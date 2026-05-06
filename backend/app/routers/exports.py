import csv
import io
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_credentials
from app.database import get_db
from app.models.targets import Export

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(verify_credentials)])

CLAIMS_CSV_COLS = [
    "serial_nr", "claim_name", "claim_type", "claimant_name", "state", "county",
    "township", "range", "section", "acres", "case_status", "disposition_cd",
    "disposition_desc", "location_dt", "closed_dt", "blm_url",
    "geom_confidence", "first_seen_at", "last_seen_at",
]

TARGETS_CSV_COLS = [
    "id", "internal_name", "serial_nr", "claim_type", "state", "county",
    "claimant_name", "case_status", "workflow_status", "assigned_to",
    "priority_score", "priority_label", "notes", "created_at", "updated_at",
]


def _build_claims_where(state, county, status, claim_type, closed_within_days, disposition_cd, search):
    conditions = ["1=1"]
    params = {}
    if state:
        conditions.append("c.state = :state")
        params["state"] = state
    if county:
        conditions.append("c.county ILIKE :county")
        params["county"] = f"%{county}%"
    if status:
        conditions.append("c.case_status = :status")
        params["status"] = status.upper()
    if claim_type:
        conditions.append("c.claim_type = :claim_type")
        params["claim_type"] = claim_type
    if closed_within_days:
        conditions.append(f"c.closed_dt >= NOW() - INTERVAL '{int(closed_within_days)} days'")
    if disposition_cd:
        conditions.append("c.disposition_cd = :disposition_cd")
        params["disposition_cd"] = disposition_cd
    if search:
        conditions.append("c.claimant_name ILIKE :search")
        params["search"] = f"%{search}%"
    return " AND ".join(conditions), params


def _filter_summary(state, county, status, claim_type, closed_within_days):
    parts = []
    if state:
        parts.append(f"state={state}")
    if county:
        parts.append(f"county={county}")
    if status:
        parts.append(f"status={status}")
    if claim_type:
        parts.append(f"type={claim_type}")
    if closed_within_days:
        parts.append(f"closed_within={closed_within_days}d")
    return "; ".join(parts) if parts else "none"


@router.get("/claims.csv")
async def export_claims_csv(
    state: Optional[str] = None,
    county: Optional[str] = None,
    status: Optional[str] = None,
    claim_type: Optional[str] = None,
    closed_within_days: Optional[int] = None,
    disposition_cd: Optional[str] = None,
    search: Optional[str] = None,
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
):
    where_clause, params = _build_claims_where(
        state, county, status, claim_type, closed_within_days, disposition_cd, search
    )

    sql = text(f"""
        SELECT
            c.serial_nr, c.claim_name, c.claim_type, c.claimant_name, c.state, c.county,
            c.township, c.range, c.section, c.acres, c.case_status, c.disposition_cd,
            c.disposition_desc, c.location_dt, c.closed_dt, c.blm_url,
            c.geom_confidence, c.first_seen_at, c.last_seen_at
        FROM claims c WHERE {where_clause}
        ORDER BY c.last_seen_at DESC
    """)
    result = await db.execute(sql, params)
    rows = result.fetchall()

    now_str = datetime.now(timezone.utc).isoformat()
    filter_str = _filter_summary(state, county, status, claim_type, closed_within_days)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        f"# INTERNAL USE ONLY - ClaimTrakr | Generated: {now_str} | Filters: {filter_str}"
    ])
    writer.writerow([
        "# DISCLAIMER: Closed claims are NOT confirmed as open to mineral location. "
        "Independent verification required before any staking action."
    ])
    writer.writerow(CLAIMS_CSV_COLS)
    for row in rows:
        writer.writerow([str(v) if v is not None else "" for v in row])

    # Log export
    db.add(Export(
        exported_by=username,
        export_type="claims_csv",
        filters_used={"state": state, "county": county, "status": status,
                      "claim_type": claim_type, "closed_within_days": closed_within_days},
        record_count=len(rows),
    ))
    await db.commit()

    csv_content = output.getvalue()

    async def generate():
        yield csv_content

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=claims_export.csv"},
    )


@router.get("/targets.csv")
async def export_targets_csv(
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
):
    sql = text("""
        SELECT
            t.id, t.internal_name, t.serial_nr, c.claim_type, c.state, c.county,
            c.claimant_name, c.case_status, t.workflow_status, t.assigned_to,
            t.priority_score, t.priority_label, t.notes, t.created_at, t.updated_at
        FROM targets t
        JOIN claims c ON c.serial_nr = t.serial_nr
        WHERE t.workflow_status != 'archived'
        ORDER BY t.created_at DESC
    """)
    result = await db.execute(sql)
    rows = result.fetchall()

    now_str = datetime.now(timezone.utc).isoformat()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        f"# INTERNAL USE ONLY - ClaimTrakr | Generated: {now_str} | All active targets"
    ])
    writer.writerow([
        "# DISCLAIMER: Closed claims are NOT confirmed as open to mineral location. "
        "Independent verification required before any staking action."
    ])
    writer.writerow(TARGETS_CSV_COLS)
    for row in rows:
        writer.writerow([str(v) if v is not None else "" for v in row])

    db.add(Export(
        exported_by=username,
        export_type="targets_csv",
        filters_used={},
        record_count=len(rows),
    ))
    await db.commit()

    csv_content = output.getvalue()

    async def generate():
        yield csv_content

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=targets_export.csv"},
    )


@router.get("/claims.geojson")
async def export_claims_geojson(
    state: Optional[str] = None,
    county: Optional[str] = None,
    status: Optional[str] = None,
    claim_type: Optional[str] = None,
    closed_within_days: Optional[int] = None,
    disposition_cd: Optional[str] = None,
    search: Optional[str] = None,
    bbox: Optional[str] = None,
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
):
    where_clause, params = _build_claims_where(
        state, county, status, claim_type, closed_within_days, disposition_cd, search
    )
    if bbox:
        try:
            parts = [float(x.strip()) for x in bbox.split(",")]
            if len(parts) == 4:
                where_clause += f" AND c.bbox && ST_MakeEnvelope({parts[0]}, {parts[1]}, {parts[2]}, {parts[3]}, 4326)"
        except ValueError:
            pass

    sql = text(f"""
        SELECT
            c.serial_nr, c.claim_name, c.claim_type, c.claimant_name,
            c.state, c.county, c.acres, c.case_status, c.disposition_cd,
            c.disposition_desc, c.location_dt, c.closed_dt, c.blm_url,
            c.geom_confidence, c.first_seen_at, c.last_seen_at,
            ST_AsGeoJSON(c.geom) as geojson
        FROM claims c
        WHERE {where_clause} AND c.geom IS NOT NULL
        ORDER BY c.last_seen_at DESC
        LIMIT 5000
    """)
    result = await db.execute(sql, params)
    rows = result.fetchall()

    features = []
    for row in rows:
        geojson_str = row[16]
        if not geojson_str:
            continue
        try:
            geometry = json.loads(geojson_str)
        except Exception:
            continue
        features.append({
            "type": "Feature",
            "geometry": geometry,
            "properties": {
                "serial_nr": row[0], "claim_name": row[1], "claim_type": row[2],
                "claimant_name": row[3], "state": row[4], "county": row[5],
                "acres": float(row[6]) if row[6] is not None else None,
                "case_status": row[7], "disposition_cd": row[8],
                "disposition_desc": row[9],
                "location_dt": str(row[10]) if row[10] else None,
                "closed_dt": str(row[11]) if row[11] else None,
                "blm_url": row[12], "geom_confidence": row[13],
                "first_seen_at": str(row[14]) if row[14] else None,
                "last_seen_at": str(row[15]) if row[15] else None,
            },
        })

    collection = json.dumps({"type": "FeatureCollection", "features": features})

    db.add(Export(
        exported_by=username,
        export_type="claims_geojson",
        filters_used={"state": state, "county": county, "status": status,
                      "claim_type": claim_type},
        record_count=len(features),
    ))
    await db.commit()

    async def generate():
        yield collection

    return StreamingResponse(
        generate(),
        media_type="application/geo+json",
        headers={"Content-Disposition": "attachment; filename=claims_export.geojson"},
    )
