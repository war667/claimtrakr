from sqlalchemy import Column, Integer, BigInteger, Text, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class DataSource(Base):
    __tablename__ = "data_sources"

    id = Column(Integer, primary_key=True)
    source_key = Column(Text, unique=True, nullable=False)
    display_name = Column(Text, nullable=False)
    source_type = Column(Text, nullable=False)
    base_url = Column(Text)
    layer_index = Column(Integer)
    state_filter = Column(ARRAY(Text))
    is_active = Column(Boolean, default=True)
    phase = Column(Integer, default=1)
    notes = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    runs = relationship("IngestionRun", back_populates="source")


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"

    id = Column(Integer, primary_key=True)
    source_id = Column(Integer, ForeignKey("data_sources.id"))
    triggered_by = Column(Text, default="scheduler")
    started_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    finished_at = Column(TIMESTAMP(timezone=True))
    status = Column(Text, default="running")
    records_fetched = Column(Integer, default=0)
    records_upserted = Column(Integer, default=0)
    records_errored = Column(Integer, default=0)
    changes_detected = Column(Integer, default=0)
    error_summary = Column(Text)
    metadata_ = Column("metadata", JSONB, default={})

    source = relationship("DataSource", back_populates="runs")
    errors = relationship("IngestionError", back_populates="run", cascade="all, delete-orphan")


class IngestionError(Base):
    __tablename__ = "ingestion_errors"

    id = Column(Integer, primary_key=True)
    run_id = Column(Integer, ForeignKey("ingestion_runs.id", ondelete="CASCADE"))
    error_type = Column(Text)
    serial_nr = Column(Text)
    page_offset = Column(Integer)
    error_message = Column(Text)
    raw_data = Column(JSONB)
    occurred_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    run = relationship("IngestionRun", back_populates="errors")


class SourceRawRecord(Base):
    __tablename__ = "source_raw_records"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("ingestion_runs.id"))
    source_id = Column(Integer, ForeignKey("data_sources.id"))
    serial_nr = Column(Text, nullable=False)
    fetched_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    raw_json = Column(JSONB, nullable=False)
