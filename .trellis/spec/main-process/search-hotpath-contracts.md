# Search Hot-Path Contracts (main process)

Source: task 08-05-search-hotpath-quadratic-fix (2026-08-05). These are executable
contracts for the per-keystroke CoreBox search path; violating them reintroduces the
quadratic-per-keystroke bug class this task removed.

## Scenario: code on the per-keystroke search path

CoreBox query → provider `onSearch` → candidate scoring → result build. Budget
context: `SLOW_PROCESS_THRESHOLD_MS = 300` (search-processing-service.ts), gather
fast layer 80ms.

## Contracts

### 1. Token dedup is O(1) per insert — all producers funnel through `addSearchToken`

`packages/utils/search/search-token-builder.ts` tracks dedup keys in a
`WeakMap<SearchTokenList, Set<string>>` seeded on first use. A direct `tokens.push`
after the first `addSearchToken` call bypasses dedup silently — never push token
lists directly; add tokens only via the `add*SearchTokens` helpers.

### 2. Per-app search derivation is memoized — the cache key MUST cover every input

`resolveAppSearchDerived` (search-processing-service.ts) memoizes semantic aliases,
tool-source ids, and `buildAppSearchTokens` output on a content fingerprint
(`buildAppSearchDerivedKey`). **Any new field that feeds catalog resolution or token
building must be added to the key** (exception: values derived from existing key
fields, e.g. `fileName`). A field feeding derivation but missing from the key is a
stale-cache bug: search results silently stop reflecting that field's changes.
User aliases (`setAliases`) flow in via `aliasList` — already keyed.

### 3. Cached arrays are shared references — consumers stay read-only

Cached `searchTokens`/`toolSourceIds` are attached to result items across
keystrokes. `matchFeature` copies tokens it returns (`normalizeSearchToken`) and
must stay non-mutating; no main-process code may write to
`item.meta.extension.searchTokens`. Cache is LRU-bounded
(`APP_SEARCH_DERIVED_CACHE_LIMIT = 512`).

### 4. Runtime index reads belong to the dedicated read worker

Local libSQL's Promise API executes native SQLite synchronously. `Promise.all`
does not move queries off Electron's main thread. Runtime SearchIndexService
receives a SearchIndexReadExecutor owned by SearchEngineCore; FTS, exact/prefix,
ngram/subsequence, counts and commit-visibility reads use that executor. Keep SQL
construction and result semantics in SearchIndexService, not a second worker query
implementation. Writer-side services retain their existing local connection.

The reader opens the same `getSearchDatabaseFilePath()` selected for the writer,
requires an existing regular database and enables `PRAGMA query_only`. It never
migrates, repairs or writes the index. Main still awaits writer readiness before
prewarming the reader; the visibility barrier observes commits on the read
connection. Never hold a long-lived read transaction across searches.

The parent owns a bounded queue and one physical native read at a time. Pass the
provider AbortSignal through every candidate lookup. A queued abort removes the
work; an active abort rejects its caller but retains the physical slot until the
worker replies or times out. Failure, premature exit, timeout and close settle
every pending caller without replay or a synchronous main-thread fallback. Core
closes the reader from its shutdown finally path, after normal writer drains.

### 5. Measure input delivery separately from SQL wall time

Short-lived search sessions use typed IPC by default, not a fresh MessagePort
handshake. Keep the 80ms input debounce and existing ranking policy independent
from that transport decision. SearchIndex duration includes readiness, queueing
and return scheduling; it is not isolated native SQL time. For runtime UI timing,
identify the owned native CoreBox window and its foreground state. Background
timer/animation-frame throttling must not be reported as foreground search latency.

The read-worker integration accepts `TUFF_SEARCH_READ_WORKER_TEST_PATH` for an
isolated build. On macOS canonicalize a temporary build root before electron-vite
build (`/var` can resolve to `/private/var`); relative asset locators otherwise
acquire the wrong parent depth. Use a script file rather than `node --input-type`
for ad-hoc native worker probes, whose child inherits Node loader arguments.

## Verification

```bash
cd packages/utils && npx vitest run                     # 979 tests
cd apps/core-app && npx vitest run src/main/modules/box-tool/addon/apps/
cd apps/core-app && npm run typecheck:node
```

Benchmark shape (throwaway vitest file, see task design.md): old-dedup replica vs
new at 150 apps × 200/400 tokens — measured 2026-08-05: old 1388→6006ms (4.33×,
quadratic), new 34→62ms (1.82×, linear); memoized `processSearchResults` over 150
rows: cold 21.6ms → warm 2.9ms with identical match sets.
