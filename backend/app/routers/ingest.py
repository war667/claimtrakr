import json
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_credentials
from app.database import get_db, AsyncSessionLocal
from app.models.ingestion import DataSource, IngestionRun, IngestionError
from app.schemas.ingestion import (
    DataSourceSchema, IngestionRunSchema, IngestionRunDetailSchema,
    IngestionErrorSchema, IngestionStatusSchema, IngestionSourceStatus,
    PaginatedRuns, UploadResult,
)
from app.ingestion.runner import run_ingestion, run_all_sources, UPSERT_SQL
from app.ingestion.csv_upload import parse_csv, parse_geojson, normalize_uploaded_records

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(verify_credentials)])


@router.get("/status", response_model=IngestionStatusSchema)
async def get_ingestion_status(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DataSource).where(DataSource.is_active == True).order_by(DataSource.id))
    sources = result.scalars().all()

    statuses = []
    for source in sources:
        last_run_result = await db.execute(
            text("""
            SELECT id, started_at, status, records_fetched, changes_detected, error_summary
            FROM ingestion_runs
            WHERE source_id = :sid
            ORDER BY started_at DESC
            LIMIT 1
            """),
            {"sid": source.id},
        )
        last_run = last_run_result.fetchone()

        # Compute next run time (02:00 UTC next day)
        now = datetime.now(timezone.utc)
        next_run = now.replace(hour=2, minute=0, second=0, microsecond=0)
        if next_run <= now:
            from datetime import timedelta
            next_run = next_run + timedelta(days=1)

        statuses.append(
            IngestionSourceStatus(
                source_key=source.source_key,
                display_name=source.display_name,
                source_type=source.source_type,
                is_active=source.is_active,
                last_run_id=last_run[0] if last_run else None,
                last_run_at=last_run[1] if last_run else None,
                last_run_status=last_run[2] if last_run else None,
                last_records_fetched=last_run[3] if last_run else 0,
                last_changes_detected=last_run[4] if last_run else 0,
                last_error_summary=last_run[5] if last_run else None,
                next_run_at=next_run if source.source_type == "arcgis_rest" else None,
            )
        )

    return IngestionStatusSchema(sources=statuses)


@router.get("/sources", response_model=list)
async def list_sources(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DataSource).order_by(DataSource.id))
    sources = result.scalars().all()
    return [DataSourceSchema.model_validate(s) for s in sources]


@router.get("/runs", response_model=PaginatedRuns)
async def list_runs(
    page: int = 1,
    page_size: int = 50,
    source_key: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    where = "1=1"
    params = {}
    if source_key:
        where += " AND ds.source_key = :source_key"
        params["source_key"] = source_key

    count_sql = text(f"""
        SELECT COUNT(*) FROM ingestion_runs ir
        JOIN data_sources ds ON ds.id = ir.source_id
        WHERE {where}
    """)
    count_result = await db.execute(count_sql, params)
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset

    data_sql = text(f"""
        SELECT ir.id, ir.source_id, ir.triggered_by, ir.started_at, ir.finished_at,
               ir.status, ir.records_fetched, ir.records_upserted, ir.records_errored,
               ir.changes_detected, ir.error_summary, ir.metadata
        FROM ingestion_runs ir
        JOIN data_sources ds ON ds.id = ir.source_id
        WHERE {where}
        ORDER BY ir.started_at DESC
        LIMIT :limit OFFSET :offset
    """)
    result = await db.execute(data_sql, params)
    rows = result.fetchall()

    items = [
        IngestionRunSchema(
            id=r[0], source_id=r[1], triggered_by=r[2], started_at=r[3],
            finished_at=r[4], status=r[5], records_fetched=r[6] or 0,
            records_upserted=r[7] or 0, records_errored=r[8] or 0,
            changes_detected=r[9] or 0, error_summary=r[10], metadata_=r[11],
        )
        for r in rows
    ]
    return PaginatedRuns(total=total, page=page, page_size=page_size, items=items)


@router.get("/runs/{run_id}")
async def get_run(run_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(IngestionRun).where(IngestionRun.id == run_id))
    run = result.scalar_one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    errors_result = await db.execute(
        select(IngestionError)
        .where(IngestionError.run_id == run_id)
        .order_by(IngestionError.occurred_at.desc())
    )
    errors = errors_result.scalars().all()

    return IngestionRunDetailSchema(
        id=run.id, source_id=run.source_id, triggered_by=run.triggered_by,
        started_at=run.started_at, finished_at=run.finished_at, status=run.status,
        records_fetched=run.records_fetched or 0, records_upserted=run.records_upserted or 0,
        records_errored=run.records_errored or 0, changes_detected=run.changes_detected or 0,
        error_summary=run.error_summary, metadata_=run.metadata_,
        errors=[IngestionErrorSchema.model_validate(e) for e in errors],
    )


async def _bg_run_all():
    try:
        await run_all_sources()
    except Exception as exc:
        logger.error(f"Background run_all_sources failed: {exc}", exc_info=True)


async def _bg_run_source(source_key: str):
    try:
        await run_ingestion(source_key, triggered_by="api")
    except Exception as exc:
        logger.error(f"Background run_ingestion({source_key}) failed: {exc}", exc_info=True)


@router.post("/trigger", status_code=202)
async def trigger_all(background_tasks: BackgroundTasks):
    background_tasks.add_task(_bg_run_all)
    return {"status": "accepted", "message": "Full ingestion started as background task"}


@router.post("/trigger/{source_key}", status_code=202)
async def trigger_source(
    source_key: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DataSource).where(DataSource.source_key == source_key)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail=f"Source '{source_key}' not found")

    background_tasks.add_task(_bg_run_source, source_key)
    return {"status": "accepted", "source_key": source_key, "message": "Ingestion started"}


@router.post("/upload", response_model=UploadResult)
async def upload_file(
    file: UploadFile = File(...),
    source_type: str = Form("csv"),
    notes: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    if source_type not in ("csv", "geojson"):
        raise HTTPException(status_code=400, detail="source_type must be 'csv' or 'geojson'")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    # Find manual_upload source
    src_result = await db.execute(
        select(DataSource).where(DataSource.source_key == "manual_upload")
    )
    source = src_result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=500, detail="manual_upload source not configured")

    # Create run record
    run = IngestionRun(
        source_id=source.id,
        triggered_by="manual",
        status="running",
        metadata_={"filename": file.filename, "notes": notes},
    )
    db.add(run)
    await db.flush()
    run_id = run.id

    parse_errors = []
    if source_type == "geojson":
        raw_records, parse_errors = parse_geojson(content)
    else:
        raw_records, parse_errors = parse_csv(content)

    if parse_errors:
        run.status = "error"
        run.error_summary = "; ".join(parse_errors[:5])
        run.finished_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(status_code=422, detail=parse_errors)

    normalized_records, norm_errors = normalize_uploaded_records(
        raw_records, source_id=source.id, source_type=source_type
    )

    accepted = 0
    rejected = len(norm_errors)
    upsert_errors = []

    for record in normalized_records:
        try:
            geom_wkt = record.pop("geom_wkt", None)
            params = {
                **record,
                "geom_wkt": geom_wkt,
                "last_run_id": run_id,
                "raw_json": json.dumps({}),
                "location_dt": str(record["location_dt"]) if record.get("location_dt") else None,
                "filing_dt": str(record["filing_dt"]) if record.get("filing_dt") else None,
                "closed_dt": str(record["closed_dt"]) if record.get("closed_dt") else None,
                "last_action_dt": str(record["last_action_dt"]) if record.get("last_action_dt") else None,
            }
            await db.execute(UPSERT_SQL, params)
            accepted += 1
        except Exception as exc:
            rejected += 1
            upsert_errors.append(str(exc)[:200])

    run.status = "success" if not upsert_errors else "partial"
    run.records_fetched = len(raw_records)
    run.records_upserted = accepted
    run.records_errored = rejected
    run.finished_at = datetime.now(timezone.utc)

    await db.commit()

    messages = norm_errors[:10] + upsert_errors[:10]
    return UploadResult(
        accepted=accepted,
        rejected=rejected,
        errors=len(norm_errors) + len(upsert_errors),
        run_id=run_id,
        messages=messages,
    )
