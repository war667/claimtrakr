from datetime import datetime, timezone, date as date_type
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_credentials
from app.database import get_db
from app.models.leases import Lease

router = APIRouter(dependencies=[Depends(verify_credentials)])

WORKFLOW_STATUSES = ["active", "expired", "terminated"]


class LeaseCreateSchema(BaseModel):
    lease_name: str
    serial_nr: Optional[str] = None
    lessor: Optional[str] = None
    lessee: Optional[str] = None
    acreage: Optional[float] = None
    annual_payment: Optional[float] = None
    renewal_terms: Optional[str] = None
    start_dt: Optional[str] = None
    expiration_dt: Optional[str] = None
    workflow_status: str = "active"
    notes: Optional[str] = None


class LeaseUpdateSchema(BaseModel):
    lease_name: Optional[str] = None
    serial_nr: Optional[str] = None
    lessor: Optional[str] = None
    lessee: Optional[str] = None
    acreage: Optional[float] = None
    annual_payment: Optional[float] = None
    renewal_terms: Optional[str] = None
    start_dt: Optional[str] = None
    expiration_dt: Optional[str] = None
    workflow_status: Optional[str] = None
    notes: Optional[str] = None


def _lease_to_dict(lease: Lease) -> dict:
    return {
        "id": lease.id,
        "lease_name": lease.lease_name,
        "serial_nr": lease.serial_nr,
        "lessor": lease.lessor,
        "lessee": lease.lessee,
        "acreage": float(lease.acreage) if lease.acreage is not None else None,
        "annual_payment": float(lease.annual_payment) if lease.annual_payment is not None else None,
        "renewal_terms": lease.renewal_terms,
        "start_dt": str(lease.start_dt) if lease.start_dt else None,
        "expiration_dt": str(lease.expiration_dt) if lease.expiration_dt else None,
        "workflow_status": lease.workflow_status,
        "notes": lease.notes,
        "created_by": lease.created_by,
        "created_at": lease.created_at.isoformat() if lease.created_at else None,
        "updated_at": lease.updated_at.isoformat() if lease.updated_at else None,
    }


@router.get("")
async def list_leases(
    workflow_status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Lease).order_by(Lease.expiration_dt.asc().nullslast(), Lease.created_at.desc())
    if workflow_status:
        q = q.where(Lease.workflow_status == workflow_status)
    result = await db.execute(q)
    return [_lease_to_dict(l) for l in result.scalars().all()]


@router.get("/expiring")
async def expiring_leases(
    days: int = 90,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            SELECT id, lease_name, serial_nr, lessor, expiration_dt, workflow_status,
                   (expiration_dt - CURRENT_DATE) AS days_remaining
            FROM leases
            WHERE expiration_dt IS NOT NULL
              AND expiration_dt >= CURRENT_DATE
              AND expiration_dt <= CURRENT_DATE + :days
              AND workflow_status NOT IN ('expired', 'terminated')
            ORDER BY expiration_dt ASC
        """),
        {"days": days},
    )
    rows = result.fetchall()
    return [
        {
            "id": r[0], "lease_name": r[1], "serial_nr": r[2],
            "lessor": r[3], "expiration_dt": str(r[4]),
            "workflow_status": r[5], "days_remaining": r[6],
        }
        for r in rows
    ]


@router.get("/{lease_id}")
async def get_lease(lease_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lease).where(Lease.id == lease_id))
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    return _lease_to_dict(lease)


@router.post("", status_code=201)
async def create_lease(
    body: LeaseCreateSchema,
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
):
    if body.workflow_status not in WORKFLOW_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid workflow_status")
    lease = Lease(
        lease_name=body.lease_name,
        serial_nr=body.serial_nr or None,
        lessor=body.lessor,
        lessee=body.lessee,
        acreage=body.acreage,
        annual_payment=body.annual_payment,
        renewal_terms=body.renewal_terms,
        start_dt=body.start_dt or None,
        expiration_dt=body.expiration_dt or None,
        workflow_status=body.workflow_status,
        notes=body.notes,
        created_by=username,
    )
    db.add(lease)
    await db.commit()
    await db.refresh(lease)
    return _lease_to_dict(lease)


@router.put("/{lease_id}")
async def update_lease(
    lease_id: int,
    body: LeaseUpdateSchema,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Lease).where(Lease.id == lease_id))
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")

    if body.lease_name is not None:
        lease.lease_name = body.lease_name
    if body.serial_nr is not None:
        lease.serial_nr = body.serial_nr or None
    if body.lessor is not None:
        lease.lessor = body.lessor
    if body.lessee is not None:
        lease.lessee = body.lessee
    if body.acreage is not None:
        lease.acreage = body.acreage
    if body.annual_payment is not None:
        lease.annual_payment = body.annual_payment
    if body.renewal_terms is not None:
        lease.renewal_terms = body.renewal_terms
    if body.start_dt is not None:
        lease.start_dt = body.start_dt or None
    if body.expiration_dt is not None:
        lease.expiration_dt = body.expiration_dt or None
    if body.workflow_status is not None:
        if body.workflow_status not in WORKFLOW_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid workflow_status")
        lease.workflow_status = body.workflow_status
    if body.notes is not None:
        lease.notes = body.notes

    lease.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(lease)
    return _lease_to_dict(lease)


@router.delete("/{lease_id}", status_code=204)
async def delete_lease(lease_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Lease).where(Lease.id == lease_id))
    lease = result.scalar_one_or_none()
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    await db.delete(lease)
    await db.commit()
