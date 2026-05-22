# 微审计 68/70

- 审计主题

`touch-browser-bookmarks` 与 Raycast Quicklinks / Alfred Web Bookmarks / uTools 网页快开之间的边界：它是否已经能作为统一 `QuicklinkSource` 的完整实现，还是只是 Tuff 当前 Quicklinks/Web Search 分散能力中的“本地插件 storage 书签 + 最近 URL + 打开/复制动作”切片。

本轮不重复 round-48 已覆盖的 `touch-browser-data` Chromium Bookmarks JSON 只读扫描，而是专门核对 `touch-browser-bookmarks` 这个用户维护型书签插件，避免把它和真实浏览器 profile 数据源混为一谈。

- 读取/核对的文档或源码锚点

1. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/01-basic-capability-alignment.md`
   - Quicklinks / Web Search 被标为“部分落地”，锚点包括 `touch-browser-open`、`touch-browser-bookmarks`、`touch-dev-toolbox`、`touch-browser-data`。
   - 缺口被定义为统一 Quicklinks 数据模型、占位符与管理面，而不是缺 URL 打开能力本身。
2. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/02-raycast-smooth-interactions.md`
   - Quicklinks 动态参数要求 URL/file/deeplink 可使用 runtime 参数，Tuff 侧最小设计是 `QuicklinkSource` + `TuffParameterSet`。
   - 文档明确“不写回浏览器书签”，说明浏览器数据 source、用户手工 quicklink、插件 storage 书签需要分层。
3. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`
   - `quicklinks-v1` 把常用 URL、搜索引擎、浏览器书签、开发链接统一为 manual / pinned / browser / dev source。
   - 风险列为 Browser Data / Bookmarks 边界不清；不做事项包括不写回浏览器、不做云同步。
4. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
   - 第 8 条确认 Quicklinks / Web Search 当前只有 URL builder / bookmarks / Browser Data 切片，缺统一 schema。
   - 第 19 条确认 per-engine `encodeURIComponent(query)` 不等于可配置 Quicklink。
5. `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-48.md`
   - 已确认 `touch-browser-data` 是只读 Chromium Bookmarks JSON source，不读 History / Safari / Cookies / Sessions。
   - 本轮据此区分：`touch-browser-bookmarks` 不是浏览器 profile scanner，而是插件自有数据。
6. `plugins/touch-browser-bookmarks/manifest.json`
   - 插件声明 `sdkapi: 260428`，required permissions 为空，optional 只有 `clipboard.write`。
   - feature `browser-bookmarks` 声明 `acceptedInputTypes: ["text"]`，三平台可用，关键词覆盖 bookmark / bookmarks / 收藏 / 网址 / 链接。
7. `plugins/touch-browser-bookmarks/index.js`
   - 使用 `plugin.storage` 维护 `bookmarks.json` 与 `recent-urls.json`，上限分别为 `MAX_BOOKMARKS = 200` 与 `MAX_RECENT = 60`，最近访问 TTL 为 30 天。
   - `normalizeUrlInput()` 只接受 `http:` / `https:`，裸域名会补 `https://`。
   - `onFeatureTriggered()` 对 URL 输入提供“默认浏览器打开”“添加到收藏”“复制 URL”“打开配置目录”，对非 URL 输入按 title/url/tags 搜索本地收藏和最近访问。
   - `onItemAction()` 支持 `open-url`、`add-bookmark`、`copy-url`、`config-open`；打开 URL 后会写入最近访问。
   - `copy-url` 会请求 `clipboard.write`；`open-url` 依赖运行时 `openUrl`，不直接写 shell helper。

- 结论

主文档对该映射点的判断成立：`touch-browser-bookmarks` 是真实可执行的网页入口切片，但不能直接等同于 Raycast Quicklinks / Alfred Web Bookmarks 的统一产品模型。

已经成立的部分：

1. 插件能维护用户自己的本地 URL 列表，并按 title / URL / tags 搜索。
2. URL 归一化有最小安全边界，只允许 `http` / `https`，不会把任意 scheme 交给打开动作。
3. 它有完整小闭环：输入 URL -> 添加收藏 / 打开 / 复制；打开后写入最近访问；本地数据通过插件 storage 保存。
4. 权限面较窄，只有复制 URL 时才需要 optional `clipboard.write`；这比把浏览器 profile 或历史记录默认纳入更稳。
5. 它适合成为后续 `QuicklinkSource.manual` 或 `QuicklinkSource.pinned` 的迁移样本。

但边界也很明确：

1. 该插件读取的是自己维护的 `bookmarks.json` / `recent-urls.json`，不是 Chrome / Edge / Brave / Arc 的浏览器书签源；浏览器 profile source 仍是 `touch-browser-data` 的职责。
2. 现有数据结构没有 URL template、参数声明、默认值、dropdown、变量 resolver 或 percent/raw encode 策略，不能承载 Raycast Quicklinks 的动态参数能力。
3. “打开配置目录，编辑 JSON”是开发者友好的逃生口，不是最终用户级 Quicklinks 管理面。
4. 最近访问是插件打开动作产生的局部 recent，不等于浏览器 History；不应用它替代 Browser History / Safari 调研。
5. 它没有 source diagnostics、last validated、import source、sync policy 或 clear/rebuild evidence；因此还不能作为 Store / release evidence 的完整 Quicklinks 卡片。

所以后续最小路径应保持主文档口径：保留 `touch-browser-bookmarks` 作为 `quicklinks-v1` 的一个迁移样本，抽出薄的 `QuicklinkSource` schema，把 `manual` / `pinned` / `browser` / `dev` source 分开；复用现有 open/copy/add recent 行为，但不要把插件 storage JSON 直接升级成浏览器书签同步，也不要引入 History 读取或云同步。

- 是否发现需修正的主文档问题

否。`01`、`02`、`10` 与 `11` 都把 `touch-browser-bookmarks` 写在 Quicklinks / Web Search 的分散能力里，并把统一 `QuicklinkSource`、参数 resolver、管理面和 evidence 放在后续任务。源码核对没有发现主文档夸大它为完整 Quicklinks parity、浏览器 profile source 或 Browser History 能力。

- 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-68.md`，并更新 `.codexpotter` 进度记录；未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 创建分支 / reset / checkout / 工作树清理操作。
