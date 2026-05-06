#!/bin/bash
set -e

echo "Waiting for database..."
while ! pg_isready -h db -U $POSTGRES_USER -q; do
  sleep 1
done

echo "Running migrations..."
alembic upgrade head

echo "Starting server..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
