#!/bin/bash
set -u

BACKUP_APP=""
DEST_APP=""
LOG_FILE=""

log() {
  printf '[self-update] %s %s\n' "$(/bin/date +%s)" "$*" >> "$LOG_FILE"
}

usage() {
  echo "Usage: macos-restore-update.sh --backup <app> --dest <app> --log <file>" >&2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --backup)
      BACKUP_APP="$2"
      shift 2
      ;;
    --dest)
      DEST_APP="$2"
      shift 2
      ;;
    --log)
      LOG_FILE="$2"
      shift 2
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

if [ -z "$BACKUP_APP" ] || [ -z "$DEST_APP" ] || [ -z "$LOG_FILE" ]; then
  usage
  exit 2
fi

mkdir -p "$(dirname "$LOG_FILE")" >/dev/null 2>&1 || exit 1
log "recovery started"

if [ ! -d "$BACKUP_APP/Contents" ]; then
  log "recovery backup is missing or invalid: $BACKUP_APP"
  exit 1
fi


restore_direct() {
  rm -rf "$DEST_APP" >> "$LOG_FILE" 2>&1 || return 1
  /usr/bin/ditto "$BACKUP_APP" "$DEST_APP" >> "$LOG_FILE" 2>&1
}


if restore_direct; then
  log "recovery restored without elevated privileges"
else
  log "recovery failed; privilege escalation is disabled"
  exit 1
fi

open "$DEST_APP" >> "$LOG_FILE" 2>&1 || true
exit 0
