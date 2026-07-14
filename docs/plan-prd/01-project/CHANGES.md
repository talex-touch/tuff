# 变更日志

> 更新时间：2026-07-13
> 定位：只保留当前阶段的高信号变更索引。更早流水记录已从文档树移除，可从 Git 历史追溯。

## 2026-07-13

### corebox: preserve programmatic query context

- Typed `setQuery` transport requests now carry optional `TuffContext` through the main-process renderer bridge, and CoreBox attaches that context only to the forced search triggered by the programmatic query.
- Plugin feature activation keeps an immutable submission snapshot while widget render metadata refreshes, preventing a refreshed custom-render item from replacing the feature payload executed by the plugin.
- Added focused plugin window boundary coverage and aligned Nexus governance source contracts with their extracted shared types and formatters.

## 2026-07-11

### workspace: complete renderer and package optimization wave

- Added the repository-wide HTML dry-run audit at `docs/engineering/reports/optimization-dry-run-2026-07-11/index.html`, covering renderer complexity, Tuffex delegation, shared-utils candidates, OSAdapter bypasses, monolith boundaries, package naming, and generated artifacts.
- Extracted stateful renderer logic into focused CoreApp/Nexus/plugin composables, including user identity, dialog interaction/autosizing, locale orchestration, provider-registry administration, analytics data, and word-lyric runtime behavior.
- Migrated duplicated UI primitives to `@talex-touch/tuffex`, removed legacy wrapper files/callers, and added parity contracts for button, checkbox, icon, tag, tabs, and progress behavior.
- Consolidated canonical sleep, plugin image-data URL handling, indexing snapshot cloning, and environment/OSAdapter capabilities in `@talex-touch/utils`; system actions and app launching now route through typed adapters instead of local platform branching.
- Split the plugin transport, app provider, QuickOps, search/indexing, updater, governance, analytics, and provider-registry monoliths by runtime responsibility while preserving public behavior through focused contracts.
- Normalized package-backed plugin names, moved the internal analysis app to `apps/tuff-analyse`, promoted the builder example to `examples/tuff-builder.example.ts`, and removed approved generated outputs; CoreApp now exposes the documented package typecheck script.

### corebox: unify AutoPaste freshness gating

- CoreBox renderer hooks now share one clipboard freshness predicate and track whether active clipboard state came from implicit AutoPaste or an explicit user action.
- Hidden clipboard changes no longer populate active renderer state directly; shortcut reopen and implicit search refresh both reject ineligible or expired clipboard items, while explicit paste and plugin execution retain manual clipboard semantics.

## 2026-07-07

### nexus: bound plugin store APIs

- `/api/store/search` now uses `searchStorePlugins` instead of loading every store plugin/version into the route handler; D1 mode pushes approval/category/keyword filters, latest visible approved version selection, total count, and limit/offset into SQL.
- `/api/store/plugins` now reuses the bounded store list helper with limit/offset metadata; compact listing returns only latest-version card fields, while non-compact D1 responses hydrate approved versions only for the current bounded page.
- Added store-search D1 indexes for approved plugin/category listing and approved version lookup, plus focused Nexus tests for D1 binding/mapping, memory fallback pagination/latest-version semantics, route pagination clamps, compact field trimming, and bounded D1 version hydration.
- Store front page now consumes compact `/api/store/search` directly with remote debounce, server-side category/keyword refresh, and offset-based "load more" pagination, so first paint no longer depends on fetching all store plugins for local filtering.
- Store front page detail overlay now lazy-loads the dialog, tab shell, metadata header, and shared detail renderers only when a plugin detail is requested, keeping interaction-only plugin detail code out of the initial store page import graph.

### nexus: trim dashboard first-visit imports

- Dashboard devices page now lazy-loads `GeoLeafletMap.client.vue` only when a device map is expanded, keeping Leaflet map code out of the first-visit synchronous import graph; added a focused performance boundary test for the lazy map contract.
- Dashboard overview page now lazy-loads `DashboardSparklineChart.client.vue` and `GeoLeafletMap.client.vue`, keeping ECharts/Leaflet client widgets behind the chart/map render boundary instead of the page's synchronous imports.
- Dashboard storage page now lazy-loads the sync details `FlipDialog` and sparkline chart client only when their UI boundaries render, trimming dialog/chart code from the storage route's first-visit synchronous imports.
- Dashboard team page now lazy-loads team action `FlipDialog` overlays and the credit trend sparkline client at their render boundaries, avoiding modal/chart code in the team route's first-visit synchronous imports.
- Dashboard account page now lazy-loads the profile edit `FlipDialog` only when the edit overlay opens, keeping dialog code out of the account route's first-visit synchronous imports.
- Dashboard notifications page now lazy-loads the browser setup `FlipDialog` only when the setup overlay opens, while keeping the setup trigger in the initial page without dialog code.
- Dashboard OAuth page now lazy-loads the create-app `FlipDialog` only when the create dialog opens, while keeping the primary create trigger in the route's initial UI.
- Dashboard API keys page now lazy-loads the create-key `FlipDialog` only when a create overlay opens, preserving both populated and empty-state create triggers without dialog code in the initial route graph.
- Dashboard admin analytics page now lazy-loads the geo `GeoLeafletMap.client.vue` widget behind the geo analytics data boundary, avoiding Leaflet code in the analytics route's initial synchronous imports.

### corebox: bound subsequence fallback scans

- SearchIndex subsequence fallback now pushes the subsequence shape into SQLite with an escaped `LIKE` prefilter, deterministic short-keyword ordering, and a hard 2k scan cap before JS scoring, reducing hot-path keyword rows scored in memory while preserving fuzzy recall.
- Added focused CoreApp coverage for LIKE prefilter generation, scan-limit clamping, and fallback result ordering.

### corebox: parallelize hot search-index reads

- AppProvider 与 FileProvider 搜索首段 now dispatch exact keyword lookup, short-query prefix lookup, and FTS lookup together, so independent SQLite/SearchIndex reads overlap instead of stacking on the user-visible `onSearch` path.
- Added deterministic CoreApp tests proving prefix/FTS reads start before exact lookup resolves; n-gram/subsequence fallback remains gated after first-pass candidate aggregation.
- AppProvider and FileProvider search now observe `AbortSignal` before starting search-index work, after parallel candidate reads, and after candidate DB fetch/processing boundaries, avoiding stale query row loads/scoring when CoreBox supersedes app/file searches.
- Search gatherer now gives each provider call a per-task `AbortSignal`, aborts it on provider timeout, and clears fast-layer timeout timers once fast providers complete, so timed-out fast/deferred providers stop stale work and completed fast searches do not leave extra pending timers.

### nexus: bound intelligence chat and provider probe streams

- `/api/admin/intelligence/chat` and `/api/dashboard/intelligence/providers/:id/probe-stream` now clamp provider/request stream timeouts to 5s–120s and apply them to stream open plus per-chunk waits, so stalled LLM providers produce typed SSE errors and close instead of leaving callers waiting indefinitely.
- LangChain provider clients now use static imports and pass timeout through OpenAI/Anthropic-supported config paths; added focused fake-timer utility coverage for bounded promises and async iterables.

### intelligence: surface orchestration decisions as AEP events

- `@talex-touch/tuff-intelligence` now dispatches `skillRequests` and `subAgentTasks` from normalized agent decisions as first-class AEP runtime envelopes (`skill.request` / `subagent.task`) instead of silently dropping them.
- Added focused DecisionDispatcher coverage that preserves request/task payload identity and correlation ids, giving CoreApp/Nexus callers a stable hook for LangChain/DeepAgent-style skill loading and delegated agent execution.

### nexus: bound shared runtime bridge stalls

- Nexus intelligence-agent shared runtime bridge now enforces a bounded AEP stream timeout, emits a `shared_runtime_timeout` error event, and persists failed runtime session state instead of letting `/api/admin/intelligence-agent/session/stream` callers wait indefinitely.
- Added focused bridge tests covering the successful shared AEP stream path and a fake-timer never-yielding runtime stream, locking the failed metrics/session behavior without sleeping in real time.

### corebox: avoid stale file search cleanup waits

- FileProvider search now schedules stale search-index candidate removal off the user-visible `onSearch` path, so missing DB rows no longer make file search wait on FTS cleanup or worker initialization latency.
- Added focused CoreApp coverage where stale candidate cleanup never settles; `onSearch` still returns an empty result promptly while scheduling `removeProviderItems` best-effort cleanup.

### corebox: batch app search exact keyword lookup

- AppProvider 多词精确搜索复用现有 `SearchIndexService.lookupByKeywords` 批量查询，一次读取 term / phrase 命中集合，避免按 term 并发打 `keyword_mappings` 查询造成可感知延迟与 SQLite 读放大。
- 新增 focused AppProvider 测试，锁定多词交集语义、phrase lookup 复用 batch 结果、候选加载仍只返回共同命中应用，并确保旧的 per-term `db.select({ itemId })` 路径会失败。

### corebox: align AutoPaste freshness behavior

- AutoPaste 快捷键唤起时刷新剪贴板快照，并统一以 `freshnessBaseAt` / `observedAt` 判断新鲜度；超过 `autoPaste.time` 的旧内容不会再经由短文本或重复长文本路径自动填入。
- `autoPaste.time = 0` 明确保留为无限制，`-1` 为关闭；Nexus CoreBox 架构文档同步为当前实际行为。

## 2026-07-04

### docs: add stability and architecture optimization entry

- 新增 `docs/plan-prd/04-implementation/Stability-Architecture-Optimization-2026-07-04.md`，把当前文档读取顺序、稳定性优先级、架构代码优化落点、执行切片和最小验证矩阵集中到一个实施入口。
- 同步 `docs/plan-prd/README.md`、`docs/INDEX.md` 与 `docs/plan-prd/04-implementation/README.md`，让稳定性 / 架构优化入口可从主文档索引进入。
- 修正 `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` 的当前执行版本口径，移除过期本地 `HEAD` / dirty worktree 描述，避免长期质量基线承载易漂移环境事实。

## 2026-06-24

### coreapp: close app-index workbench visible evidence

- `app-index-workbench` visible surface 标记为 `passed`，绑定 `app-index-workbench-summary-2026-06-24.*`、`app-index-workbench-filtered-empty-2026-06-24.*`、probe JSON 与 diagnostic JSON。
- 新增 packaged App Index workbench probe，使用 isolated userData、真实 Settings -> File Index -> App Index Manager UI、typed appIndex transport 与 isolated SQLite fallback 覆盖 UWP/Store、Steam、shortcut、protocol、AppRef、path source filters。
- 诊断证据覆盖 found / unchecked / disabled / attention 状态，`app-index:diagnostic:verify` 通过；strict visible gate 仍因 Assistant / Workflow / Provider broader surfaces pending 失败，但不再列出 `app-index-workbench`。

### coreapp: close browser login recovery visible evidence

- `browser-login-recovery` visible surface 标记为 `passed`，绑定 `login-browser-open-failure.png/json` 与 `login-timeout-or-network-failure.png/json`。
- 新增 packaged login recovery probe，覆盖 browser-open failure waiting session、manual login URL / short code copy action、timeout retry 文案与 network failure copy JSON。
- `useAuth` 登录恢复状态机补齐 callback resolve 时清理 countdown interval、retry reopen 失败进入 failed 状态。

### docs: stage remaining execution batches

- `TODO.md` 新增分批执行计划，把 30min 侦察批、2-5h R2 surface、半天批、R3 durable 设计批与高风险 migration 设计批拆开，明确每批交付物和文档落点。
- `TODO-AI.md` 新增 R2 visible gate 执行梯队，按 `browser-login-recovery`、`app-index-workbench`、Provider / OmniPanel / Assistant surfaces、长链路 surfaces 排序，并写明每个 surface 的关账条件。
- `TODO-R3.md` 新增 durable job history 最小设计，限定在 runtime task/job history 与 Settings diagnostics evidence，不进入 SQLite/FTS ownership 或 `scan_progress` schema migration 实现。

### corebox: add tool-only app search source aliases

- App Index 增加 tool-only source/alias catalog，先覆盖开发工具、IM、设计工具三类以及 Photoshop、Codex、VSCode、飞书、微信、Telegram 高频工具。
- CoreBox app 搜索将 `im`、`design`、`ps`、`codex` 归入稳定 alias 命中，并在结果 metadata 中暴露 `toolSources` 与更准确的 `alias` match source。
- Indexed Source diagnostics 增加 `app-provider:tool-sources` evidence，便于确认工具 source/alias catalog 的覆盖范围和版本。

### docs: draft OmniPanel and assistant next PRD

- 新增 `docs/plan-prd/03-features/omnipanel-assistant-next-prd.md`，梳理 OmniPanel、悬浮助手、桌面烟花、性能优化与截图翻译逐步引入的下一版本 PRD。
- 新增 `.spec-workflow/specs/omnipanel-assistant-next/requirements.md`，按 spec workflow 记录 EARS 风格需求与非功能约束。
- 同步 `docs/plan-prd/README.md` 与 `docs/INDEX.md` 高价值专题入口。

## 2026-06-22

### nexus: harden privacy export and account deletion flow

- 隐私数据导出改为 `privacy_export_jobs` 异步任务，Dashboard 创建 job 后轮询状态，成功后通过下载端点取得 JSON 附件。
- 账号注销改为 30 天冷静期：提交后进入 `deletion_pending`，普通会话、App Token 与 API Key 访问被拒绝，30 天内真实登录会自动恢复为 `active`。
- 注销确认新增服务端条款阅读会话，前端弹出详细条款与确认短语，后端强制校验至少阅读 30 秒且 session 只能使用一次。

### release: bind real R1 gate-e evidence

- 对 `v2.4.12-beta.8` 执行 GitHub Release、Nexus release/latest/assets/download/signature endpoint 与 CoreApp signature verifier 复采。
- 证据落到 `docs/engineering/reports/release-integrity-2026-06-22/`，并同步 R1 Evidence Matrix。
- 当前真实链路结论：Nexus metadata/latest/assets/download 已通；GitHub manifest 存在；Gate E 仍被 `.sig/.asc` sidecar、manifest `signature` 字段、Nexus `signatureUrl/signatureKey` 与 signing public key 缺失阻塞。

### tuffex: stabilize select dynamic dropdown behavior

- `TuffSelect` 支持直接 `options` 数据源、loading / empty 状态与自定义 option/loading/empty slot。
- `TuffSelect` 增加多选标签返显、标签移除、自助创建、分组选项、自定义 footer 与 error / warning 状态。
- Select 选中反显改为基于 props options 与 slot item registry 的统一 label map，slot item 卸载时注销，避免动态选项旧状态残留。
- 下拉 spacing 收敛为 content / option padding，动画 duration 默认缩短并支持透传 animation。
- `TxBaseAnchor` 在 reference / content 尺寸变化时同步刷新 floating 位置与轮廓尺寸。
- disabled Select 触发器统一整块 `not-allowed` 光标，避免只有边缘显示禁用光标。

## 2026-06-21

### nexus: standardize provider registry admin workspace

- 服务渠道页改为 TuffEx 统计卡、标准 `TxDataTable` 列表与 `TxDrawer` 添加/编辑抽屉。
- Provider、能力与 Scene 统一为 list CRUD 工作台，用量与健康记录改为只读表格。
- 创建服务渠道改为「服务大类 -> adapter」二级选择，并补齐 AI / Exchange / Screenshot / Translation 分类模板与 OpenAI Responses adapter。
- 补齐服务渠道相关中英文 i18n，将中文界面的 Provider / Scene / dry-run / adapter 等混排文案收敛为中文术语。

### nexus: merge AI credits into user management

- Dashboard 工作台与 Intelligence 管理页移除独立 AI 积分入口，旧积分路由改为跳转到账号/用户管理。
- 用户管理编辑抽屉新增所选用户积分摘要、最近流水与管理员增减积分操作。
- 新增管理员用户积分 GET/PATCH API，积分调整写入 credit ledger 与 admin audit，并限制减少额度不能低于已用积分。

### nexus: expose account details in settings

- `dashboard/account` 新增「详情信息」Tab，按行展示账号 ID、邮箱、角色、语言偏好、创建时间与最近更新，并支持点击复制 ID / 邮箱。
- `/api/user/me` 补充 `status`、`createdAt`、`updatedAt`，其中 `updatedAt` 来自现有用户/凭据/OAuth/Passkey 记录的只读聚合。

### docs: clean reports and evidence

- 删除 6 月以前的 reports / audits / historical snapshots / pre-compression archives。
- 将 6 月 evidence 中的 `raw`、`logs`、`user-data` 等运行态产物移出仓库文档树，保留到本地忽略目录 `.doc.local/docs-evidence/`。
- 更新 `.gitignore`，阻止 `docs/engineering/reports/**` 下的 Chromium profile、GPUCache、Cookies、SQLite DB、`.key`、logs 与 raw 产物进入提交。
- `docs` 目录体积从约 `111M` 降到约 `11M`；`docs/engineering/reports` 从约 `102M` 降到约 `2.2M`。

### corebox: keep text search independent from stale clipboard images

- 普通文本搜索默认不携带 stale clipboard image input。
- 空查询、插件/AI send-mode 或显式 `includeClipboardImage=true` 仍可带图片输入。
- no-result 空态保留 retry 与 File Index settings action，并在空态 DOM 落地后触发布局刷新。
- 代码侧验证通过 focused CoreBox tests、CoreApp typecheck 与 `build:unpack`。
- 2026-06-22 R2D packaged 复采通过本机 Apple Development 签名绕过 macOS 启动阻断，并修复普通 `core-box` 可见搜索态 resize 链路；`corebox-search-states` 已取得 idle、searching/warm-up 与 no-result retry/File Index settings 可接受截图。该 surface 仍保持 pending，因为 isolated packaged profile 无 result rows，source/status/reason pills 仍缺真实可见样本，采集期间 app scanner 报 `spawn EBADF`。
- 2026-06-22 R2I packaged 复采关闭 `corebox-search-states`：`set-query` 会强制触发搜索并在 accept 后派发布局刷新，CoreBox manager 会在内部 `_show=true` 但 BrowserWindow 实际 hidden 时重试 show；真实 `screenshot` 查询让窗口从 `720x56` resize 到 `720x242`，并采到 source/status/reason pills 无重叠的可见截图。
- 2026-06-22 R3 非 schema runtime-store 小切片完成：FileProvider incremental DB persist、FTS write/delete 与 index worker flush 现在统一进入 indexed source runtime/store evidence；未触碰 `scan_progress` schema migration。

### ai: pass CoreBox AI Ask packaged stable surface

- `AI-STABLE-01/02/03/04/05/06/07/08` 已绑定独立 packaged probe JSON + PNG artifacts。
- CoreBox AI Ask packaged surface 已标记 `passed`。
- 已覆盖 text.chat success、OCR handoff、logged-out、provider unavailable、quota exhausted、model/capability unsupported、copy failure visible、Local/Ollama routing。
- global strict visible gate 仍按预期失败，剩余 search/app-index/login/OmniPanel/Assistant/Workflow/Provider broader surfaces pending。

### startup: bind packaged startup evidence

- packaged hot startup benchmark：10/10 passed，Startup health P50 `552ms`，P95 `810ms`，0 WARN / 0 ERROR。
- packaged cold startup benchmark：10/10 passed，Startup health P50 `572ms`，P95 `615ms`，0 WARN / 0 ERROR。
- startup first-screen evidence 证明 Settings/onboarding 首屏可用，Startup health summary 可达。

### roadmap: current execution handoff

- 当前 SoT 统一到 `Roadmap-vNext-2026-06-18.md`、`Current-Execution-Plan-2026-06-17.md`、`TODO.md`、`TODO-AI.md`、`TODO-R3.md`。
- R1 Release Integrity 仍需真实 GitHub Release ↔ Nexus endpoint/signature matrix。
- R2 AI Stable CoreBox AI Ask 已通过，global visible gate 仍 pending。
- R3 仍按约 `70%`，剩余 runtime-store migration、source-scoped `scan_progress`、durable scheduler evidence。
- Nexus 性能线单独收敛到 `TODO-nexus.md`，不与 CoreApp / AI / R3 dirty files 混批。

### release: advance R1 integrity chain

- GitHub update provider 保留 artifact `.sig` 到 `DownloadAsset.signatureUrl`。
- Nexus release asset metadata 增加 `signatureKey` / `signatureUrl`，只暴露真实记录的 signature endpoint 或 GitHub HTTPS signature URL。
- Nexus signature endpoint 改为读取记录的 `signatureKey`，避免凭 `${fileKey}.sig` 猜测导致 metadata 指向 404。
- 新增 `Evidence-Matrix-Release-Integrity-2026-06-21.md` 记录 focused matrix；Gate E 仍等待真实 GitHub Release ↔ Nexus endpoint/download/signature 运行证据。

### nexus: refine global search surface

- Nexus 全局搜索从 header 搜索按钮 FLIP/GSAP 展开到最终命令面板。
- 空查询默认展示热点入口，并在底部显示快捷键提示与 `Powered by Tuff Intelligence.`。
- `TxCommandPalette` 增加 empty/footer slots 与 overlay/panel class props，用于业务侧克制扩展。

### nexus: align dashboard activity and device status

- Dashboard overview 下层活动流 / 设备状态与上层趋势卡片统一 `8/4` 栅格比例，修正两层卡片竖向对齐。
- 设备状态卡增加平台 brand icon，并优先展示最近访问 IP 与归属地。
- `auth_devices` 增加最近访问 IP / Geo 字段，设备 upsert 时记录真实请求来源；活动流合并最近登录与设备访问，避免有设备记录但活动流空置。

### nexus: update team invitation flow

- `dashboard/team` 将激活码兑换收敛为顶部按钮 + 弹窗，个人团队状态区隐藏角色与已激活席位。
- 团队邀请从公开邀请码输入改为按邮箱或用户 ID 定向发送；个人团队页展示收到的团队邀请。
- 接受团队邀请改为 `/team/join?invitation=...` 详情页，并在加入前强制 Passkey 二次验证。

### nexus: sync privacy settings through account API

- `dashboard/privacy` 的隐私偏好改为账号级服务端设置，不再使用浏览器 localStorage 作为 SoT。
- 新增 `/api/dashboard/privacy-settings` GET/PATCH，用于同步使用分析、崩溃报告、详细使用数据与个性化推荐偏好。
- `auth_users` 增加隐私偏好列并通过 schema hydration 自动补齐，页面文案调整为账号同步语义。

### nexus: normalize credits display

- credits 额度改为整数 credits 积分单位，Free 周期额度为 1000，认证后为 5000；团队池按旧比例放大到整数 credits 口径。
- 用户侧 credits 页面不再展示剩余或总 credits，只展示消耗百分比、消耗 credits 积分与单条流水消耗。
- 认证提升文案只说明会提升额度，不暴露具体提升后的额度数值。

### nexus: fix login history accuracy

- 登录历史将网页登录记录为 `web` 来源，避免密码登录被误标为 App。
- OAuth / Magic Link 成功登录补充写入历史，Passkey 登录去掉二段式 token 消费造成的重复成功记录。
- `/api/login-history` 仅返回脱敏 IP，Dashboard 登录历史与活动流统一展示 `ipMasked`。

## 当前文档入口

- Roadmap：`../04-implementation/Roadmap-vNext-2026-06-18.md`
- 当前计划：`../TODO.md`
- AI：`../TODO-AI.md`
- R3：`../TODO-R3.md`
- Nexus：`../TODO-nexus.md`
- Evidence Matrix：`../04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md`
