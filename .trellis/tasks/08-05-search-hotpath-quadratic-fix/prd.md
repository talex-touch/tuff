# Search hot path: eliminate O(n^2) token dedup and per-keystroke recompute

## Goal

CoreBox app-search per-keystroke path does O(n²) JSON.stringify dedup in
`addSearchToken` and rebuilds semantic aliases + pinyin tokens per candidate per
keystroke; replace with O(n) keyed dedup and memoized per-app token construction,
behavior-identical.

## Background

Three-way audit (2026-08-06, this session) found:

1. `addSearchToken` (packages/utils/search/search-token-builder.ts:98-129) dedups by
   re-`JSON.stringify`-ing **every existing token** per insert → O(n²) stringify calls.
   Each app builds ~150–230 tokens; 120–200 candidates per keystroke → millions of
   `JSON.stringify` calls per keystroke on the main thread.
2. `processSearchResults` (apps/core-app/.../apps/search-processing-service.ts:260-351)
   recomputes, per candidate per keystroke, work whose inputs are query-independent:
   semantic-catalog scans (×2 entry points), pinyin-pro syllable expansion for every
   Chinese string, and the full token build. `SLOW_PROCESS_THRESHOLD_MS = 300` in that
   file documents the pain.

Plugin features already cache tokens on the feature object
(plugin-features-adapter.ts:439-440); app rows are re-fetched fresh per query, so the
equivalent is a content-keyed memo.

## Requirements

- R1: Token dedup in `addSearchToken` is O(1) per insert (O(n) per token list) with
  **identical dedup semantics** (same JSON key shape: value/source/display/segments).
- R2: Per-app derived search data (semantic aliases, tool-source ids, search tokens)
  is computed at most once per distinct app content, not per keystroke; cache is
  bounded (LRU) and self-invalidating via a content fingerprint covering every input
  field (including user aliases from `setAliases`).
- R3: Zero behavior change: same match results, scores, highlights, alias rendering.
  Existing tests pass unmodified.
- R4: No new dependencies (inline Map-based LRU).

## Acceptance Criteria

- [ ] `pnpm utils:test` green; core-app `search-processing-service.test.ts` and
      `app-provider.test.ts` green; `npm run typecheck:node` green; lint clean on
      changed files.
- [ ] Micro-benchmark (throwaway, not committed) shows token building is no longer
      quadratic (doubling token count ≤ ~2.5× time, not 4×) and repeat-keystroke
      processing hits the memo (second run ≥ 10× faster).
- [ ] Public API of `@talex-touch/utils` unchanged (published npm package).

## Out of scope (recorded, do not widen)

- Semantic-catalog substring false-positive fix (audit H1) — separate task.
- SQL-side scans (`lookupByKeywordPrefix` LIKE full-partition scan, missing DB indexes).
- Windows shell file provider per-row pinyin; renderer-side matching paths.
- Index-time `isAlias` per-keyword catalog rescan (app-index-record-sync-service.ts)
  only if it is a trivial hoist in the same spirit; otherwise record as follow-up.
