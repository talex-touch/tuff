# Telemetry And Credits Idempotency Evidence

## Scope

- Date: 2026-08-28 (America/Los_Angeles)
- Mode: local code implementation + focused tests + release preflight
- Result: telemetry and Credits moved from `blocked` to `partial`; privacy, production Sync, billing registry and remote D1 evidence remain blocked/partial.

## Telemetry Changes

- `apps/core-app/src/main/modules/sentry/sentry-service.ts` now uses `randomUUID()` for telemetry batch idempotency keys.
- CoreApp stops Nexus telemetry upload while telemetry is disabled, clears in-memory Nexus telemetry, and discards only `sentry.nexus.batch` outbox rows so shared startup analytics rows are not cross-consumed.
- `apps/nexus/server/api/telemetry/batch.post.ts` requires `X-Idempotency-Key`.
- Same key + same canonical payload returns the cached ACK and does not duplicate writes.
- Same key + different payload returns `409`.
- Logged-in Nexus batch ingest now applies privacy settings before writes: `analytics=false` rejects all telemetry, `usageData=false` rejects usage/search/visit/feature/performance telemetry, and `crashReports=false` rejects crash/error telemetry.
- Single-event write failures are no longer swallowed as success.
- `processed` is retained for compatibility but equals accepted count.

## Credits Changes

- `apps/nexus/server/api/credits/consume.post.ts` forwards `X-Idempotency-Key`.
- `apps/nexus/server/utils/creditsStore.ts` stores `idempotency_key` and `idempotency_hash` on ledger rows and enforces a scoped unique index.
- Same business key replay returns the existing ledger result.
- Same business key with conflicting amount/reason/metadata fails closed.
- New consumption path uses one D1 batch for ledger plus team/user balance updates.

## Focused Validation

- `apps/nexus/test/api/telemetryBatchIdempotency.api.test.ts`
- `apps/core-app/src/main/modules/sentry/sentry-service.test.ts`
- `apps/nexus/test/api/credits-consume-idempotency.api.test.ts`
- `apps/nexus/server/utils/creditsStore.idempotency.test.ts`
- `corepack pnpm -C apps/nexus run typecheck`
- `corepack pnpm lint:changed`
- `corepack pnpm test:release-acceptance`
- `corepack pnpm plugins:validate`
- `corepack pnpm quality:pr`
- `corepack pnpm quality:release`
- `git diff --check`

## Remaining Gates

- Telemetry receipt retention and fully atomic event/stat/governance/receipt commit still need dedicated maintenance evidence.
- Privacy settings are now enforced for the CoreApp Nexus telemetry outbox drain and Nexus batch ingest, but not yet proven across every telemetry producer, personalization pathway, export/delete owner, or production D1 run.
- Privacy export/delete/finalization does not yet cover every user-owned telemetry/provider usage/Credits/sync owner.
- Billing registry is still unavailable as a real payment source of truth.
- Production/Preview D1 evidence is intentionally not claimed in this local run.
