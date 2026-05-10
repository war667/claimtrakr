import secrets
import logging
from datetime import datetime
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


def _parse_ua(ua: str) -> str:
    if not ua:
        return "Unknown"
    if "Edg/" in ua:
        browser = "Edge"
    elif "OPR/" in ua or "Opera" in ua:
        browser = "Opera"
    elif "Chrome/" in ua:
        import re
        v = re.search(r"Chrome/([\d]+)", ua)
        browser = f"Chrome {v.group(1)}" if v else "Chrome"
    elif "Safari/" in ua and "Chrome" not in ua:
        browser = "Safari"
    elif "Firefox/" in ua:
        import re
        v = re.search(r"Firefox/([\d]+)", ua)
        browser = f"Firefox {v.group(1)}" if v else "Firefox"
    else:
        browser = "Unknown browser"
    if "Windows NT" in ua:
        os = "Windows"
    elif "Mac OS X" in ua:
        os = "macOS"
    elif "Android" in ua:
        os = "Android"
    elif "iPhone" in ua or "iPad" in ua:
        os = "iOS"
    elif "Linux" in ua:
        os = "Linux"
    else:
        os = "Unknown OS"
    mobile = " Mobile" if any(x in ua for x in ("Mobile", "Android", "iPhone", "iPad")) else ""
    return f"{browser} · {os}{mobile}"


async def record_login_event(request: Request, username: str, db: AsyncSession):
    from datetime import timezone, timedelta
    from sqlalchemy import desc
    from app.models.targets import LoginEvent

    # Only record once per hour per user — /me is called on every page load
    result = await db.execute(
        select(LoginEvent)
        .where(LoginEvent.username == username)
        .order_by(desc(LoginEvent.logged_at))
        .limit(1)
    )
    last = result.scalar_one_or_none()
    if last and last.logged_at and (datetime.now(timezone.utc) - last.logged_at) < timedelta(hours=1):
        return

    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else None
    )
    user_agent = request.headers.get("User-Agent")
    logger.info("LOGIN user=%s ip=%s device=%s", username, ip, _parse_ua(user_agent))
    db.add(LoginEvent(username=username, ip_address=ip, user_agent=user_agent))
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
