import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import text, select, update

from app.database import AsyncSessionLocal
from app.models.ingestion import DataSource, IngestionRun, IngestionError, SourceRawRecord
from app.models.claims import Claim, ClaimEvent
from app.ingestion import blm_arcgis
from app.ingestion.normalizer import normalize_feature

logger = logging.getLogger(__name__)

DUE_DILIGENCE_TASKS = [
    (1, "mlrs_record_review", "Review MLRS / Serial Register record"),
    (2, "county_recorder_check", "Check county recorder for prior recording"),
    (3, "active_overlap_check", "Check for active claim overlaps"),
    (4, "plss_verification", "Verify Township / Range / Section in PLSS"),
    (5, "surface_ownership_check", "Verify surface ownership (manual BLM/state check)"),
    (6, "withdrawal_check", "Check for withdrawals or restricted-land status"),
    (7, "access_check", "Verify road and physical access to area"),
    (8, "mineral_evidence_review", "Review MRDS / historic mine data for mineral evidence"),
    (9, "field_photos", "Obtain field photos of the area"),
    (10, "gps_coordinates", "Record GPS coordinates for proposed location"),
    (11, "legal_review", "Attorney / compliance review completed"),
    (12, "final_stake_decision", "Final go / no-go staking decision made"),
]

UPSERT_SQL = text("""
INSERT INTO claims (
    serial_nr, source_id, claim_name, claim_type, claimant_name, claimant_addr,
    state, county, meridian, township, township_dir, range, range_dir, section,
    aliquot, acres, case_status, disposition_cd, disposition_desc,
    location_dt, filing_dt, closed_dt, last_action_dt, blm_url, source_layer,
    geom, geom_source, geom_confidence, bbox,
    first_seen_at, last_seen_at, last_run_id, raw_json
) VALUES (
    :serial_nr, :source_id, :claim_name, :claim_type, :claimant_name, :claimant_addr,
    :state, :county, :meridian, :township, :township_dir, :range, :range_dir, :section,
    :aliquot, :acres, :case_status, :disposition_cd, :disposition_desc,
    :location_dt, :filing_dt, :closed_dt, :last_action_dt, :blm_url, :source_layer,
    CASE WHEN CAST(:geom_wkt AS TEXT) IS NOT NULL THEN ST_GeomFromText(CAST(:geom_wkt AS TEXT), 4326) ELSE NULL END,
    :geom_source, :geom_confidence,
    CASE WHEN CAST(:geom_wkt AS TEXT) IS NOT NULL
         THEN ST_Envelope(ST_GeomFromText(CAST(:geom_wkt AS TEXT), 4326))
         ELSE NULL END,
    NOW(), NOW(), :last_run_id, CAST(:raw_json AS jsonb)
)
ON CONFLICT (serial_nr) DO UPDATE SET
    source_id = EXCLUDED.source_id,
    claim_name = EXCLUDED.claim_name,
    claim_type = EXCLUDED.claim_type,
    claimant_name = EXCLUDED.claimant_name,
    claimant_addr = EXCLUDED.claimant_addr,
    state = EXCLUDED.state,
    county = EXCLUDED.county,
    meridian = EXCLUDED.meridian,
    township = EXCLUDED.township,
    township_dir = EXCLUDED.township_dir,
    range = EXCLUDED.range,
    range_dir = EXCLUDED.range_dir,
    section = EXCLUDED.section,
    aliquot = EXCLUDED.aliquot,
    acres = EXCLUDED.acres,
    case_status = EXCLUDED.case_status,
    disposition_cd = EXCLUDED.disposition_cd,
    disposition_desc = EXCLUDED.disposition_desc,
    location_dt = EXCLUDED.location_dt,
    filing_dt = EXCLUDED.filing_dt,
    closed_dt = EXCLUDED.closed_dt,
    last_action_dt = EXCLUDED.last_action_dt,
    blm_url = EXCLUDED.blm_url,
    source_layer = EXCLUDED.source_layer,
    geom = COALESCE(EXCLUDED.geom, claims.geom),
    geom_source = EXCLUDED.geom_source,
    geom_confidence = EXCLUDED.geom_confidence,
    bbox = COALESCE(EXCLUDED.bbox, claims.bbox),
    last_seen_at = NOW(),
    last_run_id = EXCLUDED.last_run_id,
    prev_status = claims.case_status,
    prev_disp_cd = claims.disposition_cd,
    prev_claimant = claims.claimant_name,
    raw_json = EXCLUDED.raw_json
""")


async def _log_error(
    session,
    run_id: int,
    error_type: str,
    error_message: str,
    serial_nr: Optional[str] = None,
    page_offset: Optional[int] = None,
    raw_data: Optional[Any] = None,
) -> None:
    err = IngestionError(
        run_id=run_id,
        error_type=error_type,
        serial_nr=serial_nr,
        page_offset=page_offset,
        error_message=error_message,
        raw_data=raw_data,
    )
    session.add(err)
    await session.flush()


async def run_ingestion(source_key: str, triggered_by: str = "scheduler") -> int:
    """Run ingestion for a single source. Returns run_id."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DataSource).where(DataSource.source_key == source_key)
        )
        source = result.scalar_one_or_none()
        if not source:
            raise ValueError(f"Unknown source_key: {source_key}")

        run = IngestionRun(source_id=source.id, triggered_by=triggered_by, status="running")
        session.add(run)
        await session.flush()
        run_id = run.id
        run_start_time = datetime.now(timezone.utc)
        logger.info(f"Starting ingestion run {run_id} for {source_key}")

        records_fetched = 0
        records_upserted = 0
        records_errored = 0
        changes_detected = 0
        catastrophic = False

        try:
            if source.source_type == "arcgis_rest":
                state_filter = source.state_filter or ["UT", "NV"]

                fetch_errors = 0

                async def on_fetch_error(error_type, page_offset, error_message, raw_data):
                    nonlocal fetch_errors
                    fetch_errors += 1
                    await _log_error(
                        session, run_id, error_type, error_message,
                        page_offset=page_offset, raw_data=raw_data
                    )

                try:
                    features = await blm_arcgis.fetch_all_features(
                        base_url=source.base_url,
                        layer_index=source.layer_index,
                        state_filter=state_filter,
                        run_id=run_id,
                        on_error=on_fetch_error,
                    )
                except Exception as exc:
                    logger.error(f"Catastrophic fetch failure for {source_key}: {exc}")
                    run.status = "error"
                    run.error_summary = str(exc)
                    run.finished_at = datetime.now(timezone.utc)
                    await session.commit()
                    return run_id

                records_fetched = len(features)

                # Get existing claims for change detection, scoped by state.
                # Cannot filter by source_id because the upsert overwrites it on every run,
                # causing all records to appear as new_claim events on subsequent runs.
                state_placeholders = ", ".join(f":st{i}" for i in range(len(state_filter)))
                state_params = {f"st{i}": s for i, s in enumerate(state_filter)}
                existing_result = await session.execute(
                    text(f"SELECT serial_nr, case_status, claimant_name, disposition_cd FROM claims WHERE state IN ({state_placeholders})"),
                    state_params,
                )
                existing_map = {
                    row[0]: {"case_status": row[1], "claimant_name": row[2], "disposition_cd": row[3]}
                    for row in existing_result.fetchall()
                }

                for feature in features:
                    normalized, err = normalize_feature(
                        feature,
                        source_id=source.id,
                        source_layer=source.source_key,
                    )
                    if err or not normalized:
                        records_errored += 1
                        serial_nr = (feature.get("attributes") or {}).get("CASE_SERIAL_NR")
                        await _log_error(
                            session, run_id, "parse_error", err or "Unknown parse error",
                            serial_nr=serial_nr, raw_data=feature.get("attributes")
                        )
                        continue

                    serial_nr = normalized["serial_nr"]

                    # Insert raw record
                    raw_rec = SourceRawRecord(
                        run_id=run_id,
                        source_id=source.id,
                        serial_nr=serial_nr,
                        raw_json=feature.get("attributes") or {},
                    )
                    session.add(raw_rec)

                    # Detect changes
                    existing = existing_map.get(serial_nr)
                    if existing is None:
                        event = ClaimEvent(
                            serial_nr=serial_nr,
                            run_id=run_id,
                            event_type="new_claim",
                        )
                        session.add(event)
                        changes_detected += 1
                    else:
                        new_status = normalized["case_status"]
                        old_status = existing["case_status"]
                        if old_status and new_status and old_status != new_status:
                            session.add(ClaimEvent(
                                serial_nr=serial_nr,
                                run_id=run_id,
                                event_type="status_changed",
                                event_subtype=f"{old_status.lower()}_to_{new_status.lower()}",
                                old_value=old_status,
                                new_value=new_status,
                            ))
                            changes_detected += 1

                        new_claimant = normalized.get("claimant_name")
                        old_claimant = existing.get("claimant_name")
                        if old_claimant and new_claimant and old_claimant != new_claimant:
                            session.add(ClaimEvent(
                                serial_nr=serial_nr,
                                run_id=run_id,
                                event_type="claimant_changed",
                                old_value=old_claimant,
                                new_value=new_claimant,
                            ))
                            changes_detected += 1

                        new_disp = normalized.get("disposition_cd")
                        old_disp = existing.get("disposition_cd")
                        if old_disp and new_disp and old_disp != new_disp:
                            session.add(ClaimEvent(
                                serial_nr=serial_nr,
                                run_id=run_id,
                                event_type="disposition_changed",
                                old_value=old_disp,
                                new_value=new_disp,
                            ))
                            changes_detected += 1

                    # Upsert claim
                    try:
                        geom_wkt = normalized.pop("geom_wkt", None)
                        params = {
                            **normalized,
                            "geom_wkt": geom_wkt,
                            "last_run_id": run_id,
                            "raw_json": json.dumps(feature.get("attributes") or {}),
                            "location_dt": str(normalized["location_dt"]) if normalized.get("location_dt") else None,
                            "filing_dt": str(normalized["filing_dt"]) if normalized.get("filing_dt") else None,
                            "closed_dt": str(normalized["closed_dt"]) if normalized.get("closed_dt") else None,
                            "last_action_dt": str(normalized["last_action_dt"]) if normalized.get("last_action_dt") else None,
                        }
                        await session.execute(UPSERT_SQL, params)
                        records_upserted += 1
                    except Exception as exc:
                        records_errored += 1
                        logger.warning(f"Upsert error for {serial_nr}: {exc}")
                        await _log_error(
                            session, run_id, "upsert_error", str(exc),
                            serial_nr=serial_nr
                        )

                    # Flush periodically to avoid huge transaction
                    if records_upserted % 500 == 0:
                        await session.flush()

                # Only detect removed records if the fetch completed without errors
                if fetch_errors == 0:
                    removed_result = await session.execute(
                        text(f"""
                        SELECT serial_nr FROM claims
                        WHERE state IN ({state_placeholders}) AND last_seen_at < :run_start
                        """),
                        {**state_params, "run_start": run_start_time},
                    )
                    for (removed_serial,) in removed_result.fetchall():
                        session.add(ClaimEvent(
                            serial_nr=removed_serial,
                            run_id=run_id,
                            event_type="claim_removed",
                        ))
                        changes_detected += 1

            run.status = "success" if records_errored == 0 else "partial"
            run.records_fetched = records_fetched
            run.records_upserted = records_upserted
            run.records_errored = records_errored
            run.changes_detected = changes_detected
            run.finished_at = datetime.now(timezone.utc)

        except Exception as exc:
            logger.error(f"Catastrophic failure in run {run_id}: {exc}", exc_info=True)
            run.status = "error"
            run.error_summary = str(exc)
            run.finished_at = datetime.now(timezone.utc)

        await session.commit()
        logger.info(
            f"Run {run_id} complete: status={run.status} fetched={records_fetched} "
            f"upserted={records_upserted} errors={records_errored} changes={changes_detected}"
        )
        return run_id


async def run_all_sources() -> List[int]:
    """Run ingestion for all active arcgis_rest sources sequentially."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DataSource).where(
                DataSource.is_active == True,
                DataSource.source_type == "arcgis_rest",
            )
        )
        sources = result.scalars().all()

    run_ids = []
    for source in sources:
        try:
            run_id = await run_ingestion(source.source_key, triggered_by="scheduler")
            run_ids.append(run_id)
        except Exception as exc:
            logger.error(f"Failed to run ingestion for {source.source_key}: {exc}")
    return run_ids
