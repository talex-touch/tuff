# Semantic catalog token-boundary matching

## Goal

Replace bare substring `includes` in app semantic/tool-source catalogs with
token-boundary matching so short needles stop mass-misattaching aliases
(audit A-H1: Postgres gets Telegram's aliases via 'tg'; a `/Users/tim` home dir
makes every app an IM app via 'tim').

## Background (audit A-H1)

`collectSearchText` joins ~16 fields (name, displayName, alternateNames, bundleId,
**full path**, launchTarget, description, …) into one string; catalog entries match via
`searchText.includes(needle)`. Needles include 'tg', 'tim', 'qq', 'edge', 'lark',
'lens', 'surge', 'cursor'. Matched aliases index at priority 1.5 — higher than title
words (1.0/1.25) — so a false attach pollutes both recall and ranking.
Two entry points share the bug: app-semantic-catalog.ts:696 and
app-tool-source-catalog.ts:112 (both have their own `collectSearchText`).

## Requirements

- R1: Needles match on token boundaries, not substrings. Multi-word needles
  ('utm virtual', 'vs code') match as token phrases.
- R2: Directory segments of path-like fields and free-text description must not be
  needle-matchable identity evidence; identity fields (name, displayName,
  alternateNames, fileName, bundleId and its segments, appIdentity, uniqueId,
  stableId, basenames of path/launchTarget/displayPath) remain matchable.
  Exception allowed only if the existing test suite proves a legit catalog entry
  depends on a directory segment — then scope the exception to that field, not all.
- R3: Both catalogs (semantic + tool-source) get the same matcher; single shared
  implementation, no second copy.
- R4: Zero regression on the existing catalog tests (app-semantic-catalog.test.ts,
  app-tool-source-catalog usage in tests, search-processing-service.test.ts app
  matching cases like ps→Photoshop, im/即时通讯→IM apps, design→design apps).
- R5: The per-app derived-data memo (search-processing-service) keys on field
  content, so no cache-key change is needed; but bump
  APP_SEMANTIC_ALIAS_CATALOG_VERSION / APP_TOOL_SOURCE_CATALOG_VERSION so index-side
  keyword regeneration picks up the corrected alias sets.

## Acceptance Criteria

- [ ] New regression tests: Postgres.app does NOT match the Telegram entry ('tg');
      an app under /Users/tim/Applications does NOT become IM; Telegram/TIM/QQ still
      match their own entries; 'utm virtual' phrase needle still matches UTM.
- [ ] Existing suites green: core-app addon/apps directory, typecheck:node.
- [ ] Diff confined to the two catalog files (+ shared matcher util + tests).
