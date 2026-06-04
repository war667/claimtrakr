"""
USGS Docket downloader + Claude vision processor.
Endpoint flow:
  POST /fetch  → download PDF, send to Claude, store summary + extracted_text
  POST /ask    → streaming Q&A against stored extracted_text
  GET  /       → list all fetched dockets
  GET  /{nr}   → single docket record
"""
import base64
import json
import logging
import os
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_credentials
from app.config import settings
from app.database import get_db
from app.data.usgs_dockets import ALL_RECORDS, land_hint

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(verify_credentials)])

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

USGS_BASE = "https://pubs.usgs.gov/ds/1004/scans"
PDF_STORE = Path(settings.UPLOADS_PATH) / "usgs_pdfs"
MAX_PDF_BYTES = 3 * 1024 * 1024    # 3 MB raw → ~4 MB base64, safe under API limit

SUMMARIZE_PROMPT = """\
You are analyzing a historical USGS mineral exploration docket from the 1950s–1970s \
(Defense Minerals Administration / DMEA / Office of Minerals Exploration program).

Extract and return:
1. **Property description** — location, legal description (township/range/section), acreage
2. **Land type** — is this BLM federal land, state lease, patented claim, Indian reservation, or private?
3. **Minerals targeted** — what commodities were explored?
4. **Exploration method** — drilling, trenching, sampling, geophysical survey, etc.
5. **Results / findings** — any ore grades, assay results, resource estimates mentioned
6. **Outcome** — was the project approved, funded, denied, or abandoned?
7. **Staking potential today** — based on the docket, is this likely still open BLM land worth investigating?

Be concise and direct. Use bullet points. Flag any patenting language, homestead entries, \
state lease numbers, or evidence the claim was converted to private title.
"""


CHUNK_PROMPT = """\
You are analyzing a portion of a historical USGS mineral exploration docket (1950s–1970s).
Extract any useful information visible in these pages: property location, legal description \
(township/range/section), land type (BLM/state/patented/private), minerals targeted, \
exploration methods, assay results, funding decisions, and any staking-relevant details.
Be concise and use bullet points. Note page numbers where possible.
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _pdf_url(state: str, docket: str, agency: str) -> str:
    state_abbr = "ut" if state == "Utah" else "nv"
    return f"{USGS_BASE}/{state_abbr}/{agency.lower()}/{docket}_{agency}.pdf"


def _find_record(docket_nr: str) -> Optional[dict]:
    for r in ALL_RECORDS:
        if r["docket"] == docket_nr:
            return r
    return None


MAX_PAGES_DEFAULT = 50    # cap for normal fetch (user can request full analysis)
MAX_PAGES_FULL = 120      # absolute ceiling even for full analysis
MAX_BLOCKS_PER_CHUNK = 8  # images per Claude API call

def _detect_fmt(data: bytes) -> str:
    if data[:4] == b'%PDF':
        return 'pdf'
    if data[:3] == b'\xff\xd8\xff':
        return 'jpeg'
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'png'
    if data[:4] in (b'II*\x00', b'MM\x00*'):
        return 'tiff'
    return 'unknown'


def _image_block(data: bytes, fmt: str) -> dict | None:
    """Resize and compress image to JPEG, return Anthropic image content block."""
    try:
        from PIL import Image
        img = Image.open(BytesIO(data))
        logger.info(f"Image: mode={img.mode} size={img.size} fmt={fmt}")
        w, h = img.size
        if max(w, h) > 1100:
            ratio = 1100 / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        if img.mode not in ('RGB',):
            img = img.convert('RGB')
        buf = BytesIO()
        img.save(buf, format='JPEG', quality=65, optimize=True)
        jpeg_bytes = buf.getvalue()
        logger.info(f"Compressed to {len(jpeg_bytes)} bytes JPEG")
    except Exception as exc:
        logger.warning(f"Image processing failed ({fmt}): {exc}")
        return None
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": base64.standard_b64encode(jpeg_bytes).decode(),
        },
    }


def _render_page_jpeg(page, dpi: int = 120) -> bytes:
    import fitz
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    return pix.tobytes("jpeg", jpg_quality=65)


def _jpeg_block(jpeg_bytes: bytes) -> dict:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/jpeg",
            "data": base64.standard_b64encode(jpeg_bytes).decode(),
        },
    }


def _build_content_blocks(pdf_bytes: bytes, max_pages: int = MAX_PAGES_FULL) -> tuple[list[dict], int]:
    """
    Build Claude image blocks from a PDF or PDF Portfolio.
    Returns (blocks[:max_pages], total_pages_in_source).
    total_pages_in_source may be capped at MAX_PAGES_FULL for very large docs.

    Strategy A: PDF Portfolio — extract each embedded file with PyMuPDF and
                render its pages to JPEG (handles TIFFs, JPEGs, sub-PDFs).
    Strategy B: Plain PDF — render visible pages directly to JPEG.
    """
    import fitz

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    n_embedded = doc.embfile_count()
    logger.info(f"PyMuPDF: {doc.page_count} pages, {n_embedded} embedded files")

    all_blocks: list[dict] = []

    if n_embedded > 0:
        for i in range(n_embedded):
            if len(all_blocks) >= MAX_PAGES_FULL:
                break
            info = doc.embfile_info(i)
            content = doc.embfile_get(i)
            logger.info(f"  Embedded {i}: '{info.get('name', '?')}' {len(content)} bytes")

            fmt = _detect_fmt(content)
            if fmt == "pdf":
                try:
                    subdoc = fitz.open(stream=content, filetype="pdf")
                    for pnum in range(subdoc.page_count):
                        if len(all_blocks) >= MAX_PAGES_FULL:
                            break
                        all_blocks.append(_jpeg_block(_render_page_jpeg(subdoc.load_page(pnum))))
                    subdoc.close()
                except Exception as exc:
                    logger.warning(f"  Failed to render embedded PDF: {exc}")
            else:
                blk = _image_block(content, fmt)
                if blk:
                    all_blocks.append(blk)

        logger.info(f"Portfolio extraction: {len(all_blocks)} blocks")

    if not all_blocks:
        logger.info(f"Rendering {doc.page_count} pages of plain PDF")
        for pnum in range(min(MAX_PAGES_FULL, doc.page_count)):
            all_blocks.append(_jpeg_block(_render_page_jpeg(doc.load_page(pnum))))

    doc.close()
    total = len(all_blocks)
    logger.info(f"Total: {total} pages available, returning up to {max_pages}")
    return all_blocks[:max_pages], total


def _render_docket_pdf(pdf_path: str, max_pages: int = 20) -> bytes:
    """Render Portfolio embedded files (or plain pages) into a browser-viewable PDF."""
    import fitz

    doc = fitz.open(pdf_path)
    n_embedded = doc.embfile_count()
    out = fitz.open()
    page_count = 0

    if n_embedded > 0:
        for i in range(n_embedded):
            if page_count >= max_pages:
                break
            content = doc.embfile_get(i)
            fmt = _detect_fmt(content)

            if fmt == "pdf":
                try:
                    subdoc = fitz.open(stream=content, filetype="pdf")
                    for pnum in range(subdoc.page_count):
                        if page_count >= max_pages:
                            break
                        pix = subdoc.load_page(pnum).get_pixmap(
                            matrix=fitz.Matrix(150 / 72, 150 / 72), colorspace=fitz.csRGB
                        )
                        new_page = out.new_page(width=pix.width, height=pix.height)
                        new_page.insert_image(new_page.rect, pixmap=pix)
                        page_count += 1
                    subdoc.close()
                except Exception as exc:
                    logger.warning(f"Render embedded PDF error: {exc}")
            elif fmt in ("jpeg", "png", "tiff"):
                try:
                    pix = fitz.Pixmap(content)
                    if pix.colorspace and pix.colorspace.n > 3:
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    new_page = out.new_page(width=pix.width, height=pix.height)
                    new_page.insert_image(new_page.rect, pixmap=pix)
                    page_count += 1
                except Exception as exc:
                    logger.warning(f"Render embedded image error: {exc}")

    if page_count == 0:
        for pnum in range(min(max_pages, doc.page_count)):
            pix = doc.load_page(pnum).get_pixmap(
                matrix=fitz.Matrix(150 / 72, 150 / 72), colorspace=fitz.csRGB
            )
            new_page = out.new_page(width=pix.width, height=pix.height)
            new_page.insert_image(new_page.rect, pixmap=pix)
            page_count += 1

    doc.close()
    pdf_bytes = out.tobytes(deflate=True)
    out.close()
    return pdf_bytes


def _row_to_dict(r) -> dict:
    return {
        "id": r[0], "docket_nr": r[1], "agency": r[2], "state": r[3],
        "county": r[4], "property_name": r[5], "commodity": r[6],
        "pdf_url": r[7], "pdf_path": r[8], "file_size_bytes": r[9],
        "summary": r[10], "extracted_text": r[11], "land_hint": r[12],
        "status": r[13], "error_msg": r[14],
        "fetched_at": r[15].isoformat() if r[15] else None,
        "processed_at": r[16].isoformat() if r[16] else None,
        "created_at": r[17].isoformat() if r[17] else None,
        "pages_total": r[18], "pages_analyzed": r[19],
    }


SELECT_COLS = """
    id, docket_nr, agency, state, county, property_name, commodity,
    pdf_url, pdf_path, file_size_bytes, summary, extracted_text, land_hint,
    status, error_msg, fetched_at, processed_at, created_at,
    pages_total, pages_analyzed
"""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
async def list_fetched_dockets(
    state: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    conditions = ["1=1"]
    params: dict = {}
    if state:
        conditions.append("state = :state")
        params["state"] = state
    if status:
        conditions.append("status = :status")
        params["status"] = status
    where = " AND ".join(conditions)
    result = await db.execute(
        text(f"SELECT {SELECT_COLS} FROM usgs_dockets WHERE {where} ORDER BY processed_at DESC NULLS LAST"),
        params,
    )
    return [_row_to_dict(r) for r in result.fetchall()]


@router.get("/{docket_nr}")
async def get_docket(docket_nr: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text(f"SELECT {SELECT_COLS} FROM usgs_dockets WHERE docket_nr = :nr"),
        {"nr": docket_nr},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Docket not fetched yet")
    return _row_to_dict(row)


@router.get("/{docket_nr}/pdf")
async def get_docket_pdf(docket_nr: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT pdf_path FROM usgs_dockets WHERE docket_nr = :nr"),
        {"nr": docket_nr},
    )
    row = result.fetchone()
    if not row or not row[0]:
        raise HTTPException(status_code=404, detail="PDF not downloaded yet")
    path = Path(row[0])
    if not path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found on disk")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=f"docket_{docket_nr}.pdf",
        headers={"Content-Disposition": f"inline; filename=docket_{docket_nr}.pdf"},
    )


@router.get("/{docket_nr}/rendered-pdf")
async def get_rendered_pdf(docket_nr: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("SELECT pdf_path FROM usgs_dockets WHERE docket_nr = :nr"),
        {"nr": docket_nr},
    )
    row = result.fetchone()
    if not row or not row[0]:
        raise HTTPException(status_code=404, detail="PDF not downloaded yet")
    path = Path(row[0])
    if not path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found on disk")

    import asyncio
    loop = asyncio.get_event_loop()
    try:
        pdf_bytes = await loop.run_in_executor(None, _render_docket_pdf, str(path))
    except Exception as exc:
        logger.error(f"Render error for {docket_nr}: {exc}")
        raise HTTPException(status_code=500, detail=f"Render failed: {exc}")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename=docket_{docket_nr}_pages.pdf"},
    )


@router.delete("/{docket_nr}")
async def delete_docket(docket_nr: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("DELETE FROM usgs_dockets WHERE docket_nr = :nr RETURNING id"),
        {"nr": docket_nr},
    )
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Docket not found")
    await db.commit()
    return {"deleted": docket_nr}


@router.post("/{docket_nr}/fetch")
async def fetch_docket(
    docket_nr: str,
    full: bool = False,
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
):
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    record = _find_record(docket_nr)
    if not record:
        raise HTTPException(status_code=404, detail=f"Docket {docket_nr} not in dataset")

    pdf_url = _pdf_url(record["state"], docket_nr, record["agency"])

    # Check if already processed
    existing = await db.execute(
        text("SELECT status FROM usgs_dockets WHERE docket_nr = :nr"), {"nr": docket_nr}
    )
    row = existing.fetchone()
    if row and row[0] == "ready" and not full:
        raise HTTPException(status_code=409, detail="Docket already processed. Use /ask to query it.")

    # Upsert with status=downloading
    await db.execute(text("""
        INSERT INTO usgs_dockets (docket_nr, agency, state, county, property_name, commodity,
            pdf_url, land_hint, status)
        VALUES (:nr, :agency, :state, :county, :prop, :comm, :url, :hint, 'downloading')
        ON CONFLICT (docket_nr) DO UPDATE SET status='downloading', error_msg=NULL
    """), {
        "nr": docket_nr, "agency": record["agency"], "state": record["state"],
        "county": record["county"], "prop": record["property"], "comm": record["commodity"],
        "url": pdf_url, "hint": record["land_hint"],
    })
    await db.commit()

    # Download PDF
    PDF_STORE.mkdir(parents=True, exist_ok=True)
    pdf_path = PDF_STORE / f"{docket_nr}_{record['agency']}.pdf"

    try:
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            resp = await client.get(pdf_url)
            if resp.status_code != 200:
                raise ValueError(f"HTTP {resp.status_code} from USGS")
            pdf_bytes = resp.content
    except Exception as exc:
        await db.execute(
            text("UPDATE usgs_dockets SET status='error', error_msg=:e WHERE docket_nr=:nr"),
            {"e": str(exc), "nr": docket_nr}
        )
        await db.commit()
        raise HTTPException(status_code=502, detail=f"Download failed: {exc}")

    # Save to disk
    with open(pdf_path, "wb") as f:
        f.write(pdf_bytes)

    await db.execute(
        text("UPDATE usgs_dockets SET status='processing', pdf_path=:p, file_size_bytes=:s, fetched_at=NOW() WHERE docket_nr=:nr"),
        {"p": str(pdf_path), "s": len(pdf_bytes), "nr": docket_nr}
    )
    await db.commit()

    # Build content blocks — handles both PDF Packages and plain large PDFs
    max_pages = MAX_PAGES_FULL if full else MAX_PAGES_DEFAULT
    try:
        content_blocks, pages_total = _build_content_blocks(pdf_bytes, max_pages)
    except Exception as exc:
        await db.execute(
            text("UPDATE usgs_dockets SET status='error', error_msg=:e WHERE docket_nr=:nr"),
            {"e": str(exc), "nr": docket_nr}
        )
        await db.commit()
        raise HTTPException(status_code=500, detail=f"PDF extraction failed: {exc}")

    n_pages = len(content_blocks)
    truncated = pages_total > n_pages
    logger.info(f"Sending {n_pages}/{pages_total} pages to Claude (chunked={n_pages > MAX_BLOCKS_PER_CHUNK}, truncated={truncated})")

    # Send to Claude — single call for small dockets, chunked+synthesized for large ones
    try:
        import anthropic as _anthropic
        client = _anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        if n_pages <= MAX_BLOCKS_PER_CHUNK:
            response = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                messages=[{"role": "user", "content": content_blocks + [{"type": "text", "text": SUMMARIZE_PROMPT}]}],
            )
            summary = response.content[0].text
        else:
            # Step 1: partial summary per chunk
            chunk_summaries = []
            for start in range(0, n_pages, MAX_BLOCKS_PER_CHUNK):
                chunk = content_blocks[start:start + MAX_BLOCKS_PER_CHUNK]
                end = min(start + MAX_BLOCKS_PER_CHUNK, n_pages)
                label = f"pages {start + 1}–{end} of {n_pages}"
                logger.info(f"  Chunk {label}")
                r = await client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=2048,
                    messages=[{"role": "user", "content": chunk + [{"type": "text", "text": CHUNK_PROMPT + f"\n\n(This is {label}.)"}]}],
                )
                chunk_summaries.append(f"### {label.title()}\n{r.content[0].text}")

            # Step 2: synthesize all partial summaries
            combined = "\n\n".join(chunk_summaries)
            logger.info(f"  Synthesizing {len(chunk_summaries)} chunks")
            synth = await client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=4096,
                messages=[{"role": "user", "content": [{"type": "text", "text": (
                    f"Below are partial analyses of a {n_pages}-page USGS mineral exploration "
                    f"docket, broken into chunks of {MAX_BLOCKS_PER_CHUNK} pages each. "
                    f"Synthesize them into one comprehensive summary.\n\n{combined}\n\n{SUMMARIZE_PROMPT}"
                )}]}],
            )
            summary = synth.content[0].text

        if truncated:
            summary += (
                f"\n\n---\n⚠ **Partial analysis** — {n_pages} of {pages_total} pages were analyzed. "
                f"Use \"Analyze All Pages\" to process the full docket."
            )

        extracted_text = summary

    except Exception as exc:
        await db.execute(
            text("UPDATE usgs_dockets SET status='error', error_msg=:e WHERE docket_nr=:nr"),
            {"e": str(exc), "nr": docket_nr}
        )
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Claude processing failed: {exc}")

    # Store results
    await db.execute(text("""
        UPDATE usgs_dockets
        SET status='ready', summary=:summary, extracted_text=:text,
            pages_total=:ptotal, pages_analyzed=:panalyzed, processed_at=NOW()
        WHERE docket_nr=:nr
    """), {"summary": summary, "text": extracted_text,
           "ptotal": pages_total, "panalyzed": n_pages, "nr": docket_nr})
    await db.commit()

    result = await db.execute(
        text(f"SELECT {SELECT_COLS} FROM usgs_dockets WHERE docket_nr = :nr"),
        {"nr": docket_nr}
    )
    return _row_to_dict(result.fetchone())


# ---------------------------------------------------------------------------
# Streaming Q&A against a processed docket
# ---------------------------------------------------------------------------

class AskBody(BaseModel):
    question: str
    history: list[dict] = []


@router.post("/{docket_nr}/ask")
async def ask_docket(
    docket_nr: str,
    body: AskBody,
    db: AsyncSession = Depends(get_db),
):
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    result = await db.execute(
        text("SELECT docket_nr, agency, state, county, property_name, commodity, summary, extracted_text, pdf_path, file_size_bytes FROM usgs_dockets WHERE docket_nr = :nr AND status='ready'"),
        {"nr": docket_nr}
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Docket not ready — fetch it first")

    doc_nr, agency, state, county, prop, commodity, summary, extracted_text, pdf_path, file_size = row

    system = f"""\
You are a mineral claim research assistant. The user is asking questions about a specific \
USGS mineral exploration docket.

Docket: {doc_nr} | Agency: {agency} | State: {state} | County: {county}
Property: {prop} | Commodity: {commodity}

Extracted content from this docket:
---
{extracted_text or summary}
---

Answer questions directly and concisely. Focus on staking potential, land status, \
exploration results, and actionable insights for a prospector.
"""

    import anthropic as _anthropic
    client = _anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    messages = body.history + [{"role": "user", "content": body.question}]

    async def generate():
        try:
            async with client.messages.stream(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                system=system,
                messages=messages,
            ) as stream:
                async for text_chunk in stream.text_stream:
                    yield f"data: {json.dumps({'text': text_chunk})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            logger.error(f"Ask stream error: {exc}")
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
