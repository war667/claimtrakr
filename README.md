# ClaimTrakr

Internal mining claim intelligence and staking workflow tool for Utah and Nevada.
Monitors BLM MLRS data for claim status changes, supports due-diligence checklists,
and tracks staking workflow from research through BLM filing.

## Prerequisites

- Docker Desktop or Docker Engine + Docker Compose v2
- 4 GB RAM minimum
- Port 8084 available

## Quick Start

1. Clone the repo
2. `cp .env.example .env`
3. Edit `.env` — change all passwords
4. `docker compose up --build`
5. Open http://localhost:8084
6. Login with `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` from `.env`

## First Run

The database starts empty. No seed data is loaded.

To pull live BLM data:

**Option A — Trigger via UI:** Go to Ingestion page → click "Run All Sources"

**Option B — Trigger via API:**
```bash
curl -u admin:yourpassword -X POST http://localhost:8084/api/v1/ingest/trigger
```

Ingestion pulls all Utah and Nevada mining claims from the BLM ArcGIS REST service.
Expect 10,000–50,000 records. First run may take 5–15 minutes depending on BLM server load.

## Manual CSV / GeoJSON Upload (Fallback)

If the BLM endpoint is unavailable:
```bash
curl -u admin:yourpassword \
  -F "file=@your_claims.geojson" \
  -F "source_type=geojson" \
  http://localhost:8084/api/v1/ingest/upload
```

Expected GeoJSON format: FeatureCollection with claim properties matching
the schema field names (`serial_nr`, `claim_type`, `case_status`, `state`, `county`, etc.)

## Viewing Ingestion Logs

- **UI:** Ingestion page → Run History section
- **DB:**
```bash
docker compose exec db psql -U ct claimtrakr -c \
  "SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 10;"
```

## Database Access

```bash
docker compose exec db psql -U ct claimtrakr
```

## Stopping

```bash
docker compose down
docker compose down -v   # also removes database volume
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `POSTGRES_DB` | Database name | `claimtrakr` |
| `POSTGRES_USER` | Database user | `ct` |
| `POSTGRES_PASSWORD` | Database password | *(required)* |
| `BASIC_AUTH_USER` | API / UI login username | `admin` |
| `BASIC_AUTH_PASS` | API / UI login password | *(required)* |
| `BLM_CLAIMS_BASE_URL` | BLM ArcGIS REST base URL | *(BLM MapServer)* |
| `BLM_CLAIMS_ACTIVE_LAYER` | Active claims layer index | `0` |
| `BLM_CLAIMS_CLOSED_LAYER` | Closed claims layer index | `1` |
| `UPLOADS_PATH` | File upload directory | `/uploads` |
| `LOG_LEVEL` | Logging verbosity | `INFO` |
| `APP_ENV` | Environment name | `production` |
| `VITE_API_URL` | Frontend API base URL | `http://localhost:8084` |
| `VITE_AUTH_USER` | Frontend Basic Auth username | `admin` |
| `VITE_AUTH_PASS` | Frontend Basic Auth password | *(required)* |

## Important Disclaimers

**This tool is for internal research only.** A closed mining claim in the BLM MLRS
database does NOT confirm that the land is open to mineral location. All candidate
targets require independent legal, land-status, withdrawal-check, surface-ownership,
and field verification before any staking decision is made. ClaimTrakr does not
constitute legal advice and does not file claims on your behalf.

Data displayed is sourced from the BLM MLRS ArcGIS service and may not reflect the
most current official records. Always verify directly with the BLM State Office before
taking any staking action.

## Architecture

```
Browser
  └── Frontend nginx  (port 8084, external)
        ├── /api/*  →  proxied to backend:8000
        └── /*      →  React SPA (index.html)

Backend FastAPI       (port 8000, internal only)
  └── PostgreSQL/PostGIS  (port 5432, internal only)

File uploads stored at ./uploads (host) → /uploads (container)
Scheduled daily ingestion at 02:00 UTC via APScheduler
```
