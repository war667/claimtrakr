#!/bin/sh
set -e

cd "$(dirname "$0")/.."

echo "Applying migration 004: add user_agent to login_events..."

docker compose exec db psql -U ct -d claimtrakr -c "
ALTER TABLE login_events ADD COLUMN IF NOT EXISTS user_agent TEXT;
"

echo "Done."
