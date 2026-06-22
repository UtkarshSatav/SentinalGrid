#!/bin/sh
set -e
# Ensure a usable database is present (image ships a seeded copy).
if [ ! -f "${DB_PATH}" ]; then
  echo "[entrypoint] no DB at ${DB_PATH} — seeded copy missing, starting empty"
fi
echo "[entrypoint] starting SentinelGrid dashboard on :${PORT}"
exec node server.js
