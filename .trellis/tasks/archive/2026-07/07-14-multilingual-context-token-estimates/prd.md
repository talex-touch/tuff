# Harden Multilingual Context Token Estimates

## Goal

Replace duplicate ASCII-only length/4 heuristics with a shared Unicode-aware estimator and re-evaluate persisted context and knowledge rows at read time.

## Background

Both `intelligence-context-hygiene.ts` and `intelligence-local-knowledge-engine.ts` independently estimate tokens as `trimmed.length / 4`. That rough English-text rule underestimates Chinese/Japanese/Korean text and emoji-heavy content, allowing ContextPackage and local-knowledge packing to admit substantially more content than their host-owned token budgets intend. Persisted rows retain the old estimates unless corrected on read.

## Requirements

- Replace both duplicate estimators with one shared CoreApp Intelligence helper; do not introduce a tokenizer/runtime dependency.
- Empty/whitespace content returns the existing minimum estimate of 1.
- Count ASCII code points using the existing four-characters-per-token approximation.
- Count each non-ASCII Unicode code point as at least one token and each `Extended_Pictographic` code point as two, so CJK and emoji sequences are never treated as quarter-token ASCII characters.
- Iterate Unicode code points rather than UTF-16 code units; combining marks, variation selectors, and joiners remain conservatively counted.
- New knowledge chunks, context turns, summaries, snapshots, and memories use the shared helper.
- When reading persisted knowledge chunks or context turns, use the maximum of the stored estimate and the current helper result so legacy underestimates cannot bypass current budgets; do not rewrite rows during reads or require a schema migration.
- Preserve API/SDK types, metadata, citation identity, privacy redaction, chunk contents, and existing budget/degraded semantics.
- Document that this is a conservative tokenizer-independent estimate, not exact provider tokenization.

## Acceptance Criteria

- [x] CJK and emoji-heavy content receives materially higher estimates than the previous length/4 heuristic.
- [x] Mixed ASCII/CJK/emoji content remains deterministic and never estimates fewer than the Unicode-aware components require.
- [x] A persisted normal turn with a stale low estimate is re-evaluated before ContextPackage budget packing.
- [x] A persisted local-knowledge CJK chunk with a stale low estimate is re-evaluated before budget packing.
- [x] A focused ContextHygiene test proves a persisted normal turn cannot retain a lower legacy estimate than its current content.
- [x] Existing local-knowledge and ContextHygiene focused tests, targeted lint, and CoreApp node type-check pass.
- [x] 2.5.3/2.5.4 docs, TODO/CHANGES, and the Intelligence quality contract record the heuristic and legacy-row boundary without claiming exact provider token counts.

## Out of Scope

- Adding `tiktoken`, model-specific tokenizers, provider round trips, or a new dependency.
- Rewriting existing SQLite rows, changing schema, or migrating quota/accounting estimates.
- Claiming exact token counts or guaranteeing identical counts across providers/models.
