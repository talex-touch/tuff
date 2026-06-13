# 文档索引

> 更新时间：2026-06-13
> 定位：仓库文档导航。当前执行状态以 `docs/plan-prd/TODO.md` 为准，历史事实以 `docs/plan-prd/01-project/CHANGES.md` 为准。

## 主入口

- `docs/plan-prd/README.md` - PRD / 规划主索引。
- `docs/plan-prd/TODO.md` - 当前 2 周执行清单。
- `docs/plan-prd/01-project/CHANGES.md` - 近 30 天变更日志与历史归档入口。
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` - 产品总览与路线图。
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` - PRD 质量基线与门禁约束。
- `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md` - 长期债务池。
- `docs/engineering/README.md` - 工程过程资料索引。
- `docs/engineering/coreapp-ui-contract.md` - CoreApp UI Contract 与 TuffEx 渐进收口规则。

## 当前状态快照

- 当前基线：`2.4.10`（GitHub Release 与 Nexus release metadata sync 已成功）；当前代码版本与 tag 已到 `2.4.11-beta.7`，`2.4.11-beta.6` 发布后 Gate D strict 复核通过的证据仍作为最近完整发布链路记录；Nexus 资产 sha256/signatureUrl 与 signature endpoint 缺口仍按 release integrity debt 跟踪。
- 当前主线：`2.4.11` 关闭或显式降权剩余 legacy/compat/size 债务，补齐 Windows/macOS release-blocking 回归；Linux best-effort。CoreBox app launch handoff 已补 immediate hide，避免慢启动期间 launcher 可见卡死；AI compat 生产退役端点已钉住 HTTP `410` 与迁移目标，不再返回可消费占位 payload。
- 下一版本门槛：`2.5.0` AI 桌面入口收口，Stable 只承诺文本 + OCR；Workflow/Skills/Automation 保持 Beta。
- CoreApp 性能当前切片：2026-05-28 已新增启动、CoreBox 搜索、常驻 CPU/内存、构建与包体的第一轮性能基线执行计划，并新增 `build:vite` 与 `perf:bundle:size` 分析入口；当前不改变 `build`、`quality:pr` 或 `quality:release` 门禁。
- Nexus/Tuffex 文档当前切片：2026-05-27 已新增 Tuffex 组合界面教程、组件总览组合 Demo 与 ECharts-backed dashboard sparkline 通用组件，Credits/Storage/Overview 小趋势图已从手写 SVG 收敛为图表封装；2026-05-29 已新增 focused visual smoke 脚本覆盖 composition 五个组合 demo 的 375/768/1440、light/dark 与 reduced motion；2026-05-31 增量审计确认 TuffEx Tabs Fragment / async component name 修复方向正确并已补 focused test，TuffEx 组件子路径 exports、局部 `style.css` 生成和 `audit:exports` 已接入；2026-06-01 Nexus/Chrome CDP visual smoke 已采集 30/30 通过截图/JSON evidence，报告见 `output/playwright/tuffex-visual-smoke/2026-06-01/tuffex-composition-smoke-report.json`。
- 质量现状：PR lint 已收敛为 changed-file lint；`file-provider.ts` 编译边界已恢复（完整 `fileProvider` 导出），当前临时 master 已在干净依赖 worktree 通过 `pnpm quality:pr`（changed-file lint、`test:targeted`、CoreApp node/web typecheck）；2026-05-20 自动化审计未发现新的 P0 fixed fake-success，本轮已补 CoreBox app launch immediate-hide、MetaOverlay renderer action bridge、CoreApp secure-store `safeStorage` 优先后端与 Nexus retired intelligence endpoint 410 合同测试；2026-05-22 已继续推进 Assistant 剪贴板图片翻译 typed event、`smoke:assistant` 悬浮球/VoicePanel 可见入口 smoke、推荐上下文来源开关、可选 AI embedding/rerank fail-open 测试、壁纸个性化、设置页资产兼容提示、统一网络/代理高级设置入口、TuffEx 基础组件文档覆盖与 Nexus storage/upload lifecycle governance telemetry 与 telemetry-to-governance analytics 写入链路；2026-05-25 已完成 Nexus Data Governance / Provider Registry admin hydration 与 i18n 稳定化，focused governance test、file-scoped ESLint、`git diff --check` 与 `pnpm nexus:build` 通过；同日 `v2.4.11-beta.4` release workflow、GitHub Release、Nexus BETA latest 与 Cloudflare Pages `tuff` 生产部署已验证成功；同日 UI/兼容/占位/架构审计未发现新的 P0 fixed fake-success，但确认 legacy retained aliases、旧 snippets placeholder 插件、Nexus memory fallback 证据分层、preload debug `innerHTML`、dialog `v-html` 与 TuffEx visual smoke 是下一批高信号治理点；2026-05-26 已收口 preload debug panel 运行时日志安全渲染与同段 debug console 噪音；2026-05-29 增量审计继续未发现新的 P0 fixed fake-success，确认 Nexus/TuffEx 组合 demo 与 dashboard chart wrapper 改善 UI 完善度；同日已完成 legacy alias telemetry/hard-cut 判定记录、旧 snippets hidden/deprecated/replacedBy 退场、Nexus evidence source enum/UI 分层、dialog message 文本/可信 HTML 分流与 TuffEx composition visual smoke 脚本；同日 post-slice 复核继续确认无新增 P0 fixed fake-success；同日 `v2.4.11-beta.6` 发布成功并通过发布后 Gate D strict 复核，本地提交态 notes 已补齐，release manifest validator 与当前 workflow 资产命名对齐，Nexus sync 已修正 manifest redirect、metadata YAML 跳过与全 tag sha256 backfill；2026-06-01 TuffEx composition visual smoke 已在 Nexus/Chrome CDP 环境采集 30/30 通过截图/JSON evidence，作为 focused evidence 记录且不改变 `quality:pr` / `quality:release` 门禁；Windows App indexing / Everything registry PATH 探测 / CoreBox function key hardening / 手动文件索引完成通知仍需 Windows 真机 evidence；npm 公共包发布已新增 `publish:check` / packed manifest 防污染门禁，`@talex-touch/tuffex@0.3.7` 已清理 `catalog:` 依赖并等待具备 `@talex-touch` scope publish 权限的 `NPM_TOKEN` 发布；Data Governance 已有本地 Wrangler/Miniflare seeded admin 认证浏览器证据，但生产/preview 认证 operator evidence、live send、live object storage、production D1 migration/backfill 与真实 provider quota 仍未闭环；`touch-browser-bookmarks` 与 `touch-browser-data` 外链打开已纳入 `network.internet` capability 口径，展示期只做 non-mutating permission check，执行期 request/block；`touch-snipaste` shell capability、`touch-window-presets` 展示期权限请求、Browser Data source-level diagnostics、widget runtime sandbox、裸 console 与 SRP 大文件仍是优先治理点；`quality:release` 仍按全仓 lint/build 另行收口，需记录最近路径替代验证；旧 compat registry / legacy allowlist / size allowlist 已不在 live tree，治理以 `quality:pr`、`quality:release`、Windows acceptance verifier、最近路径测试与人工清单为准。
- 当前工作区口径：2026-06-13 `touch-music` / `touch-image` 已完成 starter asset、模板 README 与过时入口残留清理；`touch-music` 已从全量 `@talex-touch/tuffex/style.css` 切到 `base.css` + 组件子路径样式。下一步按 UI 语义控件、CLI publish evidence、平台真机 evidence 与 File write/store boundary 排序推进。
- 2026-06-02 UI/兼容/占位复核：新增增量审计报告，继续未发现生产路径 P0 fixed fake-success；新增高信号点是 TuffEx `base.css` + 子路径 `style.css` + on-demand style plugin 的 dev/prod 一致性证据、旧 `style.css` public docs 推荐用法降级，以及自动化 shell 缺 `pnpm`/`corepack` 且 Node 为 Codex `v24.14.0` 的验证环境偏差。
- 2026-06-02 UI/安全实现切片：shared Markdown 默认 sanitize、Update release notes safe renderer、preload overlay DOM 构建、CoreApp `UiPreferenceStorage`、首批语义控件、Nexus local marker/privacy preference 口径与 cloud preset `not-shipped` unavailable contract 已落地；focused tests 已新增，需在 Volta Node `22.16.0` + `pnpm@10.32.1` 环境补跑。
- 2026-06-03 UI/兼容/占位复核：新增增量审计报告，继续未发现生产路径 P0 fixed fake-success；确认 Markdown sanitizer、preload DOM 构建、cloud preset fail-closed、TuffEx README 按需推荐已经进入实现切片。剩余高信号点是 Nexus content docs 旧 `@talex-touch/tuffex/style.css` 示例、TuffEx dev/prod 样式一致性验证、HTML trusted boundary、Widget runtime sandbox evidence 与 Windows/macOS 真机 evidence。
- 2026-06-04/05 UI/兼容/占位复核：新增增量审计报告，继续未发现生产路径 P0 fixed fake-success；Nexus TuffEx public docs 推荐示例已改为 `base.css` + 组件子路径 + 局部 `style.css`，旧 full `style.css` 只保留为迁移期兼容说明；Nexus `notesHtml` 已接共享 sanitizer。TuffEx `build` / 三个 audit、Nexus `typecheck` / `build` 与 PreviewSDK focused test 已在 Node `22.16.0` + pnpm `10.32.1` 通过；Nexus visual smoke 因无 CDP 浏览器服务与 3200 dev/preview server 未执行。剩余高信号点是 CoreApp/TuffEx dialog HTML boundary 与平台真机 evidence。
- 2026-06-06 UI/兼容/占位复核：新增增量审计报告，继续未发现生产路径 P0 fixed fake-success；escaped highlight / safe Markdown / AI answer escape 属受控 HTML 输出，`touch-intelligence` placeholder item 属空输入态。CoreApp/TuffEx dialog trusted HTML boundary 与 Widget runtime sandbox evidence 已完成 focused 切片；剩余高信号点是主路径 UI 语义控件与 Windows/macOS 真机 evidence。
- 2026-06-07 UI/兼容/占位复核：新增增量审计报告，继续未发现生产路径 P0 fixed fake-success；CLI publish 旧 token 交互刷新已落地，非交互仍 fail-closed；剩余高信号点是 UI 语义控件、CLI publish evidence、Windows/macOS 真机 evidence 与 File write/store boundary。
- 2026-06-13 UI/兼容/占位复核：`touch-music` / `touch-image` starter asset、模板 README、过时临时文件与 `touch-music` 全量 TuffEx 样式入口已完成清理；继续未发现新的生产路径 P0 fixed fake-success。剩余高信号点是 UI 语义控件、CLI publish evidence、Windows/macOS 真机 evidence 与 File write/store boundary。
- 当前索引 goal：P1-APP-DATA 继续统一 Search Provider / Indexed Source / Indexing Runtime SDK 抽象；已完成 provider SDK、插件 provider 权限 gate、Settings enable/order、source-to-provider link、File progress ETA、Browser Bookmarks consent skeleton 与 Quicklinks linked provider enablement。下一批在 UI 语义与示例插件小切片后，继续按 File write/store boundary、Browser Bookmarks 官方插件 lifecycle、Everything、Quicklinks feed/UI evidence、Browser History/System Settings/Obsidian/VSCode 推进。

## 高价值专题入口

- `docs/plan-prd/02-architecture/UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md` - Legacy/兼容/结构治理统一实施 PRD。
- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md` - Tuff 2.5.0 AI 桌面入口收口 Plan PRD。
- `docs/plan-prd/03-features/ai-2.5.3-local-knowledge-retrieval-prd.md` - Tuff 2.5.3 本地知识检索与上下文构建 PRD。
- `docs/plan-prd/03-features/ai-2.5.5-local-model-runtime-prd.md` - Tuff 2.5.5 本地开源模型运行时 PRD。
- `docs/plan-prd/03-features/ai-2.5.8-asr-provider-runtime-prd.md` - Tuff 2.5.8 ASR Provider Runtime PRD。
- `docs/plan-prd/03-features/cloudshare-plugin-content-prd.md` - CloudShare 插件内容包发布与 Store 展示 PRD。
- `docs/plan-prd/03-features/search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md` - App Data Plugins 与 Everything 收口 Roadmap。
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md` - Indexing Runtime V1 统一搜索源、监听、补漏与诊断计划。
- `docs/plan-prd/03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md` - Raycast / uTools 常用能力差距矩阵。
- `docs/plan-prd/03-features/search/competitive-analysis-2026-05-22/10-execution-roadmap-synthesis.md` - Raycast / Alfred / uTools 竞品分析执行路线与 100 轮审计入口。
- `docs/plan-prd/02-architecture/intelligence-power-generic-api-prd.md` - Intelligence 能力路由与 Provider 抽象。
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md` - Nexus Provider 聚合与 Scene 编排重构 PRD。
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md` - Nexus Data Governance 当前 8 项进度快照。
- `docs/plan-prd/04-implementation/NexusStorageGovernanceRunbook-2026-05-24.md` - Nexus storage channel sizing、smoke 与告警响应 runbook。
- `docs/plan-prd/04-implementation/NexusNotificationGovernanceRunbook-2026-05-24.md` - Nexus notification channel 配置、live-send evidence 与隐私审计 runbook。
- `docs/plan-prd/report/cross-platform-compat-placeholder-deep-review-2026-05-13.md` - 跨平台兼容与占位实现深度复核报告。
- `docs/plan-prd/report/cross-platform-compat-placeholder-followup-2026-05-14.md` - 跨平台兼容与占位实现跟进报告。
- `docs/plan-prd/report/cross-platform-compat-placeholder-summary-2026-05-15.md` - 跨平台兼容、占位实现与治理口径总结。
- `docs/plan-prd/report/cross-platform-compat-placeholder-deep-audit-2026-05-16.md` - 跨平台兼容、占位实现与架构健壮性深度审计。
- `docs/plan-prd/report/cross-platform-compat-placeholder-incremental-audit-2026-05-19.md` - 跨平台兼容、占位实现与架构健壮性增量审计。
- `docs/plan-prd/report/cross-platform-compat-placeholder-automation-audit-2026-05-20.md` - 跨平台兼容、占位实现与架构健壮性自动化审计。
- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-05-25.md` - 跨平台兼容、占位实现、UI 适配与架构健壮性审计。
- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-05-29.md` - 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计。
- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-post-slice-review-2026-05-29.md` - UI/兼容/占位与架构健壮性后续复核。
- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-05-30.md` - 跨平台兼容、占位实现、UI 适配与架构健壮性自动化增量审计。
- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-05-31.md` - 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计。
- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-01.md` - 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计。
- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-02.md` - 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计。
- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-03.md` - 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计。
- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-04.md` - 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计。
- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-06.md` - 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计。
- `docs/plan-prd/report/cross-platform-compat-placeholder-ui-architecture-audit-2026-06-07.md` - 跨平台兼容、占位实现、UI 适配与架构健壮性增量审计。
- `docs/plan-prd/04-implementation/performance/CoreAppPerformanceBaseline-2026-05-28.md` - CoreApp 启动、CoreBox 搜索、常驻 CPU/内存、构建与包体第一轮性能基线与优化门槛。
- `docs/plan-prd/report/coreapp-startup-async-blocking-analysis-2026-05-13.md` - CoreApp 启动异步化与首屏卡顿分析。
- `docs/plan-prd/report/performance-audit-2026-06-07.md` - 搜索/索引/IPC/启动性能审计与本轮优化（debounce 调优、结果渲染上限、scanDirectory 重构、InteractiveTerminal 泄漏修复）。
- `docs/plan-prd/04-implementation/ActiveGoalClosure-2026-05-23.md` - 当前 2.4.11 稳定化、插件 capability 与后续 Intelligence 小切片执行顺序。
- `docs/plan-prd/04-implementation/ActiveGoalBranchCleanup-2026-05-23.md` - 当前 goal 进度与截图分支清理记录。
- `docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md` - Nexus 设备授权风控实施方案。
- `docs/plan-prd/docs/NEXUS-RELEASE-ASSETS-CHECKLIST.md` - Release assets 核对入口。
- `retired-ai-app/deploy/README.zh-CN.md` - AI 1Panel 部署手册。
- 2.5.0 Intelligence 当前切片：CoreBox AI Ask handoff session、Nexus `/api/v1/intelligence/invoke` credits 扣减与 CoreApp credits summary、Tuff-native Tool Kit foundation、Nexus docs prerender、OmniPanel Writing Tools、Workflow service、agent/tool channels 与 Assistant typed transport 已进入 dev 分支；AI 不是空壳，但仍缺 packaged Electron 文本/OCR成功与失败路径证据，不能标记为体验闭环。下一步优先补 CoreBox AI Ask 文本/OCR、OmniPanel Writing Tools、Nexus invoke 未登录/provider 不可用/quota 不足/model 不支持、provider metadata chips 与 packaged Electron UI evidence；仍不得抢占 `2.4.11` 稳定化与债务退场主线。
- 2.5.3 本地知识方向：SQLite / FTS5 / metadata / Context Builder 优先，embeddings 与 rerank 作为增强项，不把向量数据库作为 MVP 第一优先级。
- 2.5.5 本地模型方向：不强依赖 Ollama，优先内置 GGUF / `llama.cpp` runtime；Ollama 仅作为可选兼容后端，模型权重按需下载到用户数据目录。
- 2.5.8 ASR 方向：本地 `whisper.cpp` + 云端 ASR provider 抽象，支持 `local-only/cloud-only/auto`；TTS 不进入 Stable。
- Nexus Provider Registry / Scene 编排：Provider 列表已暴露 capability adapter readiness，能在运行前标出声明能力缺少可执行 Scene adapter 的配置风险；真实 adapter 执行仍由 Scene Orchestrator 负责。
- Nexus 数据治理方向：Data Governance 已覆盖治理事件/config、dashboard analytics、访问/搜索/signup/plugin analytics、上传 retry/problem attempts、通知健康/channel-test/delivery evidence、存储策略/告警、local/memory storage smoke evidence、Provider usage/quota、operations summary、secure credential reference 与 object storage executor；direct invoke quota 与 Provider Registry quota admin 已并入同一治理口径；2026-05-25 已补 admin hydration / locale reconciliation / i18n 字典稳定化，并完成本地 Wrangler Pages runtime + Miniflare D1 seeded admin 的认证 cockpit 浏览器证据，详细历史以 `docs/plan-prd/01-project/CHANGES.md` 为准。
- Nexus 数据治理当前缺口：生产/preview 认证 operator evidence、真实凭据/live send、SMTP socket 或托管 relay、Web Push 生产 VAPID/relay、R2/S3/OSS live storage、生产 D1 migration/backfill、真实 provider quota fail-closed 与更深运营大屏。
- App Data Plugins 与 Everything 方向：先建立统一数据源/索引诊断基线；Calculator 显式入口、`touch-snippets` date/time/uuid/clipboard 首批 placeholders、`touch-emoji-symbols` 首版 emoji/symbol 搜索复制已落地，Browser Data 已有 source-level diagnostics 与书签 URL 打开 `network.internet` gate。当前第一优先级是 File write/store boundary 迁移，其次 Browser Bookmarks 从 CoreApp skeleton 走向官方 `touch-browser-data` runtime source lifecycle，再补 Everything registry PATH、Windows App indexing、手动文件索引完成通知与 Quicklinks feed/UI evidence；不包含更新系统 Nexus Hard-Cut。
- 插件 capability 诊断方向：shell/OS/network 类外部动作继续补展示期 non-mutating capability metadata、执行期 request/block 状态与 focused tests；`touch-browser-bookmarks` 与 `touch-browser-data` 外链打开已纳入 `network.internet` 口径。
- 插件发布当前切片：`touch-intelligence` 已补齐 Nexus 发布资产并修复 1.0.0 运行时加载源码 TS 的问题；1.0.1 包使用 bundled prelude 与 `@talex-touch/tuff-intelligence/client` CJS 入口，可重新发布到 Nexus；公共 npm 子包补发仍等待具备 `@talex-touch` publish 权限的 `NPM_TOKEN`。

## 归档与降权

- `docs/plan-prd/05-archive/*` - 历史 PRD 归档，不参与当前里程碑状态统计。
- `docs/plan-prd/next-edit/*` - 草稿池，不作为发布判定来源。
- `docs/plan-prd/docs/archive/TODO-pre-compression-2026-05-14.md` - TODO 压缩前快照。
- `docs/plan-prd/01-project/archive/changes/CHANGES-pre-doc-compression-2026-05-14.md` - CHANGES 压缩前快照。
- `docs/plan-prd/docs/archive/PRD-QUALITY-BASELINE-pre-compression-2026-05-14.md` - 质量基线压缩前快照。
- `docs/plan-prd/01-project/archive/PRODUCT-OVERVIEW-ROADMAP-2026Q1-pre-compression-2026-05-14.md` - 路线图压缩前快照。
- `docs/engineering/archive/README-pre-compression-2026-05-14.md` - Engineering README 压缩前快照。
- `docs/engineering/archive/ARCHIVE-pre-compression-2026-05-14.md` - Engineering ARCHIVE 压缩前快照。

## 文档维护规则

- 行为/接口/架构变更至少同步 `README / TODO / CHANGES / INDEX` 之一。
- 目标或质量门禁变化必须同步 Roadmap 与 Quality Baseline。
- 入口文档不承载长历史；长尾任务进入长期债务池，历史事实进入 CHANGES 或 archive。
