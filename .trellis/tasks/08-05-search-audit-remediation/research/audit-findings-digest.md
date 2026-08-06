# Search audit findings digest (2026-08-06 three-way audit)

Source: three parallel deep-read agents (app search / file search / engine core) run in
the session that created this task tree. Full reports live in that session transcript;
this digest is the durable requirement source. Format:
`ID · sev · class · anchor — finding`. Line refs are as-of audit time (branch
TalexDreamSoul/app-shell-v2 @ a1431ca42); verify before use.

## Engine core (search-engine/, core-box/, renderer useSearch)

- E-H1..E-H4 + E-M6 — FIXED 2026-08-05 (08-05-search-sort-reaches-ui, commit
  d880b6b22): score/pinned writeback on sorter copies, full enrichment before the
  single per-batch publish, renderer merge→rank→per-source-floor→cap with 200
  pre-rank intake, completion-time accumulated cache, selection by id.
- E-H1 · 高 · 精准 · search-core.ts:1413 — 5s search cache only stores the fast-layer
  first batch; repeat query within TTL loses all deferred (file) results.
- E-H2 · 高 · 精准 · search-core.ts:1208/1355/1425 + useSearch.ts:460 — main path sorts
  with enrichmentMode:'base'; the one 'full' re-rank re-pushes same ids and renderer
  Map.set keeps old positions → pinned/frecency never affect visible order.
- E-H3 · 高 · 精准 · search-gather.ts:364 — file-provider is the only deferred
  provider; renderer appends → files always rank below fast-layer regardless of score.
- E-H4 · 高 · bug · useSearch.ts:401/468 + search-core.ts:106 — 80-item cap both sides,
  current-first merge → deferred file batch fully starved on short queries.
- E-H5 · 高 · bug · core-box/ipc.ts:258-676 — 21 CoreBox IPC handlers registered twice
  (two ensureTransport().on closures); every invoke runs twice.
- E-H6 · 高 · i18n · search-index-service.ts:13/1436/1527 — INVALID_KEYWORD_REGEX
  whole-word veto: non-[a-z0-9一-龥] keywords dropped entirely (kana/hangul/Cyrillic/
  accented Latin; also full-path, dotted-extension, spaced full-title keywords).
- E-H7 · 高 · bug · workers/search-index-worker.ts:462 — cleanupOrphanKeywords leaves
  search_index_meta; hash-skip then permanently omits keyword_mappings on reindex.
- E-H8 · 高 · bug · packages/utils/search/indexing-write-plan.ts:493 — disk mtime (ms)
  vs DB mtime (s) strict > → reconcile marks nearly every file changed every round.
- E-H9 · 高 · bug · useSearch.ts:1107/1012 — superseded-search catch returns without
  resetting loading → spinner forever, window collapse blocked.
- E-M1 · 中 · 精准 · tuff-sorter.ts:274 — providers' scoring.final/match ignored by
  sorter; only recency (one writer) and frequency (no writer) are read.
- E-M2 · 中 · bug · search-index-service.ts:746 — lookupByKeywords LIMIT is global, no
  ORDER BY; hot term fills limit → per-term buckets empty → intersection empty.
- E-M3 · 中 · 速度 · search-index-service.ts:786 — prefix LIKE cannot use BINARY index
  (needs NOCASE); scans whole provider partition incl. ng: rows on every ≤5-char key.
- E-M4 · 中 · bug · search-index-worker-client.ts:705 — worker messages have no timeout
  except commit (60s); stuck worker hangs writes forever.
- E-M5 · 中 · bug · search-gather.ts:225 + search-core.ts:1136 — gather controller
  promise never awaited/caught; failure without isDone → session never completes.
- E-M6 · 中 · 速度 · search-core.ts:1430 — each later batch sorted+pushed twice (base
  then full) → 2× IPC for a reorder that never lands (see E-H2).
- E-M7 · 中 · bug · search-core-utils.ts:70 + orchestrator:104 — any `@word` prefix
  treated as provider filter, no fallback → `@vue/runtime-core`, emails ⇒ 0 results.
- E-M8 · 中 · bug · search-index-service.ts:934 — >3-word FTS branch drops prefix `*`
  (NEAR without prefixes) → long queries fail while typing last word.
- E-M9 · 中 · 速度 · search-index-service.ts:1030/692 — FTS provider column UNINDEXED;
  MATCH spans all providers, filtered per-row after bm25.
- E-M10 · 中 · bug · useSearch.ts:911 — renderer stream await has no timeout (pairs
  with E-M5).
- E-M11 · 中 · bug · quicklinks/browser-bookmarks indexed sources — reconcile never
  emits deletions (deleted:0 hardcoded, upsert-only adapter) → ghosts persist.
- E-M12 · 中 · bug · search-provider-registry.ts:261 — activation path skips
  applyUserConfig (user-disabled providers still queried).
- E-M13 · 中 · 速度 · client-runtime.ts:86 — new MessageChannel per search (force:true),
  3 extra IPC before stream start.
- E-M14 · 中 · 速度 · useSearch.ts:921 — blocking clipboard refresh awaited before
  every search (can block hundreds of ms on big images).
- E-M15 · 中 · bug · core-box/window.ts:444 — hide() does not cancel in-flight search;
  runs up to 3s for an invisible window.
- E-M16 · 中 · 精准 · tuff-sorter.ts:33 — plugin meta.priority unclamped into kindBias
  (manifest priority 100000 ⇒ always first).
- E-M17 · 中 · 精准 · recommendation/item-rebuilder.ts:78 — rebuild concatenates by
  type, discarding recommendation scores/rerank order.
- E-L1 · 低 · bug · search-index-service.ts:1366 — `!acronym || acronym.length > 1`
  always true → single-char keyword per multi-word title (feeds E-M2/M3 noise).
- E-L6 · 低 · 精准 · sort/preview-priority-sorter.ts — dead code; preview items
  (10000×300) lose to any title-substring hit.
- E-L7 · 低 · bug · search-index-service.ts:601 — removeProviderItems skips
  keyword/meta cleanup when FTS row missing (orphan source for E-H7).
- E-L8 · 低 · bug · search-index-writer.ts:577 — visibility barrier ignores
  request.itemIds (SELECT ... LIMIT 1).
- E-NEW1 · 中 · bug · search-core.ts (found during A1 implementation 2026-08-05) —
  `scheduleDeferredSemanticRecall` is scheduled in the isDone branch but the same
  tick continues to `session.complete()`; by the time semantic recall resolves the
  session is terminal and `publishUpdate` returns false — the semantic-recall push
  is always dropped. Candidate for batch B/C.
- E-NEW2 · 低 · 契约 · plugin-business-capabilities.ts:648 + modules/ai/agents/
  builtin/search-agent.ts:406 (found during A1) — plugin inbound items validate
  scoring ∈ [0,1] while the sorter now writes absolute million-scale `final`
  (separate paths, no conflict today); search-agent forwards `final` to a model
  prompt, so its magnitude changed with A1. Review when touching ai/.
- E-NEW3 · 高 · bug · modules/ai/agents/builtin/search-agent.ts:406/459/276 (found by
  A1 check 2026-08-05) — A1's absolute `scoring.final` writeback saturates
  `computeSemanticScore` (`min(1, lexical*0.8 + relevance*0.2)`) to constant 1:
  `search.semantic` threshold filter passes everything, sort ties, preferredSources
  bonus vanishes. Fix: normalize per-batch at the agent boundary (or dedicated rank
  field). modules/ai was under concurrent edit at the time — needs its own follow-up
  task once that settles.
- E-NEW4 · 低 · 速度 · query-completion-service.ts:111 (A1 check) — completion prefix
  LIKE has no index on query_completions and now runs pre-publish; if firstResultMs
  regresses, add the prefix index → fold into batch B index-sql-recall-fixes.
- E-NEW5 · 中 · 契约 · recommendation-engine.ts:718 (R1 check) — pre-existing:
  `backfillTrendDay` upserts usage_trend_daily WITHOUT scheduleDbWrite (violates
  database-write-contracts); same table the R1 migration writes correctly. Fold into
  R2 or batch B cleanup.
- E-NEW7 · 低 · 说明 · lookupByKeywords growth (A2 check) — folded twins + full-title/
  spaced keywords increase rows per item, so E-M2/F-H5 (global LIMIT, no ORDER BY)
  saturates earlier; batch B index-sql-recall-fixes must size limits with this in.
- E-NEW6 · 低 · 说明 · usage-source-identity-migration (R1 check) — migration reads
  (loadTrendRowsByKeys) are outside the scheduled write; a concurrent trend increment
  in the read→apply window can lose one count once, self-corrected by the next
  aggregator rebuild. Accepted; root fix = read+plan+apply in one scheduled txn.
- Sorter notes: matchScore×20000 makes tiers unbridgeable (frecency needs e10 count);
  APP_EXACT_TOKEN_INTENT_BONUS=6.2e6 balances app-vs-feature at a 1.0% margin; no
  cross-provider dedup (app id and file id are both absolute path on macOS — extraPaths
  including ~/Applications silently downgrades app items to file items); no per-source
  quota/interleave (applyDiversityFilter exists only in recommendations); CJK titles
  get substring tier (300) where segmented English gets prefix tier (500).

## App search (addon/apps/)

- A-H1 · 高 · bug/精准 · app-semantic-catalog.ts:696 + app-tool-source-catalog.ts:112 —
  bare substring needle match over 16 joined fields incl. full path; 'tg' ⇒ Postgres
  gets Telegram aliases; '/Users/tim' ⇒ everything is IM. Aliases index at priority
  1.5 > title 1.0/1.25 → recall + ranking double pollution.
  FIXED 2026-08-05 (08-05-semantic-catalog-token-boundary): shared token-boundary
  matcher (app-catalog-matching.ts), identity fields only, catalog versions bumped.
- A-H2 · 高 · 速度 · search-token-builder.ts:107 — FIXED 2026-08-05
  (08-05-search-hotpath-quadratic-fix): O(n²) JSON.stringify dedup → WeakMap/Set.
- A-H3 · 高 · 速度 · search-processing-service.ts:284 — FIXED same task: per-keystroke
  catalog+pinyin+token rebuild → content-keyed LRU memo.
- A-H4 · 高 · bug · app-provider.ts:3236/3276 — unbounded prefix hits crowd out
  bm25-ordered FTS under the 120-candidate cap; path segment 'applications' is a
  keyword for every app; lookupByKeywordPrefix rows arbitrary (no ORDER BY).
- A-H5 · 高 · i18n — same root as E-H6 (INVALID_KEYWORD_REGEX) + buildFtsQuery
  (app-provider.ts:3464) deletes unknown chars: ü→space (übersicht ⇒ 'bersicht'),
  pure kana/hangul query ⇒ empty ⇒ FTS skipped. Scoring layer is Unicode-correct;
  only recall is broken.
- A-H6 · 高 · bug/i18n · app-scanner.ts:363/401 + display-name-sync-utils.ts:66 — mdls
  overwrite discards prior localized displayName (not saved to alternateNames), quality
  'system' locks it → 微信 permanently lost on non-zh locale; breaks CN queries.
- A-M1 · 中 · bug — same as E-M2 (lookupByKeywords LIMIT/no ORDER BY), app call site
  app-provider.ts:3188 intersection.
- A-M2 · 中 · 精准 · feature-matcher.ts:118/468 — token source not weighted:
  description/bundleId token exact = 950 > title prefix 900 ('apple' ⇒ all com.apple.*
  beat "Apple ..." apps).
- A-M3 · 中 · 精准 · feature-matcher.ts:421 — title contains returns 700 early; loses
  to any alternate-name exact 950 elsewhere.
- A-M4 · 中 · bug — multi-word aliases never indexed (same regex root as E-H6);
  catalog tests assert production but nothing asserts retrievability.
- A-M5 · 中 · 速度 · search-processing-service.ts:118 — 1-6 sync fs.existsSync per
  result per keystroke (icon resolution) on main thread.
- A-M6 · 中 · bug · app-scanner.ts:76 — forceRefresh swallowed by in-flight normal
  scan (scanPromise check precedes forceRefresh branch).
- A-M7 · 中 · bug · darwin.ts:301 — mdfind is the only discovery path, no FS fallback
  (Spotlight off ⇒ zero apps); roots miss /Users/Shared/Applications, Cryptexes/App,
  homebrew/nix .apps, external volumes.
- A-M8 · 中 · bug · app-scanner.ts:39 + app-provider.ts:3487 — watch roots miss
  /System/Applications & CoreServices; changes wait for mdls poll (≥1h) or 24h sync.
- A-L1 · 低 · i18n — three inconsistent CJK ranges (一-鿿 vs 一-龥) across
  search-token-builder.ts:3, app-provider.ts:2555, search-index-service.ts:12.
- A-L2 · 低 · i18n · search-processing-service.ts:183 — single pinyin reading only
  (重庆 ⇒ zhongqing, not chongqing).
- A-L3 · 低 · i18n · darwin.ts:147 — lproj priority hardcodes zh before system locale.
- A-L4 · 低 · bug · highlighting-service.ts:63 — matchAcronym undefined-index bug
  (only used by windows-shell-file-provider).
- A-L6 · 低 · 速度 · app-index-record-sync-service.ts:88 — FIXED 2026-08-05 task
  (per-keyword catalog rescan hoisted).
- A-L7/L8 · 低 · 精准 — single-char initial keywords (with E-M2 randomness); whole
  path/launchTarget strings as contains-matchable tokens (query 'users' hits all).
- Cross-platform: win.ts three PowerShell sources catch-and-return-[] with undefined
  error (diagnostics show healthy+0 apps); no maxBuffer (1MiB default) on win.ts:352/
  609/698; win dedup drops the only MUI-Chinese-named entry (win.ts:952); linux.ts no
  alternateNames (no bilingual search), Flatpak stableId collapse (execPath), quoted
  Exec path truncation, zero logging.

## File search (addon/files/, db schema)

- F-H1 + F-H2 + F-M4 + E-H8 — FIXED 2026-08-05 (08-05-file-index-data-safety, commit
  7f9e806e3): scan error counting + per-root deletion guard; search path
  display-filters only with ENOENT-gated cleanup (both paths); darwin-gated NFC
  ingress + gated idempotent twin-merge migration (reconcile defers while pending);
  second-precision mtime compare in planner AND worker copy. F-L1 (same-second edit)
  remains open by design.
- F-H1 · 高 · bug · file-provider.ts:2872 + file-scan-utils.ts:302 — readdir failure
  silently treated as empty dir; reconcile deletes the whole subtree from index (TCC
  revoke / unplugged volume / renamed root). No scanned-0-but-DB-N guard.
- F-H2 · 高 · i18n+bug — zero Unicode normalization anywhere in the file chain; APFS
  NFD vs input NFC ⇒ duplicate rows (files.path UNIQUE BINARY), reconcile churn,
  watcher delete no-ops. Fix points: scan output, watcher events, manual add, query.
- F-H3 · 高 · i18n — same regex root as E-H6, file side: café/Résumé/ひらがな/한글/
  Привет/ملف keywords all dropped (verified by direct regex test).
- F-H4 · 高 · i18n · file-provider-search-service.ts:69 — query side same regex:
  kana/hangul/etc ⇒ empty FTS query ⇒ zero results; résumé(NFC) ⇒ 'r sum' fails while
  'resume' works.
- F-H5 · 高 · 精准 — same as E-M2 verified empirically (5000×'annual' + 2×'report',
  LIMIT 200 returns only 'annual'); path-segment keywords ('documents') guarantee it.
- F-H6 · 高 · 速度 · search-index-service.ts:787 — EXPLAIN-verified: LIKE prefix scans
  whole provider partition (BINARY index, case_sensitive_like OFF), wading through
  ≤256 ng: rows per item, on every keystroke ≤5 chars.
- F-H7 · 高 · 速度 — files table has no index besides path UNIQUE; type/extension/
  mtime filters = SCAN + temp B-tree (EXPLAIN-verified).
- F-M1 · 中 · 速度 — n-gram rows written for files (≤256/item) but file search never
  calls lookupByNgrams (only app-provider does): pure write amplification; wiring it
  would solve CJK infix.
- F-M2 · 中 · 速度/精准 · embedding-service.ts:254 — semantic recall reads
  `LIMIT 1000` embeddings with no ORDER BY (rowid-first cap: files indexed after the
  first 1000 are never recallable); JSON.parse×1000 per query; indexFile existence
  check is a table scan (O(n²) batch).
- F-M3 · 中 · bug · file-index-persistence-repository.ts:301 — removeFile leaves
  embeddings orphans (no FK), consuming the 1000-row recall budget.
- F-M4 · 中 · bug · file-provider-search-result-service.ts:488 — rows dropped by
  search-time filter counted as stale ⇒ REAL deletion from index during search;
  root: getIndexExclusionReason checks parent only, getSearchExclusionReason checks
  all ancestors (hasHiddenSegment).
- F-M5 · 中 · bug · indexing-watch-path-policy.ts:41 — watch depth 5 vs scan depth 24:
  deep files indexed but never watched; deletions persist until 24h reconcile.
- F-M6 · 中 · 精准 — CJK infix unsearchable (unicode61 treats han run as one token,
  prefix-only match expr; index-side split only on [-_.\s]): 「会议」/「纪要」 cannot
  find 「2026年度会议纪要.docx」.
- F-L1 · 低 · bug — same-second modifications undetected (strict >, second-precision
  DB mtime; also E-H8).
- F-L2 · 低 · 覆盖 · file-scan-utils.ts:319 — symlinked dirs/files silently skipped.
- F-L3 · 低 · 覆盖 — iCloud placeholders (.foo.icloud) rejected as hidden;
  ~/Library/Mobile Documents blacklisted; APP_SPECIFIC_CONFIG.ICLOUD allowlist is
  dead code (never imported).
- F-L4 · 低 — file_fts external-content table created, never written/queried.
- F-NEW1 · 低 · 既定取舍 · reconciliation deletion guard (A3, 2026-08-05) — a root
  whose contents were ALL genuinely deleted reads as scannedEntries=0 + dbRows>0 and
  is guard-blocked forever; its rows drain only via the ENOENT-verified search-path
  cleanup. Deliberate conservative bias (never mass-delete on ambiguity); accepted.
- F-NEW2 · 说明 · NFC scope (A3 check) — normalizeFsPath is darwin-gated (follow-up):
  byte-exact filesystems (Linux ext4/NTFS) must keep raw paths or NFD files enter an
  ENOENT-delete/rescan churn loop. Cross-platform normalization strategy, if ever
  needed, belongs to batch C cross-platform-parity.
- Positive: file-system-watcher.ts:55 TCC probe + pendingPaths re-mount is correct;
  keep. mdfind provider lacks the same treatment (silent empty on no FDA).
- Cross-platform: macOS = mdfind + own index in parallel (merged by id in renderer);
  Windows = Everything XOR fileProvider per query (orchestrator:138) ⇒ pinyin file
  search works on macOS but NOT on Windows when Everything active; usage stats keyed
  by source.id don't transfer across backend switch; Everything sorts by path
  alphabetical (-sort path), no relevance; suspects: CLI encoding on zh-CN codepage,
  <1e12 timestamp treated as seconds (pre-2001 ⇒ Infinity recency).

## Task map

- Batch A (this tree): A4 semantic-catalog-token-boundary (A-H1) →
  A1 search-sort-reaches-ui (E-H1..H4, E-M6, sorter notes) →
  A3 file-index-data-safety (F-H1, F-H2, F-M4, E-H8/F-L1) →
  A2 keyword-charset-unification (E-H6/A-H5/F-H3/F-H4, A-M4, A-L1, E-L1).
- Batch B (to create later): index-sql-recall-fixes (E-M2/M3/M9, F-H5/H6/H7, A-H4);
  ngram-cjk-infix (F-M1, F-M6); hotpath-misc (A-M5, E-M13/M14, E-L5-usage-cache).
- Batch R FULL PROGRAM approved 2026-08-06 ("都做，本地数据处理") — task tree and
  signal→task mapping in research/reco-signal-program.md: R1 (in flight) → R2 (+
  hit-rate@k metrics R9) → R3a substrate → R3b system-state / R3c file-activity
  (parallel) → R3d calendar → R3e behavior learning. Geolocation parked.
- Batch R (recommendation, to create later — see research/reco-signals-audit.md):
  R1 fix-reco-ranking-and-stats — FIXED 2026-08-05 (08-05-reco-ranking-stats-fix):
  P0-1 rebuild order loss + scoring.final writeback + pinned truncation after sort;
  P0-2 sourceId口径断链 + trend double-key P1-3 (write site + gated idempotent
  migration); P1-4 pre-open foreground snapshot. R2 wire-existing-signals (hourDistribution,
  cache-key cardinality, cold start, incremental aggregation, selection-capture,
  timezone-change); R3 new-signals (prev_app co-occurrence, wifi place buckets,
  geolocation last + default off).
- Batch C (to create later): ipc-lifecycle-fixes (E-H5/H9, E-M4/M5/M7/M10/M15/M16);
  macos-app-discovery-robustness (A-H6, A-M6/M7/M8); pinyin-consolidation (A-L2,
  4 duplicated pinyin sites, getSyllables contract, index schema version);
  scoring-rebalance (A-M2/M3, E-M1/M11/M17, E-L6, CJK tier; USER REQ 2026-08-06:
  exact/prefix-matched internal commands & system actions like 展示主窗口 must rank
  near top — today kindBias command 11 < app 12 and the exact/prefix intent bonuses
  are app-only, so exactly-matched commands get buried) — after A1;
  cross-platform-parity (Windows pinyin gap, usage transfer, linux alternateNames,
  win maxBuffer/dedup).
