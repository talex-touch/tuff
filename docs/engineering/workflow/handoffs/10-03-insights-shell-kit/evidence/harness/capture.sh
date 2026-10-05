#!/usr/bin/env bash
# One phase of the screenshot parity check, end to end, against the isolated instance.
#
#   bash launch.sh                 # once; wait ~30s for the window
#   bash capture.sh prepare        # once per fresh profile: gate, zh-CN, dark theme
#   bash capture.sh before|after   # the phase itself
#
# Writes <phase>-*.png and <phase>-*.json to $SHELLKIT_OUT (default /tmp/tuff-shellkit/shots):
#   empty        empty state, waveform held on its t=0 frame
#   data         seeded data state, full page height
#   menu         ⋯ menu open
#   notices      all three notices over the data state, full page height
#   notices-640  the same at 640px (max-width: 680px rules)
#   notices-460  the same at 460px (max-width: 480px rules)
set -euo pipefail
PHASE="${1:?prepare|before|after}"
H="$(cd "$(dirname "$0")" && pwd)"
OUT="${SHELLKIT_OUT:-/tmp/tuff-shellkit/shots}"
PORT="${SHELLKIT_CDP_PORT:-9437}"
export CDP_PRELUDE="$H/helpers.js"
MATCH="id:$(node "$H/cdp.mjs" "$PORT" main)"
mkdir -p "$OUT"
cdp() { node "$H/cdp.mjs" "$PORT" "$@"; }
at() { local viewport="$1"; shift; CDP_VIEWPORT="$viewport" cdp "$@"; }
tall() { at "$1x820x2" eval "$MATCH" 'window.__shellkit.neededHeight()'; }

if [[ "$PHASE" == "prepare" ]]; then
  cdp eval "$MATCH" 'window.__shellkit.prepareProfile()'
  cdp reload "$MATCH"
  cdp eval "$MATCH" 'window.__shellkit.goto()'
  exit 0
fi

echo "== empty"
bash "$H/seed.sh" unseed
cdp reload "$MATCH"
at 1100x820x2 shot "$MATCH" "$OUT/$PHASE-empty.png" \
  'window.__shellkit.goto().then(() => window.__shellkit.freezeWave())'
at 1100x820x2 eval "$MATCH" 'window.__shellkit.geometry()' >"$OUT/$PHASE-empty-1100.json"

echo "== data"
bash "$H/seed.sh" seed
cdp reload "$MATCH"
at 1100x820x2 eval "$MATCH" 'window.__shellkit.goto()'
HEIGHT="$(tall 1100)"
at "1100x${HEIGHT}x2" shot "$MATCH" "$OUT/$PHASE-data.png" 'window.__shellkit.goto()'
at "1100x${HEIGHT}x2" eval "$MATCH" 'window.__shellkit.geometry()' >"$OUT/$PHASE-data-1100.json"

echo "== menu"
at 1100x820x2 shot "$MATCH" "$OUT/$PHASE-menu.png" \
  'window.__shellkit.goto().then(() => window.__shellkit.openMenu())'
at 1100x820x2 eval "$MATCH" 'window.__shellkit.geometry()' >"$OUT/$PHASE-menu-1100.json"

echo "== notices"
cdp reload "$MATCH"
at 1100x820x2 eval "$MATCH" 'window.__shellkit.goto().then(() => window.__shellkit.forceNotices())'
for WIDTH in 1100 640 460; do
  HEIGHT="$(tall "$WIDTH")"
  SUFFIX="$([[ "$WIDTH" == 1100 ]] && echo "" || echo "-$WIDTH")"
  at "${WIDTH}x${HEIGHT}x2" shot "$MATCH" "$OUT/$PHASE-notices$SUFFIX.png" 'window.__shellkit.goto()'
  at "${WIDTH}x${HEIGHT}x2" eval "$MATCH" 'window.__shellkit.geometry()' >"$OUT/$PHASE-notices-$WIDTH.json"
done

cdp reload "$MATCH" >/dev/null
echo "done: $OUT"
ls -la "$OUT" | grep " $PHASE-" || true
