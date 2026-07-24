#!/bin/bash
set -u

SOURCE_PACKAGE=""
DEST_APP=""
STAGE_ROOT=""
BACKUP_APP=""
APP_PID=""
LOG_FILE=""

log() {
  if [ -n "$LOG_FILE" ]; then
    printf '[self-update] %s %s\n' "$(/bin/date +%s)" "$*" >> "$LOG_FILE"
  fi
}

usage() {
  echo "Usage: macos-apply-update.sh --source <package> --dest <app> --stage <dir> --backup <app> --pid <pid> --log <file>" >&2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --source)
      SOURCE_PACKAGE="$2"
      shift 2
      ;;
    --dest)
      DEST_APP="$2"
      shift 2
      ;;
    --stage)
      STAGE_ROOT="$2"
      shift 2
      ;;
    --backup)
      BACKUP_APP="$2"
      shift 2
      ;;
    --pid)
      APP_PID="$2"
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

if [ -z "$SOURCE_PACKAGE" ] || [ -z "$DEST_APP" ] || [ -z "$STAGE_ROOT" ] || [ -z "$BACKUP_APP" ] || [ -z "$APP_PID" ] || [ -z "$LOG_FILE" ]; then
  usage
  exit 2
fi

mkdir -p "$(dirname "$LOG_FILE")" "$(dirname "$BACKUP_APP")" "$STAGE_ROOT" >/dev/null 2>&1 || exit 1
: > "$LOG_FILE"

WORK_APP="$STAGE_ROOT/new.app"
EXTRACT_DIR="$STAGE_ROOT/extract"
MOUNT_DIR="$STAGE_ROOT/mount"

cleanup_mount() {
  if mount | grep -F " on $MOUNT_DIR " >/dev/null 2>&1; then
    /usr/bin/hdiutil detach "$MOUNT_DIR" -quiet >/dev/null 2>&1 || true
  fi
}


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
    for i in $(seq 1 5); do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        return 0
      fi
      sleep 1
    done
  fi
}

copy_app_candidate() {
  local candidate="$1"
  if [ -z "$candidate" ] || [ ! -d "$candidate" ]; then
    return 1
  fi
  rm -rf "$WORK_APP" >> "$LOG_FILE" 2>&1 || true
  /usr/bin/ditto "$candidate" "$WORK_APP" >> "$LOG_FILE" 2>&1
}

prepare_source() {
  rm -rf "$WORK_APP" "$EXTRACT_DIR" "$MOUNT_DIR" >> "$LOG_FILE" 2>&1 || true
  /usr/bin/xattr -dr com.apple.quarantine "$SOURCE_PACKAGE" >> "$LOG_FILE" 2>&1 || true

  case "$SOURCE_PACKAGE" in
    *.app|*.APP)
      copy_app_candidate "$SOURCE_PACKAGE"
      ;;
    *.zip|*.ZIP)
      mkdir -p "$EXTRACT_DIR" >> "$LOG_FILE" 2>&1 || return 1
      /usr/bin/ditto -x -k "$SOURCE_PACKAGE" "$EXTRACT_DIR" >> "$LOG_FILE" 2>&1 || return 1
      local app_candidate
      app_candidate="$(/usr/bin/find "$EXTRACT_DIR" -maxdepth 6 -type d -name "*.app" | /usr/bin/head -n 1)"
      copy_app_candidate "$app_candidate"
      ;;
    *.dmg|*.DMG)
      mkdir -p "$MOUNT_DIR" >> "$LOG_FILE" 2>&1 || return 1
      /usr/bin/hdiutil attach "$SOURCE_PACKAGE" -nobrowse -readonly -mountpoint "$MOUNT_DIR" >> "$LOG_FILE" 2>&1 || return 1
      local mounted_app
      mounted_app="$(/usr/bin/find "$MOUNT_DIR" -maxdepth 4 -type d -name "*.app" | /usr/bin/head -n 1)"
      copy_app_candidate "$mounted_app"
      cleanup_mount
      ;;
    *)
      log "unsupported package: $SOURCE_PACKAGE"
      return 1
      ;;
  esac

  if [ ! -d "$WORK_APP/Contents" ]; then
    log "prepared bundle is invalid: $WORK_APP"
    return 1
  fi

  /usr/bin/xattr -dr com.apple.quarantine "$WORK_APP" >> "$LOG_FILE" 2>&1 || true
  return 0
}

restore_backup() {
  if [ -d "$BACKUP_APP" ]; then
    rm -rf "$DEST_APP" >> "$LOG_FILE" 2>&1 || true
    /usr/bin/ditto "$BACKUP_APP" "$DEST_APP" >> "$LOG_FILE" 2>&1 || true
  fi
}

install_direct() {
  rm -rf "$BACKUP_APP" >> "$LOG_FILE" 2>&1 || true
  if [ -d "$DEST_APP" ]; then
    /usr/bin/ditto "$DEST_APP" "$BACKUP_APP" >> "$LOG_FILE" 2>&1 || return 1
  fi

  if rm -rf "$DEST_APP" >> "$LOG_FILE" 2>&1 && /usr/bin/ditto "$WORK_APP" "$DEST_APP" >> "$LOG_FILE" 2>&1; then
    /usr/bin/xattr -dr com.apple.quarantine "$DEST_APP" >> "$LOG_FILE" 2>&1 || true
    return 0
  fi

  restore_backup
  return 1
}


main() {
  log "started"
  trap cleanup_mount EXIT

  wait_for_app_exit "$APP_PID"

  if ! prepare_source; then
    log "prepare_source failed"
    open "$DEST_APP" >> "$LOG_FILE" 2>&1 || open "$SOURCE_PACKAGE" >> "$LOG_FILE" 2>&1 || true
    exit 1
  fi

  if ! install_direct; then
    log "direct install failed; refusing administrator prompt"
    open "$DEST_APP" >> "$LOG_FILE" 2>&1 || open "$SOURCE_PACKAGE" >> "$LOG_FILE" 2>&1 || true
    exit 1
  fi
  log "installed without elevated privileges"

  open "$DEST_APP" >> "$LOG_FILE" 2>&1 || true
  rm -rf "$STAGE_ROOT" >/dev/null 2>&1 || true
  exit 0
}

main
