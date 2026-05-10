from sqlalchemy import Column, Date, Integer, Numeric, Text, TIMESTAMP
from sqlalchemy.sql import func
from app.database import Base


class Lease(Base):
    __tablename__ = "leases"

    id = Column(Integer, primary_key=True)
    lease_name = Column(Text, nullable=False)
    serial_nr = Column(Text, nullable=True)
    lessor = Column(Text)
    lessee = Column(Text)
    acreage = Column(Numeric(10, 4))
    annual_payment = Column(Numeric(12, 2))
    renewal_terms = Column(Text)
    start_dt = Column(Date)
    expiration_dt = Column(Date)
    workflow_status = Column(Text, nullable=False, default="prospecting")
    notes = Column(Text)
    created_by = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
