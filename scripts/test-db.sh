#!/usr/bin/env bash
# Bring up a throwaway Postgres for the e2e/integration harness and hand it a CLEAN
# database. Idempotent. No real secrets — credentials are local-only. Runs BEFORE
# `playwright test` so the app server (which migrates + seeds on boot) starts against
# a ready, empty DB. Use `scripts/test-db.sh down` to remove the container.
set -euo pipefail

CONTAINER=pairdesk-test-pg
PG_USER=pairdesk
PG_PASSWORD=pairdesk
PG_DB=pairdesk_test
HOST_PORT=${PAIRDESK_TEST_PG_PORT:-5433}

if [[ "${1:-up}" == "down" ]]; then
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  echo "[test-db] removed $CONTAINER"
  exit 0
fi

if [[ "$(docker ps -q -f "name=^${CONTAINER}$" -f status=running)" == "" ]]; then
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_USER="$PG_USER" -e POSTGRES_PASSWORD="$PG_PASSWORD" -e POSTGRES_DB="$PG_DB" \
    -p "${HOST_PORT}:5432" postgres:16-alpine >/dev/null
fi

# Wait for readiness.
for _ in $(seq 1 60); do
  if docker exec "$CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" 2>/dev/null | grep -q accepting; then
    break
  fi
  sleep 1
done

# Clean slate (no app connections yet — the server boots after this script).
# Separate -c flags: each runs as its own simple query, so DROP DATABASE is not
# wrapped in a transaction block (psql wraps a multi-statement -c string in one).
docker exec "$CONTAINER" psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS ${PG_DB} WITH (FORCE);" \
  -c "CREATE DATABASE ${PG_DB};" >/dev/null

echo "[test-db] $CONTAINER ready on :${HOST_PORT}, database ${PG_DB} reset."
