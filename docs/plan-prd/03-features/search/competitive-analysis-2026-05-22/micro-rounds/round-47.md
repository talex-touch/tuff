# 微审计 47/70

- 审计主题

剪贴板 URL 推荐是否应被纳入 Raycast Quicklinks / Alfred Web Search / uTools 网页快开到 Tuff `quicklinks-v1` 的映射证据；重点核对当前 `__builtin_clipboard_url__` 推荐候选是可复用的上下文信号，还是已经能被视为完整 Quicklink / Browser Open 执行闭环。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/01-basic-capability-alignment.md`
   - 第 3 节把 Quicklinks / Web Search 标为“部分落地”，证据包括 `touch-browser-open`、`touch-browser-bookmarks`、`touch-dev-toolbox`、`touch-browser-data`，缺口是统一 Quicklinks 数据模型。
   - 第 4 节要求先定义 `QuicklinkSource` 最小 schema，复用 `touch-browser-open` 执行与 Browser Data source diagnostics。
   - 第 6 节把 `quicklinks-contract-v1` 验收限定为 manual link、browser bookmark、dev link、URL template、placeholder contract，不做浏览器历史写回或跨设备同步。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
   - 第 2.3 节指出 `plugins/touch-browser-open/index.js` 的搜索引擎 URL builder 已有 `buildSearchUrl(query)`，但没有 Quicklink schema。
   - 第 4.1 节强调 Raycast Quicklinks 的关键不是“打开网址”，而是 URL template 能在打开前拿到 runtime 参数；`clipboard` / `selection` 参数必须在 UI 上显示 source，不静默读取。
3. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/06-parameter-filling-dynamic-variables.md`
   - 第 1 节把 `touch-browser-open` 定位为搜索引擎参数化散点实现，缺用户可管理 Quicklink schema 和共享参数 spec。
   - 第 3 节把 Browser Open / Search 的现状写成 `buildSearchUrl(query)` + `encodeURIComponent`，缺 `QuicklinkSource` schema 和共享 URL template resolver。
   - 第 5.4 节建议 Quicklinks / `touch-browser-open` 使用 URL template + `TuffVariableSpec[]`，URL 默认 encode。
4. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`
   - 第 4.2 节把 `context-actions-v1` 验收限定为 selected text、clipboard image、files 三类输入，每条 action 有 inputSource、permission/status/reason。
   - 第 4.3 节把 `quicklinks-v1` 验收限定为 `QuicklinkSource` schema、manual/pinned/browser/dev source、URL template、open/copy action。
   - 第 7 节把 Quicklinks schema 放在 P2，说明它仍是后续合同，不是当前已完整落地。
5. `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/recommendation-engine.ts`
   - `getClipboardUrlCandidates()` 在 `context.clipboard.meta.isUrl` 且有 content 时生成内置候选，`sourceId` 为 `__builtin_clipboard_url__`，item id 为 `clipboard-url-open:${url}`。
   - 候选标题为“打开 URL”，action 为 `open-url`，`data.url` 保存剪贴板 URL，priority 为 95。
   - 评分逻辑把 `__builtin_clipboard_url__` 视为高优先级上下文匹配；semantic profile 也会为 URL 剪贴板加入 `task:web`、`app:browser`、`research` tokens。
6. `apps/core-app/src/main/modules/box-tool/search-engine/recommendation/item-rebuilder.ts`
   - `rebuildPluginRecommendItems()` 会把 `__builtin_clipboard_url__` 重建成 `source.type: "system"`、`source.name: "Clipboard URL"` 的 `TuffItem`。
   - 该 item 带 `open-url` / `copy-url` 两个 actions，并把 URL 放进 `meta.pluginRecommend.data`。
7. `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts`
   - 默认 provider 只注册 `mainWindowProvider`、`systemActionsProvider`、`appProvider`、平台文件 provider、`fileProvider`、`PluginFeaturesAdapter`、`previewProvider`。
   - `CoreBoxEvents.item.execute` 执行时按 `item.source.id` 查找 provider；若没有 provider 或 provider 没有 `onExecute`，直接返回当前 activation state。
   - 未看到 `__builtin_clipboard_url__` provider 注册，因此内置剪贴板 URL 推荐不能仅凭 `source.id` 直接证明 open/copy 执行已闭环。
8. `plugins/touch-browser-open/manifest.json` 与 `plugins/touch-browser-open/index.js`
   - `browser-open` 与 `web-search` feature 只声明 `acceptedInputTypes: ["text"]`。
   - `touch-browser-open` 自身已有 `executeBrowserOpenAction()`、`tryCopyUrl()`、`onItemAction()`、`copy-url` 等执行能力，并处理 `system.shell` / `clipboard.write` 权限。
   - 但当前内置剪贴板 URL item 的 `source.id` 不是 `plugin-features`，也没有直接复用 `touch-browser-open` 的 `onItemAction()` 路由。

- 结论

主文档对 Quicklinks 的“部分落地，缺统一合同”判断成立，而且本轮补充了一个更具体的边界：剪贴板 URL 推荐已经是有价值的上下文信号，但不能被算作完整 Quicklinks 闭环。

当前 Tuff 已具备三项可复用资产：

1. **上下文发现**：RecommendationEngine 能从剪贴板识别 URL，并生成高优先级 `Clipboard URL` action item。
2. **动作元数据**：重建后的 item 已声明 `open-url` / `copy-url`，并把真实 URL 放入 `meta.pluginRecommend.data`。
3. **浏览器执行能力**：`touch-browser-open` 已有默认浏览器打开、指定浏览器打开、复制 URL、权限检查和平台 unsupported reason。

但这三者还没有形成一条统一合同：

1. `__builtin_clipboard_url__` 是推荐系统内置 source，不是 `QuicklinkSource` schema 里的 manual/pinned/browser/dev source。
2. 该 item 的执行路由按 `source.id` 找 provider，而默认 provider 列表没有注册 `__builtin_clipboard_url__`；因此仅看 item action 不能证明 Enter 或 Action Panel 的 `open-url` 已真实打开浏览器。
3. URL 参数来源仍停留在剪贴板 content，不具备 Raycast Quicklinks 的 `{argument}`、`{clipboard}`、默认值、校验、percent encode、source disclosure 等统一变量合同。
4. `touch-browser-open` 有成熟执行能力，但内置推荐 item 当前没有显式路由到它；后续 quicklinks-v1 应优先复用这条执行能力，而不是新增平行的 open-url shell helper。

因此，后续最小修正方向不是重写推荐系统，也不是把剪贴板 URL 推荐宣传成 Quicklinks 完成态；而是把它纳入 `quicklinks-v1` / `context-actions-v1` 的一个验收样本：`clipboard-url` source 必须有 inputSource、permission/status/reason、执行结果和失败 toast，并且 open/copy 统一复用 `touch-browser-open` 或明确注册一个 typed system provider。

- 是否发现需修正的主文档问题

否。`01`、`02`、`06`、`10` 没有把当前剪贴板 URL 推荐夸大成完整 Raycast Quicklinks / Alfred Web Search / uTools 网页快开能力；它们把 Quicklinks 写成分散能力，缺 `QuicklinkSource`、URL template、参数 resolver 和 evidence。源码核对结果与该口径一致。

本轮额外发现的是后续实现层的验收注意点：`Clipboard URL` 推荐 item 的展示、actions 元数据和真实执行 provider 需要一起验证，不能只用推荐列表里出现“打开 URL”来证明 open/copy 已闭环。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-47.md` 作为中文 Markdown 微审计记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / 创建分支 / reset / checkout / 清理工作树。
