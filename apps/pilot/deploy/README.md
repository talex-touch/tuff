# Pilot Deployment Guide (1Panel + Docker Compose)

This folder provides standard deployment scripts for Pilot on 1Panel:

- `deploy-pilot-1panel.sh`: pull image + restart + health check + rollback
- `deploy-pilot-1panel-cron.sh`: scheduled wrapper (env loading + lock)
- `deploy-pilot-1panel.env.example`: environment template

## 1) Quick start

1. Upload files to server, for example `/opt/1panel/scripts/pilot-deploy`:
   - `deploy-pilot-1panel.sh`
   - `deploy-pilot-1panel-cron.sh`
   - `deploy-pilot-1panel.env.example`
2. Make scripts executable:

```bash
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh"
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-cron.sh"
cp "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.env.example" "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
```

3. Edit `pilot-deploy.env` with your production values.

## 2) Environment variables

### Required runtime vars

- `PILOT_POSTGRES_URL`
- `PILOT_REDIS_URL`
- `PILOT_JWT_ACCESS_SECRET`
- `PILOT_JWT_REFRESH_SECRET`
- `PILOT_COOKIE_SECRET`
- `PILOT_CONFIG_ENCRYPTION_KEY`
- `PILOT_BOOTSTRAP_ADMIN_PASSWORD` (default is `admin`, override in production)

### Optional runtime vars

- `PILOT_BOOTSTRAP_ADMIN_EMAIL` (default `admin@pilot.local`)
- `PILOT_EXECUTOR_DEBUG`
- `NUXT_PUBLIC_NEXUS_ORIGIN`
- `PILOT_NEXUS_OAUTH_CLIENT_ID`
- `PILOT_NEXUS_OAUTH_CLIENT_SECRET`

### Deployment vars

- `PILOT_IMAGE_TAG` (default `pilot-latest`)
- `PILOT_HEALTHCHECK_URL`
- `PILOT_HEALTHCHECK_ATTEMPTS`
- `PILOT_HEALTHCHECK_INTERVAL_SEC`
- `PILOT_ROLLBACK_ON_FAILURE`

> Compose path/service/image are auto-detected by default. If there is no compose file yet, run
> `deploy-pilot-1panel.sh --bootstrap-compose --bootstrap-http-port 3300` once to generate a minimal template.

## 3) Manual deployment

```bash
set -a
source "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
set +a
"/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh"
```

## 4) Scheduled daily deployment

Recommended cron entry:

```bash
0 4 * * * /opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-cron.sh >> /var/log/pilot-deploy.log 2>&1
```

The cron wrapper automatically:

1. loads `pilot-deploy.env`
2. acquires lock to avoid concurrent runs
3. executes deployment script

## 5) Rollback behavior

- Script records currently running image
- Deploys target image
- Runs health check
- If check fails and rollback is enabled, script rolls back to previous image automatically

## 6) Notes

- This deployment flow is Node server only (no Cloudflare runtime)
- Runtime requires PostgreSQL + Redis
- Admin account defaults to `admin@pilot.local` + `admin` if not overridden
- For production, change admin password immediately after first deployment
