# Implementation plan: search-index split write paths

Status: writers reconciled and verified statically; the application-run gate now has a harness and
has not been executed yet (see `acceptance.md`).

## 1. Establish exact write inventory

1. Search the named 2d/2e sites and all `dbUtils.addEmbedding` callers before modifying them.
2. Classify each write by table, dependent id/extension behavior, current connection, and worker API
   suitability.
3. Keep a checklist mapping every named site to its replacement and focused test/evidence.

**Done (2026-09-29).** The checklist is the "Reconciled writer inventory" table in `design.md`,
verified line by line against the working tree. Outcome:

- `runAppTransaction` and every app-provider transaction write the **app catalog**, which stays on
  the primary on purpose (`app-provider.ts:773-784`); 2d.2's migration instruction is void, and its
  13 line references are stale.
- `file-provider.ts` has no `withDbWrite` API; 2d.3's nine site references are stale. The real
  scheduled writes are explicit flag-off branches.
- `embedding-service.ts` no longer exposes `addEmbedding`; `indexFile`/`runWrite` is split-aware and
  no `dbUtils.addEmbedding` caller remains.
- The two sites an initial pass flagged as unguarded (`file-provider.ts:3538-3542`, `3655-3680`) are
  the flag-off branches behind `isSearchSplitEnabledNow()`.
- Static half: `pnpm -C apps/core-app run check:search-index-writers`.

## 2. Wire context and migrate writes

1. Add provider-local split context to `createDbUtils` in `app-provider.ts` and both
   `file-provider.ts` sites. → **Superseded for `app-provider.ts`** (see §1); `file-provider.ts`
   passes `{ enabled, searchDb, writer }` at `:2545-2549` and `:2888-2895`.
2. Convert app-provider transaction sites via exact `execWrite` forwarding. → **Not required**: the
   catalog never moves.
3. Convert file-provider scheduled writes to the typed worker persistence API only where its write
   contract is exact. → Migrated; `upsertFiles` is used for inserts/updates where the conflict set
   matches, `execWrite` where it does not.
4. Route embeddings and remaining direct helper callers to the worker. → Done via
   `EmbeddingService.runWrite`.
5. Ensure an empty split database triggers the required first-launch rescan/reindex. →
   `services/file-provider-bootstrap-reindex.ts`; asserted by the harness' `bootstrap` phase.
6. Add focused startup-order evidence that a split-enabled provider write waits or fails closed
   before `searchIndexWriter` readiness and never reaches the primary database as a fallback. →
   Structural: `search-core.ts:329-336` awaits `initialize` in `beforeProvidersLoad`. Fail-closed:
   `file-provider.ts:1283-1298` + `search-index-writer.ts:276-284`. Runtime half: the harness'
   `provider writes waited for writer readiness` check.

## 3. Focused verification before runtime evidence

1. Run focused provider/worker/persistence tests for each changed contract.
2. Confirm the flag-off paths preserve their prior SQL and behavior.
3. Verify each split-on path awaits worker completion before dependent reads.
4. Exercise the provider-before-writer-ready startup path and prove it cannot write `database.db`.
5. Do not infer runtime correctness from typecheck alone.

The runtime gate itself is now one harness rather than four manual steps:

```bash
pnpm -C apps/core-app run search-split:app-evidence -- --profile /tmp/tuff-split-evidence
pnpm -C apps/core-app run search-split:app-evidence:self-check   # judgement only, no launch
```

## 4. Flag-on application acceptance

`acceptance.md` holds the assertion matrix and the exact commands. The harness owns the disposable
profile (under a temp root, enforced by path), arms a write detector in `database.db`, and runs the
three phases:

1. `bootstrap` — flag **unset** (proves the default), empty search file → full reindex.
2. `split` — flag unset, detector armed → topology, sentinel silence, readiness, no busy storm.
3. `rollback` — `TUFF_DB_SEARCH_SPLIT_ENABLED=0` → live store back on the primary, stale search home
   frozen, sentinel fires, count and query parity against phase 2.

Any mismatch is a silent-data-loss blocker; a failing run keeps its profile for inspection.

## Evidence map

| prd acceptance criterion | check id | artifact |
|---|---|---|
| every 2d/2e writer executes on the worker connection under the split | `judgeTopology(…, 'split')`, `no worker-owned write reached the primary`, `check:search-index-writers` | `phase-split.json`, guard output |
| focused startup-ordering evidence; no fallback to `database.db` | `provider writes waited for writer readiness`, `no silent fallback to the primary database` | run log window in `phase-*.json` |
| provider `displayName`, conflict semantics and extensions intact | `judgeTopology(…, 'split')` (extension rows), query parity | `report.json#parityChecks` |
| embedding / first-launch reindex decisions covered | `first-launch-reindex` (reindex); embeddings remain unit-level evidence | `phase-bootstrap.json` |
| isolated-profile run proves populated search file, complete results, matching counts, rollback | the whole matrix | `report.json` + `--repoSummary` |
| release stays blocked without direct app-run evidence | `acceptance.md` "Not executed" | this file |

## Rollback

Rollback is a data-preserving transition to the shared-file topology, not merely a flag flip:
quiesce every search-index writer, reconcile or rebuild the worker-owned index into the primary
database (or restore one consistent snapshot), then set `TUFF_DB_SEARCH_SPLIT_ENABLED=0` and restart
CoreApp. Before release resumes, compare application/file counts and representative query results
across the two homes and prove the shared-file path has parity. If reconciliation, restart, or parity
fails, restore the snapshot and keep the release blocked; never delete primary moved tables as a
workaround.

Parity is compared between the two **live homes**, not between the union of both files: a
data-preserving rollback leaves the retired `search-index.db` populated, so a union double-counts
and reports parity while the primary index is empty. `compareParity` in
`scripts/search-split-topology-verify.ts` now takes the judged run's `expect` for that reason
(2026-09-29).
