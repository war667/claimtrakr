from datetime import datetime, timezone, date as date_type
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_credentials
from app.database import get_db
from app.models.leases import Lease, LeaseCriticalDate

router = APIRouter(dependencies=[Depends(verify_credentials)])

WORKFLOW_STATUSES = ["active", "expired", "terminated"]

DATE_TYPES = [
    "renewal_notice",
    "option_exercise",
    "payment_due",
    "work_commitment",
    "rent_review",
    "custom",
]


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


class CriticalDateSchema(BaseModel):
    label: str
    date_type: str = "custom"
    critical_date: str
    alert_days: int = 60
    notes: Optional[str] = None


def _parse_date(s: Optional[str]) -> Optional[date_type]:
    if not s:
        return None
    return date_type.fromisoformat(s)


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


def _cd_to_dict(cd: LeaseCriticalDate) -> dict:
    return {
        "id": cd.id,
        "lease_id": cd.lease_id,
        "label": cd.label,
        "date_type": cd.date_type,
        "critical_date": str(cd.critical_date),
        "alert_days": cd.alert_days,
        "notes": cd.notes,
        "created_at": cd.created_at.isoformat() if cd.created_at else None,
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


@router.get("/upcoming-dates")
async def upcoming_critical_dates(
    days: int = 90,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        text("""
            SELECT lcd.id, lcd.lease_id, l.lease_name, l.workflow_status,
                   lcd.label, lcd.date_type, lcd.critical_date, lcd.alert_days,
                   (lcd.critical_date - CURRENT_DATE) AS days_remaining
            FROM lease_critical_dates lcd
            JOIN leases l ON l.id = lcd.lease_id
            WHERE lcd.critical_date >= CURRENT_DATE
              AND lcd.critical_date <= CURRENT_DATE + :days
              AND l.workflow_status = 'active'
            ORDER BY lcd.critical_date ASC
        """),
        {"days": days},
    )
    rows = result.fetchall()
    return [
        {
            "id": r[0], "lease_id": r[1], "lease_name": r[2],
            "workflow_status": r[3], "label": r[4], "date_type": r[5],
            "critical_date": str(r[6]), "alert_days": r[7], "days_remaining": r[8],
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
        raise HTTPException(status_code=400, detail="Invalid workflow_status")
    lease = Lease(
        lease_name=body.lease_name,
        serial_nr=body.serial_nr or None,
        lessor=body.lessor,
        lessee=body.lessee,
        acreage=body.acreage,
        annual_payment=body.annual_payment,
        renewal_terms=body.renewal_terms,
        start_dt=_parse_date(body.start_dt),
        expiration_dt=_parse_date(body.expiration_dt),
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
        lease.start_dt = _parse_date(body.start_dt)
    if body.expiration_dt is not None:
        lease.expiration_dt = _parse_date(body.expiration_dt)
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


# --- Critical Dates ---

@router.get("/{lease_id}/dates")
async def list_critical_dates(lease_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LeaseCriticalDate)
        .where(LeaseCriticalDate.lease_id == lease_id)
        .order_by(LeaseCriticalDate.critical_date)
    )
    return [_cd_to_dict(cd) for cd in result.scalars().all()]


@router.post("/{lease_id}/dates", status_code=201)
async def create_critical_date(
    lease_id: int,
    body: CriticalDateSchema,
    db: AsyncSession = Depends(get_db),
):
    lease = await db.get(Lease, lease_id)
    if not lease:
        raise HTTPException(status_code=404, detail="Lease not found")
    cd = LeaseCriticalDate(
        lease_id=lease_id,
        label=body.label,
        date_type=body.date_type,
        critical_date=_parse_date(body.critical_date),
        alert_days=body.alert_days,
        notes=body.notes,
    )
    db.add(cd)
    await db.commit()
    await db.refresh(cd)
    return _cd_to_dict(cd)


@router.put("/{lease_id}/dates/{date_id}")
async def update_critical_date(
    lease_id: int,
    date_id: int,
    body: CriticalDateSchema,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LeaseCriticalDate).where(
            LeaseCriticalDate.id == date_id,
            LeaseCriticalDate.lease_id == lease_id,
        )
    )
    cd = result.scalar_one_or_none()
    if not cd:
        raise HTTPException(status_code=404, detail="Critical date not found")
    cd.label = body.label
    cd.date_type = body.date_type
    cd.critical_date = _parse_date(body.critical_date)
    cd.alert_days = body.alert_days
    cd.notes = body.notes or None
    await db.commit()
    await db.refresh(cd)
    return _cd_to_dict(cd)


@router.delete("/{lease_id}/dates/{date_id}", status_code=204)
async def delete_critical_date(
    lease_id: int,
    date_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(LeaseCriticalDate).where(
            LeaseCriticalDate.id == date_id,
            LeaseCriticalDate.lease_id == lease_id,
        )
    )
    cd = result.scalar_one_or_none()
    if not cd:
        raise HTTPException(status_code=404, detail="Critical date not found")
    await db.delete(cd)
    await db.commit()
