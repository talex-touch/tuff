# Provider Registry migration evidence

> Scope: R2 AI Stable broader provider surface `provider-migration-evidence`.
> Evidence source: local-only Nexus API handler dry-run with `MockD1Database`.
> Verification command: `corepack pnpm -C "apps/nexus" exec vitest run "test/api/dashboard/intelligence/providers/migrate.local-dry-run.api.test.ts"`

## Evidence Summary

mode: dry-run
readiness: planning
registryPrimaryReady: no
total: 1
migrated: 0
skipped: 0
failed: 0
blockers: migration_dry_run_only, migration_not_executed

items:
- OpenAI Main (ip_local_dry_run): would_create; secret=unchanged reason=legacy_api_key_would_move_to_secure_store

## Source Path

- API handler: `apps/nexus/server/api/dashboard/intelligence/providers/migrate.post.ts`
- Migration bridge: `apps/nexus/server/utils/intelligenceProviderRegistryBridge.ts`
- Summary formatter: `apps/nexus/app/utils/intelligence-provider-migration.ts`
- Evidence test: `apps/nexus/test/api/dashboard/intelligence/providers/migrate.local-dry-run.api.test.ts`

## Secret Review

- The dry-run does not write provider registry rows or secure-store credential rows.
- The generated summary does not contain `encrypted-local-secret-placeholder` or raw provider API key material.
- `secret=unchanged` means the legacy API key would move to secure store only during execute mode; this artifact does not execute migration.

## Readiness Boundary

- This artifact proves the migration dry-run summary, blocker accounting, migrated/skipped/failed counts, and secret redaction path.
- This artifact does not claim registry-primary runtime readiness because the run is dry-run only and local-only.
