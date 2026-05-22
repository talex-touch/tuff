# 微审计 16/70

- 审计主题：Raycast Quicklinks / Alfred Web Search / uTools 动态指令映射到 Tuff `touch-browser-open` 时，当前能力是否已经形成“用户可管理 Quicklink 模板”，还是仍主要停留在内置 Web Search 引擎与浏览器打开插件。
- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/06-parameter-filling-dynamic-variables.md`：主文档把 Quicklinks 归入 `TuffVariableContract v1` 首批落点，明确指出 `touch-browser-open` 已有 `buildSearchUrl(query)` 与动态 search feature，但缺 QuicklinkSource schema 和共享 URL template resolver。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/05-search-performance-ranking.md`：主文档把 Raycast Quicklinks 放在 Root Search 心智里，同时要求 Tuff 先补 search trace / ranking explain / evidence，不建议重写搜索引擎。
  - `plugins/touch-browser-open/manifest.json`：插件声明 `browser-open` 与 `web-search` 两个 feature；`web-search` 只接受 text，关键词覆盖 `search` / `web` / `google` / `bing` / `duckduckgo` / `搜索` / `网页搜索`；权限包含 `system.shell`、可选 `clipboard.write` 与 `network.internet`。
  - `plugins/touch-browser-open/index.js`：内置 Google / Bing / DuckDuckGo 三个 search engine，`buildSearchUrl()` 对 query 做 `encodeURIComponent()`，`parseSearchQuery()` 支持 `google/g`、`bing`、`duckduckgo/ddg/duck` 等显式引擎前缀。
  - `plugins/touch-browser-open/index.js`：`buildSearchEngineFeatures()` 会按启用搜索引擎动态注册 `search-engine-*` feature，`onFeatureTriggered()` 支持进入 per-engine 搜索模式或通用 `web-search` 模式。
  - `plugins/touch-browser-open/index.js`：`buildSearchItems()` 会生成直接搜索 item 和 suggestion item；`loadSuggestions()` 需要 `network.internet` 权限，失败时保留直接搜索并追加“搜索建议不可用”的 warning。
  - `plugins/touch-browser-open/index.js`：`onItemAction()` 对 `search-web` action 重新构造 URL，执行前请求 `system.shell` 权限；复制 URL 则走 `clipboard.write` 权限。
- 结论：
  - Tuff 已有真实 Web Search 执行链路，不是空规划。用户输入 `web` / `google query` / `bing query` 这类路径时，插件能解析搜索引擎、生成编码后的搜索 URL、展示直接搜索与建议词，并通过系统打开能力执行。
  - 当前实现比“裸 URL 拼接”更稳：URL query 已默认编码，网络建议词失败不会吞掉直接搜索，item meta 中也有 `capability` / `featureId` / `actionId` / `payload`，能够为后续 evidence 与 Action Panel 承接提供基础。
  - 但它还不是 Raycast Quicklinks 或 Alfred Web Search 那种用户可管理模板能力。搜索引擎列表是插件内置常量，设置只覆盖默认引擎和 enabled engines；没有用户自定义 URL template、命名参数、required/default/options、scheme allowlist、raw/encode modifier 或“保存当前 item 为 Quicklink”的合同。
  - 因此主文档把下一步收敛为 `TuffVariableContract v1` 与 `quicklink-template-v1` 是准确的。KISS/YAGNI 角度看，不应先重写 `touch-browser-open` 或做大型表单平台；更合理的是复用当前 Web Search item/action 路径，只补一个小的 manual quicklink schema、URL template resolver、参数缺失/非法失败态和 3 个样本模板。
  - 这个映射点也提醒主文档后续验收要区分两类 evidence：内置搜索引擎的 `search-web` 体验已存在；用户可管理 Quicklinks 的参数合同仍未落地，不能把前者宣传成后者。
- 是否发现需修正的主文档问题：否。主文档已经明确写出 `touch-browser-open` 是“搜索引擎参数化散点实现”，并把缺口定位到 QuicklinkSource schema、共享 URL template resolver、URL 默认 encode、参数 required/default/options 与动态 Quicklink 噪声控制；源码核对结果支持该判断。
- 本轮未改业务代码、未提交 git 的说明：本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-16.md` 并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 `git commit` / `git push` / 创建分支 / reset / checkout / 清理工作树操作。
