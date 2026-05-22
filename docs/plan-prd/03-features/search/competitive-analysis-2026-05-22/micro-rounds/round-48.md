# 微审计 48/70

## 审计主题

Browser Data 只读书签源是否能正确映射 Raycast Quicklinks / Alfred Web Bookmarks / uTools 网页快开一类“网页入口与本地浏览器数据源”能力；重点核对 Tuff 当前是否只把 Chromium Bookmarks JSON 作为受限、只读、可诊断的首版 source，而没有把 Browser History / Safari / Cookies / Sessions 等高敏数据误写成已落地能力。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/01-basic-capability-alignment.md`
  - 第 3 节把 Browser Data 标为“部分落地，需要 evidence”，证据路径指向 `plugins/touch-browser-data/index.js`，并明确当前只读扫描 Chrome / Edge / Brave / Arc Bookmarks JSON。
  - 第 4 节把 Browser Data 的 P0 下一步限定为 Chrome / Edge / Brave / Arc Bookmarks JSON 只读扫描、`read-failed` / `not-found` / `unsupported` diagnostics、打开 / 复制 URL action。
  - 第 5 节把 Browser Data 首版 evidence 放进 P0，但没有把 History、Safari、持久索引或清理 UI 写成已完成。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/09-cross-platform-local-data.md`
  - 第 2 节指出竞品并不默认承诺完整跨浏览器历史索引，Browser Data 适合从书签只读起步，历史、Safari、账号数据不能默认读。
  - 第 3 节把 Browser Data 当前状态写为“首版只读落地”，并要求 `fs.read`、supported / unsupported / not-found / read-failed diagnostics。
  - 第 5.2 / 5.3 节明确 Chromium Bookmarks 首版只允许读取 `Bookmarks` JSON、搜索、打开 URL、复制 URL；禁止默认读取 History、Cookies、Sessions、Login Data、Safari 历史 / 书签数据库。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 67 条确认当前只读 Chrome / Edge / Brave / Arc Bookmarks JSON，输出 available / not-found / read-failed / unsupported；文档没有宣称 History / Safari 已落地。
- `plugins/touch-browser-data/manifest.json`
  - 插件声明 `sdkapi: 260428`，`permissions.required` 只有 `fs.read`，`permissionReasons.fs.read` 写明“只读扫描本机浏览器 Bookmarks JSON 文件用于搜索书签”。
  - `clipboard.write` 是 optional，只用于复制书签 URL；feature 的 `acceptedInputTypes` 只有 `text`，不接收图片、文件或 HTML 上下文。
- `plugins/touch-browser-data/index.js`
  - `browserDefinitions()` 只枚举 Chrome / Edge / Brave / Arc 的 Chromium profile root；Linux 平台没有 Arc definition。
  - `buildBrowserSourceDiagnostics()` 会为缺失 definition 的 browser 写入 `unsupported` 与 reason，例如 Arc on Linux。
  - `discoverBookmarkFiles()` 只寻找 profile 下的 `Bookmarks` 文件，且 profile 名限定为 `Default`、`Guest Profile`、`Profile N`。
  - `scanBrowserBookmarks()` 读取 Bookmarks JSON 后输出 `available` / `not-found` / `read-failed` diagnostics；读取失败时保留 `lastError` 和 `failedProfile`。
  - `parseChromiumBookmarks()` 只遍历 bookmark roots；`collectBookmarkNodes()` 只保留 `http://` / `https://` URL，过滤非网页 URL。
  - `buildBookmarkItem()` 默认 action 是打开 URL，并只额外提供复制 URL action，没有写回浏览器书签或读取历史记录的动作。
- `plugins/touch-browser-data/index.test.cjs`
  - 覆盖 Bookmarks JSON flatten、scan diagnostics、Linux Arc unsupported、read-failed reason、title prefix 排序优先，以及结果 item 携带 open action / copy URL action。

## 结论

主文档对 Browser Data 的映射口径成立：Tuff 当前更接近“只读浏览器书签 source + 网页快开 / 复制 URL action”，而不是 Raycast / Alfred / uTools 里所有浏览器数据能力的完整替代。

这个映射有三个关键边界：

1. **只读 source 边界清晰**：manifest 只要求 `fs.read`，源码只读取 Chromium `Bookmarks` JSON；没有写回书签、没有扫描 History SQLite、没有读取 Cookies / Sessions / Login Data。
2. **平台差异不是空结果伪装**：`buildBrowserSourceDiagnostics()` 和测试都覆盖 Arc on Linux 的 `unsupported` reason；`scanBrowserBookmarks()` 对文件不存在和 JSON 读取失败分别输出 `not-found` / `read-failed`，符合 09 文档要求的 fail-closed / diagnostics 口径。
3. **产品动作保持最小闭环**：结果 item 支持打开 URL 与复制 URL，足够支撑 Quicklinks / Web Bookmarks / 网页快开的首版体验；History、Safari、持久索引、disable / clear / rebuild UI 仍应作为后续 source contract 与 evidence，而不是并入当前已完成范围。

因此，本轮没有发现“文档夸大 Browser Data 已完成度”的问题。更准确的后续工作不是扩写主文档，而是补真机 evidence：每个平台至少采样 Chrome / Edge / Brave / Arc 可用或不可用状态、`fs.read` 拒绝、Bookmarks 缺失、JSON 读取失败、打开 URL、复制 URL，并确认日志和 UI 不泄露私密 URL 批量明文。

## 是否发现需修正的主文档问题

否。`01-basic-capability-alignment.md`、`09-cross-platform-local-data.md` 与 `11-100-round-cross-review-ledger.md` 都把 Browser Data 限定在只读 Chromium Bookmarks 首版能力，没有把 Browser History、Safari、账号数据或完整 App Data 索引写成已落地。

## 本轮未改业务代码、未提交 git 的说明

本轮只新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-48.md`，未修改业务代码，未修改 01-11 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / git push / 分支 / reset / checkout / 工作树清理操作。
