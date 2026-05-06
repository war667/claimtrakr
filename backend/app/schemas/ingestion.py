from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict


class DataSourceSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_key: str
    display_name: str
    source_type: str
    base_url: Optional[str] = None
    layer_index: Optional[int] = None
    state_filter: Optional[List[str]] = None
    is_active: bool
    phase: int
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class IngestionRunSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_id: Optional[int] = None
    triggered_by: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    status: Optional[str] = None
    records_fetched: int = 0
    records_upserted: int = 0
    records_errored: int = 0
    changes_detected: int = 0
    error_summary: Optional[str] = None
    metadata_: Optional[Any] = None


class IngestionErrorSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    run_id: Optional[int] = None
    error_type: Optional[str] = None
    serial_nr: Optional[str] = None
    page_offset: Optional[int] = None
    error_message: Optional[str] = None
    raw_data: Optional[Any] = None
    occurred_at: Optional[datetime] = None


class IngestionRunDetailSchema(IngestionRunSchema):
    errors: List[IngestionErrorSchema] = []


class IngestionSourceStatus(BaseModel):
    source_key: str
    display_name: str
    source_type: str
    is_active: bool
    last_run_id: Optional[int] = None
    last_run_at: Optional[datetime] = None
    last_run_status: Optional[str] = None
    last_records_fetched: int = 0
    last_changes_detected: int = 0
    last_error_summary: Optional[str] = None
    next_run_at: Optional[datetime] = None


class IngestionStatusSchema(BaseModel):
    sources: List[IngestionSourceStatus]


class PaginatedRuns(BaseModel):
    total: int
    page: int
    page_size: int
    items: List[IngestionRunSchema]


class UploadResult(BaseModel):
    accepted: int
    rejected: int
    errors: int
    run_id: Optional[int] = None
    messages: List[str] = []
