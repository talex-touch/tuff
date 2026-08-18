# Main Process Spec Index

Electron main-process (apps/core-app/src/main) coding contracts.

## Documents

- [pi-provider-contracts.md](pi-provider-contracts.md) — renderer→main→pi
  boundary: @files attachment channel (dual-mirrored types, spill validation
  skip-not-fail, hint contract), stream commit/rollback semantics (pending).
- [agent-tool-gateway-contracts.md](agent-tool-gateway-contracts.md) — how
  model-callable tools reach `pi`: loopback gateway topology, executor arg
  order, confirmation/remember semantics (proxy tools narrow rememberKey via
  `classify`), MCP risk mapping, home skills-injection surface marker,
  degrade-not-abort rules, opt-in live smoke.

- [database-write-contracts.md](database-write-contracts.md) — single-writer-per-file
  topology, `scheduleDbWrite`/`scheduleAuxWrite` call-site convention, scheduler
  busy-retry semantics (never sleep holding the queue), live home resolution,
  search-split parity rules, boot-time maintenance write gating; hand-written
  migration authoring (snapshot chain dead at 0014, journal `when` must be max,
  leaf-table rebuild pattern, renderer-assigned ids need parent-scoped PKs).
- [channel-transport-contracts.md](channel-transport-contracts.md) — main→renderer
  delivery modes, notification-vs-request semantics, renderer quiesce before handler teardown,
  destroyed-transport send rejection, perf-report recursion prevention, delivery-target identity,
  port allowlist, and stable-mock/runtime quit evidence.
- [app-semantic-catalog-contracts.md](app-semantic-catalog-contracts.md) — category
  vocabulary: locale-structured alias groups (new language = locale key + rule),
  automatic English pluralization + skip-table discipline, match-needle token
  semantics (bare generic tokens leak), version bump ≠ instant refresh, lift-to-utils
  constraints.
- [recommendation-freshness-contracts.md](recommendation-freshness-contracts.md) —
  `installedAt` extension (write-once via conflict-do-nothing, watch-now fallback),
  double-gate freshness predicate, novelty→frecency handoff, the THREE
  `recommendation.source` union files, cache-invalidation read-guard vs cleanup
  deletion, exposure slice tag rules.
- [search-hotpath-contracts.md](search-hotpath-contracts.md) — per-keystroke search
  path: token dedup funnels through `addSearchToken` (O(1) WeakMap/Set), per-app
  derivation memoized with a content key that must cover every input field, cached
  arrays are shared read-only references.
- [background-task-timeout-contracts.md](background-task-timeout-contracts.md) —
  main-thread liveness: PollingService defaults (30s bound when `timeoutMs` is
  omitted, `null` = opt-out, omitted `lane` = serial/concurrency-1), timeout
  releases the slot but never cancels the callback, outbox drains need a round
  deadline + stop-on-first-failure + carry-back of unreached items, polled child
  processes need consecutive-failure backoff and throttled logs, nothing on the
  search path may `waitForIdle()` unbounded; how to read `[Perf:EventLoop]`.
- [search-charset-and-identity-contracts.md](search-charset-and-identity-contracts.md)
  — charset rules import from search-charset only; SEARCH_KEYWORD_SCHEMA_VERSION
  bump semantics (app auto / file via bound backfill, never through the disk-reading
  worker); gated paged migration pattern; usage identity = source.id everywhere.

## Quality Check

Before committing main-process DB changes:

```bash
cd apps/core-app
grep -rn "schedule([^)]*withSqliteRetry" src/main --include="*.ts" | grep -v test   # must be empty
npm run typecheck:node
npx vitest run src/main/db/
```
