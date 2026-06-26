#!/bin/sh
# Container entrypoint: keep the data fresh in the background while the API
# server runs as PID 1.
#
# Set REFRESH_DISABLED=1 to skip the background refresh loop (e.g. when the data
# is managed externally or the container has no network access).
set -eu

if [ "${REFRESH_DISABLED:-0}" != "1" ]; then
  /app/scripts/refresh-db.sh --loop &
fi

exec node server/index.js
