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
from fastapi.responses import StreamingResponse
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


MAX_IMAGE_BLOCKS = 5
MAX_TOTAL_RAW_BYTES = 1_200_000  # 1.2 MB raw → ~1.6 MB base64

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
        if max(w, h) > 1000:
            ratio = 1000 / max(w, h)
            img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        if img.mode not in ('RGB',):
            img = img.convert('RGB')
        buf = BytesIO()
        img.save(buf, format='JPEG', quality=70, optimize=True)
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


def _pages_to_pdf(pdf_bytes: bytes, max_pages: int = 5) -> bytes:
    """Extract first N pages from a PDF as a new valid PDF document."""
    from pypdf import PdfReader, PdfWriter
    reader = PdfReader(BytesIO(pdf_bytes))
    writer = PdfWriter()
    n = min(max_pages, len(reader.pages))
    for i in range(n):
        writer.add_page(reader.pages[i])
    buf = BytesIO()
    writer.write(buf)
    result = buf.getvalue()
    logger.info(f"Extracted {n}/{len(reader.pages)} pages → {len(result)} bytes")
    return result


def _build_content_blocks(pdf_bytes: bytes) -> tuple[list[dict], str]:
    """
    Build Claude content blocks from a downloaded PDF.
    Strategy 1: PDF Package → extract embedded image files (TIFF/JPEG scans).
    Strategy 2: Any PDF → extract first 5 pages as a valid sub-PDF.
    Returns (blocks, note).
    """
    from pypdf import PdfReader
    reader = PdfReader(BytesIO(pdf_bytes))

    # --- Strategy 1: PDF Package with embedded files ---
    attachments = reader.attachments
    if attachments:
        logger.info(f"PDF Package: {len(attachments)} embedded files")
        blocks: list[dict] = []
        total_raw = 0
        done = False
        for _name, file_list in sorted(attachments.items()):
            if done:
                break
            for raw in file_list:
                if not raw or len(raw) < 8:
                    continue
                fmt = _detect_fmt(raw)
                logger.info(f"  '{_name}': {len(raw)} bytes fmt={fmt}")
                if fmt == 'pdf' and len(raw) <= MAX_PDF_BYTES:
                    blocks.append({
                        "type": "document",
                        "source": {"type": "base64", "media_type": "application/pdf",
                                   "data": base64.standard_b64encode(raw).decode()},
                    })
                    total_raw += len(raw)
                elif fmt != 'pdf':
                    blk = _image_block(raw, fmt)
                    if blk:
                        img_raw = len(base64.b64decode(blk["source"]["data"]))
                        if total_raw + img_raw > MAX_TOTAL_RAW_BYTES:
                            done = True
                            break
                        blocks.append(blk)
                        total_raw += img_raw
                if len(blocks) >= MAX_IMAGE_BLOCKS:
                    done = True
                    break

        logger.info(f"Package blocks: {len(blocks)}, {total_raw} raw bytes")
        if blocks:
            note = f"(PDF Package — first {len(blocks)} pages analyzed)" if len(blocks) >= MAX_IMAGE_BLOCKS else ""
            return blocks, note

    # --- Strategy 2: Extract first N pages as a valid PDF ---
    n_pages = len(reader.pages)
    logger.info(f"Plain PDF: {n_pages} pages, extracting first 5")
    page_pdf = _pages_to_pdf(pdf_bytes, max_pages=5)
    note = f"(Large PDF — only first 5 of {n_pages} pages analyzed)" if n_pages > 5 else ""
    return [{
        "type": "document",
        "source": {"type": "base64", "media_type": "application/pdf",
                   "data": base64.standard_b64encode(page_pdf).decode()},
        "cache_control": {"type": "ephemeral"},
    }], note


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
    }


SELECT_COLS = """
    id, docket_nr, agency, state, county, property_name, commodity,
    pdf_url, pdf_path, file_size_bytes, summary, extracted_text, land_hint,
    status, error_msg, fetched_at, processed_at, created_at
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
    if row and row[0] == "ready":
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
    try:
        content_blocks, page_note = _build_content_blocks(pdf_bytes)
    except Exception as exc:
        await db.execute(
            text("UPDATE usgs_dockets SET status='error', error_msg=:e WHERE docket_nr=:nr"),
            {"e": str(exc), "nr": docket_nr}
        )
        await db.commit()
        raise HTTPException(status_code=500, detail=f"PDF extraction failed: {exc}")

    note = f"\n\nNote: {page_note}" if page_note else ""

    # Send to Claude
    try:
        import anthropic as _anthropic
        client = _anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        response = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": content_blocks + [{
                    "type": "text",
                    "text": SUMMARIZE_PROMPT + note,
                }],
            }],
        )
        summary = response.content[0].text
        extracted_text = summary  # store summary as queryable text for now

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
        SET status='ready', summary=:summary, extracted_text=:text, processed_at=NOW()
        WHERE docket_nr=:nr
    """), {"summary": summary, "text": extracted_text, "nr": docket_nr})
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
