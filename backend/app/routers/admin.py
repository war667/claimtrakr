from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin, verify_credentials, _has_any_users, _find_active_user
from app.database import get_db
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# /me is accessible to any authenticated user
me_router = APIRouter()

# All other admin endpoints require admin role
router = APIRouter(dependencies=[Depends(require_admin)])


class UserCreateSchema(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class UserUpdateSchema(BaseModel):
    password: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None


@me_router.get("/me")
async def me(
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
):
    has_users = await _has_any_users(db)
    if not has_users:
        is_admin = (username == settings.BASIC_AUTH_USER)
    else:
        user = await _find_active_user(username, db)
        is_admin = bool(user and user.is_admin)
    return {"username": username, "is_admin": is_admin}


@router.get("/users")
async def list_users(db: AsyncSession = Depends(get_db)):
    from app.models.targets import User
    result = await db.execute(select(User).order_by(User.created_at))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "is_admin": u.is_admin,
            "is_active": u.is_active,
            "created_at": u.created_at,
        }
        for u in users
    ]


@router.post("/users", status_code=201)
async def create_user(body: UserCreateSchema, db: AsyncSession = Depends(get_db)):
    from app.models.targets import User
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")
    user = User(
        username=body.username,
        password_hash=pwd_context.hash(body.password),
        is_admin=body.is_admin,
    )
    db.add(user)
    await db.commit()
    return {"id": user.id, "username": user.username, "is_admin": user.is_admin, "is_active": user.is_active}


@router.put("/users/{user_id}")
async def update_user(user_id: int, body: UserUpdateSchema, db: AsyncSession = Depends(get_db)):
    from app.models.targets import User
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.password:
        user.password_hash = pwd_context.hash(body.password)
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    if body.is_active is not None:
        user.is_active = body.is_active
    await db.commit()
    return {"id": user.id, "username": user.username, "is_admin": user.is_admin, "is_active": user.is_active}


@router.get("/login-events")
async def login_events(limit: int = 200, db: AsyncSession = Depends(get_db)):
    from app.models.targets import LoginEvent
    result = await db.execute(
        select(LoginEvent).order_by(desc(LoginEvent.logged_at)).limit(limit)
    )
    events = result.scalars().all()
    return [
        {
            "id": e.id,
            "username": e.username,
            "ip_address": e.ip_address,
            "logged_at": e.logged_at,
        }
        for e in events
    ]
