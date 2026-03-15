# Pilot Deployment Guide (1Panel + Docker Compose)

This folder provides standard deployment scripts for Pilot on 1Panel:

- `deploy-pilot-1panel.sh`: pull image + restart + health check + rollback
- `deploy-pilot-1panel-cron.sh`: scheduled wrapper (env loading + lock)
- `deploy-pilot-1panel.env.example`: environment template
- `deploy-pilot-1panel-webhook.sh`: resolve webhook payload to image target and call deploy script
- `deploy-pilot-1panel-webhook.env.example`: webhook token and guardrails template
- `pilot-deploy-webhook-server.py`: lightweight HTTP webhook server with status page
- `pilot-deploy-webhook.service.example`: systemd unit template

## 1) Quick start

1. Upload files to server, for example `/opt/1panel/scripts/pilot-deploy`:
  - `deploy-pilot-1panel.sh`
  - `deploy-pilot-1panel-cron.sh`
  - `deploy-pilot-1panel.env.example`
  - `deploy-pilot-1panel-webhook.sh`
  - `deploy-pilot-1panel-webhook.env.example`
  - `pilot-deploy-webhook-server.py`
2. Make scripts executable:

```bash
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.sh"
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-cron.sh"
chmod +x "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-webhook.sh"
cp "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel.env.example" "/opt/1panel/scripts/pilot-deploy/pilot-deploy.env"
cp "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-webhook.env.example" "/opt/1panel/scripts/pilot-deploy/deploy-pilot-1panel-webhook.env"
```

3. Edit `pilot-deploy.env` and `deploy-pilot-1panel-webhook.env` with your production values.

## 2) Environment variables

### Required runtime vars

- `PILOT_POSTGRES_URL`
- `PILOT_REDIS_URL`
- `PILOT_JWT_ACCESS_SECRET`
- `PILOT_JWT_REFRESH_SECRET`
- `PILOT_COOKIE_SECRET`
- `PILOT_CONFIG_ENCRYPTION_KEY`
- `PILOT_BOOTSTRAP_ADMIN_PASSWORD` (must be explicitly provided, minimum length 6)

### Optional runtime vars

- `PILOT_BOOTSTRAP_ADMIN_EMAIL` (default `admin@pilot.local`)
- `PILOT_EXECUTOR_DEBUG`
- `NUXT_PUBLIC_NEXUS_ORIGIN`
- `PILOT_NEXUS_OAUTH_CLIENT_ID`
- `PILOT_NEXUS_OAUTH_CLIENT_SECRET`
- `PILOT_ATTACHMENT_PROVIDER` (`memory|auto|s3`, default `memory`, recommend `memory` first)
- `PILOT_ATTACHMENT_PUBLIC_BASE_URL`
- `PILOT_ATTACHMENT_SIGNING_SECRET` (optional; falls back to `PILOT_COOKIE_SECRET` when empty)
- Configure the following only when `PILOT_ATTACHMENT_PROVIDER=s3`:
- `PILOT_MINIO_ENDPOINT`
- `PILOT_MINIO_BUCKET`
- `PILOT_MINIO_ACCESS_KEY`
- `PILOT_MINIO_SECRET_KEY`
- `PILOT_MINIO_REGION` (default `us-east-1`)
- `PILOT_MINIO_FORCE_PATH_STYLE` (default `true`)
- `PILOT_MINIO_PUBLIC_BASE_URL` (optional, bucket root URL)

### Deployment vars

- `PILOT_IMAGE_TAG` (default `pilot-latest`)
- `PILOT_HEALTHCHECK_URL`
- `PILOT_HEALTHCHECK_ATTEMPTS`
- `PILOT_HEALTHCHECK_INTERVAL_SEC`
- `PILOT_ROLLBACK_ON_FAILURE`

### Webhook vars

- `PILOT_WEBHOOK_TOKEN` (required, request token validation)
- `PILOT_WEBHOOK_ALLOWED_BRANCH` (default `master`)
- `PILOT_WEBHOOK_ALLOWED_REPOSITORY` (optional, for example `talex-touch/tuff`)
- `PILOT_WEBHOOK_DEFAULT_IMAGE`
- `PILOT_WEBHOOK_DEFAULT_TAG`
- `PILOT_WEBHOOK_SERVER_HOST` (default `127.0.0.1`)
- `PILOT_WEBHOOK_SERVER_PORT` (default `19021`)

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

## 5) Auto deploy by webhook (GitHub -> 1Panel)

1. Install systemd unit:

```bash
cp "/opt/1panel/scripts/pilot-deploy/pilot-deploy-webhook.service.example" "/etc/systemd/system/pilot-deploy-webhook.service"
systemctl daemon-reload
systemctl enable --now pilot-deploy-webhook.service
```

2. Verify webhook status page:

```bash
curl "http://127.0.0.1:19021/health"
```

3. Expose the webhook with FRP (remote port in `20000-30000`, avoid conflicts), then restart FRPC.
4. Set GitHub repository secrets:
   - `ONEPANEL_WEBHOOK_URL` (for example `http://<frp-host>:23301`)
   - `ONEPANEL_WEBHOOK_TOKEN` (same value as `PILOT_WEBHOOK_TOKEN`)
5. `pilot-image.yml` will trigger `POST /deploy` after pushing `pilot-latest`.

## 6) Rollback behavior

- Script records currently running image
- Deploys target image
- Runs health check
- If check fails and rollback is enabled, script rolls back to previous image automatically

## 7) Notes

- This deployment flow is Node server only (no Cloudflare runtime)
- Runtime requires PostgreSQL + Redis
- Admin email defaults to `admin@pilot.local`; admin password must come from `PILOT_BOOTSTRAP_ADMIN_PASSWORD` (minimum length 6)
- For production, change admin password immediately after first deployment
