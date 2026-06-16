# Nexus Maintenance Worker

Independent Cloudflare Worker Cron for Nexus telemetry/governance retention.

## Schedule

- Cron: `23 */6 * * *` (UTC, every 6 hours)
- Production D1: `tuff-nexus-prod`
- Preview D1: `tuff-nexus-dev`

## Behavior

The worker calls the shared Nexus retention core directly:

- raw `telemetry_events`: retain 7 days
- raw `platform_governance_events`: retain 14 days
- batch limit: 10,000 rows per run
- `daily_stats` telemetry aggregates are backfilled before deleting telemetry detail rows

## Commands

```bash
pnpm exec wrangler deploy --dry-run --config "workers/nexus-maintenance/wrangler.toml" --env production
pnpm exec wrangler deploy --config "workers/nexus-maintenance/wrangler.toml" --env production
```

Use the preview environment for non-production checks:

```bash
pnpm exec wrangler deploy --dry-run --config "workers/nexus-maintenance/wrangler.toml" --env preview
```
