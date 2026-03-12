#!/usr/bin/env bash

set -euo pipefail

log() {
  printf '[pilot-webhook] %s\n' "$*"
}

error() {
  printf '[pilot-webhook][error] %s\n' "$*" >&2
}

usage() {
  cat <<'EOF'
Usage:
  deploy-pilot-1panel-webhook.sh [options]

Options:
  --payload-file <path>         Read webhook payload from file
  --payload-json <json>         Read webhook payload from inline JSON
  --request-token <value>       Token provided by webhook request
  --expected-token <value>      Expected webhook token
  --deploy-script <path>        Deploy script path
  --default-image <repo>        Default image repo, for example ghcr.io/acme/tuff-pilot
  --default-tag <tag>           Default image tag (default: pilot-latest)
  --default-image-ref <value>   Default full image ref (repo:tag or repo@digest)
  --allowed-branch <name>       Allowed branch (default: master)
  --allowed-repository <value>  Allowed repository (owner/repo)
  --sha <value>                 Override sha
  --tag <value>                 Override image tag
  --image <value>               Override image repo
  --image-ref <value>           Override full image ref
  --dry-run                     Print resolved deploy target and exit
  -h, --help                    Show this help

Environment fallback:
  PILOT_WEBHOOK_PAYLOAD_JSON
  PILOT_WEBHOOK_REQUEST_TOKEN
  PILOT_WEBHOOK_TOKEN
  PILOT_WEBHOOK_DEPLOY_SCRIPT
  PILOT_WEBHOOK_DEFAULT_IMAGE
  PILOT_WEBHOOK_DEFAULT_TAG
  PILOT_WEBHOOK_DEFAULT_IMAGE_REF
  PILOT_WEBHOOK_ALLOWED_BRANCH
  PILOT_WEBHOOK_ALLOWED_REPOSITORY
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Missing required command: $1"
    exit 1
  fi
}

json_get() {
  local payload="$1"
  local key="$2"
  PAYLOAD_JSON_INPUT="$payload" python3 - "$key" <<'PY'
import json
import os
import sys

key = sys.argv[1]
raw = os.environ.get("PAYLOAD_JSON_INPUT", "").strip()
if not raw:
    print("")
    raise SystemExit(0)

try:
    data = json.loads(raw)
except Exception:
    print("")
    raise SystemExit(0)

value = data
for part in key.split("."):
    if isinstance(value, dict):
        value = value.get(part)
    else:
        value = None
        break

if value is None:
    print("")
elif isinstance(value, bool):
    print("true" if value else "false")
elif isinstance(value, (int, float, str)):
    print(value)
else:
    print(json.dumps(value, separators=(",", ":")))
PY
}

is_valid_json() {
  PAYLOAD_JSON_INPUT="$1" python3 - <<'PY' >/dev/null
import json
import os
import sys

raw = os.environ.get("PAYLOAD_JSON_INPUT", "").strip()
if not raw:
    raise SystemExit(0)
json.loads(raw)
PY
}

normalize_sha() {
  local raw="$1"
  local compact
  compact="$(printf '%s' "$raw" | tr -d '[:space:]')"
  if [[ "$compact" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
    printf '%s' "${compact:0:7}" | tr '[:upper:]' '[:lower:]'
    return 0
  fi
  return 1
}

normalize_branch() {
  local raw="$1"
  if [[ "$raw" == refs/heads/* ]]; then
    printf '%s' "${raw#refs/heads/}"
  else
    printf '%s' "$raw"
  fi
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PAYLOAD_FILE=""
PAYLOAD_JSON="${PILOT_WEBHOOK_PAYLOAD_JSON:-}"
REQUEST_TOKEN="${PILOT_WEBHOOK_REQUEST_TOKEN:-}"
EXPECTED_TOKEN="${PILOT_WEBHOOK_TOKEN:-}"
DEPLOY_SCRIPT="${PILOT_WEBHOOK_DEPLOY_SCRIPT:-${SCRIPT_DIR}/deploy-pilot-1panel.sh}"
DEFAULT_IMAGE="${PILOT_WEBHOOK_DEFAULT_IMAGE:-${PILOT_IMAGE_REPO:-}}"
DEFAULT_TAG="${PILOT_WEBHOOK_DEFAULT_TAG:-${PILOT_IMAGE_TAG:-pilot-latest}}"
DEFAULT_IMAGE_REF="${PILOT_WEBHOOK_DEFAULT_IMAGE_REF:-${PILOT_IMAGE_REF:-}}"
ALLOWED_BRANCH="${PILOT_WEBHOOK_ALLOWED_BRANCH:-master}"
ALLOWED_REPOSITORY="${PILOT_WEBHOOK_ALLOWED_REPOSITORY:-}"
OVERRIDE_SHA=""
OVERRIDE_TAG=""
OVERRIDE_IMAGE=""
OVERRIDE_IMAGE_REF=""
DRY_RUN="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --payload-file)
      PAYLOAD_FILE="${2:-}"
      shift 2
      ;;
    --payload-json)
      PAYLOAD_JSON="${2:-}"
      shift 2
      ;;
    --request-token)
      REQUEST_TOKEN="${2:-}"
      shift 2
      ;;
    --expected-token)
      EXPECTED_TOKEN="${2:-}"
      shift 2
      ;;
    --deploy-script)
      DEPLOY_SCRIPT="${2:-}"
      shift 2
      ;;
    --default-image)
      DEFAULT_IMAGE="${2:-}"
      shift 2
      ;;
    --default-tag)
      DEFAULT_TAG="${2:-}"
      shift 2
      ;;
    --default-image-ref)
      DEFAULT_IMAGE_REF="${2:-}"
      shift 2
      ;;
    --allowed-branch)
      ALLOWED_BRANCH="${2:-}"
      shift 2
      ;;
    --allowed-repository)
      ALLOWED_REPOSITORY="${2:-}"
      shift 2
      ;;
    --sha)
      OVERRIDE_SHA="${2:-}"
      shift 2
      ;;
    --tag)
      OVERRIDE_TAG="${2:-}"
      shift 2
      ;;
    --image)
      OVERRIDE_IMAGE="${2:-}"
      shift 2
      ;;
    --image-ref)
      OVERRIDE_IMAGE_REF="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
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

require_cmd python3

if [[ -n "$PAYLOAD_FILE" ]]; then
  if [[ ! -f "$PAYLOAD_FILE" ]]; then
    error "Payload file not found: $PAYLOAD_FILE"
    exit 1
  fi
  PAYLOAD_JSON="$(cat "$PAYLOAD_FILE")"
elif [[ -z "$PAYLOAD_JSON" && ! -t 0 ]]; then
  PAYLOAD_JSON="$(cat)"
fi

if [[ -z "$PAYLOAD_JSON" ]]; then
  PAYLOAD_JSON="{}"
fi

if ! is_valid_json "$PAYLOAD_JSON"; then
  error "Webhook payload is not valid JSON"
  exit 1
fi

if [[ -n "$EXPECTED_TOKEN" && "$REQUEST_TOKEN" != "$EXPECTED_TOKEN" ]]; then
  error "Webhook token mismatch"
  exit 1
fi

payload_branch="$(json_get "$PAYLOAD_JSON" "branch")"
if [[ -z "$payload_branch" ]]; then
  payload_branch="$(json_get "$PAYLOAD_JSON" "ref_name")"
fi
if [[ -z "$payload_branch" ]]; then
  payload_branch="$(json_get "$PAYLOAD_JSON" "ref")"
fi
payload_branch="$(normalize_branch "$payload_branch")"

payload_repository="$(json_get "$PAYLOAD_JSON" "repository")"
if [[ -z "$payload_repository" ]]; then
  payload_repository="$(json_get "$PAYLOAD_JSON" "github.repository")"
fi

if [[ -n "$ALLOWED_REPOSITORY" ]]; then
  if [[ -z "$payload_repository" ]]; then
    error "Payload repository is empty but allowed repository is set: $ALLOWED_REPOSITORY"
    exit 1
  fi
  if [[ "$payload_repository" != "$ALLOWED_REPOSITORY" ]]; then
    log "Skip deploy for repository '$payload_repository' (allowed: '$ALLOWED_REPOSITORY')"
    exit 0
  fi
fi

if [[ -n "$ALLOWED_BRANCH" && -n "$payload_branch" && "$payload_branch" != "$ALLOWED_BRANCH" ]]; then
  log "Skip deploy for branch '$payload_branch' (allowed: '$ALLOWED_BRANCH')"
  exit 0
fi

payload_sha="$(json_get "$PAYLOAD_JSON" "sha")"
if [[ -z "$payload_sha" ]]; then
  payload_sha="$(json_get "$PAYLOAD_JSON" "github.sha")"
fi

payload_tag="$(json_get "$PAYLOAD_JSON" "tag")"
if [[ -z "$payload_tag" ]]; then
  payload_tag="$(json_get "$PAYLOAD_JSON" "image_tag")"
fi
if [[ -z "$payload_tag" ]]; then
  payload_tag="$(json_get "$PAYLOAD_JSON" "imageTag")"
fi

payload_image="$(json_get "$PAYLOAD_JSON" "image")"
if [[ -z "$payload_image" ]]; then
  payload_image="$(json_get "$PAYLOAD_JSON" "image_repo")"
fi
if [[ -z "$payload_image" ]]; then
  payload_image="$(json_get "$PAYLOAD_JSON" "imageRepo")"
fi

payload_image_ref="$(json_get "$PAYLOAD_JSON" "image_ref")"
if [[ -z "$payload_image_ref" ]]; then
  payload_image_ref="$(json_get "$PAYLOAD_JSON" "imageRef")"
fi

resolved_sha="${OVERRIDE_SHA:-$payload_sha}"
resolved_tag="${OVERRIDE_TAG:-$payload_tag}"
resolved_image="${OVERRIDE_IMAGE:-$payload_image}"
resolved_image_ref="${OVERRIDE_IMAGE_REF:-$payload_image_ref}"

if [[ -z "$resolved_image_ref" ]]; then
  resolved_image_ref="$DEFAULT_IMAGE_REF"
fi

if [[ -z "$resolved_image_ref" ]]; then
  if [[ -z "$resolved_image" ]]; then
    resolved_image="$DEFAULT_IMAGE"
  fi

  if [[ -z "$resolved_tag" && -n "$resolved_sha" ]]; then
    if short_sha="$(normalize_sha "$resolved_sha")"; then
      resolved_tag="pilot-${short_sha}"
    fi
  fi

  if [[ -z "$resolved_tag" ]]; then
    resolved_tag="$DEFAULT_TAG"
  fi
fi

if [[ -z "$resolved_image_ref" && -z "$resolved_image" ]]; then
  error "Unable to resolve image target from payload/default options"
  exit 1
fi

if [[ ! -x "$DEPLOY_SCRIPT" ]]; then
  error "Deploy script is not executable: $DEPLOY_SCRIPT"
  exit 1
fi

if [[ "$DRY_RUN" == "true" ]]; then
  if [[ -n "$resolved_image_ref" ]]; then
    log "Dry run target image ref: $resolved_image_ref"
  else
    log "Dry run target image: ${resolved_image}:${resolved_tag}"
  fi
  exit 0
fi

if [[ -n "$resolved_image_ref" ]]; then
  export PILOT_IMAGE_REF="$resolved_image_ref"
  unset PILOT_IMAGE_REPO
  unset PILOT_IMAGE_TAG
  log "Resolved deploy image ref: $resolved_image_ref"
else
  export PILOT_IMAGE_REPO="$resolved_image"
  export PILOT_IMAGE_TAG="$resolved_tag"
  unset PILOT_IMAGE_REF
  log "Resolved deploy image: ${resolved_image}:${resolved_tag}"
fi

exec "$DEPLOY_SCRIPT"
