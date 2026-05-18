# Provider Registry Migration Planning Evidence

> Date: 2026-05-17
> Scope: legacy `intelligence_providers` retirement evidence format.
> Status: blocked, planning-only.

This artifact is produced from local isolated dry-run tests that execute the Provider Registry migration API handler and the real migration bridge against a Mock D1 database. It does not call production APIs, does not write production D1, and is not a user-session Dashboard dry-run result. It must not be used to claim registry-primary runtime readiness.

## Command

```bash
pnpm -C "apps/nexus" exec vitest run "test/api/dashboard/intelligence/providers/migrate.local-dry-run.api.test.ts" "server/utils/intelligenceProviderRegistryBridge.local-dry-run.test.ts"
```

## Evidence Summary

```text
# Provider Registry migration evidence

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
```

## Review Notes

- Readiness remains `planning`; this is not safe for registry-primary reads.
- `registryPrimaryReady` remains `no` because dry-run-only evidence is not execution evidence.
- The copied text includes provider id, provider name, action, blocker, and secret migration state only.
- No raw API key, decrypted secret, prompt, model output, or production account data is present.
- The local API dry-run test exercises `server/api/dashboard/intelligence/providers/migrate.post.ts` with a mocked admin session and Mock D1.
- The local bridge dry-run test exercises `migrateLegacyIntelligenceProvidersToRegistry()` directly with the same Mock D1 fixture.
- Both tests assert that the registry table and provider secure store remain empty after dry-run.
- Required follow-up: run a real Dashboard Admin or controlled local API dry-run with real local bindings, copy the generated evidence summary, then replace this planning artifact with the real artifact.
