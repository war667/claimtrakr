from sqlalchemy import Column, Integer, BigInteger, Text, Boolean, TIMESTAMP, ForeignKey, Numeric, Date
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class DispositionCode(Base):
    __tablename__ = "disposition_codes"

    code = Column(Text, primary_key=True)
    description = Column(Text, nullable=False)
    category = Column(Text)
    is_closure = Column(Boolean, default=False)


class Claim(Base):
    __tablename__ = "claims"

    id = Column(BigInteger, primary_key=True)
    serial_nr = Column(Text, unique=True, nullable=False)
    source_id = Column(Integer, ForeignKey("data_sources.id"))
    claim_name = Column(Text)
    claim_type = Column(Text)
    claimant_name = Column(Text)
    claimant_addr = Column(Text)
    state = Column(Text)
    county = Column(Text)
    meridian = Column(Text)
    township = Column(Text)
    township_dir = Column(Text)
    range_ = Column("range", Text)
    range_dir = Column(Text)
    section = Column(Text)
    aliquot = Column(Text)
    acres = Column(Numeric(10, 2))
    case_status = Column(Text, nullable=False)
    disposition_cd = Column(Text)
    disposition_desc = Column(Text)
    location_dt = Column(Date)
    filing_dt = Column(Date)
    closed_dt = Column(Date)
    last_action_dt = Column(Date)
    blm_url = Column(Text)
    source_layer = Column(Text)
    # geom and bbox are geometry columns managed via raw SQL to avoid asyncpg type issues
    geom_source = Column(Text, default="source")
    geom_confidence = Column(Text, default="low")
    first_seen_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    last_seen_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    last_run_id = Column(Integer, ForeignKey("ingestion_runs.id"))
    prev_status = Column(Text)
    prev_disp_cd = Column(Text)
    prev_claimant = Column(Text)
    is_duplicate = Column(Boolean, default=False)
    needs_review = Column(Boolean, default=False)
    raw_json = Column(JSONB)


class ClaimSnapshot(Base):
    __tablename__ = "claim_snapshots"

    id = Column(BigInteger, primary_key=True)
    serial_nr = Column(Text, nullable=False)
    snapped_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    run_id = Column(Integer, ForeignKey("ingestion_runs.id"))
    case_status = Column(Text)
    disposition_cd = Column(Text)
    claimant_name = Column(Text)
    acres = Column(Numeric(10, 2))
    geom_hash = Column(Text)
    raw_json = Column(JSONB)


class ClaimEvent(Base):
    __tablename__ = "claim_events"

    id = Column(BigInteger, primary_key=True)
    serial_nr = Column(Text, nullable=False)
    run_id = Column(Integer, ForeignKey("ingestion_runs.id"))
    event_type = Column(Text, nullable=False)
    event_subtype = Column(Text)
    old_value = Column(Text)
    new_value = Column(Text)
    detected_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    notes = Column(Text)
