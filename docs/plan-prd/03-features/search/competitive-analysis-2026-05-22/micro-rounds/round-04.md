# 微审计 04/70

## 审计主题

Raycast Search Bar 的 URL detection / Quicklinks 心智，是否能映射到 Tuff 当前 `touch-browser-open` 插件的 URL 归一化、默认浏览器打开、指定浏览器打开与网页搜索能力。

本轮只审一个具体映射点：Tuff 是否已经具备“输入裸域名或 URL 后自动形成可执行打开动作”的真实链路；以及主分析文档把缺口定位为 Quicklink schema / 参数合同 / evidence，而不是“缺浏览器打开底座”，是否准确。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
  - 第 2.1 节说明 Raycast Search Bar 会识别 URL 或裸域名，并自动补 `https://`。
  - 第 2.3 节把 Quicklinks 列为参数填充场景：URL/file/deeplink 可使用动态占位符，URL 默认 percent encode。
  - 第 3、4 节把 Tuff 当前 `touch-browser-open` 归为可复用路径，同时明确缺 Quicklink 数据模型和参数 resolver。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/04-utools-plugin-cross-platform.md`
  - 第 4 节把 `touch-browser-open` 映射为 selected text URL 的 Context Action 候选，并要求 Linux 指定浏览器给出 unsupported reason。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 执行优先级中把 Snippets/Quicklinks/Translate/AI Command 共享参数语义列为 P1，不要求先做完整 Quicklinks 管理器。
- `plugins/touch-browser-open/manifest.json`
  - `browser-open` feature 声明 `acceptedInputTypes: ["text"]`，关键词包含 `url`、`link`、`open`、`浏览器`、`网页`、`打开链接`。
  - `web-search` feature 也声明 text 输入，并支持 Google / Bing / DuckDuckGo 等搜索入口。
  - 权限理由覆盖 `system.shell`、`clipboard.write`、`network.internet`，说明打开、复制、搜索建议不是无权限假动作。
- `plugins/touch-browser-open/index.js`
  - `normalizeUrlInput()` 会把 `example.com` 这类裸域名补为 `https://example.com/`，并只允许 `http:` / `https:`。
  - `buildSearchUrl()` 会按搜索引擎生成 URL，并在 engine 内使用 `encodeURIComponent(query)`。
  - `buildSearchEngineFeatures()` 会按启用的搜索引擎动态注册可搜索 feature，且所有动态 feature 都声明 text 输入。
  - `resolveBrowserOpenSupport()` 在 macOS / Windows 标记可用；Linux 只允许默认打开和网页搜索，指定浏览器打开返回 `linux-specific-browser-open-unsupported`。
  - `handleBrowserOpenFeature()` 在 URL 无效时推送“请输入 URL / URL 格式不正确”提示；URL 有效时推送默认打开、复制 URL、推荐浏览器、最近浏览器与能力诊断项。
  - `handleWebSearchFeature()` 先推送直接搜索项，再 best-effort 拉取搜索建议；建议失败时仍保留直接搜索。
- `packages/test/src/plugins/browser-open.test.ts`
  - 覆盖裸域名归一化、非法 URL 拒绝、搜索 URL percent encode、动态搜索引擎 feature 注册、缺 `system.shell` 时只推送 capability diagnostics、不主动请求权限、Linux 指定浏览器 unsupported reason。

## 结论

主文档的映射判断成立：Tuff 已有真实的“URL detection -> 可执行动作”底座，不能把这块描述成空白能力。

当前事实链路是：

1. 输入层：`browser-open` 与 `web-search` 都声明接收 text，CoreBox 可以把用户输入或上下文文本交给插件。
2. URL 识别层：`normalizeUrlInput()` 能识别裸域名并自动补 `https://`，同时拒绝非 URL 文本和非 http/https scheme。
3. 动作层：有效 URL 会生成默认浏览器打开、复制 URL、推荐浏览器、最近浏览器和能力诊断；无效 URL 会显示可读提示，不伪装成空结果。
4. 搜索层：网页搜索独立于 URL 打开，支持 engine command、动态搜索引擎 feature、percent encode 与搜索建议降级。
5. 平台层：macOS / Windows 支持默认和指定浏览器；Linux 默认打开与网页搜索可用，指定浏览器明确 `unsupported`，符合主文档的 fail-closed 口径。

但这仍不是 Raycast Quicklinks 的完整对齐。`touch-browser-open` 当前更接近“打开当前 URL / 搜索当前文本”的执行插件，而不是用户可管理的 Quicklink 系统：

- 没有 `urlTemplate` / `parameters` / tags / openWith / storage schema。
- 没有把 `{argument}`、`{clipboard}`、`{selection}`、`{date}`、`{uuid}` 等变量纳入统一 resolver。
- 没有将 Quicklink、Snippet、AI Command 的参数解析失败统一为机器可读 failure reason。
- 没有把 selected text URL、clipboard URL、typed query 的来源区别作为统一 evidence 暴露。

因此主文档建议 P1 做 `TuffParameterSet` / `TuffVariableContract v1` 和 Quicklink template v1 是准确的；它应复用 `touch-browser-open` 现有 URL 归一化、搜索 URL builder、能力诊断和平台 unsupported reason，而不是另起一套浏览器打开实现。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。主文档对该映射点的边界是正确的：Tuff 已具备浏览器打开与网页搜索的真实底座，但 Quicklinks 仍缺用户可管理模板、统一参数合同、输入来源 evidence 和失败 reason。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-04.md`，并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
