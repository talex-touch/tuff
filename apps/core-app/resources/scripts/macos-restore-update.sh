#!/bin/bash
set -u

BACKUP_APP=""
DEST_APP=""
LOG_FILE=""

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
printf '[self-update] recovery started\n' >> "$LOG_FILE"

if [ ! -d "$BACKUP_APP/Contents" ]; then
  printf '[self-update] recovery backup is missing or invalid: %s\n' "$BACKUP_APP" >> "$LOG_FILE"
  exit 1
fi

quote_arg() {
  printf "'"
  printf '%s' "$1" | /usr/bin/sed "s/'/'\\\\''/g"
  printf "'"
}

restore_direct() {
  rm -rf "$DEST_APP" >> "$LOG_FILE" 2>&1 || return 1
  /usr/bin/ditto "$BACKUP_APP" "$DEST_APP" >> "$LOG_FILE" 2>&1
}

restore_with_admin() {
  local backup_quoted dest_quoted log_quoted command
  backup_quoted="$(quote_arg "$BACKUP_APP")"
  dest_quoted="$(quote_arg "$DEST_APP")"
  log_quoted="$(quote_arg "$LOG_FILE")"
  command="set -e
rm -rf $dest_quoted >> $log_quoted 2>&1
/usr/bin/ditto $backup_quoted $dest_quoted >> $log_quoted 2>&1"
  /usr/bin/osascript - "$command" <<'OSA'
on run argv
  set shellCommand to item 1 of argv
  do shell script shellCommand with administrator privileges
end run
OSA
}

if restore_direct; then
  printf '[self-update] recovery restored without elevated privileges\n' >> "$LOG_FILE"
elif restore_with_admin; then
  printf '[self-update] recovery restored with administrator privileges\n' >> "$LOG_FILE"
else
  printf '[self-update] recovery failed\n' >> "$LOG_FILE"
  exit 1
fi

open "$DEST_APP" >> "$LOG_FILE" 2>&1 || true
exit 0
