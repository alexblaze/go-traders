#!/bin/sh
# Apply migrations (non-destructive) and optionally seed before starting the API.
set -e
cd /app/packages/database
echo "[entrypoint] applying database migrations"
npx prisma migrate deploy
if [ "${SEED_ON_START:-true}" = "true" ]; then
  echo "[entrypoint] seeding (idempotent)"
  npx tsx src/seed.ts
fi
cd /app/apps/api
exec "$@"
