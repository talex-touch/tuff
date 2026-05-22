# 微审计 46/70

- 审计主题

Windows 文件搜索中，Raycast / Alfred / uTools 的“本地文件搜索应在索引或后端异常时保持可用、不把失败伪装成空结果”的体验要求，是否能映射到 Tuff 当前 `EverythingProvider -> FileProvider` 的同次查询保底路径。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/05-search-performance-ranking.md`
   - 第 3 节把 `EverythingProvider` 定义为 Windows fast provider，明确已有 `sdk-napi -> cli -> unavailable` backend、diagnostics、path filtering，以及“真实 backend 故障同次 fallback 到 FileProvider”。
   - 第 4 节把“降级/失败诚实度”列为差距项：当前已有 Everything fallback 与 FileProvider startup degraded notice，但普通搜索结果里 degraded reason / fallback reason 还不够可见。
   - 第 6 节建议把 Everything / FileProvider / native / plugin / preview 的 source diagnostics 收束进 search trace，而不是重写搜索路径。
2. `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
   - `routeWindowsFileProviders()` 在 Windows 上会根据 provider filter、`fileProvider.hasSearchFilters()` 与 `everythingProvider.isSearchReady()` 二选一选择 `everything-provider` 或 `file-provider`，并保留 `windows-shell-file-provider` 的平台辅助能力。
   - 这证明默认路由层已避免同时跑两个重文件 provider；FileProvider 是 Everything 未 ready 或显式过滤时的后备路径。
3. `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts`
   - `searchEverything()` 先尝试 SDK backend，SDK runtime 失败后尝试 CLI；CLI 初始化失败时通过 `markBackendUnavailable()` 降级为 `unavailable`，并抛出 `EverythingSearchFallbackError`。
   - `searchEverythingWithCli()` 遇到真实运行时错误时会标记 backend unavailable 并抛出 fallback error；合法空结果不会走该异常路径。
   - `onSearch()` 捕获 `EverythingSearchFallbackError` 后直接调用 `fileProvider.onSearch(query, signal)`，因此同一轮用户查询可以拿到 FileProvider 保底结果，不要求用户重新输入。
   - `filterAuthorizedResults()` 会用 FileProvider 的 watch roots 过滤 Everything 原始结果，并记录 `pathFilteringStatus`，说明 fast provider 不会绕过 File Index 授权范围。
   - Everything item 的 `meta.fileSearchContext` 会写入 `source: "everything"`、`backend`、`score` 等字段，已具备一部分解释数据。
4. `apps/core-app/src/main/modules/box-tool/addon/files/everything-errors.ts`
   - `EverythingSearchFallbackError` 与 `EverythingSearchAbortedError` 分开建模；abort 不会误触发 backend fallback。
5. `apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.test.ts`
   - 已覆盖 SDK runtime 失败转 CLI、SDK 失败且 CLI 不可用转 `EverythingSearchFallbackError`、watch roots path filtering、status snapshot 暴露 path filtering，以及 Everything 结果携带 `fileSearchContext`。

- 结论

主文档对该映射点的判断成立：Tuff 当前不是只做“设置页显示 Everything 不可用”，而是在真实搜索链路里形成了三层保底：

1. provider 选择层：Windows 上优先 Everything；Everything 未 ready 或查询含 FileProvider filter 时改走 FileProvider。
2. backend 层：Everything SDK 失败可降到 CLI；SDK + CLI 都不可用时标记 backend unavailable。
3. 当前查询层：真实 backend 故障抛出 `EverythingSearchFallbackError` 后，`onSearch()` 会在同次查询内调用 `fileProvider.onSearch()`。

这个设计比“下一次查询才降级”更接近竞品对本地搜索连续性的要求，也符合 Tuff 本地优先的产品边界。合法空结果与真实故障已经被区分：空结果返回空 `TuffSearchResult`，运行时故障才触发 FileProvider fallback。

但这还不是完整的竞品级可解释体验。当前缺口不在保底路径本身，而在 evidence 消费面：普通 CoreBox 搜索结果和 search trace 里仍不一定清楚展示“本轮从 Everything 降级到 FileProvider、原因是什么、被 path filtering 丢弃了多少”。因此主文档建议补 `source diagnostics` / `fallback reason` / `pathFilteringStatus` 到 trace，而不是改 provider 路由或并行跑两个文件 provider，是合理的小口径下一步。

- 是否发现需修正的主文档问题

否。`05-search-performance-ranking.md` 没有把当前实现夸大为完整可解释 UI，只声明了真实 backend 故障同次 fallback 已存在，同时把 degraded reason、fallback reason、path filtering reason 的消费面列为待补 evidence。源码核对结果与该口径一致。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-46.md`，未修改业务代码、未修改 01-11 主分析文档、未修改 `docs/INDEX.md` / README / TODO / CHANGES，未执行 git commit / git push / 分支 / reset / checkout / 工作树清理操作。
