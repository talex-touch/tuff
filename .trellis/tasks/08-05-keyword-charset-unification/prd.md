# Keyword charset unification

## Goal

Replace the [a-z0-9 CJK-basic] whole-word veto regex with shared Unicode-property cleaning across index and query sides; restores accented Latin, kana/hangul/Cyrillic, multi-word aliases, extension and full-title keywords (audit app-H5/M4, file high-3/4, engine H6/L1).

## Requirements

- R1: One shared charset module (packages/utils) defines text cleaning, keyword
  validity, Han detection; the three duplicated regex sites (search-index-service,
  file-provider-search-service, app-provider) and the two inconsistent CJK ranges all
  import it. No local copies remain.
- R2: Index side cleans characters instead of vetoing whole keywords: keywords made of
  any Unicode letters/digits (NFC, lowercase) are valid, including internal spaces
  (multi-word aliases like `vs code`), dots (`7-zip`→`7 zip` cleaned, `.txt`), and
  full-title keywords.
- R3: Accent-insensitive exact/prefix: keywords whose folded (diacritic-stripped)
  form differs are stored in both forms; query terms are looked up as-typed (NFC) and
  folded. Typing `résumé` and `resume` both hit a file named `résumé.pdf`.
- R4: Query side (both FTS query builders) preserves non-ASCII instead of deleting it;
  kana/hangul/Cyrillic queries produce non-empty, safely-quoted FTS5 MATCH
  expressions. The full cleaned query string is additionally tried as one exact
  keyword so spaced aliases are reachable.
- R5: A keyword schema version is folded into the per-item keyword hash so existing
  items regenerate their keyword mappings on the next reconcile/scan pass without a
  manual rebuild.
- R6: Existing CN/EN behavior is regression-free (pinyin generation trigger widens
  from CJK-basic to Script=Han only; all current keywords remain producible).
- R7: E-L1 fix: single-character acronym keywords are no longer written.

## Acceptance Criteria

- [ ] Charset unit tests: café/Übersicht/ひらがな/한글/Привет/emoji-stripped/vs code/
      full-title/extension keywords validity + folding twins.
- [ ] Query-builder tests: accented and kana queries yield non-empty MATCH; quoting
      safe against FTS5 syntax injection ("a OR b", quotes).
- [ ] search-index-service integration tests: index → lookupByKeywords round trip for
      café (via `cafe` and `café`), `vs code` via full-query exact path.
- [ ] Existing search-engine + addon/apps + addon/files suites green; typecheck:node
      green for touched files.

## Notes

Complex task: design.md decisions locked; execute after 08-05-file-index-data-safety
lands (regeneration rides the mtime-accurate reconcile).
