# 微审计 18/70

- 审计主题：Browser Data 书签只读源是否能作为 Raycast Quicklinks / Alfred Web Bookmarks / uTools 网页快开的 Tuff `QuicklinkSource` 映射底座，而不是被误判为完整 Browser History 或可同步浏览器数据能力。
- 读取/核对的文档或源码锚点：
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/01-basic-capability-alignment.md`：把 Browser Data 标为“部分落地，需要 evidence”，并要求 Quicklinks / Web Search 后续统一数据模型。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/09-cross-platform-local-data.md`：明确 Browser Data 首版只读 Chrome / Edge / Brave / Arc Chromium `Bookmarks` JSON，History / Safari / 持久索引 / disable-clear-rebuild UI 后置。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md`：把 `quicklinks-v1` 的来源拆为 manual / pinned / browser / dev source，并强调不写回浏览器、不做云同步。
  - `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`：第 67 条已复核 Browser Data 只读有限源，没有宣称 History / Safari 已落地。
  - `plugins/touch-browser-data/manifest.json`：插件声明 `sdkapi: 260428`，必需权限为 `fs.read`，可选 `clipboard.write`，feature 只接受 text 输入。
  - `plugins/touch-browser-data/index.js`：`browserDefinitions()` 只列 Chrome / Edge / Brave / Arc 的 Chromium profile root；Linux 不列 Arc；`scanBrowserBookmarks()` 读取 `Bookmarks` 文件并输出 `available` / `not-found` / `read-failed` / `unsupported` diagnostics；`buildBookmarkItem()` 提供打开 URL 与复制 URL 动作。
- 结论：
  - 主文档的映射边界成立。`touch-browser-data` 已经提供了可作为 `QuicklinkSource.browser` 的真实底座：它能从本机浏览器书签文件只读生成 URL item，并且每条 item 有 open/copy 两类动作，足以服务“浏览器书签进入 CoreBox 快开”的最小闭环。
  - 当前实现没有读取 History SQLite、Cookies、Sessions、Login Data 或 Safari 数据，也没有写回浏览器书签；这与主文档“书签可只读起步，历史和 Safari 后置”的隐私边界一致。
  - 该实现仍不是完整 Quicklinks 产品模型。它缺用户可管理的 manual/pinned/dev link schema、统一 URL template resolver、参数填充合同、source enable/disable/clear/rebuild UI，以及 packaged / 真机 evidence。因此主文档把它列为 Quicklinks 的 browser source，而不是完整 Raycast Quicklinks parity，是正确的。
  - KISS/YAGNI 角度看，下一步不应把 `touch-browser-data` 扩成通用浏览器数据索引器；更合理的是复用当前只读 scanner 和 diagnostics，给 `quicklinks-v1` 增加一个薄的 `browser` source 适配层，并把 History / Safari 保持在后续显式授权调研切片。
- 是否发现需修正的主文档问题：否。主文档没有把 Browser Data 夸大成完整浏览器历史、跨浏览器数据同步或 Raycast Quicklinks 完整替代；它明确区分了只读书签底座、Quicklinks 统一模型缺口和后续 evidence 需求。
- 本轮未改业务代码、未提交 git 的说明：本轮只新增本文件作为微审计输出，并更新 codex-potter 进度记录；未修改业务代码，未执行 git commit / push / checkout / reset。
