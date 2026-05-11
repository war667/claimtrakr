import csv
import io
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_credentials
from app.database import get_db

router = APIRouter(dependencies=[Depends(verify_credentials)])


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

import re as _re

# Normalize a column header: strip, lowercase, remove all whitespace
def _norm_col(s: str) -> str:
    return _re.sub(r'\s+', '', s.strip()).lower().lstrip('﻿')

# Map normalized BLM column names → our field names
HEADER_MAP = {
    'serialnumber':           'serial_nr',
    'legacyleadfilenumber':   'legacy_lead_file_nr',
    'claimname':              'claim_name',
    'dateoflocation':         'location_dt',
    'closeddate':             'closed_dt',
    'nextpmtduedate':         'next_pmt_due_dt',
    'legacyserialnumber':     'legacy_serial_nr',
    'casedisposition':        'case_disposition',
    'leadfilenumber':         'lead_file_nr',
    'section':                'section',
    'meridiantownshiprange':  'meridian_twp_rng',
    'subdivision':            'subdivision',
    'caselandremarks':        'case_land_remarks',
    'adminstate':             'admin_state',
    'fieldoffice':            'field_office',
    'geostate':               'geo_state',
    'county':                 'county',
    'claimtype':              'claim_type',
    'customerid':             'customer_id',
    'claimant':               'claimant',
    'legacyaliscustomerid':   'legacy_alis_customer_id',
    'surveytype':             'survey_type',
}

DATE_FIELDS = {'location_dt', 'closed_dt', 'next_pmt_due_dt'}


def _parse_date(s: str) -> Optional[date]:
    if not s or not s.strip():
        return None
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _parse_rows(text_data: str) -> list[dict]:
    """Parse BLM Geographic Index export. Auto-detects delimiter, maps by header name."""
    text_data = text_data.lstrip('﻿').strip()  # strip BOM
    if not text_data:
        return []

    first_line = text_data.splitlines()[0]
    delimiter = "," if first_line.count(",") > first_line.count("\t") else "\t"

    reader = csv.reader(io.StringIO(text_data), delimiter=delimiter)
    col_map: dict[int, str] = {}  # position → field name
    header_found = False
    rows = []

    for raw_row in reader:
        if not any(c.strip() for c in raw_row):
            continue

        if not header_found:
            # Try to map this row as header
            mapping = {}
            for i, cell in enumerate(raw_row):
                field = HEADER_MAP.get(_norm_col(cell))
                if field:
                    mapping[i] = field
            if 'serial_nr' in mapping.values():
                col_map = mapping
                header_found = True
                continue
            # No header recognized yet — skip

        if not col_map:
            continue

        rec: dict = {}
        for i, field in col_map.items():
            val = raw_row[i].strip() if i < len(raw_row) else ''
            rec[field] = _parse_date(val) if field in DATE_FIELDS else (val or None)

        # Must have serial_nr to be useful
        if not rec.get('serial_nr'):
            continue
        rows.append(rec)

    return rows


def _aggregate(rows: list[dict]) -> list[dict]:
    """Deduplicate by (serial_nr, next_pmt_due_dt), aggregating sections."""
    groups: dict[tuple, list] = defaultdict(list)
    for r in rows:
        if not r["serial_nr"] or not r["next_pmt_due_dt"]:
            continue
        groups[(r["serial_nr"], r["next_pmt_due_dt"])].append(r)

    out = []
    for (serial_nr, pmt_dt), group in groups.items():
        base = group[0]
        sections = sorted(set(r["section"] for r in group if r["section"]))
        out.append({
            "serial_nr": serial_nr,
            "legacy_lead_file_nr": base["legacy_lead_file_nr"] or None,
            "claim_name": base["claim_name"] or None,
            "claimant": base["claimant"] or None,
            "customer_id": base["customer_id"] or None,
            "location_dt": base["location_dt"],
            "closed_dt": base["closed_dt"],
            "next_pmt_due_dt": pmt_dt,
            "case_disposition": base["case_disposition"] or None,
            "lead_file_nr": base["lead_file_nr"] or None,
            "meridian_twp_rng": base["meridian_twp_rng"] or None,
            "admin_state": base["admin_state"] or None,
            "field_office": base["field_office"] or None,
            "county": base["county"] or None,
            "claim_type": base["claim_type"] or None,
            "sections": ", ".join(sections) or None,
        })
    return out


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ImportBody(BaseModel):
    text: str


class NotesUpdateBody(BaseModel):
    notes: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _row_to_dict(r) -> dict:
    return {
        "id": r[0],
        "serial_nr": r[1],
        "legacy_lead_file_nr": r[2],
        "claim_name": r[3],
        "claimant": r[4],
        "customer_id": r[5],
        "location_dt": str(r[6]) if r[6] else None,
        "closed_dt": str(r[7]) if r[7] else None,
        "next_pmt_due_dt": str(r[8]) if r[8] else None,
        "case_disposition": r[9],
        "lead_file_nr": r[10],
        "meridian_twp_rng": r[11],
        "admin_state": r[12],
        "field_office": r[13],
        "county": r[14],
        "claim_type": r[15],
        "sections": r[16],
        "is_paid": r[17],   # derived: next_pmt_due_dt > current Sept 1
        "notes": r[18],
        "imported_at": r[19].isoformat() if r[19] else None,
    }


# is_paid is derived: true when next payment is due AFTER the current assessment year's Sept 1
DERIVED_PAID = """
    next_pmt_due_dt > (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '8 months')::date
"""

SELECT_COLS = f"""
    id, serial_nr, legacy_lead_file_nr, claim_name, claimant, customer_id,
    location_dt, closed_dt, next_pmt_due_dt, case_disposition, lead_file_nr,
    meridian_twp_rng, admin_state, field_office, county, claim_type, sections,
    ({DERIVED_PAID}) AS is_paid,
    notes, imported_at
"""


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/import", status_code=201)
async def import_report(
    body: ImportBody,
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
):
    rows = _parse_rows(body.text)
    aggregated = _aggregate(rows)

    if not rows:
        raise HTTPException(status_code=400, detail="Could not read any rows. Header row with 'Serial Number' not found — check the file format.")
    if not aggregated:
        raise HTTPException(status_code=400, detail=f"Read {len(rows)} rows but none had a Next Pmt Due Date. Check that the correct report was exported.")

    upserted = 0
    for rec in aggregated:
        await db.execute(text("""
            INSERT INTO blm_payment_tracking (
                serial_nr, legacy_lead_file_nr, claim_name, claimant, customer_id,
                location_dt, closed_dt, next_pmt_due_dt, case_disposition, lead_file_nr,
                meridian_twp_rng, admin_state, field_office, county, claim_type, sections,
                imported_at
            ) VALUES (
                :serial_nr, :legacy_lead_file_nr, :claim_name, :claimant, :customer_id,
                :location_dt, :closed_dt, :next_pmt_due_dt, :case_disposition, :lead_file_nr,
                :meridian_twp_rng, :admin_state, :field_office, :county, :claim_type, :sections,
                NOW()
            )
            ON CONFLICT (serial_nr, next_pmt_due_dt) DO UPDATE SET
                legacy_lead_file_nr = EXCLUDED.legacy_lead_file_nr,
                claim_name          = EXCLUDED.claim_name,
                claimant            = EXCLUDED.claimant,
                customer_id         = EXCLUDED.customer_id,
                location_dt         = EXCLUDED.location_dt,
                closed_dt           = EXCLUDED.closed_dt,
                case_disposition    = EXCLUDED.case_disposition,
                lead_file_nr        = EXCLUDED.lead_file_nr,
                meridian_twp_rng    = EXCLUDED.meridian_twp_rng,
                admin_state         = EXCLUDED.admin_state,
                field_office        = EXCLUDED.field_office,
                county              = EXCLUDED.county,
                claim_type          = EXCLUDED.claim_type,
                sections            = EXCLUDED.sections,
                imported_at         = NOW()
        """), rec)
        upserted += 1

    await db.commit()
    return {"imported": upserted, "raw_rows": len(rows)}


@router.get("")
async def list_payments(
    is_paid: Optional[str] = None,
    admin_state: Optional[str] = None,
    meridian_twp_rng: Optional[str] = None,
    days_until: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    conditions = ["1=1"]
    params: dict = {}

    if is_paid == "true":
        conditions.append(f"({DERIVED_PAID})")
    elif is_paid == "false":
        conditions.append(f"NOT ({DERIVED_PAID})")

    if admin_state:
        conditions.append("admin_state = :admin_state")
        params["admin_state"] = admin_state

    if meridian_twp_rng:
        conditions.append("meridian_twp_rng = :meridian_twp_rng")
        params["meridian_twp_rng"] = meridian_twp_rng

    if days_until is not None:
        conditions.append("next_pmt_due_dt <= CURRENT_DATE + :days_until")
        params["days_until"] = days_until

    where = " AND ".join(conditions)
    result = await db.execute(text(f"""
        SELECT {SELECT_COLS},
               (next_pmt_due_dt - CURRENT_DATE) AS days_remaining
        FROM blm_payment_tracking
        WHERE {where}
        ORDER BY next_pmt_due_dt ASC, serial_nr ASC
    """), params)
    rows = result.fetchall()
    out = []
    for r in rows:
        d = _row_to_dict(r)
        d["days_remaining"] = r[22]
        out.append(d)
    return out


@router.get("/summary")
async def payments_summary(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text(f"""
        SELECT
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE NOT ({DERIVED_PAID})) AS unpaid,
            COUNT(*) FILTER (WHERE NOT ({DERIVED_PAID}) AND next_pmt_due_dt <= CURRENT_DATE + 30) AS due_30,
            COUNT(*) FILTER (WHERE NOT ({DERIVED_PAID}) AND next_pmt_due_dt <= CURRENT_DATE + 90) AS due_90,
            COUNT(DISTINCT meridian_twp_rng) AS township_ranges
        FROM blm_payment_tracking
    """))
    r = result.fetchone()
    return {
        "total": r[0], "unpaid": r[1],
        "due_30": r[2], "due_90": r[3],
        "township_ranges": r[4],
    }


@router.get("/township-ranges")
async def list_township_ranges(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT DISTINCT meridian_twp_rng, admin_state, county
        FROM blm_payment_tracking
        WHERE meridian_twp_rng IS NOT NULL
        ORDER BY admin_state, meridian_twp_rng
    """))
    return [{"meridian_twp_rng": r[0], "admin_state": r[1], "county": r[2]} for r in result.fetchall()]


@router.put("/{entry_id}/notes")
async def update_notes(
    entry_id: int,
    body: NotesUpdateBody,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(text("SELECT id FROM blm_payment_tracking WHERE id = :id"), {"id": entry_id})
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.execute(text("UPDATE blm_payment_tracking SET notes = :notes WHERE id = :id"),
                     {"notes": body.notes, "id": entry_id})
    await db.commit()
    return {"ok": True}


@router.delete("/{entry_id}", status_code=204)
async def delete_entry(entry_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT id FROM blm_payment_tracking WHERE id = :id"), {"id": entry_id})
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Entry not found")
    await db.execute(text("DELETE FROM blm_payment_tracking WHERE id = :id"), {"id": entry_id})
    await db.commit()
