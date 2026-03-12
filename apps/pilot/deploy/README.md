# Pilot Deployment Guide (1Panel + GHCR)

This folder contains the standardized deployment assets for Pilot on 1Panel:

- `deploy-pilot-1panel.sh`: deployment script with health check, auto rollback, and pull-only mode
- `deploy-pilot-1panel.env.example`: environment template

---

## 1. Target Deployment Flow

Recommended pipeline:

1. GitHub Actions builds and pushes the Pilot image to GHCR (`pilot-<short_sha>`, `pilot-latest`)
2. 1Panel triggers the script in this folder
3. The script pulls the target image and restarts only the `pilot` service
4. If health check fails, the script rolls back to the previous image automatically

---

## 2. Prerequisites

The server must have:

- Docker (`docker`)
- Compose (`docker compose` or `docker-compose`)
- A target directory for Pilot compose project in 1Panel (existing compose is optional)
- If GHCR package is private: GHCR credentials (PAT with minimum `read:packages`)

---

## 3. Upload Files to Server

Upload these files to your server (example path: `/opt/1panel/scripts/pilot-deploy`):

- `apps/pilot/deploy/deploy-pilot-1panel.sh`
- `apps/pilot/deploy/deploy-pilot-1panel.env.example`

Then run:

```bash
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh"
cp "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.env.example" "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
```

---

## 4. Configure Environment

Edit `pilot-deploy.env`:

```bash
PILOT_PROJECT_DIR=/opt/1panel/apps/tuff-pilot
PILOT_COMPOSE_FILE=docker-compose.yml
PILOT_SERVICE_NAME=pilot

PILOT_IMAGE_REPO=ghcr.io/talex-touch/tuff-pilot
PILOT_IMAGE_TAG=pilot-latest
PILOT_DB_FILE=/app/data/pilot.sqlite

PILOT_HEALTHCHECK_URL=http://127.0.0.1:3300/api/auth/status
PILOT_HEALTHCHECK_ATTEMPTS=20
PILOT_HEALTHCHECK_INTERVAL_SEC=3
PILOT_ROLLBACK_ON_FAILURE=true

PILOT_GHCR_USERNAME=
PILOT_GHCR_TOKEN=
```

Important fields:

- `PILOT_PROJECT_DIR`: compose project directory (required)
- `PILOT_SERVICE_NAME`: target service to update (default `pilot`)
- `PILOT_IMAGE_TAG`: default `pilot-latest`, can be pinned to a release tag such as `pilot-a1b2c3d`
- `PILOT_DB_FILE`: runtime SQLite path for Node deployment (default recommended: `/app/data/pilot.sqlite`)
- `PILOT_HEALTHCHECK_URL`: recommended for post-deploy validation

---

## 5. Run Deployment Manually

### 5.1 Deploy with env file (recommended)

```bash
set -a
source "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
set +a
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh"
```

### 5.2 Deploy with CLI arguments

```bash
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh" \
  --project-dir "/opt/1panel/apps/tuff-pilot" \
  --image "ghcr.io/talex-touch/tuff-pilot" \
  --tag "pilot-latest" \
  --health-url "http://127.0.0.1:3300/api/auth/status"
```

### 5.3 Deploy a specific version (recommended for rollback/canary)

```bash
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh" \
  --project-dir "/opt/1panel/apps/tuff-pilot" \
  --image "ghcr.io/talex-touch/tuff-pilot" \
  --tag "pilot-a1b2c3d"
```

### 5.4 Pull image only (manual prefetch, no restart)

```bash
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh" \
  --project-dir "/opt/1panel/apps/tuff-pilot" \
  --image "ghcr.io/talex-touch/tuff-pilot" \
  --tag "pilot-latest" \
  --pull-only
```

Use this mode when you only want to warm up image layers before a maintenance window.

### 5.5 First-time bootstrap (when compose file does not exist)

```bash
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh" \
  --project-dir "/opt/1panel/apps/tuff-pilot" \
  --compose-file "docker-compose.yml" \
  --service "pilot" \
  --image "ghcr.io/talex-touch/tuff-pilot" \
  --tag "pilot-latest" \
  --bootstrap-compose \
  --bootstrap-http-port "3300" \
  --health-url "http://127.0.0.1:3300/api/auth/status"
```

Behavior:

- if compose is missing, script creates a minimal compose file first
- generated compose includes `./data:/app/data` volume for persistent runtime database
- then it performs normal deploy flow (pull + restart + health check + rollback)
- `--bootstrap-http-port` controls host port mapping (`<hostPort>:3300`)

---

## 6. Configure 1Panel Automation

Option A (recommended): 1Panel script task

1. Create a script task in 1Panel
2. Use this command:

```bash
set -a
source "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
set +a
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh"
```

3. Validate manually before enabling webhook or schedule

Option B: 1Panel webhook + GitHub Actions

Use the dedicated webhook entry script:

- `deploy-pilot-1panel-webhook.sh`
- `deploy-pilot-1panel-webhook.env.example`

It handles:

1. webhook token validation (optional)
2. payload parsing (`image/tag/sha`)
3. auto mapping `sha -> pilot-<short_sha>` when `tag` is missing
4. calling `deploy-pilot-1panel.sh` for the actual deployment

### 6.1 Initialize webhook env

```bash
cp "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-webhook.env.example" "/opt/1panel/scripts/pilot-deploy/pilot-webhook.env"
```

Edit `pilot-webhook.env`:

```bash
PILOT_WEBHOOK_TOKEN=replace-with-secure-token
PILOT_WEBHOOK_ALLOWED_BRANCH=master
PILOT_WEBHOOK_ALLOWED_REPOSITORY=talex-touch/tuff
PILOT_WEBHOOK_DEFAULT_IMAGE=ghcr.io/talex-touch/tuff-pilot
PILOT_WEBHOOK_DEFAULT_TAG=pilot-latest
PILOT_WEBHOOK_DEPLOY_SCRIPT=/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh
```

### 6.2 1Panel webhook task command

> This example assumes 1Panel writes webhook body to `/tmp/pilot-webhook.json` and request token to env `ONEPANEL_WEBHOOK_TOKEN_IN`.  
> Replace these with your real 1Panel variables.

```bash
set -a
source "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
source "/opt/1panel/scripts/pilot-deploy/pilot-webhook.env"
set +a
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-webhook.sh" \
  --payload-file "/tmp/pilot-webhook.json" \
  --request-token "${ONEPANEL_WEBHOOK_TOKEN_IN:-}"
```

### 6.3 Suggested GitHub webhook payload

```json
{
  "repository": "talex-touch/tuff",
  "branch": "master",
  "sha": "abcdef1234567890",
  "image": "ghcr.io/talex-touch/tuff-pilot",
  "tag": "pilot-abcdef1"
}
```

Resolution rules:

- if `image_ref` exists, deploy by full image ref first (for example `ghcr.io/talex-touch/tuff-pilot@sha256:...`)
- else if `image + tag` exist, deploy by tag
- else if only `sha` exists, auto use `pilot-<short_sha>`
- else fallback to `PILOT_WEBHOOK_DEFAULT_IMAGE + PILOT_WEBHOOK_DEFAULT_TAG`

---

## 7. Rollback Behavior

Default script behavior:

1. Read current running image
2. Deploy target image
3. Run health check
4. If failed, rollback to previous image and run health check again

Disable rollback:

```bash
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh" \
  --project-dir "/opt/1panel/apps/tuff-pilot" \
  --image "ghcr.io/talex-touch/tuff-pilot" \
  --tag "pilot-latest" \
  --no-rollback
```

---

## 8. Troubleshooting

### Q1: `docker compose / docker-compose is not available`

Compose is missing on your server. Install/enable Docker Compose first.

### Q2: GHCR auth fails

Check:

- `PILOT_GHCR_USERNAME` and `PILOT_GHCR_TOKEN`
- token scope includes `read:packages`
- package ownership (account/org) is correct

### Q3: Health check fails but service looks up

Verify `PILOT_HEALTHCHECK_URL` is reachable from the host context. You can temporarily disable health check to isolate deployment issues.

### Q4: `Compose file not found: .../docker-compose.yml`

Most cases mean `PILOT_PROJECT_DIR` points to the script directory instead of the real 1Panel app directory.  
Set:

- `PILOT_PROJECT_DIR=/opt/1panel/apps/<your-app>`
- `PILOT_COMPOSE_FILE=docker-compose.yml` (or absolute compose path)

The script now auto-detects compose files under common 1Panel roots when the configured relative file is missing, but it only accepts candidates that match Pilot service/image hints.

If this is a first-time deployment and there is no compose yet, run once with `--bootstrap-compose`.

### Q5: `Cloudflare D1 binding "DB" is required for Pilot runtime`

This means the service is running on Node server mode without a database file configured.  
Set `PILOT_DB_FILE=/app/data/pilot.sqlite` and keep a persistent volume like `./data:/app/data`.

---

## 9. Security Recommendations

- Use least-privilege GHCR token (`read:packages`)
- Never commit GHCR token into Git
- Protect 1Panel webhook with token/signature verification
- Prefer immutable tags (`pilot-<sha>`) in production over floating `latest`
