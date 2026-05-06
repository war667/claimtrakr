import csv
import io
import json
import logging
from typing import Any, Dict, List, Tuple

from app.ingestion.normalizer import normalize_csv_row, normalize_geojson_feature

logger = logging.getLogger(__name__)


def parse_csv(content: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Parse CSV bytes into list of row dicts. Returns (rows, errors)."""
    errors = []
    rows = []
    try:
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        for i, row in enumerate(reader):
            rows.append(dict(row))
    except Exception as exc:
        errors.append(f"CSV parse error: {exc}")
    return rows, errors


def parse_geojson(content: bytes) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Parse GeoJSON bytes into list of feature dicts. Returns (features, errors)."""
    errors = []
    features = []
    try:
        data = json.loads(content.decode("utf-8"))
        if data.get("type") == "FeatureCollection":
            features = data.get("features", [])
        elif data.get("type") == "Feature":
            features = [data]
        else:
            errors.append("GeoJSON must be a FeatureCollection or Feature")
    except Exception as exc:
        errors.append(f"GeoJSON parse error: {exc}")
    return features, errors


def normalize_uploaded_records(
    raw_records: List[Dict[str, Any]],
    source_id: int,
    source_type: str,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Normalize uploaded records. source_type is 'csv' or 'geojson'.
    Returns (normalized_list, error_messages).
    """
    normalized = []
    errors = []

    for i, record in enumerate(raw_records):
        try:
            if source_type == "geojson":
                result, err = normalize_geojson_feature(record, source_id)
            else:
                result, err = normalize_csv_row(record, source_id)

            if err:
                errors.append(f"Row {i+1}: {err}")
                continue
            if result:
                normalized.append(result)
        except Exception as exc:
            errors.append(f"Row {i+1}: unexpected error: {exc}")

    return normalized, errors
