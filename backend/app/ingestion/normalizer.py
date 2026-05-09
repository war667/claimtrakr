import logging
from datetime import date, datetime
from typing import Any, Dict, Optional, Tuple

import shapely
from shapely.geometry import MultiPolygon, Polygon, shape
from shapely.wkt import dumps as to_wkt

logger = logging.getLogger(__name__)

CLAIM_TYPE_MAP = {
    "LODE": "lode",
    "LODE CLAIM": "lode",
    "PLACER": "placer",
    "PLACER CLAIM": "placer",
    "MILL SITE": "mill_site",
    "MILL SITE CLAIM": "mill_site",
    "MILL_SITE": "mill_site",
    "TUNNEL": "tunnel_site",
    "TUNNEL SITE": "tunnel_site",
    "TUNNEL SITE CLAIM": "tunnel_site",
}


def _epoch_ms_to_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    try:
        ts = int(value) / 1000.0
        return datetime.utcfromtimestamp(ts).date()
    except (ValueError, TypeError, OSError):
        return None


def _map_claim_type(raw: Any) -> str:
    if raw is None:
        return "unknown"
    normalized = str(raw).strip().upper()
    return CLAIM_TYPE_MAP.get(normalized, "unknown")


def _map_case_status(raw: Any) -> str:
    if raw is None:
        return "ACTIVE"
    val = str(raw).strip().upper()
    if val in ("ACTIVE", "A"):
        return "ACTIVE"
    if val in ("CLOSED", "C"):
        return "CLOSED"
    return "ACTIVE"


def _rings_to_multipolygon(geometry: Optional[Dict]) -> Optional[MultiPolygon]:
    if not geometry:
        return None
    geo_type = geometry.get("type", "")
    rings = geometry.get("rings")

    if geo_type == "MultiPolygon":
        try:
            geom = shape(geometry)
            if geom.is_valid and not geom.is_empty:
                return geom if isinstance(geom, MultiPolygon) else MultiPolygon([geom])
        except Exception:
            pass
        return None

    if geo_type == "Polygon":
        try:
            geom = shape(geometry)
            if geom.is_valid and not geom.is_empty:
                return MultiPolygon([geom]) if isinstance(geom, Polygon) else geom
        except Exception:
            pass
        return None

    if rings:
        try:
            polygons = []
            for ring in rings:
                if len(ring) < 3:
                    continue
                poly = Polygon(ring)
                if poly.is_valid and not poly.is_empty:
                    polygons.append(poly)
            if polygons:
                parts = [to_wkt(p, rounding_precision=6)[len("POLYGON "):] for p in polygons]
                return shapely.from_wkt("MULTIPOLYGON (" + ", ".join(parts) + ")")
        except Exception as exc:
            logger.debug(f"Ring to polygon conversion failed: {exc}")

    return None


def _geom_confidence(geom: Optional[MultiPolygon], acres: Any) -> str:
    if geom is None:
        return "none"
    if acres is not None:
        return "medium"
    return "low"


def normalize_feature(
    feature: Dict[str, Any],
    source_id: int,
    source_layer: str = "",
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Normalizes a raw BLM ArcGIS feature into a clean dict for DB insertion.
    Returns (normalized_dict, error_message). On error, returns (None, message).
    """
    try:
        attrs = feature.get("attributes") or feature.get("properties") or {}
        geometry_raw = feature.get("geometry")

        serial_nr = attrs.get("CASE_SERIAL_NR") or attrs.get("CSE_NR") or attrs.get("serial_nr")
        if not serial_nr:
            return None, "Missing serial_nr"
        serial_nr = str(serial_nr).strip()

        raw_acres = attrs.get("GIS_ACRES") or attrs.get("RCRD_ACRS") or attrs.get("acres")
        try:
            acres = float(raw_acres) if raw_acres is not None else None
        except (ValueError, TypeError):
            acres = None

        geom = _rings_to_multipolygon(geometry_raw)
        geom_confidence = _geom_confidence(geom, acres)

        geom_wkt: Optional[str] = None
        if geom is not None:
            try:
                geom_wkt = to_wkt(geom, rounding_precision=6)
            except Exception as exc:
                logger.warning(f"WKT conversion failed for {serial_nr}: {exc}")
                geom = None
                geom_confidence = "none"
                geom_wkt = None

        sf_id = attrs.get("SF_ID")
        if sf_id:
            blm_url = f"https://mlrs.blm.gov/s/blm-case/{sf_id}"
        elif geom is not None:
            c = geom.centroid
            blm_url = f"https://mlrs.blm.gov/s/research-map#15,{c.y:.6f},{c.x:.6f}"
        else:
            blm_url = "https://mlrs.blm.gov/s/research-map"

        normalized = {
            "serial_nr": serial_nr,
            "source_id": source_id,
            "claim_name": attrs.get("CASE_NM") or attrs.get("CSE_NAME") or attrs.get("claim_name"),
            "claim_type": _map_claim_type(attrs.get("CASE_TYPE") or attrs.get("BLM_PROD") or attrs.get("claim_type")),
            "claimant_name": (attrs.get("CLAIMANT_NM") or attrs.get("claimant_name") or "").strip() or None,
            "claimant_addr": attrs.get("CLAIMANT_ADDR") or attrs.get("claimant_addr"),
            "state": attrs.get("ADMIN_ST") or attrs.get("ADMIN_STATE") or attrs.get("state"),
            "county": (attrs.get("COUNTY_NM") or attrs.get("CNTY_NM") or
                       attrs.get("COUNTY_NAME") or attrs.get("COUNTY") or attrs.get("county")),
            "meridian": attrs.get("MERIDIAN") or attrs.get("meridian"),
            "township": attrs.get("TOWNSHIP") or attrs.get("township"),
            "township_dir": attrs.get("TOWNSHIP_DIR") or attrs.get("township_dir"),
            "range": attrs.get("RANGE") or attrs.get("range"),
            "range_dir": attrs.get("RANGE_DIR") or attrs.get("range_dir"),
            "section": attrs.get("SECTION") or attrs.get("section"),
            "aliquot": attrs.get("ALIQUOT") or attrs.get("aliquot"),
            "acres": acres,
            "case_status": _map_case_status(attrs.get("CASE_STATUS") or attrs.get("CSE_DISP") or attrs.get("case_status")),
            "disposition_cd": str(attrs["DISP_CD"]).strip() if attrs.get("DISP_CD") is not None else (attrs.get("disposition_cd") or None),
            "disposition_desc": attrs.get("DISP_DESC") or attrs.get("disposition_desc"),
            "location_dt": _epoch_ms_to_date(attrs.get("LOCATION_DT") or attrs.get("location_dt")),
            "filing_dt": _epoch_ms_to_date(attrs.get("FILING_DT") or attrs.get("filing_dt")),
            "closed_dt": _epoch_ms_to_date(attrs.get("CLOSE_DT") or attrs.get("closed_dt")),
            "last_action_dt": _epoch_ms_to_date(attrs.get("LAST_ACTION_DT") or attrs.get("last_action_dt")),
            "blm_url": blm_url,
            "source_layer": source_layer,
            "geom_source": "source",
            "geom_confidence": geom_confidence,
            "geom_wkt": geom_wkt,
        }
        return normalized, None

    except Exception as exc:
        return None, f"Normalization error: {exc}"


def normalize_csv_row(row: Dict[str, Any], source_id: int) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Normalize a flat CSV row (already in our schema field names)."""
    try:
        serial_nr = row.get("serial_nr")
        if not serial_nr:
            return None, "Missing serial_nr"

        raw_acres = row.get("acres")
        try:
            acres = float(raw_acres) if raw_acres not in (None, "", "None") else None
        except (ValueError, TypeError):
            acres = None

        def parse_date(val):
            if not val or val in ("None", ""):
                return None
            try:
                return datetime.strptime(str(val).split("T")[0], "%Y-%m-%d").date()
            except ValueError:
                return None

        normalized = {
            "serial_nr": str(serial_nr).strip(),
            "source_id": source_id,
            "claim_name": row.get("claim_name"),
            "claim_type": _map_claim_type(row.get("claim_type")),
            "claimant_name": row.get("claimant_name"),
            "claimant_addr": row.get("claimant_addr"),
            "state": row.get("state"),
            "county": row.get("county"),
            "meridian": row.get("meridian"),
            "township": row.get("township"),
            "township_dir": row.get("township_dir"),
            "range": row.get("range"),
            "range_dir": row.get("range_dir"),
            "section": row.get("section"),
            "aliquot": row.get("aliquot"),
            "acres": acres,
            "case_status": _map_case_status(row.get("case_status")),
            "disposition_cd": row.get("disposition_cd"),
            "disposition_desc": row.get("disposition_desc"),
            "location_dt": parse_date(row.get("location_dt")),
            "filing_dt": parse_date(row.get("filing_dt")),
            "closed_dt": parse_date(row.get("closed_dt")),
            "last_action_dt": parse_date(row.get("last_action_dt")),
            "blm_url": (
                f"https://glorecords.blm.gov/details/patent/default.aspx?serial={serial_nr}"
            ),
            "source_layer": "csv_upload",
            "geom_source": "manual",
            "geom_confidence": "none",
            "geom_wkt": None,
        }
        return normalized, None
    except Exception as exc:
        return None, f"CSV normalization error: {exc}"


def normalize_geojson_feature(
    feature: Dict[str, Any], source_id: int
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Normalize a GeoJSON feature (properties in our schema field names)."""
    props = feature.get("properties") or {}
    geometry_raw = feature.get("geometry")
    feature_with_attrs = {"attributes": props, "geometry": geometry_raw}
    result, err = normalize_feature(feature_with_attrs, source_id, source_layer="geojson_upload")
    if result and not result.get("serial_nr"):
        serial_nr = props.get("serial_nr")
        if serial_nr:
            result["serial_nr"] = str(serial_nr).strip()
        else:
            return None, "Missing serial_nr in GeoJSON properties"
    return result, err
