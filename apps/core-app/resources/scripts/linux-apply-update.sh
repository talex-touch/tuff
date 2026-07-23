#!/bin/bash
set -u

# Linux self-update applier. Mirrors macos-apply-update.sh.
#
# Two modes:
#   AppImage: replace the running AppImage in place (no root needed) and relaunch.
#   .deb:     install via pkexec (root prompt) and relaunch the reinstalled binary.
#
# On any failure it does NOT fake success: it restores the backup / surfaces the
# package and exits non-zero so the update flow reports the failure honestly.

MODE="appimage"
SOURCE_PACKAGE=""
DEST_APP=""
BACKUP_APP=""
DEB_PACKAGE=""
APP_PID=""
LOG_FILE=""

log() {
  if [ -n "$LOG_FILE" ]; then
    printf '[self-update] %s %s\n' "$(date +%s)" "$*" >> "$LOG_FILE"
  fi
}

usage() {
  echo "Usage: linux-apply-update.sh (--source <appimage> --dest <appimage> --backup <file> | --deb <package> --dest <bin>) --pid <pid> --log <file>" >&2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE_PACKAGE="$2"; shift 2 ;;
    --dest) DEST_APP="$2"; shift 2 ;;
    --backup) BACKUP_APP="$2"; shift 2 ;;
    --deb) MODE="deb"; DEB_PACKAGE="$2"; shift 2 ;;
    --pid) APP_PID="$2"; shift 2 ;;
    --log) LOG_FILE="$2"; shift 2 ;;
    *) usage; exit 2 ;;
  esac
done

if [ -z "$APP_PID" ] || [ -z "$LOG_FILE" ]; then
  usage
  exit 2
fi

mkdir -p "$(dirname "$LOG_FILE")" >/dev/null 2>&1 || exit 1
: > "$LOG_FILE"

wait_for_app_exit() {
  local pid="$1"
  local i
  for i in $(seq 1 90); do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  if kill -0 "$pid" >/dev/null 2>&1; then
    log "pid still alive, sending TERM"
    kill -TERM "$pid" >/dev/null 2>&1 || true
    for i in $(seq 1 10); do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        return 0
      fi
      sleep 1
    done
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    log "pid still alive, sending KILL"
    kill -KILL "$pid" >/dev/null 2>&1 || true
    sleep 2
  fi
}

relaunch() {
  if [ -n "$DEST_APP" ] && [ -x "$DEST_APP" ]; then
    ( "$DEST_APP" >> "$LOG_FILE" 2>&1 & ) || true
    log "relaunched $DEST_APP"
  fi
}

install_appimage() {
  if [ -z "$SOURCE_PACKAGE" ] || [ -z "$DEST_APP" ] || [ -z "$BACKUP_APP" ]; then
    log "appimage install missing args"
    return 1
  fi
  if [ ! -f "$SOURCE_PACKAGE" ]; then
    log "source AppImage not found: $SOURCE_PACKAGE"
    return 1
  fi

  mkdir -p "$(dirname "$BACKUP_APP")" >/dev/null 2>&1 || true
  rm -f "$BACKUP_APP" >> "$LOG_FILE" 2>&1 || true
  if [ -f "$DEST_APP" ]; then
    cp -f "$DEST_APP" "$BACKUP_APP" >> "$LOG_FILE" 2>&1 || {
      log "backup failed"
      return 1
    }
  fi

  if cp -f "$SOURCE_PACKAGE" "$DEST_APP" >> "$LOG_FILE" 2>&1; then
    chmod +x "$DEST_APP" >> "$LOG_FILE" 2>&1 || true
    log "AppImage replaced in place"
    return 0
  fi

  log "AppImage replace failed, restoring backup"
  if [ -f "$BACKUP_APP" ]; then
    cp -f "$BACKUP_APP" "$DEST_APP" >> "$LOG_FILE" 2>&1 || true
    chmod +x "$DEST_APP" >> "$LOG_FILE" 2>&1 || true
  fi
  return 1
}

install_deb() {
  if [ -z "$DEB_PACKAGE" ] || [ ! -f "$DEB_PACKAGE" ]; then
    log "deb package not found: $DEB_PACKAGE"
    return 1
  fi
  if ! command -v pkexec >/dev/null 2>&1; then
    log "pkexec unavailable; cannot install .deb without elevation"
    return 1
  fi
  if pkexec dpkg -i "$DEB_PACKAGE" >> "$LOG_FILE" 2>&1; then
    log "deb installed via pkexec"
    return 0
  fi
  log "pkexec dpkg install failed"
  return 1
}

surface_package() {
  local pkg="$1"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$pkg" >> "$LOG_FILE" 2>&1 || true
  fi
}

main() {
  log "started (mode=$MODE)"
  wait_for_app_exit "$APP_PID"

  if [ "$MODE" = "deb" ]; then
    if install_deb; then
      relaunch
      rm -f "$DEB_PACKAGE" >/dev/null 2>&1 || true
      exit 0
    fi
    surface_package "$DEB_PACKAGE"
    exit 1
  fi

  if install_appimage; then
    relaunch
    exit 0
  fi

  # Honest fallback: bring the (still-old) app back so the user is not left with nothing.
  relaunch
  exit 1
}

main
