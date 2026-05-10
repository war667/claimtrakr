from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_credentials
from app.database import get_db

router = APIRouter(dependencies=[Depends(verify_credentials)])


class PageViewSchema(BaseModel):
    page: str


def _require_warr(username: str = Depends(verify_credentials)):
    if username != "warr":
        raise HTTPException(status_code=403, detail="Access restricted")
    return username


@router.post("/pageview", status_code=204)
async def record_pageview(
    body: PageViewSchema,
    username: str = Depends(verify_credentials),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("INSERT INTO page_views (username, page) VALUES (:username, :page)"),
        {"username": username, "page": body.page},
    )
    await db.commit()


@router.get("/summary")
async def analytics_summary(
    _: str = Depends(_require_warr),
    db: AsyncSession = Depends(get_db),
):
    by_page = await db.execute(text("""
        SELECT page, COUNT(*) AS visits
        FROM page_views
        GROUP BY page
        ORDER BY visits DESC
    """))

    by_day = await db.execute(text("""
        SELECT DATE(visited_at AT TIME ZONE 'UTC') AS day,
               COUNT(*) AS visits
        FROM page_views
        WHERE visited_at >= NOW() - INTERVAL '60 days'
        GROUP BY day
        ORDER BY day
    """))

    by_user = await db.execute(text("""
        SELECT username, COUNT(*) AS visits
        FROM page_views
        GROUP BY username
        ORDER BY visits DESC
    """))

    by_user_page = await db.execute(text("""
        SELECT username, page, COUNT(*) AS visits
        FROM page_views
        GROUP BY username, page
        ORDER BY username, visits DESC
    """))

    total = await db.execute(text("SELECT COUNT(*) FROM page_views"))

    return {
        "total_views": total.scalar(),
        "by_page": [{"page": r[0], "visits": r[1]} for r in by_page.fetchall()],
        "by_day": [{"day": str(r[0]), "visits": r[1]} for r in by_day.fetchall()],
        "by_user": [{"username": r[0], "visits": r[1]} for r in by_user.fetchall()],
        "by_user_page": [{"username": r[0], "page": r[1], "visits": r[2]} for r in by_user_page.fetchall()],
    }
