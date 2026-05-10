#!/bin/sh
# Usage: ./scripts/show_logins.sh [last N lines, default 50]

cd "$(dirname "$0")/.."

LINES=${1:-50}

docker compose logs backend --tail="$LINES" | grep "LOGIN" | sed 's/.*LOGIN //'
