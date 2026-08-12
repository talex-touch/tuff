# V1 validation run evidence (2026-08-05, first attempt: FAILED → G0 fix)

Run: `TUFF_DB_SEARCH_SPLIT_ENABLED=1 pnpm core:dev`, dev profile
`~/Library/Application Support/@talex-touch/core-app/tuff-dev/modules/database/`.
Full log: /tmp/v1-split-run.log (session-local).

## Failure

- 00:44:10.097 `[OperationalError] search-index-worker.init failed … code=SQLITE_ERROR`
  — `CREATE INDEX IF NOT EXISTS idx_keyword_mappings_provider_keyword ON
  keyword_mappings(provider_id, keyword)` failed on the fresh `search-index.db`.
- 00:44:10.098 `runtime.bootstrap.unhandled-rejection` (same error) — the worker-init
  rejection escaped through the `ALL_MODULES_LOADED` async listener
  (`search-core.ts` → `loadWhenOnboardingAllows` raw `ensureLoaded` path, no
  containment). App survived via the precore catch-all; search stayed dead for the
  session (no fallback/degrade log, no retry).

## Schema-level root cause (sqlite3 inspection)

`search-index.db` (drizzle migrations only):
```
keyword_mappings: id, keyword, item_id, priority          -- NO provider_id
scan_progress:    path PK, last_scanned                    -- LEGACY shape
```
`database.db` (primary, migrations + out-of-band fixups):
```
keyword_mappings: … + provider_id text DEFAULT '' NOT NULL -- ensureKeywordMappingsProviderColumn
scan_progress:    PRIMARY KEY(source_id, path)             -- ensureScanProgressSourceScopeMigration
```

`initSearchDatabase()` ran ONLY `migrate()`; the "same migrations ⇒ same schema"
assumption was false on two counts because the primary's schema depends on
out-of-band ensure* fixups that never ran for the search file. This is precisely the
class of failure the #295 "ships dark until validated by an app-run" gate existed to
catch — the validation just never happened until now.

## G0 fix (landed, see task journal)

- `initSearchDatabase()` applies both fixups (parameterized provider_id ensure +
  plan-gated scan-progress source-scope migration) after `migrate()`; fail-closed to
  the primary-topology fallback (= flag-off behavior).
- `loadWhenOnboardingAllows` allowed-branch routed through `ensureLoadedWithRetry`
  (containment + 1s→30s backoff); worker-init failure now degrades cleanly, no
  unhandled rejection, no worker fallback to `database.db` (would recreate the
  dual-writer topology).
- Audit: exactly two correctness fixups needed; `idx_embeddings_source` perf-index
  parity + embedding-service split-brain (`file-provider.ts:1870` primary-db
  EmbeddingService vs split-routed dbUtils) + worker init-retry client leak flagged
  → follow-up fix dispatched before the default flip.

## Rerun note

The failed `search-index.db` artifact is deliberately KEPT for the rerun: booting over
it exercises the repair-on-existing-file path (fixups on a legacy-shaped file); the
fresh-file path is covered by `index.search-schema.test.ts`.

## V1 rerun #2 (2026-08-05 01:39, after G0 schema/containment fixes): PARTIAL PASS → new blocker

PASS: boot zero SQLITE_ERROR/BUSY/unhandled; repair-on-existing-file worked (provider_id
column + source-scoped scan_progress added to the legacy search-index.db on boot); worker
initialized against the search file (dbPathLength=113, mode=writer/reader split); lanes
healthy (queuedByLane primary/aux, busy=0 across all labels for 5+ min).

FAIL (ship-blocker #3): the "one-time full reindex on first launch" promised by the
runtime-flags comment has NO implemented trigger. After 5 min: search-index.db
search_index/files/scan_progress all 0 rows, WAL 0 bytes, while primary search_index
holds 3408 rows. Zero integrity/preflight/rebuild activity in logs. Suspected mechanism:
index-STATE reads (app-provider index sync decision, file-provider scan scheduling /
scan_progress reads) still hit the PRIMARY db when the split is on — stale rows there say
"everything indexed/scanned" so nothing ever pushes into the empty search file
(read-side split-brain, sibling of the embedding write split-brain).

## V1 rerun #3 + relaunch (2026-08-05 02:27 / 02:34): PASS with pre-flip caveats

Run 3 (0.2): bootstrap fired ("Search index bootstrap reindex scheduled: search_index
empty for 'file-provider' with 6 watch root(s)"), Scan strategy newPaths=6, 4678 items
indexed in ~36s; final search-index.db: search_index=3417, files=3189,
keyword_mappings=113941. Zero SQLITE_BUSY / ERROR / unhandled.
Relaunch (0.3): bootstrap correctly skipped (index populated, si=3418), one incremental
indexed-summary only, zero errors, unclean-shutdown integrity probe passed silently.

Pre-flip caveats (default stays OFF until resolved):
1. 2d.3 write-path gaps (parked 07-28 task migrate-search-index-split-write-paths):
   watch-event incremental/cleanup writes still primary-homed; _processFileUpdates sends
   primary row ids through the worker (cross-home id collision on watch-modify).
2. scan_progress rows never persisted in either run (sp=0) — persistence under the split
   suspect; consequence is re-scan eligibility each boot, not corruption.
3. Phase-4 backfill deferral: run 3 logged "Startup backfill ... complete in 0.72s" at
   ~1.7s after boot — verify the degrade-window deferral survived the app-provider
   split-context change (expected ≥45s in dev).

## V2 final run + default flip (2026-08-05 ~03:20)

After the 2d.3 migration landed: 5-minute split-on run with zero SQLITE_BUSY, zero
FOREIGN KEY failures (run 3 had 171 extensions + 3181 icon FK failures — the
cross-home id class, now eliminated), zero retry exhaustion, zero unhandled.
`DB_SEARCH_SPLIT_ENABLED` default flipped to true (commit "enable the search-index
single-writer split by default"); `TUFF_DB_SEARCH_SPLIT_ENABLED=0` is the kill switch.
Post-flip quality check fixed 2 findings (live aux read home; 2 stray scheduler call
sites) and Phase 6 retired the .compat dual-writes. Task-scope suites: 1382+ tests
passing; remaining failures proven owned by concurrent work (trace mock gap, #301
mock gaps, uncommitted 0035 migration, electron.vite.config type cascade).
