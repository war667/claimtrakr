import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.scheduler import scheduler, setup_scheduler
from app.routers import claims, ingest, targets, exports, reference
from app.routers.admin import router as admin_router, me_router

logging.basicConfig(level=getattr(logging, settings.LOG_LEVEL, logging.INFO))
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_scheduler()
    scheduler.start()
    logger.info("Scheduler started")
    yield
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")


app = FastAPI(
    title="ClaimTrakr API",
    version="1.0.0",
    description="Internal mining claim intelligence tool for Utah and Nevada",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(claims.router, prefix="/api/v1/claims", tags=["claims"])
app.include_router(ingest.router, prefix="/api/v1/ingest", tags=["ingestion"])
app.include_router(targets.router, prefix="/api/v1/targets", tags=["targets"])
app.include_router(exports.router, prefix="/api/v1/exports", tags=["exports"])
app.include_router(reference.router, prefix="/api/v1/ref", tags=["reference"])
app.include_router(me_router, prefix="/api/v1/admin", tags=["admin"])
app.include_router(admin_router, prefix="/api/v1/admin", tags=["admin"])


@app.get("/health")
async def health():
    return {"status": "ok"}
