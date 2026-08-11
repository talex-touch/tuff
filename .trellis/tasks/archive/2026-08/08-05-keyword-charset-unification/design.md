# Design: keyword charset unification

Findings E-H6/A-H5/F-H3/F-H4, A-M4, A-L1, E-L1 (parent digest).

## Decisions (locked)

D1 **Shared module** `packages/utils/search/search-charset.ts`:
- `normalizeSearchText(text)`: NFC → lowercase → replace chars outside
  `[\p{L}\p{N}\p{M}]` with space → collapse whitespace → trim.
- `foldSearchText(text)`: normalizeSearchText → NFD → strip `\p{M}` → NFC.
  (Folding twin for accent-insensitive lookup.)
- `HAN_CHAR_REGEX = /\p{Script=Han}/u` (replaces both `一-龥` and `一-鿿` ranges).
- `isSearchKeywordValid(keyword)`: non-empty after normalizeSearchText; keep current
  length caps; internal spaces allowed.
All regex literals use the `u` flag; consumers import — no local copies.

D2 **Index side** (search-index-service prepareDocument + app-provider keyword gen):
- Validity switches to D1; dropped-keyword classes (spaced aliases, full titles,
  extensions, full path) start flowing. For each emitted keyword whose
  `foldSearchText` differs, also emit the folded twin at the same priority.
- Pinyin trigger widens to `HAN_CHAR_REGEX`.
- E-L1: fix the acronym guard so single-char acronyms are not emitted
  (`acronym.length > 1`, matching the comment's intent).
- **Regeneration**: fold a new `SEARCH_KEYWORD_SCHEMA_VERSION` constant into the
  per-item keyword hash (locate the hash in prepareDocument /
  indexing-worker-persist-entry-mapper); bumping it invalidates every item's hash so
  the normal delta path rewrites mappings on the next scan/reconcile — no manual
  rebuild, write volume bounded by the adaptive batch scheduler.

D3 **Query side** (file-provider-search-service buildFtsQuery + app-provider
buildFtsQuery + term split):
- Term cleaning uses `normalizeSearchText` (preserve, don't delete); each FTS term is
  double-quoted with internal quotes doubled; prefix `*` semantics unchanged.
- Keyword lookups try each term as-typed and folded; additionally try the full
  cleaned query as ONE exact keyword (reaches spaced aliases like `vs code`).

D4 **Explicitly unchanged**: FTS5 tokenizer config (`unicode61 remove_diacritics 2`
already folds correctly); feature-matcher scoring; search-core (A1's files);
addon/files reconcile logic (A3's files); windows-shell-file-provider (batch C).

## Files

- packages/utils/search/search-charset.ts (new) + tests
- packages/utils/search/search-token-builder.ts (CJK const import only)
- apps/core-app/src/main/modules/box-tool/search-engine/search-index-service.ts
- apps/core-app/src/main/modules/box-tool/search-engine/workers/… only if the keyword
  hash lives there (step-1 locates it)
- apps/core-app/src/main/modules/box-tool/addon/files/file-provider-search-service.ts
- apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts (buildFtsQuery,
  term split, keyword gen constants)

## Verification

Per prd acceptance; suites: search-engine dir, addon/apps dir, addon/files dir,
packages/utils, typecheck:node. Concurrent-session errors in modules/ai/* /
tuff-intelligence are out of scope.
