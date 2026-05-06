from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict


class ClaimSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    serial_nr: str
    source_id: Optional[int] = None
    claim_name: Optional[str] = None
    claim_type: Optional[str] = None
    claimant_name: Optional[str] = None
    claimant_addr: Optional[str] = None
    state: Optional[str] = None
    county: Optional[str] = None
    meridian: Optional[str] = None
    township: Optional[str] = None
    township_dir: Optional[str] = None
    range_: Optional[str] = None
    range_dir: Optional[str] = None
    section: Optional[str] = None
    aliquot: Optional[str] = None
    acres: Optional[Decimal] = None
    case_status: str
    disposition_cd: Optional[str] = None
    disposition_desc: Optional[str] = None
    location_dt: Optional[date] = None
    filing_dt: Optional[date] = None
    closed_dt: Optional[date] = None
    last_action_dt: Optional[date] = None
    blm_url: Optional[str] = None
    source_layer: Optional[str] = None
    geom_source: Optional[str] = None
    geom_confidence: Optional[str] = None
    first_seen_at: Optional[datetime] = None
    last_seen_at: Optional[datetime] = None
    last_run_id: Optional[int] = None
    prev_status: Optional[str] = None
    prev_disp_cd: Optional[str] = None
    prev_claimant: Optional[str] = None
    is_duplicate: Optional[bool] = None
    needs_review: Optional[bool] = None
    raw_json: Optional[Any] = None


class PaginatedClaims(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[ClaimSchema]


class ClaimEventSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: Optional[int] = None
    serial_nr: str
    run_id: Optional[int] = None
    event_type: str
    event_subtype: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    detected_at: Optional[datetime] = None
    notes: Optional[str] = None


class DispositionCodeSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    description: str
    category: Optional[str] = None
    is_closure: bool = False
