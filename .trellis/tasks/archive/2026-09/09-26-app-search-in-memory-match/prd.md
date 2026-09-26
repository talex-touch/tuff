# 应用搜索脱离共享读路径：内存匹配

## Goal

`app-provider.onSearch` 每次敲键对搜索索引发 3 条 SQL（精确关键词、前缀 LIKE、FTS），全部经过与文件 provider 共用的单线程读 worker。其中 FTS 的 `provider` 列是 UNINDEXED，`MATCH` 先扫全部 27.6 万文件行再过滤，实测 156 个应用要 410 到 500 ms（常见词如 `code`），远超 80 ms 快层窗口，应用因此每次都走"迟到结果"通道被追加到已渲染行下面。
本任务让应用匹配在内存中完成，查询时不再触碰 SQLite。

## Requirements

- R1 查询路径（`onSearch`）零 SQL：候选召回与打分只依赖内存中的应用目录（标题、显示名、别名/关键词、路径 token、bundle/可执行名）。
- R2 召回能力不弱于现状：精确关键词、前缀（≤5 字符的短查询）、词/短语（原 FTS 覆盖的 title/keywords/path token 匹配）、n-gram 拼写容错（原 `lookupByNgrams` 兜底）、拼音/折叠字符（沿用 `search-charset` 的 cleaned/folded 形式）。
- R3 内存目录与数据库保持一致：启动时从现有索引（`keyword_mappings` + `files`/扩展）加载一次；应用增删改（扫描、watch、别名同步、`syncScannedAppExtensions` 等写入点）后增量刷新；刷新失败不影响查询（继续用旧快照）。
- R4 排序信号不变：`search-processing-service` / `tuff-sorter` 收到的候选携带与现在等价的匹配来源与权重，`app-provider.test.ts`、`tuff-sorter.test.ts` 等现有测试不回归。
- R5 结果条目构建若仍需 DB（如 `files` 行的元数据），必须来自内存目录而非查询时 SQL；如确需 SQL，只允许命中主键/唯一索引且通过独立读车道（见 09-26-search-read-fast-lane），并在 design.md 写明理由。
- R6 156 个应用规模下单次匹配 < 2 ms；目录加载 < 200 ms（不阻塞快层，加载完成前返回空结果并记录 degraded reason）。

## Acceptance Criteria

- [ ] 单测：给定内存目录，`code` / `vs code` / `f` / `aplpe`（拼写错误）/ 拼音首字母 的召回与现状等价（用现有 app-provider 测试语料）。
- [ ] 单测：`onSearch` 期间对 `searchIndex.search` / `lookupByKeywords` / `lookupByKeywordPrefix` / `lookupByNgrams` 零调用（spy 断言）。
- [ ] 单测：应用写入点触发后目录刷新，随后查询能命中新应用；刷新抛错时旧目录仍可查询。
- [ ] `apps/core-app` 内 `addon/apps` + `search-engine` 相关 vitest 通过；`typecheck:node` 通过。
- [ ] 真实 dev 应用：输入应用名，应用行出现在首个快照（`layer: 'fast'`），searchLogger 的 provider 完成时间 < 80 ms。

## Notes

- 与 09-26-search-read-fast-lane 互补：本任务消除应用查询，读车道保护其余快层 provider。
- `app-provider.ts` 约 L1641-1660 有 talex-touch-40 的未提交 hunk（countByProviderViaMeta），不要动。
