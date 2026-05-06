from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class TargetCreateSchema(BaseModel):
    serial_nr: str
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    internal_name: Optional[str] = None


class TargetUpdateSchema(BaseModel):
    workflow_status: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    internal_name: Optional[str] = None
    proposed_claim_type: Optional[str] = None
    proposed_name: Optional[str] = None
    priority_score: Optional[int] = None
    priority_label: Optional[str] = None


class TargetSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    serial_nr: str
    workflow_status: str
    assigned_to: Optional[str] = None
    created_by: Optional[str] = None
    priority_score: int = 0
    priority_label: Optional[str] = None
    notes: Optional[str] = None
    internal_name: Optional[str] = None
    proposed_claim_type: Optional[str] = None
    proposed_name: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    status_changed_at: Optional[datetime] = None
    # denormalized claim fields
    claim_name: Optional[str] = None
    claim_type: Optional[str] = None
    claimant_name: Optional[str] = None
    state: Optional[str] = None
    county: Optional[str] = None
    case_status: Optional[str] = None
    closed_dt: Optional[str] = None
    acres: Optional[str] = None


class TargetStatusHistorySchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    target_id: int
    from_status: Optional[str] = None
    to_status: str
    changed_by: Optional[str] = None
    changed_at: Optional[datetime] = None
    notes: Optional[str] = None


class DueDiligenceItemSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    target_id: int
    task_key: str
    task_label: str
    is_complete: bool = False
    completed_by: Optional[str] = None
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    sort_order: int = 0
    created_at: Optional[datetime] = None


class DueDiligenceUpdateSchema(BaseModel):
    is_complete: bool
    notes: Optional[str] = None
    completed_by: Optional[str] = None


class TargetFileSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    target_id: int
    file_type: Optional[str] = None
    filename: str
    storage_path: str
    file_size_bytes: Optional[int] = None
    mime_type: Optional[str] = None
    uploaded_by: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    notes: Optional[str] = None


class PaginatedTargets(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[TargetSchema]
