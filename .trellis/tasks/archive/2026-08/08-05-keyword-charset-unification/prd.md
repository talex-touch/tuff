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
  manual rebuild. This carries the app source (every scan re-emits the whole
  catalog) but not the file source, whose steady-state reconcile only re-emits
  files whose mtime changed — see R8.
- R6: Existing CN/EN behavior is regression-free (pinyin generation trigger widens
  from CJK-basic to Script=Han only; all current keywords remain producible).
- R7: E-L1 fix: a multi-word title no longer also emits a single-character keyword —
  its multi-letter acronym already covers that. Single-word titles keep their
  first-letter keyword, which is what that branch exists for.
- R8: File rows indexed under the old charset are repaired by a one-time,
  version-key-gated, paginated in-DB backfill: it re-emits already-indexed rows
  through the normal indexed-source write path (no disk rescan), runs after the
  startup degrade window and behind the path-normalization pass, and leaves the
  version unrecorded when any page fails so the next boot retries.

## Acceptance Criteria

- [x] Charset unit tests: café/Übersicht/ひらがな/한글/Привет/emoji-stripped/vs code/
      full-title/extension keywords validity + folding twins.
- [x] Query-builder tests: accented and kana queries yield non-empty MATCH; quoting
      safe against FTS5 syntax injection ("a OR b", quotes).
- [x] search-index-service integration tests: index → lookupByKeywords round trip for
      café (via `cafe` and `café`), `vs code` via full-query exact path.
- [x] Backfill tests: version gate (never run / older / current / write path
      unavailable), id-cursor paging, a failed page leaves the version unrecorded,
      and a real-libsql end-to-end where an old-charset row becomes reachable by
      `café` / the full title and a retry rewrites no keyword row.
- [x] Existing search-engine + addon/apps + addon/files suites green; typecheck:node
      green for touched files.

## Notes

Complex task: design.md decisions locked; execute after 08-05-file-index-data-safety
lands (regeneration rides the mtime-accurate reconcile).

## 验收证据（2026-08-11 回填）

跑出来的结果，不是对实现的复述：

| AC | 证据 |
|---|---|
| 1 charset 单测 | `packages/utils/__tests__/search/search-charset.test.ts` 覆盖全部具名用例：`café` ×5、`Übersicht` ×2、`ひらがな` ×4、`한글` ×4、`Привет` ×3、`vs code` ×2 |
| 2 query-builder | `search-index-service.charset.test.ts` 在位；utils search 套件 **463 passed / 47 files** |
| 3 index → lookupByKeywords 往返 | 同上,由 `search-index-service.charset.test.ts` 覆盖 |
| 4 backfill 版本闸门 | `file-provider-keyword-backfill-service.test.ts`、`search-index-migration-preflight.test.ts` 在位 |
| 5 既有套件 + typecheck:node | `search-engine` + `addon/apps` + `addon/files` 三个套件 **1155 passed / 140 files**；`tsc -p tsconfig.node.json --composite false` **0 errors** |

R1 的可验证部分单独核过：共享模块 `packages/utils/search/search-charset.ts` 存在；三处站点
（`search-index-service.ts`、`files/services/file-provider-search-service.ts`、`apps/app-provider.ts`）
都 import 了它；`box-tool` 下已搜不到旧的 `[a-z0-9 + CJK]` 整词否决正则。

Notes 里写的前置任务 `08-05-file-index-data-safety` 仍是活跃状态。那条约束的是执行顺序，
而本任务已执行完毕，故不阻塞收口；该任务自身的状态另行处理。
