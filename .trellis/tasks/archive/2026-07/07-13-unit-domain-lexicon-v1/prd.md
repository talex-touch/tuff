# Implement unit Domain Lexicon V1

## Goal

Land R8 Phase 3 for the existing unit-conversion path: a reusable Domain Lexicon registry with canonical unit IDs, locale-aware labels/aliases, cross-language parsing, and deterministic symbol handling shared by PreviewSDK and CoreApp calculation exports.

## Requirements

- Add catalog-compatible `DomainLexiconEntry` types and a read-only registry under `packages/utils/i18n`; resolve by canonical ID, match aliases, and search with current-locale ranking without mutating entries.
- Migrate the existing unit table to `unit.<category>.<symbol>` canonical IDs with `zh-CN` / `en-US` labels and aliases; keep conversion functions separate from serializable lexicon metadata.
- Parse aliases from every locale regardless of the active locale; use the active locale only for labels and ranking.
- Preserve exact case-sensitive symbols before folded alias fallback so `KB` and `Kb` remain distinct.
- Keep existing unit conversion exports and default behavior backward compatible while adding optional `AppLocale` display control.
- Keep CoreApp calculation and PreviewSDK on the same shared conversion/lexicon source; do not add Plugin SDK writes or CatalogService in this slice.

## Acceptance Criteria

- [x] Domain Lexicon registry rejects duplicate IDs and returns deterministic locale-aware resolve/search/match results.
- [x] Every migrated unit has a stable canonical ID, both locale labels, serializable metadata, and a conversion mapping.
- [x] Chinese and English aliases parse under either locale; output labels follow the requested locale.
- [x] Exact `KB` / `Kb` symbols resolve to byte/bit definitions without case-fold collision.
- [x] Existing PreviewSDK/CoreApp unit conversion contracts remain green; focused typecheck and lint pass.

## Notes

- Source requirements: `docs/plan-prd/03-features/i18n-lexicon-catalog-2.6.0-prd.md` Phase 3 and `docs/plan-prd/04-implementation/R8-R9-Next-Stage-Execution-Plan-2026-06-24.md` R8-D.
- Plugin SDK facade, plugin-scoped registration, CatalogService, SQLite schema, currency/timezone lexicons, and quality gates remain separate follow-ups.
