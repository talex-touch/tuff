# Design: file index data safety

Findings F-H1, F-H2, F-M4, E-H8/F-L1 (parent digest). Line anchors are audit-time;
verify against current code first.

## Decisions (locked)

D1 **Scan failures are counted, not swallowed.**
`scanDirectoryInto` (packages/utils/common/file-scan-utils.ts ~:302) currently
`.catch(() => null)` on readdir and returns silently. Thread an error counter through
the scan result (extend the existing result/stats shape or add an optional callback —
follow whatever the current signature makes least invasive). Full-scan and reconcile
callers receive (entryCount, errorCount) per root.

D2 **Reconcile deletion guard, per root.** Where the seen-table diff plans deletions
(file-provider.ts ~:2872 + file-provider-reconciliation-run/delete services): skip the
deletion phase for a root when (scanned entries == 0 AND db rows for root > 0) OR
(scan error count > 0 AND planned deletions > 50% of that root's rows). Log the skip
with reason + counts; surface through existing scan-progress/diagnostics channel if
one is already wired (do not invent a new UI).

D3 **Search path never deletes.** In file-provider-search-result-service (~:488):
"stale" = candidate id with NO DB row at all — rows dropped by
`getSearchExclusionReason` are display-filtered, never handed to cleanup. Cleanup
itself (file-provider.ts ~:1181-1215) stat-verifies each path asynchronously and only
removes on ENOENT; it stays a queued side job, off the search hot path.

D4 **NFC at the ingress, once.** New shared helper (utils, beside file-scan-utils):
`normalizeFsPath(p) = p.normalize('NFC')` — applied at: scan entry production,
watcher event paths (file-provider-watch-service), configured extraPaths ingestion,
and any manual-add path. DB comparisons then need no change. Migration: one-time,
gated, boot-time maintenance pass (follow the existing maintenance-service gating
pattern + database-write-contracts): for rows where `normalize(path) !== path`, if an
NFC twin exists keep the newer `lastIndexedAt` row and delete the other; else rewrite
the row's path to NFC. Index-side entries keyed by replaced/deleted old ids are
removed through the existing file cleanup/removal APIs (item id = path), letting the
next reconcile re-insert under NFC ids — safe because D1/D2 protection lands first.

D5 **mtime compared at second precision.** packages/utils/search/indexing-write-plan.ts
~:493: quantize disk mtime to whole seconds (floor to 1000ms) before the strict `>`
against the DB's second-precision mtime. Same-second edits remain undetected (F-L1,
accepted; keep the digest note open).

## Out of scope

Symlink/iCloud coverage (F-L2/F-L3), watch depth 5 vs 24 (F-M5), embeddings orphans
(F-M3), keyword charset (A2 task). Do not touch search-engine/ or renderer.

## Files

- packages/utils/common/file-scan-utils.ts (+ its tests)
- packages/utils/search/indexing-write-plan.ts (+ tests)
- apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts (reconcile +
  cleanup call sites)
- apps/core-app/src/main/modules/box-tool/addon/files/services/
  file-provider-reconciliation-run-service.ts / -delete-service.ts /
  file-provider-search-result-service.ts / file-provider-watch-service.ts
- migration hook: follow existing gated maintenance pattern (integrity service or
  equivalent — implementer locates it in step 1)

## Verification

- Suites: `npx vitest run src/main/modules/box-tool/addon/files/` (core-app),
  packages/utils scan/write-plan tests, `npm run typecheck:node`.
- Pre-existing failures in packages/test and typecheck errors in modules/ai/* /
  tuff-intelligence belong to other work — ignore, introduce none.
