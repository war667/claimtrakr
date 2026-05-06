from typing import Optional, Tuple


def parse_bbox(bbox_str: Optional[str]) -> Optional[Tuple[float, float, float, float]]:
    """Parse 'minX,minY,maxX,maxY' string into tuple, or None."""
    if not bbox_str:
        return None
    try:
        parts = [float(x.strip()) for x in bbox_str.split(",")]
        if len(parts) != 4:
            return None
        return tuple(parts)
    except (ValueError, TypeError):
        return None


def bbox_to_envelope_sql(bbox: Tuple[float, float, float, float]) -> str:
    """Return PostGIS ST_MakeEnvelope expression string."""
    return f"ST_MakeEnvelope({bbox[0]}, {bbox[1]}, {bbox[2]}, {bbox[3]}, 4326)"
