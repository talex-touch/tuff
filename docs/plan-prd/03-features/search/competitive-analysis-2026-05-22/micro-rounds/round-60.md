# 微审计 60/70

- 审计主题

Raycast Quicklinks / Alfred Web Search / uTools 网址打开类能力，与 Tuff `touch-browser-open` 当前 URL 打开和网页搜索能力的映射是否准确；重点核对“已有搜索 URL builder”和“尚未具备用户可管理 Quicklink URL template / 参数填充合同”之间的边界。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
   - 第 1 节把 Search Bar 定义为 Root Search、URL detection、Quicklinks、Snippets、AI Commands、Calculator 等能力的共同入口。
   - 第 2.3 节说明 Raycast Quicklinks 支持 URL/file/deeplink 与 `{argument}`、clipboard、date、UUID、calculator 等动态占位符；Tuff 当前 `touch-browser-open` 已有搜索引擎 URL builder，但没有 Quicklink schema。
   - 第 4.1 节把最小建议限定为 `manualQuicklinks.json` 或插件 storage、`urlTemplate`、`parameters`、默认 `percent-encode`、source 可见，不要求先做完整 Raycast Quicklinks 管理器。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/06-parameter-filling-dynamic-variables.md`
   - 主线判断是 Snippets、Quicklinks、Translation、AI Command 需要共享薄参数 resolver，而不是各自继续硬编码变量逻辑。
   - Quicklink URL 场景要求默认 percent encode；raw 输出必须显式声明并配套 scheme / length 校验。
3. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-02.md`
   - 已确认 `touch-browser-open` 的固定搜索引擎 builder 是真实参数化样本，但它只是内部 query -> URL 映射，不等同于用户可配置 Quicklink 模型。
4. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-17.md`
   - 已指出 Command Arguments、`TuffQuery.context.parameters` 和统一变量 resolver 仍是设计建议，不是现有稳定合同。
5. `plugins/touch-browser-open/manifest.json`
   - 插件声明 `sdkapi: 260428`，权限为 `system.shell`，可选 `clipboard.write` 与 `network.internet`。
   - `browser-open` 和 `web-search` 两个 feature 均声明 `acceptedInputTypes: ["text"]`；`browser-open` 在 Linux 标记为不可用，`web-search` 三平台可用。
6. `plugins/touch-browser-open/index.js`
   - `SEARCH_ENGINES` 内置 Google / Bing / DuckDuckGo，`buildSearchUrl()` 对 query 使用 `encodeURIComponent()`。
   - `parseSearchQuery()` 支持 `google` / `bing` / `duckduckgo` 等显式 engine token，否则回落默认搜索引擎。
   - `normalizeUrlInput()` 支持 `example.com` / `www.example.com` 自动补 `https://`，并只允许 `http:` / `https:`。
   - `buildSearchEngineFeatures()` 会按启用搜索引擎动态注册搜索 mode feature，仍然是固定 engine 列表，不是用户自定义 URL template。
   - `handleBrowserOpenFeature()` 生成“默认浏览器打开”“复制 URL”“推荐浏览器”“最近浏览器”“权限 / 安全提示”等 item，并把 `system.shell` capability 状态写入 item。
   - `onItemAction()` 执行 `copy-url`、`default-open`、`search-web`、`open-browser`，权限缺失或执行失败会返回 `blocked` / reason。

- 结论

主文档对该映射点的判断成立：Tuff 当前已经有“打开 URL / 指定浏览器打开 / 网页搜索”的真实能力，并且不是空壳。

已经成立的事实有五点：

1. URL detection 已有基础，裸域名会补 `https://`，且只允许 `http` / `https`，没有把任意 scheme 直接交给 shell。
2. Web search builder 对 Google / Bing / DuckDuckGo query 做 `encodeURIComponent()`，符合 Quicklink URL 参数默认转义的方向。
3. 搜索引擎 mode 可动态注册为插件 feature，用户可以通过引擎关键词进入搜索模式。
4. 浏览器打开动作带 `system.shell` capability 和 permission check，Linux 指定浏览器打开会以 `unsupported` / reason 呈现，不伪装为成功。
5. 执行动作已有 `started` / `blocked` 返回语义，并维护最近浏览器，说明它是可执行路径而不是纯文档占位。

但它仍不是 Raycast Quicklinks 或 Alfred Workflow 变量系统的完整对齐：

1. 现有 URL builder 是内置搜索引擎的固定函数，不是用户可保存、可编辑、可同步的 `urlTemplate`。
2. 没有 manifest 或 storage 级 `parameters` 描述，因此无法在 Search Bar 原地提示必填参数、dropdown、password 或默认值。
3. 没有共享 `TuffParameterSet` / resolver；Quicklink、Snippet、AI Command、Translation 之间仍不能复用同一组 `{clipboard}` / `{selection}` / `{date}` / `{calculator}` 语义。
4. Search result 里能看到 capability 状态，但还没有完整 evidence：例如 input source、参数来源、percent-encode/raw 决策、template id、failure reason 的统一 trace。
5. 当前搜索建议需要 `network.internet`，但 Quicklink 本身不应默认引入网络建议能力；后续实现需要把本地 template 打开与远端 suggestion 分开。

因此最小下一步仍应沿主文档方向推进：以 `touch-browser-open` 为首个落点做 `quicklink-template-v1`，只支持本地用户定义 `id/title/urlTemplate/openWith/tags/parameters` 和 text/dropdown 参数，URL 输出默认 `percent-encode`；不要先做完整 workflow 图、复杂脚本、浏览器书签写回或跨设备同步。

- 是否发现需修正的主文档问题

否。主文档没有把 `touch-browser-open` 夸大为完整 Quicklinks；它明确区分了“已有 buildSearchUrl(query)”和“缺 Quicklink schema / 参数 resolver / evidence”的边界。源码核对没有发现需要修改 `01-11` 主分析文档的问题。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-60.md`，并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
