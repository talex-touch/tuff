# Search Charset & Identity Contracts (main process)

Source: tasks 08-05-keyword-charset-unification (7dac5286c) and
08-05-reco-ranking-stats-fix (856f89b85). Violating these reintroduces the
silent-zero-results and identity-split bug classes those tasks removed.

## 1. Charset rules live in ONE module

`packages/utils/search/search-charset.ts` is the single source for search text
cleaning (`normalizeSearchText`), folding (`foldSearchText` — keeps kana voicing
marks U+3099/309A), Han detection (`\p{Script=Han}`), keyword validity, FTS5 token
quoting, and `SEARCH_KEYWORD_SCHEMA_VERSION`. Never write a local
`[a-z0-9一-龥]`-style regex; import from the module. Query text becomes FTS5 MATCH
syntax ONLY inside `buildFtsMatchExpr` (quoted tokens, doubled inner quotes).

## 2. Bumping SEARCH_KEYWORD_SCHEMA_VERSION

The version folds into the per-item keyword hash (search-index-service
`buildKeywordHash`) — hash mismatch drives delta rewrites INDEPENDENT of mtime, but
only for items a source re-emits:

- app source: every runtime scan re-emits the full catalog → covered automatically.
- file source: steady-state reconcile re-emits only mtime-changed files → the
  version-gated paginated in-DB backfill
  (`file-provider-keyword-backfill-service.ts`, version key bound to the SAME
  constant) re-emits existing rows through the indexed-source write path. Do not
  route backfills through `scheduleIndexing` — that worker reads disk (content
  sha256); use `emitIndexedSourceRecordBatchFromBatch` (pure DB→index mapping).

## 3. Gated maintenance migration pattern

Precedents: file-provider-path-normalization-service, usage-source-identity-migration,
file-provider-keyword-backfill-service. Contract: version key in the primary config
table written via `scheduleDbWrite`; paged `id > cursor` iteration; version recorded
ONLY on zero failures (partial failure → next boot retries; operations must be
idempotent); same-table passes are serialized, never concurrent (path-normalization
before keyword backfill); schedule after the startup degrade window; timers cleared
on shutdown and reconcile defers only while a pass is scheduled-but-unattempted.

## 4. Usage identity

`usage_logs.source`, `item_usage_stats.sourceId`, `item_time_stats.sourceId`, and
`usage_trend_daily` keys all carry `item.source.id`. The literal `'system'` rows
(search sessions from `recordSearch`) are intentional and must pass through any
future migration untouched. Migration ordering is load-bearing: rewrites before
merges (negatively tested).

## Verification

```bash
cd apps/core-app && npx vitest run src/main/modules/box-tool/ && npm run typecheck:node
cd packages/utils && npx vitest run
```
