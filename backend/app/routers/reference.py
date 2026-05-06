import logging
from fastapi import APIRouter, Depends
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_credentials
from app.database import get_db
from app.models.claims import DispositionCode
from app.schemas.claims import DispositionCodeSchema

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(verify_credentials)])

WORKFLOW_STATUS_META = [
    {"key": "new",               "label": "New",               "color": "#6b7280", "order": 1},
    {"key": "researching",       "label": "Researching",       "color": "#3b82f6", "order": 2},
    {"key": "needs_field_check", "label": "Needs Field Check", "color": "#f59e0b", "order": 3},
    {"key": "field_checked",     "label": "Field Checked",     "color": "#8b5cf6", "order": 4},
    {"key": "legal_review",      "label": "Legal Review",      "color": "#06b6d4", "order": 5},
    {"key": "approved",          "label": "Approved to Stake", "color": "#10b981", "order": 6},
    {"key": "rejected",          "label": "Rejected",          "color": "#ef4444", "order": 7},
    {"key": "staked",            "label": "Staked",            "color": "#059669", "order": 8},
    {"key": "county_filed",      "label": "County Filed",      "color": "#0d9488", "order": 9},
    {"key": "blm_filed",         "label": "BLM Filed",         "color": "#0369a1", "order": 10},
]


@router.get("/counties")
async def list_counties(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT
            state,
            county,
            COUNT(*) AS total_count,
            SUM(CASE WHEN case_status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_count,
            SUM(CASE WHEN case_status = 'CLOSED' THEN 1 ELSE 0 END) AS closed_count
        FROM claims
        WHERE state IS NOT NULL AND county IS NOT NULL
        GROUP BY state, county
        ORDER BY state, county
    """))
    rows = result.fetchall()
    return [
        {
            "state": r[0],
            "county": r[1],
            "total_count": r[2],
            "active_count": r[3],
            "closed_count": r[4],
        }
        for r in rows
    ]


@router.get("/claim-types")
async def list_claim_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT claim_type, COUNT(*) AS count
        FROM claims
        WHERE claim_type IS NOT NULL
        GROUP BY claim_type
        ORDER BY count DESC
    """))
    rows = result.fetchall()
    return [{"claim_type": r[0], "count": r[1]} for r in rows]


@router.get("/disposition-codes")
async def list_disposition_codes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DispositionCode).order_by(DispositionCode.code))
    codes = result.scalars().all()
    return [DispositionCodeSchema.model_validate(c) for c in codes]


@router.get("/workflow-statuses")
async def list_workflow_statuses():
    return WORKFLOW_STATUS_META


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    counts = await db.execute(text("""
        SELECT
            COUNT(*) AS total_claims,
            SUM(CASE WHEN case_status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_claims,
            SUM(CASE WHEN case_status = 'CLOSED' THEN 1 ELSE 0 END) AS closed_claims,
            SUM(CASE WHEN case_status = 'CLOSED' AND closed_dt >= NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END) AS closed_7,
            SUM(CASE WHEN case_status = 'CLOSED' AND closed_dt >= NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END) AS closed_30,
            SUM(CASE WHEN case_status = 'CLOSED' AND closed_dt >= NOW() - INTERVAL '90 days' THEN 1 ELSE 0 END) AS closed_90
        FROM claims
    """))
    claim_row = counts.fetchone()

    targets_result = await db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE workflow_status NOT IN ('rejected','archived','blm_filed')) AS active_targets,
            COUNT(*) FILTER (WHERE workflow_status = 'needs_field_check') AS pending_field_check
        FROM targets
    """))
    target_row = targets_result.fetchone()

    last_run_result = await db.execute(text("""
        SELECT finished_at, status FROM ingestion_runs
        WHERE status IN ('success','partial','error')
        ORDER BY finished_at DESC LIMIT 1
    """))
    last_run = last_run_result.fetchone()

    if last_run is None:
        ingestion_health = "never"
        last_ingestion_at = None
    elif last_run[1] == "error":
        ingestion_health = "error"
        last_ingestion_at = last_run[0]
    else:
        ingestion_health = "ok"
        last_ingestion_at = last_run[0]

    events_result = await db.execute(text("""
        SELECT serial_nr, event_type, event_subtype, old_value, new_value, detected_at
        FROM claim_events
        ORDER BY detected_at DESC
        LIMIT 10
    """))
    event_rows = events_result.fetchall()

    recent_events = []
    for r in event_rows:
        desc_parts = [r[1]]
        if r[2]:
            desc_parts.append(r[2])
        if r[3] and r[4]:
            desc_parts.append(f"{r[3]} → {r[4]}")
        recent_events.append({
            "serial_nr": r[0],
            "event_type": r[1],
            "event_subtype": r[2],
            "old_value": r[3],
            "new_value": r[4],
            "detected_at": str(r[5]) if r[5] else None,
            "description": " | ".join(desc_parts),
        })

    return {
        "total_claims": claim_row[0] or 0,
        "active_claims": claim_row[1] or 0,
        "closed_claims": claim_row[2] or 0,
        "closed_last_7_days": claim_row[3] or 0,
        "closed_last_30_days": claim_row[4] or 0,
        "closed_last_90_days": claim_row[5] or 0,
        "active_targets": target_row[0] or 0,
        "targets_pending_field_check": target_row[1] or 0,
        "last_ingestion_at": str(last_ingestion_at) if last_ingestion_at else None,
        "ingestion_health": ingestion_health,
        "recent_events": recent_events,
    }
