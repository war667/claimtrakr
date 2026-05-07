#!/bin/sh
set -e

echo "Waiting for database..."
until pg_isready -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -q; do
  sleep 1
done

echo "Running migrations..."
alembic upgrade head

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
