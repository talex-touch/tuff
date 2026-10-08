#!/usr/bin/env bash
# Starts the isolated Tuff dev instance this task screenshots. Never the boss's instance:
# its own profile, its own vite port, its own CDP port, no global shortcuts, no native audio.
#
#   bash launch.sh            # start in the background, log to $ROOT/stack.log
#   bash launch.sh stop       # stop it, found by the vite port (never by a pgrep pattern)
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../../../../.." && pwd)"
ROOT="${SHELLKIT_ROOT:-/tmp/tuff-shellkit}"
VITE_PORT="${SHELLKIT_VITE_PORT:-5197}"
CDP_PORT="${SHELLKIT_CDP_PORT:-9437}"

if [[ "${1:-}" == "stop" ]]; then
  vite_pid="$(lsof -nP -t -iTCP:"$VITE_PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  cdp_pid="$(lsof -nP -t -iTCP:"$CDP_PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  for pid in $cdp_pid $vite_pid; do
    [[ -n "$pid" ]] && { echo "stopping $pid"; kill "$pid" 2>/dev/null || true; }
  done
  exit 0
fi

for port in "$VITE_PORT" "$CDP_PORT"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "port $port is already in use; refusing to start" >&2
    exit 1
  fi
done

mkdir -p "$ROOT/userdata"
cd "$REPO/apps/core-app"

# SHELLKIT_WRAPPER_FROM_HEAD=1 runs the committed wrapper instead of the working-tree one. Needed
# on 2026-10-03: a parallel session's uncommitted wrapper change (05:06) builds a native
# `translation` module that `@talex-touch/tuff-native` does not export yet, so the working-tree
# wrapper dies before starting anything. The committed wrapper is also what the BEFORE phase ran
# with, so both phases start the app the same way. The copy lives under $ROOT and resolves its
# packages from apps/core-app, exactly as the original does from its own directory.
WRAPPER="scripts/dev-electron-wrapper.mjs"
if [[ "${SHELLKIT_WRAPPER_FROM_HEAD:-}" == "1" ]]; then
  WRAPPER="$ROOT/dev-electron-wrapper.head.mjs"
  APP_ROOT="$REPO/apps/core-app"
  git -C "$REPO" show HEAD:apps/core-app/scripts/dev-electron-wrapper.mjs |
    sed -e "s#^const require = createRequire(import.meta.url)#const require = createRequire('$APP_ROOT/package.json')#" \
        -e "s#^const appRoot = path.resolve(__dirname, '..')#const appRoot = '$APP_ROOT'#" >"$WRAPPER"
  grep -q "createRequire('$APP_ROOT/package.json')" "$WRAPPER" && grep -q "const appRoot = '$APP_ROOT'" "$WRAPPER" ||
    { echo "could not retarget the committed wrapper" >&2; exit 1; }
fi

PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false \
REMOTE_DEBUGGING_PORT="$CDP_PORT" \
TUFF_STARTUP_BENCHMARK_USER_DATA_DIR="$ROOT/userdata" \
TUFF_DEV_SERVER_PORT="$VITE_PORT" \
TUFF_DISABLE_GLOBAL_SHORTCUTS=1 \
TUFF_DISABLE_NATIVE_AUDIO=1 \
nohup node "$WRAPPER" -- \
  --disable-renderer-backgrounding \
  --disable-backgrounding-occluded-windows \
  --disable-background-timer-throttling \
  >"$ROOT/stack.log" 2>&1 &
echo "started wrapper pid $! ($WRAPPER; vite :$VITE_PORT, cdp :$CDP_PORT, log $ROOT/stack.log)"
