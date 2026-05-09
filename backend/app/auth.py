import secrets
import uuid
import logging
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db

logger = logging.getLogger(__name__)
security = HTTPBasic()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SESSION_COOKIE = "ct_session"
SESSION_TTL_SECONDS = 24 * 3600


async def _has_any_users(db: AsyncSession) -> bool:
    from app.models.targets import User
    result = await db.execute(select(User.id).limit(1))
    return result.fetchone() is not None


async def _find_active_user(username: str, db: AsyncSession):
    from app.models.targets import User
    result = await db.execute(
        select(User).where(User.username == username, User.is_active == True)
    )
    return result.scalar_one_or_none()


async def _record_login(request: Request, response: Response, username: str, db: AsyncSession):
    session_id = request.cookies.get(SESSION_COOKIE)
    if session_id:
        return  # existing session, already recorded
    session_id = str(uuid.uuid4())
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else None
    )
    from app.models.targets import LoginEvent
    db.add(LoginEvent(username=username, ip_address=ip, session_id=session_id))
    try:
        await db.commit()
    except Exception:
        await db.rollback()
    response.set_cookie(
        SESSION_COOKIE, session_id,
        max_age=SESSION_TTL_SECONDS,
        httponly=True, samesite="lax",
    )


async def verify_credentials(
    request: Request,
    response: Response,
    credentials: HTTPBasicCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> str:
    username = credentials.username
    password = credentials.password

    has_users = await _has_any_users(db)

    if has_users:
        user = await _find_active_user(username, db)
        if not user or not pwd_context.verify(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Basic"},
            )
    else:
        correct_user = secrets.compare_digest(
            username.encode(), settings.BASIC_AUTH_USER.encode()
        )
        correct_pass = secrets.compare_digest(
            password.encode(), settings.BASIC_AUTH_PASS.encode()
        )
        if not (correct_user and correct_pass):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
                headers={"WWW-Authenticate": "Basic"},
            )

    await _record_login(request, response, username, db)
    return username


async def require_admin(
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
) -> str:
    has_users = await _has_any_users(db)
    if not has_users:
        # env-var user is the superadmin when no DB users exist
        if username == settings.BASIC_AUTH_USER:
            return username
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    user = await _find_active_user(username, db)
    if not user or not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return username
