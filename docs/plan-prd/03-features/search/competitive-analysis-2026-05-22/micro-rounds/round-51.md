# 微审计 51/70

- 审计主题

Raycast Quicklinks / Alfred Web Search 与 Tuff `touch-browser-open` 的具体映射：当前固定搜索引擎 URL builder 是否已经等价于用户可管理 Quicklink，以及主文档把缺口定位为 `QuicklinkSource` / `TuffParameterSet` 是否准确。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/01-basic-capability-alignment.md`
   - 将 Quicklinks / Web Search 标为“部分落地”：已有 `touch-browser-open`、`touch-browser-bookmarks`、`touch-browser-data` 等分散能力，但缺统一 Quicklinks 数据模型。
   - P1 建议是先定义 `QuicklinkSource` 最小 schema，复用已有打开执行链路，不重做 CoreBox。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
   - 明确 Raycast Quicklinks 的关键不是“打开网址”，而是 URL 模板在打开前能拿到 runtime 参数。
   - 对 Tuff 的建议是：`touch-browser-open` 新增 manual quicklink 数据，字段包括 `id/title/urlTemplate/openWith/tags/parameters`，并复用 `TuffParameterSet`。
3. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/06-parameter-filling-dynamic-variables.md`
   - 把 Raycast 的 `{argument}`、`{clipboard}`、`{selection}`、`{date}`、`{time}`、`{uuid}`、`{calculator}` 归纳为跨 Quicklinks / Snippets / AI Commands 的统一变量心智。
   - 明确 `touch-browser-open` 只有搜索引擎 `buildSearchUrl(query)` 和 `encodeURIComponent` 散点实现，缺 QuicklinkSource schema 和共享 URL template resolver。
4. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
   - 第 8 条认为 Quicklinks / Web Search 仍是 URL builder、bookmarks、Browser Data 切片，缺统一 schema。
   - 第 19 条认为 per-engine `encodeURIComponent(query)` 不等于可配置 Quicklink。
5. `plugins/touch-browser-open/manifest.json`
   - 插件声明两个主 feature：`browser-open` 和 `web-search`。
   - `web-search` 的 `acceptedInputTypes` 只有 `["text"]`，commands 覆盖 `search`、`web`、`google`、`bing`、`duckduckgo`、`搜索`、`网页搜索`。
6. `plugins/touch-browser-open/index.js`
   - `SEARCH_ENGINES` 固定内置 Google / Bing / DuckDuckGo；每个 engine 提供 `commands`、`buildSearchUrl(query)`、`buildSuggestUrl(query)`、`parseSuggestions()`。
   - `parseSearchQuery()` 只把首 token 映射到固定 engine command；没有读取用户 Quicklink 列表、URL template、变量 spec 或 per-link 参数定义。
   - `buildSearchUrl(engineId, query)` 对 query 做 normalize 后调用 engine 的 `buildSearchUrl()`；URL 编码由各 engine 的 `encodeURIComponent(query)` 完成。
   - `buildSearchItems()` 生成直接搜索 item 和搜索建议 item，payload 只有 `engineId`、`query`、`suggestion`、`url`。
   - `onFeatureTriggered()` 对 `web-search` 进入搜索引擎模式或调用 `handleWebSearchFeature()`；执行 action 时仍通过 `buildSearchUrl(payload.engineId, payload.query)` 得到最终 URL。
7. `packages/utils/plugin/index.ts`
   - `IPluginFeature` 当前有 `commands`、`acceptedInputTypes`、`interaction`、`omniTransfer` 等字段，但没有 `parameters` / `variables` / `urlTemplate` 这类 Quicklink 参数合同。
8. `packages/utils/core-box/tuff/tuff-dsl.ts`
   - `TuffQuery` 有 `text`、`inputs`、`filters`、`sort`、`pagination`、`context`，能承接输入和上下文；但当前类型里没有标准化的 `context.parameters` 或 Quicklink 变量命名空间。

- 结论

主文档对这个映射点的判断成立：Tuff 当前 `touch-browser-open` 已经有可用的 Web Search 能力，但它还不是 Raycast Quicklinks / Alfred Custom Web Search 意义上的可配置 Quicklink 系统。

已经落地的部分很具体：用户可以通过 `web-search` 或 `google` / `bing` / `duckduckgo` 等命令进入搜索；插件会按固定搜索引擎构造 URL，获取建议词，并在 CoreBox 中推送直接搜索或建议 item。这个能力足以支撑“网页搜索”基础体验，也能复用 `system.shell` 打开链路。

尚未落地的部分也很明确：当前实现没有用户可管理的 Quicklink 数据源，没有 URL template schema，没有 required/default/options 参数定义，没有 `{clipboard}` / `{selection}` / `{date}` / `{calculator}` 等共享变量 resolver，也没有 raw / percent-encode / scheme allowlist 的统一声明。`encodeURIComponent(query)` 只是固定 engine 的局部安全处理，不能替代跨 Quicklinks / Snippets / AI Commands 共享的参数合同。

因此后续最小改进应保持 KISS/YAGNI：先在 `touch-browser-open` 或共享 utils 中增加 manual quicklink V1 的数据模型与 resolver 单测，复用现有搜索 item / browser open 执行路径；不要先做大型模板引擎、浏览器书签写回、云同步或完整工作流编辑器。

- 是否发现需修正的主文档问题

否。`01`、`02`、`06` 与 `11` 对 Quicklinks / Web Search 的表述与 live tree 一致：Tuff 有固定搜索引擎与浏览器打开散点能力，但还缺统一 Quicklink schema、参数 resolver 和可验收 evidence。主文档没有把 `touch-browser-open` 夸大成完整 Quicklinks parity。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-51.md`，未修改业务代码、未修改 01-11 主分析文档、未修改 `docs/INDEX.md` / README / TODO / CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
