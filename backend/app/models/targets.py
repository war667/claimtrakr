from sqlalchemy import Column, Integer, Text, Boolean, TIMESTAMP, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Target(Base):
    __tablename__ = "targets"

    id = Column(Integer, primary_key=True)
    serial_nr = Column(Text, ForeignKey("claims.serial_nr"), nullable=False)
    workflow_status = Column(Text, nullable=False, default="new")
    assigned_to = Column(Text)
    created_by = Column(Text)
    priority_score = Column(Integer, default=0)
    priority_label = Column(Text)
    notes = Column(Text)
    internal_name = Column(Text)
    proposed_claim_type = Column(Text)
    proposed_name = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())
    status_changed_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    blm_scraped_data = Column(JSONB, nullable=True)
    blm_scraped_at = Column(TIMESTAMP(timezone=True), nullable=True)

    history = relationship("TargetStatusHistory", back_populates="target", cascade="all, delete-orphan")
    checklist = relationship("DueDiligenceItem", back_populates="target", cascade="all, delete-orphan")
    files = relationship("TargetFile", back_populates="target", cascade="all, delete-orphan")


class TargetStatusHistory(Base):
    __tablename__ = "target_status_history"

    id = Column(Integer, primary_key=True)
    target_id = Column(Integer, ForeignKey("targets.id", ondelete="CASCADE"))
    from_status = Column(Text)
    to_status = Column(Text, nullable=False)
    changed_by = Column(Text)
    changed_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    notes = Column(Text)

    target = relationship("Target", back_populates="history")


class DueDiligenceItem(Base):
    __tablename__ = "due_diligence_items"

    id = Column(Integer, primary_key=True)
    target_id = Column(Integer, ForeignKey("targets.id", ondelete="CASCADE"))
    task_key = Column(Text, nullable=False)
    task_label = Column(Text, nullable=False)
    is_complete = Column(Boolean, default=False)
    completed_by = Column(Text)
    completed_at = Column(TIMESTAMP(timezone=True))
    notes = Column(Text)
    sort_order = Column(Integer, default=0)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    target = relationship("Target", back_populates="checklist")


class TargetFile(Base):
    __tablename__ = "target_files"

    id = Column(Integer, primary_key=True)
    target_id = Column(Integer, ForeignKey("targets.id", ondelete="CASCADE"))
    file_type = Column(Text)
    filename = Column(Text, nullable=False)
    storage_path = Column(Text, nullable=False)
    file_size_bytes = Column(Integer)
    mime_type = Column(Text)
    uploaded_by = Column(Text)
    uploaded_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    notes = Column(Text)

    target = relationship("Target", back_populates="files")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(Text, unique=True, nullable=False)
    email = Column(Text)
    role = Column(Text, default="researcher")
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False, nullable=False)
    password_hash = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    last_login_at = Column(TIMESTAMP(timezone=True))


class LoginEvent(Base):
    __tablename__ = "login_events"

    id = Column(Integer, primary_key=True)
    username = Column(Text, nullable=False, index=True)
    ip_address = Column(Text, nullable=True)
    session_id = Column(Text, nullable=True)
    logged_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class SavedSearch(Base):
    __tablename__ = "saved_searches"

    id = Column(Integer, primary_key=True)
    created_by = Column(Text)
    name = Column(Text, nullable=False)
    filters = Column(JSONB, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())


class Export(Base):
    __tablename__ = "exports"

    id = Column(Integer, primary_key=True)
    exported_by = Column(Text)
    export_type = Column(Text)
    filters_used = Column(JSONB)
    record_count = Column(Integer)
    exported_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
