# Pilot Deployment Guide (1Panel + GHCR)

This folder contains the standardized deployment assets for Pilot on 1Panel:

- `deploy-pilot-1panel.sh`: deployment script with health check, auto rollback, and pull-only mode
- `deploy-pilot-1panel-cron.sh`: scheduled wrapper with env loading and concurrency lock
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
- `apps/pilot/deploy/deploy-pilot-1panel-cron.sh`
- `apps/pilot/deploy/deploy-pilot-1panel.env.example`

Then run:

```bash
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh"
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-cron.sh"
cp "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.env.example" "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
```

---

## 4. Configure Environment

Edit `pilot-deploy.env`:

```bash
# Optional. Keep empty to auto-detect compose under cwd and /opt/1panel.
PILOT_PROJECT_DIR=
PILOT_COMPOSE_FILE=docker-compose.yml
PILOT_SERVICE_NAME=pilot

PILOT_IMAGE_REPO=ghcr.io/talex-touch/tuff-pilot
PILOT_IMAGE_TAG=pilot-latest
PILOT_DB_DRIVER=sqlite
PILOT_DB_FILE=/app/data/pilot.sqlite
PILOT_POSTGRES_URL=
PILOT_REDIS_URL=redis://redis:6379/0

PILOT_HEALTHCHECK_URL=http://127.0.0.1:3300/api/auth/status
PILOT_HEALTHCHECK_ATTEMPTS=20
PILOT_HEALTHCHECK_INTERVAL_SEC=3
PILOT_ROLLBACK_ON_FAILURE=true

PILOT_GHCR_USERNAME=
PILOT_GHCR_TOKEN=
```

Important fields:

- `PILOT_PROJECT_DIR`: compose project directory (optional, supports auto-detection)
- `PILOT_SERVICE_NAME`: target service to update (default `pilot`)
- `PILOT_IMAGE_TAG`: default `pilot-latest`, can be pinned to a release tag such as `pilot-a1b2c3d`
- `PILOT_DB_DRIVER`: `sqlite` / `postgres` (default `sqlite`)
- `PILOT_DB_FILE`: runtime SQLite path for Node deployment
- `PILOT_POSTGRES_URL`: postgres DSN used when `PILOT_DB_DRIVER=postgres`
- `PILOT_REDIS_URL`: redis DSN (reserved for runtime integration)
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

> Auto-detection is enabled now: if you omit `--project-dir/--image/--service`, the script infers them from compose files.

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

## 6. Schedule Daily Deployment

Recommended cron entry:

```bash
0 4 * * * /opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-cron.sh >> /var/log/pilot-deploy.log 2>&1
```

Wrapper behavior:

1. loads `pilot-deploy.env`
2. acquires a lock to avoid overlapping runs
3. executes `deploy-pilot-1panel.sh` (pull + restart + health check + rollback)

To force a specific tag in cron:

```bash
PILOT_IMAGE_TAG=pilot-latest /opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-cron.sh
```

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
- Prefer immutable tags (`pilot-<sha>`) in production over floating `latest`
