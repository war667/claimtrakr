# ClaimTrakr

Internal mining claim intelligence and lease management tool for Utah and Nevada.
Monitors BLM MLRS data for claim status changes, tracks staking workflow from research
through filing, and manages signed mineral leases with expiration and critical date alerts.

---

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

---

## Modules

### Dashboard
The home screen shows at-a-glance summaries:
- **Expiring Leases** — active leases expiring within 90 days, color-coded by urgency
- **Upcoming Critical Dates** — lease milestones (renewals, sublease windows, etc.) within 90 days
- **Target Pipeline** — count of targets by workflow stage

### Targets
Research and staking workflow tracker for candidate mining claims.

**Workflow stages:**
| Stage | Meaning |
|---|---|
| New | Just added, not yet reviewed |
| Researching | Background research in progress |
| Needs Field Check | Desktop research done, field visit required |
| Field Checked | Site visited and confirmed |
| Legal Review | Under legal or title review |
| Approved to Stake | Cleared for staking |
| Rejected | Not viable |
| Staked | Claim physically staked |
| County Filed | Filed with county recorder |
| BLM Filed | Filed with BLM |

Each target links to live BLM claim data (status, claimant, acreage, county) and supports:
- Due diligence checklist with completion tracking
- File attachments (docs, photos, field notes)
- Notes and priority labeling
- Assignment to team members
- Full change history log

### Report
Printable summary of all active targets with BLM claim data, workflow status, checklist
progress, and notes. Use **Print / Save PDF** to export.

Targets appear in the report regardless of whether BLM claim data has been ingested.
BLM fields (claimant, acreage, case status) show blank if no data is loaded yet.

### Leases
Tracks signed/active mineral leases separate from target claims.

**Workflow statuses:**
| Status | Meaning |
|---|---|
| Active | Lease is in effect |
| Expired | Lease term has ended |
| Terminated | Lease was cancelled or surrendered |

**Expiration alerts:**
- Leases list color-codes expiration: red (≤30 days), amber (≤60), yellow (≤90)
- Leases with no expiration date set are flagged with a warning
- Dashboard banner appears when any active lease expires within 90 days

**Lease detail page** includes:
- All lease fields: lessor, lessee, acreage, annual payment, renewal terms, notes
- Live BLM claim lookup by serial number (if serial number is set)
- Critical Dates section (see below)
- Record metadata: created by, created at, last updated

### Critical Dates
Each lease can track multiple milestone dates with configurable advance alerts.

**To add a critical date:**
1. Open the lease detail page
2. Click **+ Add Date** in the Critical Dates section
3. Select a type from the dropdown
4. Set the date and alert threshold (default: 60 days in advance)
5. Optionally add notes

**Date types:**
| Type | Use |
|---|---|
| Right to Renew | Window to exercise renewal option |
| Sublease | Sublease agreement deadline |
| Renewal | Lease renewal date |
| Lease Expiration | End of lease term |
| Custom | Any other milestone (enter a custom label) |

Critical dates within 90 days appear on the Dashboard. Dates are color-coded by how close
they are relative to the configured alert threshold.

---

## BLM Data Ingestion

### First Run

The database starts empty. No seed data is loaded.

**Option A — UI:** Go to Ingestion page → click "Run All Sources"

**Option B — API:**
```bash
curl -u admin:yourpassword -X POST http://localhost:8084/api/v1/ingest/trigger
```

Ingestion pulls all Utah and Nevada mining claims from the BLM ArcGIS REST service.
Expect 10,000–50,000 records. First run may take 5–15 minutes depending on BLM server load.

### Manual CSV / GeoJSON Upload (Fallback)

If the BLM endpoint is unavailable:
```bash
curl -u admin:yourpassword \
  -F "file=@your_claims.geojson" \
  -F "source_type=geojson" \
  http://localhost:8084/api/v1/ingest/upload
```

Expected GeoJSON format: FeatureCollection with claim properties matching
the schema field names (`serial_nr`, `claim_type`, `case_status`, `state`, `county`, etc.)

### Viewing Ingestion Logs

- **UI:** Ingestion page → Run History section
- **DB:**
```bash
docker compose exec db psql -U ct claimtrakr -c \
  "SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 10;"
```

---

## Admin & Monitoring

### Login Events
The Admin page shows recent user logins with timestamp, IP address, and browser/device info.
Older events are collapsed — click "Show all" to expand. Use "Clear old" to keep only the last 5.

To view login events from Docker logs:
```bash
# Show recent logins
./scripts/show_logins.sh

# Show last N entries
./scripts/show_logins.sh 20

# Live tail
./scripts/show_logins.sh -f
```

### Analytics (warr only)
The Analytics page (visible only to the `warr` account) shows page visit data:
- Total views, views by page, views by user
- Daily and monthly visit trends
- Per-user page breakdown with filter

---

## Database Access

```bash
docker compose exec db psql -U ct claimtrakr
```

## Stopping

```bash
docker compose down
docker compose down -v   # also removes database volume
```

---

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

---

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

---

## Important Disclaimers

**This tool is for internal research only.** A closed mining claim in the BLM MLRS
database does NOT confirm that the land is open to mineral location. All candidate
targets require independent legal, land-status, withdrawal-check, surface-ownership,
and field verification before any staking decision is made. ClaimTrakr does not
constitute legal advice and does not file claims on your behalf.

Data displayed is sourced from the BLM MLRS ArcGIS service and may not reflect the
most current official records. Always verify directly with the BLM State Office before
taking any staking action.
