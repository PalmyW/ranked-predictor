#!/bin/sh
# Pull the latest committed season data from git main and re-import it into the
# live SQLite database. The repo's public/data is refreshed periodically by
# GitHub Actions, so this keeps a long-running container up to date without
# rebuilding the image.
#
# The running server reads afl-stats.db in WAL mode, so re-importing in place
# (import.js writes to the same /app/afl-stats.db) is safe while it serves.
#
# Usage:
#   refresh-db.sh           run a single pull + import, then exit
#   refresh-db.sh --loop    refresh now, then again every REFRESH_INTERVAL seconds
#
# Environment:
#   REPO_URL          git remote to pull from
#   REPO_BRANCH       branch to track (default: main)
#   REPO_DIR          where to keep the checkout (default: /app/repo)
#   REFRESH_INTERVAL  seconds between refreshes in --loop mode (default: 21600 = 6h)
set -eu

REPO_URL="${REPO_URL:-https://github.com/PalmyW/ranked-predictor.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
REPO_DIR="${REPO_DIR:-/app/repo}"
REFRESH_INTERVAL="${REFRESH_INTERVAL:-21600}"

log() { echo "[refresh-db $(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"; }

# Fetch only public/data (all import.js needs) with a shallow, blobless, sparse
# checkout to keep the transfer small.
sync_repo() {
  if [ -d "$REPO_DIR/.git" ]; then
    log "Fetching latest $REPO_BRANCH..."
    git -C "$REPO_DIR" fetch --depth 1 origin "$REPO_BRANCH"
    git -C "$REPO_DIR" reset --hard "origin/$REPO_BRANCH"
  else
    log "Cloning $REPO_URL ($REPO_BRANCH)..."
    git clone --depth 1 --branch "$REPO_BRANCH" \
      --filter=blob:none --sparse "$REPO_URL" "$REPO_DIR"
    git -C "$REPO_DIR" sparse-checkout set public/data
  fi
}

import_db() {
  log "Importing database from $REPO_DIR/public/data..."
  DATA_DIR="$REPO_DIR/public/data" node /app/scripts/import.js
  log "Import complete."
}

run_once() {
  sync_repo
  import_db
}

if [ "${1:-}" = "--loop" ]; then
  while true; do
    run_once || log "Refresh failed; will retry next interval."
    log "Sleeping ${REFRESH_INTERVAL}s until next refresh..."
    sleep "$REFRESH_INTERVAL"
  done
else
  run_once
fi
