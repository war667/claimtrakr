import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_credentials
from app.config import settings
from app.database import get_db
from app.models.targets import Target, TargetStatusHistory, DueDiligenceItem, TargetFile
from app.schemas.targets import (
    TargetSchema, TargetCreateSchema, TargetUpdateSchema,
    TargetStatusHistorySchema, DueDiligenceItemSchema, DueDiligenceUpdateSchema,
    TargetFileSchema, PaginatedTargets,
)
from app.ingestion.runner import DUE_DILIGENCE_TASKS
from app.utils.scoring import compute_priority_label

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(verify_credentials)])

WORKFLOW_STATUSES = [
    "new", "researching", "needs_field_check", "field_checked",
    "legal_review", "approved", "rejected", "staked", "county_filed", "blm_filed",
]

TARGET_SELECT = text("""
    SELECT
        t.id, t.serial_nr, t.workflow_status, t.assigned_to, t.created_by,
        t.priority_score, t.priority_label, t.notes, t.internal_name,
        t.proposed_claim_type, t.proposed_name, t.created_at, t.updated_at,
        t.status_changed_at,
        c.claim_name, c.claim_type, c.claimant_name, c.state, c.county,
        c.case_status, c.closed_dt::text, c.acres::text
    FROM targets t
    JOIN claims c ON c.serial_nr = t.serial_nr
""")


def _row_to_target(row) -> TargetSchema:
    return TargetSchema(
        id=row[0], serial_nr=row[1], workflow_status=row[2], assigned_to=row[3],
        created_by=row[4], priority_score=row[5] or 0, priority_label=row[6],
        notes=row[7], internal_name=row[8], proposed_claim_type=row[9],
        proposed_name=row[10], created_at=row[11], updated_at=row[12],
        status_changed_at=row[13], claim_name=row[14], claim_type=row[15],
        claimant_name=row[16], state=row[17], county=row[18],
        case_status=row[19], closed_dt=row[20], acres=row[21],
    )


@router.get("/report")
async def targets_report(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("""
        SELECT
            t.id, t.serial_nr, t.workflow_status, t.assigned_to,
            t.priority_label, t.notes, t.internal_name, t.created_at,
            c.claim_name, c.claim_type, c.claimant_name, c.state, c.county,
            c.case_status, c.closed_dt::text, c.acres::text,
            COUNT(d.id) FILTER (WHERE d.id IS NOT NULL) AS checklist_total,
            COUNT(d.id) FILTER (WHERE d.is_complete = true) AS checklist_complete
        FROM targets t
        JOIN claims c ON c.serial_nr = t.serial_nr
        LEFT JOIN due_diligence_items d ON d.target_id = t.id
        WHERE t.workflow_status != 'archived'
        GROUP BY t.id, t.serial_nr, t.workflow_status, t.assigned_to,
                 t.priority_label, t.notes, t.internal_name, t.created_at,
                 c.claim_name, c.claim_type, c.claimant_name, c.state, c.county,
                 c.case_status, c.closed_dt, c.acres
        ORDER BY t.created_at DESC
    """))
    rows = result.fetchall()
    return [
        {
            "id": r[0], "serial_nr": r[1], "workflow_status": r[2],
            "assigned_to": r[3], "priority_label": r[4], "notes": r[5],
            "internal_name": r[6], "created_at": str(r[7]) if r[7] else None,
            "claim_name": r[8], "claim_type": r[9], "claimant_name": r[10],
            "state": r[11], "county": r[12], "case_status": r[13],
            "closed_dt": r[14], "acres": float(r[15]) if r[15] else None,
            "checklist_total": int(r[16]), "checklist_complete": int(r[17]),
        }
        for r in rows
    ]


@router.get("", response_model=PaginatedTargets)
async def list_targets(
    workflow_status: Optional[str] = None,
    assigned_to: Optional[str] = None,
    state: Optional[str] = None,
    priority_label: Optional[str] = None,
    page: int = 1,
    page_size: int = 100,
    db: AsyncSession = Depends(get_db),
):
    conditions = ["1=1", "t.workflow_status != 'archived'"]
    params = {}

    if workflow_status:
        conditions.append("t.workflow_status = :workflow_status")
        params["workflow_status"] = workflow_status
    if assigned_to:
        conditions.append("t.assigned_to = :assigned_to")
        params["assigned_to"] = assigned_to
    if state:
        conditions.append("c.state = :state")
        params["state"] = state
    if priority_label:
        conditions.append("t.priority_label = :priority_label")
        params["priority_label"] = priority_label

    where = " AND ".join(conditions)

    count_result = await db.execute(
        text(f"SELECT COUNT(*) FROM targets t JOIN claims c ON c.serial_nr = t.serial_nr WHERE {where}"),
        params,
    )
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    result = await db.execute(
        text(f"""
            SELECT t.id, t.serial_nr, t.workflow_status, t.assigned_to, t.created_by,
                   t.priority_score, t.priority_label, t.notes, t.internal_name,
                   t.proposed_claim_type, t.proposed_name, t.created_at, t.updated_at,
                   t.status_changed_at, c.claim_name, c.claim_type, c.claimant_name,
                   c.state, c.county, c.case_status, c.closed_dt::text, c.acres::text
            FROM targets t
            JOIN claims c ON c.serial_nr = t.serial_nr
            WHERE {where}
            ORDER BY t.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    )
    rows = result.fetchall()
    items = [_row_to_target(r) for r in rows]
    return PaginatedTargets(total=total, page=page, page_size=page_size, items=items)


@router.post("", response_model=TargetSchema, status_code=201)
async def create_target(
    body: TargetCreateSchema,
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
):
    # Verify claim exists
    claim_result = await db.execute(
        text("SELECT serial_nr FROM claims WHERE serial_nr = :sn"),
        {"sn": body.serial_nr},
    )
    if not claim_result.fetchone():
        raise HTTPException(status_code=404, detail=f"Claim {body.serial_nr} not found")

    target = Target(
        serial_nr=body.serial_nr,
        notes=body.notes,
        assigned_to=body.assigned_to,
        internal_name=body.internal_name or f"Target: {body.serial_nr}",
        created_by=username,
        workflow_status="new",
    )
    db.add(target)
    await db.flush()

    # Auto-insert 12 due diligence items
    for sort_order, task_key, task_label in DUE_DILIGENCE_TASKS:
        db.add(DueDiligenceItem(
            target_id=target.id,
            task_key=task_key,
            task_label=task_label,
            sort_order=sort_order,
        ))

    # Insert initial status history
    db.add(TargetStatusHistory(
        target_id=target.id,
        from_status=None,
        to_status="new",
        changed_by=username,
        notes="Target created",
    ))

    await db.commit()

    result = await db.execute(
        text("""
            SELECT t.id, t.serial_nr, t.workflow_status, t.assigned_to, t.created_by,
                   t.priority_score, t.priority_label, t.notes, t.internal_name,
                   t.proposed_claim_type, t.proposed_name, t.created_at, t.updated_at,
                   t.status_changed_at, c.claim_name, c.claim_type, c.claimant_name,
                   c.state, c.county, c.case_status, c.closed_dt::text, c.acres::text
            FROM targets t JOIN claims c ON c.serial_nr = t.serial_nr
            WHERE t.id = :tid
        """),
        {"tid": target.id},
    )
    return _row_to_target(result.fetchone())


@router.get("/{target_id}", response_model=TargetSchema)
async def get_target(target_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        text("""
            SELECT t.id, t.serial_nr, t.workflow_status, t.assigned_to, t.created_by,
                   t.priority_score, t.priority_label, t.notes, t.internal_name,
                   t.proposed_claim_type, t.proposed_name, t.created_at, t.updated_at,
                   t.status_changed_at, c.claim_name, c.claim_type, c.claimant_name,
                   c.state, c.county, c.case_status, c.closed_dt::text, c.acres::text
            FROM targets t JOIN claims c ON c.serial_nr = t.serial_nr
            WHERE t.id = :tid
        """),
        {"tid": target_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Target not found")
    return _row_to_target(row)


@router.put("/{target_id}", response_model=TargetSchema)
async def update_target(
    target_id: int,
    body: TargetUpdateSchema,
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Target).where(Target.id == target_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    status_changed = False
    if body.workflow_status and body.workflow_status != target.workflow_status:
        if body.workflow_status not in WORKFLOW_STATUSES and body.workflow_status != "archived":
            raise HTTPException(status_code=400, detail=f"Invalid workflow_status: {body.workflow_status}")
        db.add(TargetStatusHistory(
            target_id=target_id,
            from_status=target.workflow_status,
            to_status=body.workflow_status,
            changed_by=username,
        ))
        target.workflow_status = body.workflow_status
        target.status_changed_at = datetime.now(timezone.utc)
        status_changed = True

    if body.notes is not None:
        target.notes = body.notes
    if body.assigned_to is not None:
        target.assigned_to = body.assigned_to
    if body.internal_name is not None:
        target.internal_name = body.internal_name
    if body.proposed_claim_type is not None:
        target.proposed_claim_type = body.proposed_claim_type
    if body.proposed_name is not None:
        target.proposed_name = body.proposed_name
    if body.priority_score is not None:
        target.priority_score = body.priority_score
        target.priority_label = compute_priority_label(body.priority_score)
    if body.priority_label is not None:
        target.priority_label = body.priority_label

    target.updated_at = datetime.now(timezone.utc)
    await db.commit()

    res = await db.execute(
        text("""
            SELECT t.id, t.serial_nr, t.workflow_status, t.assigned_to, t.created_by,
                   t.priority_score, t.priority_label, t.notes, t.internal_name,
                   t.proposed_claim_type, t.proposed_name, t.created_at, t.updated_at,
                   t.status_changed_at, c.claim_name, c.claim_type, c.claimant_name,
                   c.state, c.county, c.case_status, c.closed_dt::text, c.acres::text
            FROM targets t JOIN claims c ON c.serial_nr = t.serial_nr
            WHERE t.id = :tid
        """),
        {"tid": target_id},
    )
    return _row_to_target(res.fetchone())


@router.delete("/{target_id}", status_code=204)
async def delete_target(
    target_id: int,
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Target).where(Target.id == target_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    old_status = target.workflow_status
    target.workflow_status = "archived"
    target.updated_at = datetime.now(timezone.utc)
    db.add(TargetStatusHistory(
        target_id=target_id,
        from_status=old_status,
        to_status="archived",
        changed_by=username,
    ))
    await db.commit()


@router.get("/{target_id}/history", response_model=list)
async def target_history(target_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TargetStatusHistory)
        .where(TargetStatusHistory.target_id == target_id)
        .order_by(TargetStatusHistory.changed_at.desc())
    )
    items = result.scalars().all()
    return [TargetStatusHistorySchema.model_validate(i) for i in items]


@router.get("/{target_id}/checklist", response_model=list)
async def target_checklist(target_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(DueDiligenceItem)
        .where(DueDiligenceItem.target_id == target_id)
        .order_by(DueDiligenceItem.sort_order)
    )
    items = result.scalars().all()
    return [DueDiligenceItemSchema.model_validate(i) for i in items]


@router.put("/{target_id}/checklist/{item_id}", response_model=DueDiligenceItemSchema)
async def update_checklist_item(
    target_id: int,
    item_id: int,
    body: DueDiligenceUpdateSchema,
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DueDiligenceItem).where(
            DueDiligenceItem.id == item_id,
            DueDiligenceItem.target_id == target_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    item.is_complete = body.is_complete
    if body.is_complete and not item.completed_at:
        item.completed_at = datetime.now(timezone.utc)
        item.completed_by = body.completed_by or username
    elif not body.is_complete:
        item.completed_at = None
        item.completed_by = None
    if body.notes is not None:
        item.notes = body.notes

    await db.commit()
    return DueDiligenceItemSchema.model_validate(item)


@router.post("/{target_id}/files", response_model=TargetFileSchema, status_code=201)
async def upload_target_file(
    target_id: int,
    file: UploadFile = File(...),
    file_type: str = Form("other"),
    notes: Optional[str] = Form(None),
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Target).where(Target.id == target_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    upload_dir = Path(settings.UPLOADS_PATH) / str(target_id)
    upload_dir.mkdir(parents=True, exist_ok=True)

    filename = file.filename or "upload"
    storage_path = str(upload_dir / filename)

    content = await file.read()
    async with aiofiles.open(storage_path, "wb") as f:
        await f.write(content)

    tf = TargetFile(
        target_id=target_id,
        file_type=file_type,
        filename=filename,
        storage_path=storage_path,
        file_size_bytes=len(content),
        mime_type=file.content_type,
        uploaded_by=username,
        notes=notes,
    )
    db.add(tf)
    await db.commit()
    return TargetFileSchema.model_validate(tf)


@router.get("/{target_id}/files", response_model=list)
async def list_target_files(target_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TargetFile)
        .where(TargetFile.target_id == target_id)
        .order_by(TargetFile.uploaded_at.desc())
    )
    files = result.scalars().all()
    return [TargetFileSchema.model_validate(f) for f in files]


@router.delete("/{target_id}/files/{file_id}", status_code=204)
async def delete_target_file(
    target_id: int,
    file_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TargetFile).where(
            TargetFile.id == file_id,
            TargetFile.target_id == target_id,
        )
    )
    tf = result.scalar_one_or_none()
    if not tf:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        if os.path.exists(tf.storage_path):
            os.remove(tf.storage_path)
    except Exception as exc:
        logger.warning(f"Could not delete file {tf.storage_path}: {exc}")

    await db.delete(tf)
    await db.commit()


@router.post("/{target_id}/scrape-blm")
async def scrape_blm(
    target_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Target).where(Target.id == target_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    from app.models.claims import Claim
    claim_result = await db.execute(select(Claim).where(Claim.serial_nr == target.serial_nr))
    claim = claim_result.scalar_one_or_none()

    blm_url = claim.blm_url if claim else None
    if not blm_url or 'blm-case' not in blm_url:
        raise HTTPException(status_code=400, detail="No MLRS case URL available for this target")

    from app.ingestion.mlrs_scraper import scrape_mlrs_case
    try:
        data = await scrape_mlrs_case(blm_url)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Scrape error: {exc}")

    target.blm_scraped_data = data
    target.blm_scraped_at = datetime.now(timezone.utc)
    await db.commit()

    return data
