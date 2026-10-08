#!/usr/bin/env bash
# Seeds (or clears) deterministic voice-insight aggregates in the ISOLATED profile only.
#
# Written to both database.db and database-aux.db: the store reads through
# `resolveCurrentAuxDb()`, which falls back to the primary file whenever the aux file is not
# ready — and in this dev profile it was not (verified 2026-10-03: clearing the aux rows left the
# page showing data, clearing the primary rows emptied it). Writing both keeps the seed visible
# whichever file a given run ends up reading.
#
# Absolute dates, so the "since" label, the streaks and the heatmap are identical in both phases
# as long as both run on the same local day.
#
#   bash seed.sh seed | unseed | show
set -euo pipefail
ROOT="${SHELLKIT_ROOT:-/tmp/tuff-shellkit}"
case "$ROOT" in /tmp/*) ;; *) echo "refusing to touch a profile outside /tmp: $ROOT" >&2; exit 1;; esac
DIR="$(dirname "$(find "$ROOT/userdata" -name database.db -path '*modules/database/*' | head -1)")"
[[ -f "$DIR/database.db" ]] || { echo "no database.db under $ROOT/userdata" >&2; exit 1; }

sql_for() {
  case "$1" in
    seed)
      node -e '
        const start = Date.UTC(2026, 6, 5)            // 2026-07-05
        const rows = []
        for (let i = 0; i < 90; i += 1) {
          if (i % 7 === 3 || i % 11 === 5) continue   // quiet days: no row at all
          const day = new Date(start + i * 86400000).toISOString().slice(0, 10)
          const characters = 380 + ((i * 53) % 900)
          rows.push(`(\x27${day}\x27, ${characters}, ${characters * 25}, ${1 + (i % 4)})`)
        }
        console.log(".timeout 8000")
        console.log("BEGIN;")
        console.log("DELETE FROM voice_insight_days; DELETE FROM voice_insights_state;")
        console.log("INSERT INTO voice_insights_state (id, generation, started_at, updated_at, timezone, total_characters, total_duration_ms, session_count, polished_session_count, estimated_saved_ms) VALUES (1, 0, " + Date.UTC(2026, 6, 5, 16) + ", " + Date.UTC(2026, 9, 3, 11) + ", \x27America/Los_Angeles\x27, 128540, 2760000, 214, 176, 11520000);")
        console.log("INSERT INTO voice_insight_days (day, characters, duration_ms, session_count) VALUES " + rows.join(", ") + ";")
        console.log("COMMIT;")
      '
      ;;
    unseed)
      printf '%s\n' ".timeout 8000" "BEGIN;" "DELETE FROM voice_insight_days;" "DELETE FROM voice_insights_state;" "COMMIT;"
      ;;
  esac
}

case "${1:-}" in
  seed | unseed)
    for db in "$DIR/database.db" "$DIR/database-aux.db"; do
      [[ -f "$db" ]] || continue
      sql_for "$1" | sqlite3 -bail "$db"
    done
    ;;
  show) ;;
  *) echo "usage: seed.sh seed|unseed|show" >&2; exit 2;;
esac
for db in "$DIR/database.db" "$DIR/database-aux.db"; do
  [[ -f "$db" ]] || continue
  printf '%s: ' "$(basename "$db")"
  sqlite3 "$db" ".timeout 8000" "select count(*) || ' state, ' || (select count(*) from voice_insight_days) || ' days' from voice_insights_state;"
done
