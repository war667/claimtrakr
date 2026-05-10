import secrets
import logging
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import bcrypt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db

logger = logging.getLogger(__name__)
security = HTTPBasic()


def _verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


async def _has_any_users(db: AsyncSession) -> bool:
    from app.models.targets import User
    result = await db.execute(
        select(User.id).where(User.password_hash.isnot(None)).limit(1)
    )
    return result.fetchone() is not None


async def _find_active_user(username: str, db: AsyncSession):
    from app.models.targets import User
    result = await db.execute(
        select(User).where(
            User.username == username,
            User.is_active == True,
            User.password_hash.isnot(None),
        )
    )
    return result.scalar_one_or_none()


async def record_login_event(request: Request, username: str, db: AsyncSession):
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else None
    )
    logger.info("LOGIN user=%s ip=%s", username, ip)
    from app.models.targets import LoginEvent
    db.add(LoginEvent(username=username, ip_address=ip))
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        logger.warning("Failed to record login event for %s", username)


async def verify_credentials(
    request: Request,
    credentials: HTTPBasicCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> str:
    username = credentials.username
    password = credentials.password

    has_users = await _has_any_users(db)

    if has_users:
        user = await _find_active_user(username, db)
        if not user or not _verify_password(password, user.password_hash):
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

    return username


async def require_admin(
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
) -> str:
    has_users = await _has_any_users(db)
    if not has_users:
        if username == settings.BASIC_AUTH_USER:
            return username
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    user = await _find_active_user(username, db)
    if not user or not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return username
