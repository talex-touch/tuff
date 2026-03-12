#!/usr/bin/env bash

set -euo pipefail

log() {
  printf '[pilot-deploy] %s\n' "$*"
}

error() {
  printf '[pilot-deploy][error] %s\n' "$*" >&2
}

usage() {
  cat <<'EOF'
Usage:
  deploy-pilot-1panel.sh --project-dir <path> --image <repo> [options]
  deploy-pilot-1panel.sh --project-dir <path> --image-ref <repo:tag-or-digest> [options]

Options:
  --project-dir <path>          Docker Compose project directory (required)
  --compose-file <file>         Compose file path (default: docker-compose.yml)
  --service <name>              Pilot service name in compose (default: pilot)
  --image <repo>                Image repo, for example ghcr.io/acme/tuff-pilot
  --tag <tag>                   Image tag (default: pilot-latest)
  --image-ref <value>           Full image ref (repo:tag or repo@digest)
  --health-url <url>            Optional health check URL
  --health-attempts <number>    Health check attempts (default: 20)
  --health-interval <seconds>   Health check interval seconds (default: 3)
  --no-rollback                 Disable rollback when health check fails
  --ghcr-username <value>       Optional GHCR username
  --ghcr-token <value>          Optional GHCR token
  -h, --help                    Show this help

Environment fallback:
  PILOT_PROJECT_DIR
  PILOT_COMPOSE_FILE
  PILOT_SERVICE_NAME
  PILOT_IMAGE_REPO
  PILOT_IMAGE_TAG
  PILOT_IMAGE_REF
  PILOT_HEALTHCHECK_URL
  PILOT_HEALTHCHECK_ATTEMPTS
  PILOT_HEALTHCHECK_INTERVAL_SEC
  PILOT_ROLLBACK_ON_FAILURE=true|false
  PILOT_GHCR_USERNAME
  PILOT_GHCR_TOKEN
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Missing required command: $1"
    exit 1
  fi
}

is_positive_integer() {
  [[ "$1" =~ ^[1-9][0-9]*$ ]]
}

to_bool() {
  local raw
  raw="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')"
  case "$raw" in
    1|true|yes|y|on) echo "true" ;;
    0|false|no|n|off) echo "false" ;;
    *)
      error "Invalid boolean value: $1"
      exit 1
      ;;
  esac
}

resolve_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    return
  fi
  error "docker compose / docker-compose is not available"
  exit 1
}

PROJECT_DIR="${PILOT_PROJECT_DIR:-}"
COMPOSE_FILE="${PILOT_COMPOSE_FILE:-docker-compose.yml}"
SERVICE_NAME="${PILOT_SERVICE_NAME:-pilot}"
IMAGE_REPO="${PILOT_IMAGE_REPO:-}"
IMAGE_TAG="${PILOT_IMAGE_TAG:-pilot-latest}"
IMAGE_REF="${PILOT_IMAGE_REF:-}"
HEALTHCHECK_URL="${PILOT_HEALTHCHECK_URL:-}"
HEALTHCHECK_ATTEMPTS="${PILOT_HEALTHCHECK_ATTEMPTS:-20}"
HEALTHCHECK_INTERVAL_SEC="${PILOT_HEALTHCHECK_INTERVAL_SEC:-3}"
ROLLBACK_ON_FAILURE="$(to_bool "${PILOT_ROLLBACK_ON_FAILURE:-true}")"
GHCR_USERNAME="${PILOT_GHCR_USERNAME:-}"
GHCR_TOKEN="${PILOT_GHCR_TOKEN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir)
      PROJECT_DIR="${2:-}"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="${2:-}"
      shift 2
      ;;
    --service)
      SERVICE_NAME="${2:-}"
      shift 2
      ;;
    --image)
      IMAGE_REPO="${2:-}"
      shift 2
      ;;
    --tag)
      IMAGE_TAG="${2:-}"
      shift 2
      ;;
    --image-ref)
      IMAGE_REF="${2:-}"
      shift 2
      ;;
    --health-url)
      HEALTHCHECK_URL="${2:-}"
      shift 2
      ;;
    --health-attempts)
      HEALTHCHECK_ATTEMPTS="${2:-}"
      shift 2
      ;;
    --health-interval)
      HEALTHCHECK_INTERVAL_SEC="${2:-}"
      shift 2
      ;;
    --no-rollback)
      ROLLBACK_ON_FAILURE="false"
      shift
      ;;
    --ghcr-username)
      GHCR_USERNAME="${2:-}"
      shift 2
      ;;
    --ghcr-token)
      GHCR_TOKEN="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$PROJECT_DIR" ]]; then
  error "Missing --project-dir or PILOT_PROJECT_DIR"
  exit 1
fi
if [[ ! -d "$PROJECT_DIR" ]]; then
  error "Project directory not found: $PROJECT_DIR"
  exit 1
fi

if [[ -z "$IMAGE_REF" ]]; then
  if [[ -z "$IMAGE_REPO" ]]; then
    error "Missing --image/--image-ref (or PILOT_IMAGE_REPO/PILOT_IMAGE_REF)"
    exit 1
  fi
  IMAGE_REF="${IMAGE_REPO}:${IMAGE_TAG}"
fi

if ! is_positive_integer "$HEALTHCHECK_ATTEMPTS"; then
  error "health-attempts must be a positive integer: $HEALTHCHECK_ATTEMPTS"
  exit 1
fi
if ! is_positive_integer "$HEALTHCHECK_INTERVAL_SEC"; then
  error "health-interval must be a positive integer: $HEALTHCHECK_INTERVAL_SEC"
  exit 1
fi

require_cmd docker
resolve_compose_cmd

if [[ -n "$HEALTHCHECK_URL" ]]; then
  require_cmd curl
fi

if [[ -n "$GHCR_USERNAME" || -n "$GHCR_TOKEN" ]]; then
  if [[ -z "$GHCR_USERNAME" || -z "$GHCR_TOKEN" ]]; then
    error "Both ghcr username and token are required when one is set"
    exit 1
  fi
  log "Logging in to GHCR as $GHCR_USERNAME"
  printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin >/dev/null
fi

cd "$PROJECT_DIR"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  error "Compose file not found: $PROJECT_DIR/$COMPOSE_FILE"
  exit 1
fi

compose_base=("${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE")
current_container_id="$("${compose_base[@]}" ps -q "$SERVICE_NAME" 2>/dev/null || true)"
previous_image=""
if [[ -n "$current_container_id" ]]; then
  previous_image="$(docker inspect --format '{{.Config.Image}}' "$current_container_id" 2>/dev/null || true)"
fi

override_file="$(mktemp ".pilot-image-override.XXXXXX.yml")"
cleanup() {
  rm -f "$override_file"
}
trap cleanup EXIT

write_override() {
  local image_ref="$1"
  cat > "$override_file" <<EOF
services:
  $SERVICE_NAME:
    image: $image_ref
EOF
}

check_health() {
  if [[ -z "$HEALTHCHECK_URL" ]]; then
    return 0
  fi

  local attempt
  for ((attempt = 1; attempt <= HEALTHCHECK_ATTEMPTS; attempt++)); do
    if curl --fail --silent --show-error --max-time 10 "$HEALTHCHECK_URL" >/dev/null; then
      log "Health check passed on attempt $attempt/$HEALTHCHECK_ATTEMPTS"
      return 0
    fi
    log "Health check failed on attempt $attempt/$HEALTHCHECK_ATTEMPTS, waiting ${HEALTHCHECK_INTERVAL_SEC}s"
    sleep "$HEALTHCHECK_INTERVAL_SEC"
  done
  return 1
}

compose_with_override() {
  "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" -f "$override_file" "$@"
}

log "Deploy target image: $IMAGE_REF"
if [[ -n "$previous_image" ]]; then
  log "Current running image: $previous_image"
else
  log "Current running image: <none>"
fi

write_override "$IMAGE_REF"
compose_with_override pull "$SERVICE_NAME"
compose_with_override up -d "$SERVICE_NAME"

if check_health; then
  log "Deployment succeeded"
  exit 0
fi

error "Deployment health check failed"
if [[ "$ROLLBACK_ON_FAILURE" != "true" ]]; then
  error "Rollback is disabled"
  exit 1
fi
if [[ -z "$previous_image" ]]; then
  error "No previous image available for rollback"
  exit 1
fi
if [[ "$previous_image" == "$IMAGE_REF" ]]; then
  error "Previous image is the same as target image, skip rollback"
  exit 1
fi

log "Rolling back to previous image: $previous_image"
write_override "$previous_image"
compose_with_override pull "$SERVICE_NAME" || true
compose_with_override up -d "$SERVICE_NAME"

if check_health; then
  log "Rollback succeeded"
else
  error "Rollback health check failed, manual intervention required"
  exit 1
fi
