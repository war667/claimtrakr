import json
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_credentials
from app.database import get_db
from app.models.claims import Claim, ClaimEvent
from app.schemas.claims import ClaimSchema, PaginatedClaims, ClaimEventSchema
from app.utils.geo import parse_bbox

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(verify_credentials)])

VALID_SORT_COLUMNS = {
    "closed_dt", "serial_nr", "claimant_name", "county", "state",
    "claim_type", "acres", "first_seen_at", "last_seen_at", "case_status",
    "last_event_at",
}


def _build_where(
    state=None, county=None, status=None, claim_type=None,
    closed_within_days=None, changed_within_days=None,
    disposition_cd=None, search=None, bbox=None,
):
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
        types = [t.strip() for t in claim_type.split(",") if t.strip()]
        if len(types) == 1:
            conditions.append("c.claim_type = :claim_type")
            params["claim_type"] = types[0]
        elif len(types) > 1:
            placeholders = ", ".join(f":ct{i}" for i in range(len(types)))
            conditions.append(f"c.claim_type IN ({placeholders})")
            for i, t in enumerate(types):
                params[f"ct{i}"] = t
    if closed_within_days:
        # closed_dt is NULL for all BLM records (API doesn't return dates).
        # Use claim_events instead: find CLOSED claims whose status transition
        # or first-seen event was detected within N days.
        days = int(closed_within_days)
        conditions.append(f"""
            c.case_status = 'CLOSED'
            AND EXISTS (
                SELECT 1 FROM claim_events ce
                WHERE ce.serial_nr = c.serial_nr
                  AND (
                    (ce.event_type = 'status_changed' AND ce.new_value = 'CLOSED')
                    OR ce.event_type = 'new_claim'
                  )
                  AND ce.detected_at >= NOW() - INTERVAL '{days} days'
            )
        """)
    if changed_within_days:
        days = int(changed_within_days)
        conditions.append(f"""
            EXISTS (
                SELECT 1 FROM claim_events ce
                WHERE ce.serial_nr = c.serial_nr
                  AND ce.event_type IN ('status_changed', 'new_claim', 'claimant_changed')
                  AND ce.detected_at >= NOW() - INTERVAL '{days} days'
            )
        """)
    if disposition_cd:
        conditions.append("c.disposition_cd = :disposition_cd")
        params["disposition_cd"] = disposition_cd
    if search:
        conditions.append("(c.claimant_name ILIKE :search OR c.serial_nr ILIKE :search OR c.claim_name ILIKE :search)")
        params["search"] = f"%{search}%"
    if bbox:
        parsed = parse_bbox(bbox)
        if parsed:
            conditions.append(
                f"c.bbox && ST_MakeEnvelope({parsed[0]}, {parsed[1]}, {parsed[2]}, {parsed[3]}, 4326)"
            )

    return " AND ".join(conditions), params


@router.get("", response_model=PaginatedClaims)
async def list_claims(
    state: Optional[str] = None,
    county: Optional[str] = None,
    status: Optional[str] = None,
    claim_type: Optional[str] = None,
    closed_within_days: Optional[int] = None,
    changed_within_days: Optional[int] = None,
    disposition_cd: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    sort_by: str = Query("last_seen_at"),
    sort_dir: str = Query("desc"),
    db: AsyncSession = Depends(get_db),
):
    if sort_by not in VALID_SORT_COLUMNS:
        sort_by = "last_seen_at"
    sort_dir = "DESC" if sort_dir.lower() == "desc" else "ASC"

    where_clause, params = _build_where(
        state=state, county=county, status=status, claim_type=claim_type,
        closed_within_days=closed_within_days, changed_within_days=changed_within_days,
        disposition_cd=disposition_cd, search=search,
    )

    needs_event_join = sort_by == "last_event_at" or changed_within_days is not None

    if needs_event_join:
        join_sql = """
            LEFT JOIN (
                SELECT serial_nr, MAX(detected_at) AS last_event_at
                FROM claim_events
                GROUP BY serial_nr
            ) evt ON evt.serial_nr = c.serial_nr
        """
        event_col = ", evt.last_event_at"
        order_col = "evt.last_event_at" if sort_by == "last_event_at" else f"c.{sort_by}"
    else:
        join_sql = ""
        event_col = ", NULL::timestamptz AS last_event_at"
        order_col = f"c.{sort_by}"

    count_sql = text(f"SELECT COUNT(*) FROM claims c {join_sql} WHERE {where_clause}")
    count_result = await db.execute(count_sql, params)
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    data_sql = text(f"""
        SELECT
            c.id, c.serial_nr, c.source_id, c.claim_name, c.claim_type,
            c.claimant_name, c.claimant_addr, c.state, c.county,
            c.meridian, c.township, c.township_dir, c.range, c.range_dir,
            c.section, c.aliquot, c.acres, c.case_status, c.disposition_cd,
            c.disposition_desc, c.location_dt, c.filing_dt, c.closed_dt,
            c.last_action_dt, c.blm_url, c.source_layer, c.geom_source,
            c.geom_confidence, c.first_seen_at, c.last_seen_at, c.last_run_id,
            c.prev_status, c.prev_disp_cd, c.prev_claimant,
            c.is_duplicate, c.needs_review, c.raw_json{event_col}
        FROM claims c {join_sql}
        WHERE {where_clause}
        ORDER BY {order_col} {sort_dir} NULLS LAST
        LIMIT :limit OFFSET :offset
    """)
    params["limit"] = page_size
    params["offset"] = offset
    result = await db.execute(data_sql, params)
    rows = result.fetchall()

    items = []
    for row in rows:
        items.append(ClaimSchema(
            id=row[0], serial_nr=row[1], source_id=row[2], claim_name=row[3],
            claim_type=row[4], claimant_name=row[5], claimant_addr=row[6],
            state=row[7], county=row[8], meridian=row[9], township=row[10],
            township_dir=row[11], range_=row[12], range_dir=row[13],
            section=row[14], aliquot=row[15], acres=row[16], case_status=row[17],
            disposition_cd=row[18], disposition_desc=row[19], location_dt=row[20],
            filing_dt=row[21], closed_dt=row[22], last_action_dt=row[23],
            blm_url=row[24], source_layer=row[25], geom_source=row[26],
            geom_confidence=row[27], first_seen_at=row[28], last_seen_at=row[29],
            last_run_id=row[30], prev_status=row[31], prev_disp_cd=row[32],
            prev_claimant=row[33], is_duplicate=row[34], needs_review=row[35],
            raw_json=row[36], last_event_at=row[37],
        ))

    return PaginatedClaims(total=total, page=page, page_size=page_size, items=items)


PAYMENT_PAID_EXPR = "(pt.next_pmt_due_dt > (DATE_TRUNC('year', CURRENT_DATE) + INTERVAL '8 months')::date)"


@router.get("/geojson")
async def claims_geojson(
    state: Optional[str] = None,
    county: Optional[str] = None,
    status: Optional[str] = None,
    claim_type: Optional[str] = None,
    closed_within_days: Optional[int] = None,
    disposition_cd: Optional[str] = None,
    search: Optional[str] = None,
    bbox: Optional[str] = None,
    payment_status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    where_clause, params = _build_where(
        state=state, county=county, status=status, claim_type=claim_type,
        closed_within_days=closed_within_days, disposition_cd=disposition_cd,
        search=search, bbox=bbox,
    )

    if payment_status in ("paid", "unpaid"):
        join_clause = "INNER JOIN blm_payment_tracking pt ON pt.serial_nr = c.serial_nr"
        paid_filter = PAYMENT_PAID_EXPR if payment_status == "paid" else f"NOT {PAYMENT_PAID_EXPR}"
        where_clause = f"{where_clause} AND {paid_filter}"
    else:
        join_clause = ""

    sql = text(f"""
        SELECT
            c.serial_nr, c.claim_name, c.claim_type, c.claimant_name,
            c.state, c.county, c.acres, c.case_status, c.disposition_cd,
            c.disposition_desc, c.location_dt, c.closed_dt, c.blm_url,
            c.geom_confidence, c.first_seen_at, c.last_seen_at,
            ST_AsGeoJSON(c.geom) as geojson
        FROM claims c
        {join_clause}
        WHERE {where_clause}
          AND c.geom IS NOT NULL
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
                "serial_nr": row[0],
                "claim_name": row[1],
                "claim_type": row[2],
                "claimant_name": row[3],
                "state": row[4],
                "county": row[5],
                "acres": float(row[6]) if row[6] is not None else None,
                "case_status": row[7],
                "disposition_cd": row[8],
                "disposition_desc": row[9],
                "location_dt": str(row[10]) if row[10] else None,
                "closed_dt": str(row[11]) if row[11] else None,
                "blm_url": row[12],
                "geom_confidence": row[13],
                "first_seen_at": str(row[14]) if row[14] else None,
                "last_seen_at": str(row[15]) if row[15] else None,
            },
        })

    return {"type": "FeatureCollection", "features": features}


@router.get("/export/kml")
async def export_kml(
    state: Optional[str] = None,
    county: Optional[str] = None,
    status: Optional[str] = None,
    claim_type: Optional[str] = None,
    closed_within_days: Optional[int] = None,
    disposition_cd: Optional[str] = None,
    search: Optional[str] = None,
    bbox: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    where_clause, params = _build_where(
        state=state, county=county, status=status, claim_type=claim_type,
        closed_within_days=closed_within_days, disposition_cd=disposition_cd,
        search=search, bbox=bbox,
    )

    sql = text(f"""
        SELECT
            c.serial_nr, c.claim_name, c.claimant_name,
            c.state, c.county, c.acres, c.case_status,
            c.closed_dt, ST_AsGeoJSON(c.geom) as geojson
        FROM claims c
        WHERE {where_clause}
          AND c.geom IS NOT NULL
        ORDER BY c.serial_nr
    """)
    result = await db.execute(sql, params)
    rows = result.fetchall()

    def escape(s):
        return str(s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    def ring_coords(ring):
        return ' '.join(f"{lon},{lat},0" for lon, lat in ring)

    def placemark(row):
        serial_nr, claim_name, claimant_name, state, county, acres, case_status, closed_dt, geojson_str = row
        try:
            geom = json.loads(geojson_str)
        except Exception:
            return ''

        desc_parts = [
            claim_name    and f"Name: {claim_name}",
            claimant_name and f"Claimant: {claimant_name}",
            case_status   and f"Status: {case_status}",
            county        and f"County: {county}, {state}",
            acres         and f"Acres: {acres}",
            closed_dt     and f"Closed: {closed_dt}",
        ]
        desc = '&#10;'.join(escape(p) for p in desc_parts if p)

        if geom['type'] == 'Polygon':
            rings = [geom['coordinates'][0]]
        elif geom['type'] == 'MultiPolygon':
            rings = [poly[0] for poly in geom['coordinates']]
        else:
            return ''

        polys = ''.join(
            f"<Polygon><outerBoundaryIs><LinearRing>"
            f"<coordinates>{ring_coords(r)}</coordinates>"
            f"</LinearRing></outerBoundaryIs></Polygon>"
            for r in rings
        )
        geometry = f"<MultiGeometry>{polys}</MultiGeometry>" if len(rings) > 1 else polys

        return (
            f"<Placemark>"
            f"<name>{escape(serial_nr)}</name>"
            f"<description>{desc}</description>"
            f"{geometry}"
            f"</Placemark>\n"
        )

    def generate():
        today = date.today().isoformat()
        yield (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<kml xmlns="http://www.opengis.net/kml/2.2">\n'
            '<Document>\n'
            f'<name>ClaimTrakr Export {today}</name>\n'
        )
        for row in rows:
            pm = placemark(row)
            if pm:
                yield pm
        yield '</Document>\n</kml>\n'

    today = date.today().isoformat()
    filename = f"claimtrakr_{today}.kml"
    return StreamingResponse(
        generate(),
        media_type='application/vnd.google-earth.kml+xml',
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{serial_nr}/events", response_model=list)
async def claim_events(
    serial_nr: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ClaimEvent)
        .where(ClaimEvent.serial_nr == serial_nr)
        .order_by(ClaimEvent.detected_at.desc())
    )
    events = result.scalars().all()
    return [ClaimEventSchema.model_validate(e) for e in events]


@router.get("/{serial_nr}/raw")
async def claim_raw(
    serial_nr: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
        SELECT raw_json, fetched_at FROM source_raw_records
        WHERE serial_nr = :serial_nr
        ORDER BY fetched_at DESC
        LIMIT 1
        """),
        {"serial_nr": serial_nr},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="No raw record found")
    return {"raw_json": row[0], "fetched_at": row[1]}


@router.get("/{serial_nr}", response_model=ClaimSchema)
async def get_claim(
    serial_nr: str,
    db: AsyncSession = Depends(get_db),
):
    sql = text("""
        SELECT
            id, serial_nr, source_id, claim_name, claim_type,
            claimant_name, claimant_addr, state, county,
            meridian, township, township_dir, range, range_dir,
            section, aliquot, acres, case_status, disposition_cd,
            disposition_desc, location_dt, filing_dt, closed_dt,
            last_action_dt, blm_url, source_layer, geom_source,
            geom_confidence, first_seen_at, last_seen_at, last_run_id,
            prev_status, prev_disp_cd, prev_claimant,
            is_duplicate, needs_review, raw_json
        FROM claims WHERE serial_nr = :serial_nr
    """)
    result = await db.execute(sql, {"serial_nr": serial_nr})
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")
    return ClaimSchema(
        id=row[0], serial_nr=row[1], source_id=row[2], claim_name=row[3],
        claim_type=row[4], claimant_name=row[5], claimant_addr=row[6],
        state=row[7], county=row[8], meridian=row[9], township=row[10],
        township_dir=row[11], range_=row[12], range_dir=row[13],
        section=row[14], aliquot=row[15], acres=row[16], case_status=row[17],
        disposition_cd=row[18], disposition_desc=row[19], location_dt=row[20],
        filing_dt=row[21], closed_dt=row[22], last_action_dt=row[23],
        blm_url=row[24], source_layer=row[25], geom_source=row[26],
        geom_confidence=row[27], first_seen_at=row[28], last_seen_at=row[29],
        last_run_id=row[30], prev_status=row[31], prev_disp_cd=row[32],
        prev_claimant=row[33], is_duplicate=row[34], needs_review=row[35],
        raw_json=row[36],
    )
