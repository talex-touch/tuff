#!/usr/bin/env bash
# Manual acceptance for the realtime app-index chain (F1-F6).
# Source: ../08-05-search-audit-remediation/research/realtime-chain-diagnosis.md section 6.
#
# Run this AFTER restarting the dev instance (`pnpm core:dev`). The Doubao incident that motivated
# these fixes was an environment accident — the running instance lost its own out/main chunks — so a
# restart is a precondition, not part of the test.
#
# Usage:
#   bash .trellis/tasks/08-05-realtime-index-freshness/verify-realtime-index-freshness.sh
#
# Requires sudo for the /Applications copy. Creates and removes /Applications/ZZTestProbe.app.

set -uo pipefail

PROFILE_DIR="$HOME/Library/Application Support/@talex-touch/core-app/tuff-dev"
DB_DIR="$PROFILE_DIR/modules/database"
LOG="$PROFILE_DIR/logs/D.$(date +%Y-%m-%d).log"
PROBE_APP="/Applications/ZZTestProbe.app"
SOURCE_APP="/System/Applications/Calculator.app"

# Latency target for install -> searchable. Design headroom is ~2.5s:
#   FSEvents 0.1-1s + coalesce 0.4s + stability 0.55s + resolve/upsert ~0.35s.
TARGET_SECONDS=10

query_db() {
  sqlite3 "file:$1?mode=ro" "$2" 2>/dev/null || echo "0"
}

echo "== A. Smoke: the resolution break is gone =="
if [ -f "$LOG" ]; then
  echo "   'Cannot find module' occurrences (expect 0): $(grep -ac 'Cannot find module' "$LOG" || echo 0)"
  echo "   Recent scans:"
  grep -a 'Starting application scan\|Scan complete' "$LOG" | tail -3 | sed 's/^/     /'
else
  echo "   !! log not found at $LOG"
fi

echo
echo "== B. Install an app, expect it searchable within ${TARGET_SECONDS}s =="
baseline=$(query_db "$DB_DIR/database.db" "select count(*) from files where type='app';")
echo "   baseline app rows: $baseline"

if [ -e "$PROBE_APP" ]; then
  echo "   !! $PROBE_APP already exists; remove it first and re-run."
  exit 1
fi

sudo cp -R "$SOURCE_APP" "$PROBE_APP" || { echo "   !! copy failed"; exit 1; }
started=$(date +%s)

visible_at=""
for i in $(seq 1 30); do
  n=$(query_db "$DB_DIR/database.db" "select count(*) from files where path='$PROBE_APP';")
  k=$(query_db "$DB_DIR/search-index.db" "select count(*) from keyword_mappings where item_id like '%ZZTestProbe%';")
  echo "   t=${i}s files=$n keywords=$k"
  if [ "$n" -ge 1 ] && [ "$k" -ge 1 ]; then
    visible_at=$(( $(date +%s) - started ))
    break
  fi
  sleep 1
done

if [ -n "$visible_at" ]; then
  if [ "$visible_at" -le "$TARGET_SECONDS" ]; then
    echo "   PASS: searchable after ${visible_at}s (target <= ${TARGET_SECONDS}s)"
  else
    echo "   FAIL: searchable only after ${visible_at}s (target <= ${TARGET_SECONDS}s)"
  fi
else
  echo "   FAIL: never became searchable within 30s"
fi
echo "   Also confirm in the UI: open CoreBox and type ZZTestProbe."

echo
echo "== C. Event coalescing (F2): one resolution pass, not sixteen =="
if [ -f "$LOG" ]; then
  passes=$(grep -ac "Fetching app info: $PROBE_APP" "$LOG" || echo 0)
  echo "   'Fetching app info' passes for the probe: $passes (expect <= 2; pre-fix this was ~16)"
fi

echo
echo "== D. lastIndexedAt is written (F5) =="
query_db "$DB_DIR/database.db" \
  "select path, datetime(last_indexed_at, 'unixepoch') from files where path='$PROBE_APP';" \
  | sed 's/^/   /'
echo "   (expect a real timestamp, not 1970-01-01)"

echo
echo "== E. Self-heal on restart (F4) =="
echo "   1. Quit the dev instance now."
echo "   2. sudo rm -rf '$PROBE_APP' && sudo cp -R '$SOURCE_APP' '$PROBE_APP'   # lands while stopped"
echo "   3. Restart with 'pnpm core:dev'."
echo "   4. Within ~60s (15s backfill delay + 30s dev delay + scan) the probe must appear:"
echo "      sqlite3 \"file:\$DB_DIR/database.db?mode=ro\" \"select count(*) from files where path='$PROBE_APP';\""
echo "   Pre-fix this stayed at 0, because the health check compared DB rows against index rows"
echo "   and never looked at the filesystem."

echo
echo "== Cleanup: removes the probe and exercises the delete path =="
read -r -p "   Remove $PROBE_APP now? [y/N] " answer
if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
  if [ "$PROBE_APP" = "/Applications/ZZTestProbe.app" ] && [ -d "$PROBE_APP" ]; then
    sudo rm -rf "$PROBE_APP"
    sleep 5
    echo "   rows after delete (expect 0): $(query_db "$DB_DIR/database.db" "select count(*) from files where path='$PROBE_APP';")"
  fi
else
  echo "   Left in place. Remove it later with: sudo rm -rf '$PROBE_APP'"
fi
