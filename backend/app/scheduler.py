import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def setup_scheduler() -> None:
    from app.ingestion.runner import run_all_sources

    scheduler.add_job(
        run_all_sources,
        trigger=CronTrigger(hour=2, minute=0, timezone="UTC"),
        id="daily_blm_ingest",
        name="Daily BLM Ingestion",
        misfire_grace_time=3600,
        replace_existing=True,
    )
    logger.info("Scheduler configured: daily BLM ingest at 02:00 UTC")
