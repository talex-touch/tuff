# 微审计 30/70

## 审计主题

Browser Data 是否在 Tuff 竞品分析中被准确限定为“只读 Chromium Bookmarks 源”，而不是被误写成 Raycast / Alfred / uTools 级别的完整浏览器历史、Safari 数据或通用 App Data 索引能力。

本轮只审一个具体映射点：`touch-browser-data` 当前是否只扫描 Chrome / Edge / Brave / Arc 的 `Bookmarks` JSON，并把缺权限、未发现、读取失败、平台不支持表达为可见状态；同时确认主文档是否避免把 History / Safari / Cookies / Sessions / Login Data 纳入默认落地范围。

## 读取/核对的文档或源码锚点

- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/09-cross-platform-local-data.md`
  - 第 2 节把 Browser Data 明确写成书签可只读起步，历史、Safari、账号数据不能默认读。
  - 当前能力表把 Browser Data 标为“首版只读落地”，锚点是 `plugins/touch-browser-data/index.js`，范围限定为 Chrome / Edge / Brave / Arc Chromium `Bookmarks` JSON。
  - 跨平台矩阵要求 `fs.read` denied、not-found、read-failed、unsupported、open URL、copy URL 等 evidence；Linux Arc 明确 unsupported。
  - App Data 风险表把 Chromium History、Safari、Notes / Calendar / Contacts 等后置为只调研或默认关闭，不进入默认扫描。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/11-100-round-cross-review-ledger.md`
  - 第 67 条确认 Browser Data 只读且有限源：当前只读 Chrome / Edge / Brave / Arc Bookmarks JSON，输出 `available` / `not-found` / `read-failed` / `unsupported`，没有宣称 History / Safari 已落地。
  - 后续路线把 Browser Data bookmarks 放入 P0 evidence；Browser History、Obsidian、VSCode local data 放到 P1 / 2.5.0，说明主文档区分了“已存在书签插件”和“未来本地数据源合同”。
- `plugins/touch-browser-data/manifest.json`
  - 插件 `sdkapi` 为 `260428`，权限只声明必需 `fs.read` 和可选 `clipboard.write`。
  - 描述与 permission reason 都强调“只读扫描本机浏览器 Bookmarks JSON 文件用于搜索书签”。
  - feature `browser-data` 的 `acceptedInputTypes` 只有 `text`，不是通用多输入数据源或后台索引器。
- `plugins/touch-browser-data/index.js`
  - `browserDefinitions()` 仅定义 Chromium 系浏览器的用户数据目录：Windows / macOS 覆盖 Chrome、Edge、Brave、Arc；Linux 覆盖 Chrome、Edge、Brave，不包含 Arc。
  - `discoverBookmarkFiles()` 只查找 `Bookmarks` 文件，且最多扫描有限 profile；没有读取 `History` SQLite、Cookies、Sessions、Login Data 或 Safari 数据库。
  - `normalizeUrl()` 只保留 `http:` / `https:` URL，测试也覆盖了忽略 `file://` URL 的行为。
  - `scanBrowserBookmarks()` 会为每个 source 产出 diagnostics，并把状态写成 `available`、`not-found`、`read-failed`、`unsupported`。
  - `onFeatureTriggered()` 在缺少 `fs.read` 时推送“缺少文件读取权限” item，而不是返回空结果假装成功。
  - `buildDiagnosticsItem()` 会生成“扫描状态” item，展示可读浏览器、读取失败或不支持信息。
- `plugins/touch-browser-data/index.test.cjs`
  - 覆盖 Chromium Bookmarks flatten、忽略非 http URL、标准 profile 发现、available diagnostics、Linux Arc unsupported、read-failed reason、搜索排序、open item 与 copy URL action、空状态下的 source availability。

## 结论

主文档对 Browser Data 的边界判断成立：Tuff 当前有一个真实、可运行、权限受控的浏览器书签读取插件，但它不是完整浏览器数据平台。

已经成立的部分：

1. **数据源范围清楚**：实现只扫描 Chromium `Bookmarks` JSON，且限定 Chrome / Edge / Brave / Arc 的平台可用组合；Linux Arc 会被表达为 unsupported。
2. **读取方式保守**：插件只需要 `fs.read`，缺权限时显示可见提示；没有默认读取 History SQLite、Cookies、Sessions、Login Data 或 Safari。
3. **失败态没有被吞掉**：Bookmarks 文件不存在是 `not-found`，JSON 读取或解析失败是 `read-failed`，平台无定义是 `unsupported`，并通过“扫描状态” item 展示。
4. **URL 输出有基本安全边界**：只保留 `http:` / `https:` 书签 URL，过滤 `file://` 这类本地路径 URL，避免把浏览器书签插件变成任意本地路径打开入口。

仍然不能夸大的部分：

1. **不是 Browser History**：没有复制只读 History SQLite 副本、时间范围限制、条数限制或 profile-level opt-in。
2. **不是 Safari / 系统 App Data**：Safari、Notes、Calendar、Contacts、Mail 等高敏数据仍只应停留在调研和 unsupported / degraded reason 阶段。
3. **不是持久索引平台**：当前扫描是插件内实时读取和搜索，缺 source enable/disable、clear/rebuild、lastIndexedAt、itemCount、lastError 等 `AppDataSource` 管理合同。
4. **evidence 还需产品化**：源码已有 diagnostics item，但主文档要求的 packaged 截图、每 browser source diagnostics、`fs.read` denied、open/copy URL 的 release evidence 仍要补。

因此，`09-cross-platform-local-data.md` 把 Browser Data bookmarks 放在 P0 evidence，把 History / Safari / App Data Source 合同放在后续阶段，是正确口径。下一步应先补书签源的 evidence 和禁用/清理/重建 UI，而不是默认扩展到浏览器历史或系统级私密数据库。

## 是否发现需修正的主文档问题

否。

未发现需要修改 `01-11` 主分析文档的问题。主文档没有把 `touch-browser-data` 夸大成完整 Browser History、Safari 数据或通用 App Data 索引；它明确把当前能力限定为只读 Chromium Bookmarks，并把高敏本地数据源放到后续调研或默认关闭路径。

本轮只补充一个执行层注意点：`buildDiagnosticsItem()` 当前能展示 source 状态摘要，但还不是完整 `AppDataSource` health 面板；后续做 UI evidence 时应继续保留 `available / not-found / read-failed / unsupported` 的原始 reason，避免只展示“无结果”。

## 本轮未改业务代码、未提交 git 的说明

本轮仅新增 `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/micro-rounds/round-30.md` 并更新 `.codexpotter` 进度记录。

未修改业务代码，未修改 `01-11` 主分析文档，未修改 `docs/INDEX.md`、README、TODO、CHANGES，未执行 git commit / push / branch / reset / checkout / 工作树清理。
