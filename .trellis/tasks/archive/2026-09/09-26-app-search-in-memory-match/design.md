# Design — 应用搜索脱离共享读路径：内存匹配

## Facts the design rests on（来自代码勘察）

- 今天的结果 = SQL 召回候选 ∩ `matchFeature` 接受集合。SQL 阶段唯一下传的信号是 `isFuzzySearch = !preciseMatchedItemIds || size === 0`，其中 precise = 各词精确命中交集 ∪ 多词整句命中 ∪ 短查询（≤5）前缀命中。bm25 / priority / n-gram 计数 / 子序列分数都不参与打分。
- 候选漏斗：precise ∪ prefix（≤5 字符）∪ FTS（上限凑到 120）→ 若 <5 且长度 ≥3 再并 n-gram top30 → 若仍 <5 且长度 ≥2 再并子序列 top50。
- 候选 → 行：主库 `files WHERE type='app' AND (path IN cands OR id IN (file_extensions appIdentity/bundleId IN cands))`（主线程同步 libsql），再 `fetchExtensionsForFiles`（每 50 个一批，同步）。然后 `isSearchableAppRow`、macOS 噪声过滤、`processSearchResults(rows, query, isFuzzySearch, resolveAliases)`。
- 应用目录（`files` type='app' + `file_extensions`）在主库；写入点：扫描/全量同步（`_runFullSync`）、mdls、watch 事件、`publishAppRuntimeUpsert/Deletes`、`syncScannedAppExtensions`、图标补水（只写 icon）、`replaceAliases`（只改内存/配置）。worker 提交后 `searchIndexCommitHub.markCommitted(['app-provider'])`。
- 156 个应用；`keyword_mappings` 中 app 行 4381 条。

## Approach

新增 `addon/apps/services/app-search-catalog-service.ts`：常驻内存的应用目录 + 与今天等价的召回漏斗。`onSearch` 不再发 SQL；DB 仍是唯一真相源，目录由写入点触发的去抖重载维护。

### Catalog entry

```ts
interface AppCatalogEntry {
  row: DbAppWithExtensions            // 与今天从主库取回的形状完全一致，直接喂 processSearchResults
  itemId: string                      // resolveAppItemId(row)（mac 上即 path）
  keywords: ReadonlySet<string>       // 存储形态：cleaned + folded 孪生
  ngrams: ReadonlySet<string>         // 由 priority≥1.1、长度≥3、不含空格的关键词生成的 2-gram（与 prepareDocument 同规则，上限 96 源 / 256 gram）
  ftsTokens: ReadonlySet<string>      // unicode61 近似：title/keywords/tags/path 按非字母数字切分、小写、去变音
}
```
`keywords` 来源 = `_generateKeywordsForApp(scannedInfo)`（已含 displayName/name/fileName/alternateNames 的整串、去空格、分词、首字母、拼音、用户+语义别名）∪ title 词/紧凑形 ∪ 路径段 ∪ 完整路径 ∪ 扩展名（带点/不带点）∪ description 词；每个再加 `foldSearchText` 孪生。这是 `prepareDocument` 写入 `keyword_mappings` 的超集（多出的只会让 precise 更容易命中 → fuzzy 更少开启，噪声只减不增）。

### Recall（与 SQL 漏斗一一对应，阈值不变）

```
terms = normalizedQuery.split(/[\s/]+/)；lookupTerms = buildSearchKeywordLookupTerms([...terms, normalizedQuery, cleanedQuery])
precise  = ∩_term { e | ∃ v ∈ expandSearchLookupVariants(term): e.keywords.has(v) }   （多词时再 ∪ phrase 命中）
prefix   = len ≤ 5 ? { e | ∃ k ∈ e.keywords: k.startsWith(cleanedQuery||normalizedQuery) && !k.startsWith('ng:') } : ∅   （上限 200）
fts      = tokens = buildFtsQuery(terms) 的 ≤5 个 token：
           1–3 token → 每个 token 都是某个 e.ftsTokens 的前缀；4–5 token → 每个 token 精确命中（NEAR 近似）
candidates = precise ∪ prefix；再按 fts 顺序补到 120
if |candidates| < 5 && len ≥ 3: ngram 命中数 ≥ max(1, floor(n*0.4)) 的 top30（按命中数降序）
if |candidates| < 5 && len ≥ 2: 子序列命中（任一关键词按序包含查询字符）top50
isFuzzySearch = precise.size === 0
```
随后完全复用现有：`isSearchableAppRow` → 噪声过滤 → `processSearchResults(...)`。

### Loading & refresh

- `onLoad`：`catalog.reload('load')`，从主库读 `files WHERE type='app'` + `fetchExtensionsForFiles`（一次性 156 行，主线程同步，几毫秒；沿用现有两条查询）→ 构建 entries。`ready` 在首轮完成后置 true。
- `onSearch`：`ready` 为 false 时走现有 SQL 路径（原代码保留为 `searchViaIndex`），否则走内存路径。日志字段 `path: 'memory' | 'index'`。
- 刷新触发（去抖 250ms，单飞，失败保留旧快照并 warn）：
  - `searchIndexCommitHub.subscribe` 且 `providerIds` 含 `app-provider`（覆盖所有经 worker 的写）
  - `publishAppRuntimeUpsert` / `publishAppRuntimeDeletes` 之后
  - `_runFullSync`、`_runMdlsUpdateScan`、`handleIndexedSourceWatchEvent` 结束
  - `syncScannedAppExtensions` / 图标补水 / 显示名同步（只影响行内容）：这些最终都会经上面之一触发提交；为稳妥，图标补水处显式触发一次
  - 用户别名变更：`processSearchResults` 的 `resolveAliases` 已实时读 `AppUserAliasService`；precise 集合通过 `onAliasesChanged` 回调触发重载
- 兜底：搜索时若目录快照早于 5 分钟且无刷新在途，`setImmediate` 异步安排一次重载，不阻塞当前搜索。
- `onDestroy`：取消订阅、清定时器。

### Fallback

- 目录未就绪或重载抛错 → 旧快照/SQL 路径；不会出现"应用消失"。
- 内存路径失败（异常）→ 记录后回退 SQL 路径一次。

## Tradeoffs

- 不复刻 bm25 排序：它今天只决定 FTS 候选如何凑满 120，且最终排序由 TuffSorter 覆盖；内存路径按 ftsTokens 命中数降序填充。
- 不复刻 `count(*)` 零结果诊断：该诊断本就是问题源（全表扫）。
- FTS 近似可能比真 FTS 略多召回（title contains 命中的候选），最终由 matchFeature 决定，是今天结果的超集且只多出确实匹配的项。

## Compatibility

- `app-provider.test.ts` 的 harness 把 `search-processing-service` mock 掉、并对 `searchIndex` 传 `{}`：内存路径不再调用 `searchIndex.*`，涉及"取消时不读 index"的用例语义保持（内存路径同样先检查 signal）。用例中若断言 `lookupByKeywords` 被调用，需要改为断言内存路径（见 implement.md 的测试调整清单）。
- 诊断 `app-provider-diagnostics.ts` 仍读 DB，不受影响。
