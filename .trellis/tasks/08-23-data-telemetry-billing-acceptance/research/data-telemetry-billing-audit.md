# Data Telemetry Billing Audit

## Baseline

- Date: 2026-08-24 (America/Los_Angeles)
- Mode: read-only source inspection
- Result: sync is locally covered; telemetry, privacy, and Credits remain blocked

## Findings

### P0: Telemetry Retries Are Not Idempotent

- CoreApp persists a telemetry outbox and emits `X-Idempotency-Key` at
  `apps/core-app/src/main/modules/sentry/sentry-service.ts:1284` and `:1372`.
- Nexus batch ingest ignores that header, catches individual failures, and still
  reports every input as processed at
  `apps/nexus/server/api/telemetry/batch.post.ts:40-75`.
- Each retry gets a new event UUID at
  `apps/nexus/server/utils/telemetryStore.ts:223`.
- Event, daily stats, and governance writes are not one atomic operation at
  `telemetryStore.ts:231-303`. Missing D1 returns without error at `:204-208`.

Impact: retry can duplicate usage/governance, partial writes can drift, and the
client can delete an outbox item after a false-success ACK.

### P1: Privacy Settings Are Not Enforcement

- Dashboard PATCH only persists preference fields at
  `apps/nexus/server/api/dashboard/privacy-settings.patch.ts:29`.
- CoreApp telemetry defaults to enabled and does not consume the account policy
  at `apps/core-app/src/main/modules/sentry/sentry-service.ts:224`.
- Export omits user-linked telemetry/provider usage at
  `apps/nexus/server/utils/privacyDataStore.ts:213`.
- Account deletion enters a 30-day pending state at
  `apps/nexus/server/utils/authStore.ts:978`; no final owner worker was found,
  while the UI promises the flow at
  `apps/nexus/app/pages/dashboard/privacy.vue:117`.

### P1: Credits Are Not Atomically Reconcilable

- `consumeCredits()` updates team balance, user balance, and ledger in three
  writes at `apps/nexus/server/utils/creditsStore.ts:1024-1057`.
- A ledger failure leaves debited balances without the matching bill, and no
  business idempotency key prevents duplicate retry consumption.
- Billing registry is an empty placeholder at
  `apps/nexus/server/utils/billing/registry.ts:3`; it is not a payment fact source.

### P1: Local Provider Usage Was Assigned A Paid Default Cost

- An isolated packaged Local/Ollama text call completed with 83 prompt and 32
  completion tokens, but the audit row and day/month usage each recorded an
  estimated cost of `0.000147`.
- `IntelligenceAuditLogger` previously ignored the Provider's optional
  `usage.cost` fact and applied paid fallback pricing to every unknown model.
- The source remediation now resolves explicit audit cost first, then
  Provider-reported cost, and estimates only when neither exists. `LocalProvider`
  declares `cost: 0` for Ollama, OpenAI-compatible fallback, streaming terminal,
  and native OCR results. The Pi JSON parser also retains an explicitly reported
  zero cost instead of converting it back to an absent value.
- Focused tests cover zero and nonzero Provider costs, legacy known-model
  estimation, every LocalProvider terminal path, and the real Pi fixture shape;
  96 focused tests, CoreApp Node typecheck, scoped ESLint, and workspace
  `git diff --check` pass. A rebuilt packaged smoke is still required before
  treating the runtime regression as closed.

Impact: local self-hosted inference could pollute audit, day/month usage, quota
snapshots, and user-facing billing explanations. No direct Credits debit caused
by this row was found.

### Existing Sync Baseline

- Sync applies oplog/items/quota/session through D1 batch at
  `apps/nexus/server/utils/syncStoreV1.ts:941-956`.
- Existing tests cover duplicate operation sequence, tombstones, quota, and
  failed atomic batches. Production/Preview runtime evidence is still required.

## Evidence Boundary

- No production D1, payment API, credential, raw telemetry, IP, device identity,
  user profile, or remote mutation was used.
- The Local/Ollama evidence retains only bounded token and cost totals; no
  prompt, response, raw log, process identifier, or profile name is retained.
- Local code/tests and memory fallback do not count as production completion.
