# Tuff 产品总览与 8 周路线图（2026-Q1）

> 更新时间：2026-05-13
> 适用范围：`apps/core-app`、`apps/nexus`、`apps/pilot`、`packages/*`、`plugins/*`

## 1. 产品总览（是什么）

Tuff（原 TalexTouch）是一个 **Local-first + AI-native + Plugin-extensible** 的桌面指令中心。  
它的定位不是单一启动器，而是“统一入口层”：

- 用一个入口完成应用/文件/命令/插件能力的检索与执行；
- 通过插件体系承载扩展能力，形成可演进生态；
- 通过 Flow / DivisionBox / Intelligence 形成跨能力协作链路；
- 用可信发布与同步能力保障可持续交付。

## 2. 最终目标（North Star）

> 目标窗口：2026 年上半年（截至 2026-06-30）

### G1. 架构目标（可维护）
- 完成 SDK Hard-Cut（E~F），高频链路不再直连 legacy channel。
- renderer/main/plugin 的跨层调用统一走 typed transport/domain SDK。

### G2. 质量目标（可回归）
- `apps/core-app` 关键质量门禁长期可通过：`typecheck:node`、`typecheck:web`、定向 lint、关键测试。
- 核心链路（插件加载、搜索执行、Flow 会话、更新下载）具备稳定回归用例。

### G3. 发布目标（可可信）
- 发布链路完成 OIDC + RSA 官方构建验证；
- `build-and-release` 作为唯一桌面发版主线，Release notes 与 assets 自动同步 Nexus，结构统一为 `{ zh, en }`。
- CLI 四包 npm 自动发布（稳定版 `latest`，预发布 `next`）且同步 Nexus 更新公告。

### G4. 产品目标（可闭环）
- Flow / DivisionBox / Intelligence 的体验闭环完成（功能、权限、审计、文档、示例）。
- 保持“核心框架稳定 + 插件能力持续外移”的演进方向。

### G5. Pilot 目标（可独立部署）
- `apps/pilot` 形成独立 Chat-first 入口，复用 Intelligence Provider/Quota/Prompt 配置体系。
- 面向 Node Server 运行时提供长会话能力：SSE、checkpoint、pause/resume、`fromSeq` 补播。
- Pilot 路由 V2（模型目录 + 路由组合 + 渠道负载均衡）进入可观测运行态：可记录 `queue/ttft/total/success` 并驱动 `Quota Auto` 自动选路。

### G6. Nexus Provider 目标（可聚合）
- Nexus 升级为统一 Provider 聚合中心，Provider 独立声明 `Capability`，Scene 按使用场景自由组合能力与路由策略。
- 首版覆盖汇率、AI 大模型、文本翻译、图片/截图翻译；`exchangeRateService` 与 Nexus dashboard AI providers 后续迁移到通用 Provider registry。
- 截图翻译、划词翻译、CoreBox 汇率换算、AI Chat 与图片翻译 pin window 统一通过 Scene 编排、Strategy fallback、Metering 与 Audit 记录执行。
- Provider registry 只保存结构化元数据与 `authRef`，密钥留在系统安全存储；Usage Ledger / Audit Trace 不保存原始截图、图片、完整 prompt 或完整模型响应。

### G6.5 2.5.0 AI 目标（桌面入口收口）
- 2.5.0 AI 板块定位为桌面 AI 入口收口版本：CoreBox / OmniPanel 是用户主入口，Pilot 作为高级 Chat / DeepAgent 增强能力来源。
- Stable 只承诺文本 + OCR：`text.chat`、`text.translate`、`text.summarize`、`text.rewrite`、`code.explain`、`code.review`、`vision.ocr`。
- CoreBox AI Ask 已先落最小 Stable 切片：文本问题走 `text.chat`，剪贴板图片在空文本或显式 `ai` 提问时走 `vision.ocr -> text.chat`，并带用户可见状态、失败提示、权限检查与审计 metadata。
- 下个版本重点交付 OmniPanel Writing Tools、Workflow `Use Model` 节点、Review Queue、Desktop Context Capsule 与剪贴板整理/会议纪要/文本批处理 3 个 P0 模板。
- Skills Pack、Background Automations 与 Pilot 联动保持 Beta；Assistant、多模态生成编辑、多 Agent 长任务面板与 Nexus Scene runtime orchestration 保持 Experimental / 2.5.x 后续。
- Provider metadata 可普通存储，API Key / secret 必须通过 secure-store 或 `authRef` 引用；审计默认不保存完整 prompt / response。

### G7. 跨平台与真实能力目标（可解释）
- Windows/macOS release-blocking 能力必须有真实设备证据，Linux 保持 documented best-effort 且用户可见限制原因。
- 生产 API 禁止返回固定假值成功；能力不可用时必须返回 `unavailable + reason` 或显式错误码。
- 插件与 renderer 持久化不得绕过 Storage/Security 规则保存敏感本地路径、token、key 或业务明文。
- 2026-05-12 CI warning 迁移：GitHub Actions `uses:` 依赖已统一到 Node 24-compatible major baseline，消除 Node.js 20 action runtime deprecation warning；项目业务 Node runtime 仍固定为 `22.16.0`。
- 2026-05-12 发布链路收口：`build-and-release` 已显式支持 beta release type，`v*-beta*` tag 会进入 beta/pre-release 语义；CoreApp beta build 保留 `BETA` runtime metadata 并复用 snapshot packaging policy；主 PR CI 已从 `pull_request_target` 收窄为只读 `pull_request`，release artifact 上传只保留发布资产与 updater metadata。
- 2026-05-13 执行顺序已收紧：`2.4.10` 当前不再扩大功能范围，先完成 Windows acceptance collection plan、case/manual/performance evidence、`windows:acceptance:verify` final gate 与 Nexus Release Evidence 写入；Windows App Search & Launch Beta 的应用索引管理页、Steam 最小 provider 与 `protocol` 启动白名单已进入实现态，但 UWP/Store、Steam、手动条目搜索启动闭环仍必须补 Windows 真机 evidence；`2.5.0` AI、Provider Registry 高级策略、retained raw definition 后续迁移与 SRP 大拆分均不得抢占正式 `2.4.10` gate。
- 2026-05-13 CoreApp 启动异步化缺口已归档：`docs/plan-prd/report/coreapp-startup-async-blocking-analysis-2026-05-13.md` 确认当前仍存在 main modules 串行 `await`、Database/Extension/Intelligence 等非首屏任务进入 critical path、Search provider 启动后集中抢资源，以及 renderer mount 前等待 storage/plugin store 的问题；该项不抢当前 Windows evidence gate，后续按 P0 renderer plugin store 后台化、P1 非首屏模块 handler-first + background runtime、P2 Database critical/background 拆分、P3 Search provider 后台 ready 推进。
- 2026-05-11 治理切片已在第一治理切片基础上继续推进：`system:permission:*` / `omni-panel:feature:*` 三段 retained raw event 已无损迁到 typed builder，`typedMigrationCandidates` 当前为 `0`，retained raw definition 按测试扫描口径冻结为 `<=264`；`clipboard.ts` 已拆出 capture freshness、history persistence、transport handlers、autopaste automation、image persistence、polling policy、native watcher、meta persistence、stage-B enrichment 与 capture pipeline，并降到 `1143` 行清退 size exception；`app-provider.ts` 已拆出 path helper 与 source scanner facade，growth exception cap 收紧到 `3306`；`sdk-compat.ts` 已硬切为 `sdkapi-hard-cut-gate.ts`，Pilot `pilot-compat-*` 已硬切为领域服务命名；Tuffex `TxFlipOverlay.vue` 已拆出 stack helper 并清退 size exception；registry 当前 `36` 条、`compat-file=5`；重构期 质量入口已统一，lint 不再串全量架构债务，release 仍走 strict size/docs 门禁。

## 3. 质量约束（全项目强制）

### 3.1 代码质量门禁
- 不允许新增未类型约束的跨层调用（禁止新增 raw event 直连）。
- 新增模块必须提供最小可回归验证（lint/typecheck/test 至少 1 项）。
- 不得通过“关闭规则/降级配置”绕过质量问题（除非有明确豁免文档）。
- 兼容边界统一迁移到 ESLint：禁止新增 `channel.send('x:y')`、legacy transport/permission/channel import、旧 storage protocol、旧 SDK bypass 或伪成功兼容分支；确需例外只能通过明确 scoped ESLint override 承载并说明退场原因。
- runtime console / runtime boundary 统一迁移到 ESLint：CoreApp `main/preload/renderer` 新增裸 `console.*`、宽松 WebPreferences、裸 `ipcRenderer/ipcMain`、`window.touchChannel`、`window.$t/window.$i18n` 与旧 `/api/sync/*` 视为质量回退。
- 不再维护 compatibility registry / legacy allowlist / size allowlist；文件行数治理回到 code review 与普通 SRP 重构任务，发布质量入口以 `quality:pr` / `quality:release` 为准。
- CoreApp 平台适配门禁：`2.4.11` 前 Windows/macOS 为 release-blocking，必须完成搜索、应用扫描、托盘、更新、插件权限、安装卸载、退出释放回归；Linux 保留 `xdotool` / desktop environment documented best-effort，不作为 `2.4.10` blocker。
- CoreApp 启动关键路径约束：新增或调整启动期能力时，首屏前不得引入非必要 plugin list RPC、extension load、telemetry hydrate、agent/workflow runtime、update cache hydrate、OCR/native watcher 或长耗时同步 FS/DB 操作；必须采用 handler-first + background runtime，确需留在 critical path 的任务要记录依赖理由、耗时预算与回滚策略。
- Windows Everything target evidence 门禁：`--requireEverythingTargets` 必须复核基础 Everything 查询返回结果、目标 probe 命中、`matchCount` 为正，且至少一条 sample 文本包含目标关键词，避免弱 JSON 证据替代真实目标查询。
- Windows App Index diagnostic evidence 门禁：`app-index:diagnostic:verify` 与 acceptance case 复算必须从 stage targetHit / target itemId / matchCount 重新推导 query hit，并复核 input、diagnosis、suggested fields、app 与 reindex path 指向同一目标，避免只手工填写 `matchedStages` 或 caseId 的弱 JSON 通过。
- Windows copied app path 门禁：`windows:acceptance:verify` 最终命令必须携带 `--requireCopiedAppPathManualChecks` 与 `--requireCompletedManualEvidence`，用 checklist 全勾选且模板关键 Evidence 字段逐项填写的手工证据补齐复制源、加入本地启动区 action、reindex、indexed search result 与 indexed result launch evidence。
- Windows common app launch 门禁：微信/Codex/Apple Music 等目标 App 的手工 evidence 必须覆盖 observed display name、icon evidence、launch target、CoreBox hidden evidence、search query 与截图/录屏，禁止只靠布尔项或泛截图完成验收。
- Windows manual evidence 门禁：DivisionBox detached widget 必须在手工证据中记录 observed/expected pluginId、`detachedPayload` itemId/query 与 no-fallback 日志摘录；分时推荐必须记录 `timeSlot/dayOfWeek` cache key 与 recommendation trace 摘录，禁止只用泛化日志或截图替代关键事实。
- Windows update evidence 门禁：自动 installer handoff evidence 必须带非空 `downloadTaskId`，并用 `--requireInstalledVersionMatchesTarget` 复核安装后版本与下载目标版本一致，拒绝 cached release tag/channel 或 matching asset platform/arch/size 与 runtime target 漂移的 JSON。
- Windows update manual evidence 门禁：更新安装 Markdown 必须覆盖 UAC prompt、app exit、installer exit、installed version、app relaunch 与 failure rollback evidence，禁止只用 installer path/mode 或截图替代安装闭环。
- Windows performance evidence 门禁：`search-trace-stats/v1` 和 `clipboard-stress-summary/v1` 除 release 阈值外还必须通过计数一致性复算，拒绝 paired/sample/slow counter 漂移、无有效 clipboard 采样或 scheduler sample 超过 count 的弱证据。
- 假值/占位实现门禁：生产路径不得返回硬编码 Mock CPU、固定磁盘/内存、mock 支付 URL 等“假值成功”；开发 mock 必须由显式环境开关门控，不可用能力必须暴露 unavailable reason。
- retained raw event 指标门禁：`raw channel send` 违规与 retained `defineRawEvent` definition 分开统计；新增可 typed builder 表达的事件不得继续使用 raw definition；当前三段 migration candidate 必须保持 `0`。
- SRP/size 治理不再作为脚本门禁：后续通过 code review、targeted refactor 与最近路径测试控制大文件回潮。
- 网络边界硬约束：业务层禁止新增 direct `fetch/axios`，统一走 `@talex-touch/utils/network`（network 套件内部除外），由 ESLint 拦截。
- 统一质量入口：PR 使用 `pnpm quality:pr`，release/milestone 使用 `pnpm quality:release`。
- 桌面打包质量门禁必须覆盖 `PACKAGED_RUNTIME_MODULES` 的完整运行时依赖闭包；runtime module root 清单、平台 native 清单与闭包解析统一来源于 `apps/core-app/scripts/build-target/runtime-modules.js`，`ensure-runtime-modules`、`ensure-platform-modules`、`afterPack` 与 packaged verifier 不得各自维护模块发现逻辑。当前基线至少覆盖 Sentry/OpenTelemetry、LangChain 关键依赖（`@langchain/core`、`p-retry`、`retry`、`langsmith`）与 `compressing -> tar-stream -> readable-stream` 缺包闭包真实进入可解析产物路径，并以 hoisted/transitive dependency smoke contract 固定 pnpm 漏包场景。
- 对于显式落在 `resources/node_modules`，或因 asar 缺包被 promoted 到 `resources/node_modules` 的运行时模块，质量门禁必须递归校验其 dependencies 与必需 peer 闭包也位于 `resources/node_modules`，禁止“根模块存在但其二级/peer 依赖仍从 asar 漏解析”。
- 对于主进程在运行时直接加载的普通第三方包，质量门禁必须校验其传递依赖闭包已进入 `app.asar` 或 `resources/node_modules`，禁止留下只打进根包、未带闭包的半残产物。
- CoreApp 兼容硬切门禁：`window.$channel` 业务入口、legacy storage 协议（`storage:get/save/reload/save-sync/saveall`）、legacy `sdkapi` 放行逻辑必须保持 `0` 命中；新增插件/更新能力禁止“伪成功”返回。

### 3.2 架构约束
- 主流程优先复用 SDK 与现有模块，不允许重复造轮子。
- Storage 规则必须遵守：SQLite 为本地 SoT，JSON 仅作为同步载荷格式。
- i18n 必须走 hooks，不允许新增 `window.$t/window.$i18n` 直用。

### 3.3 发布与安全约束
- 生产链路禁止引入未审计的敏感数据外发路径。
- 官方构建验证链路（签名生成/验签）必须可追踪、可复核。
- 版本发布必须附带最小变更说明与风险说明。
- 桌面构建产物必须附带运行时依赖完整性校验，关键主进程依赖链缺失时应在构建阶段直接失败，而不是留到用户启动时暴露。
- beta / snapshot 标签发布必须保持 pre-release 语义，避免预发布资产进入稳定发布通道。
- CI/CD JavaScript Action runtime 必须保持 Node 24-compatible major baseline；不得通过 `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` 或长期 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` 绕过 warning，且不得把该迁移误解为项目业务 Node 版本升级。

### 3.4 文档约束
- 功能行为变化需同步 `README.md` / `plan-prd` / `docs/INDEX.md` 至少一处。
- 活跃 PRD 必须包含“最终目标、验收标准、质量约束、回滚策略”。

### 3.5 文档治理执行锚点（2026-05-09）
- 文档盘点历史快照保留在 `docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`；当前下一步路线以六主文档、`TODO` 与 `CHANGES` 为准。
- 当前执行优先级调整为：先完成 `2.4.10` Windows 真机 evidence 闭环（acceptance collection plan、case/manual/performance evidence、final verify、Nexus Release Evidence），再在 `2.4.11` 关闭剩余 Windows/macOS 阻塞级回归、Release Evidence 与清册退场项；`Nexus 设备授权风控` 保留实施文档与历史入口，降为非当前主线。
- Nexus Provider 聚合与 Scene 编排已进入架构蓝图；后续实现必须遵守 Provider/Scene 解耦、typed transport/domain SDK、Storage/Sync 与 Metering/Audit 边界。
- 2.5.0 AI Plan PRD 已锁定：CoreBox AI Ask 最小 Stable 切片已落地；后续实现必须继续交付 CoreBox / OmniPanel 桌面入口闭环、OmniPanel Writing Tools、Workflow `Use Model` 节点、Review Queue 与 P0 模板，禁止将范围扩大到全量多模态、Assistant 默认启用或 Nexus Scene runtime 编排。
- 2026-05-12 跨平台兼容与占位实现复核已落地：`cross-platform-compat-placeholder-audit-2026-05-10.md` 保留为历史基线，当前执行口径以 `cross-platform-compat-placeholder-review-2026-05-12.md` 与 `TODO.md` 为准；Pilot 假值成功、mock payment 默认成功与 `touch-image` renderer localStorage 长期持久化已收口，`2.4.10` release blocker 收敛为 Windows/macOS 真机 evidence，`2.4.11` 后续聚焦 `compat-file=5`、retained raw definition、CLI token storage、插件命令能力统一诊断与超长模块 SRP 小切片。
- 2026-05-11 架构治理切片已继续落地：Pilot stat 改真实 runtime metrics，mock payment 必须显式 `PILOT_PAYMENT_MODE=mock`，touch-image 图片历史迁入 plugin storage SDK，Transport boundary test 输出 raw send / retained raw definition / typed candidate 独立指标；三段 typed candidate 清零，`clipboard.ts` 已降到 `1143` 行并清退 size exception，`app-provider.ts` source scanner 第一切片完成并收紧 growth exception cap。
- 2026-05-11 Nexus AI provider 已同步镜像到 Provider Registry，API key 只进入 secure store 并通过 `authRef` 引用；dashboard list/sync/model list/probe/admin chat/docs assistant/lab runtime 已统一走 `listIntelligenceProvidersWithRegistryMirrors` / secure-store fallback，Provider Registry check 已可对 AI mirror 执行 `chat.completion` / `vision.ocr` 探活并写入 health 历史；OpenAI-compatible AI mirror 已可通过 Scene 默认 adapter 执行 `vision.ocr`；Dashboard Admin Provider Registry 已补系统级本地 `overlay.render` provider 与 `corebox.screenshot.translate` Scene 的幂等 seed 入口；下一步是旧 `intelligence_providers` 表退场方案、user-scope AI mirror OCR 自动绑定策略与高级策略。
- 文档质量不再由脚本强校验；仍按 AGENTS.md 要求在行为/接口/架构变化时同步活跃入口文档。

## 4. 8 周路线图（建议执行窗口：2026-02-23 ~ 2026-04-19）

### Week 1：基线收敛（质量止血）
- 目标：修复当前主线 typecheck 阻塞，建立可执行的质量基线。
- 交付：
  - 清理 `apps/core-app` 当前阻塞类型错误；
  - 清理 `packages/tuffex` 阻塞类型错误；
  - 固化“最小必跑校验清单”。
  - 详细执行清单：`docs/plan-prd/01-project/WEEK1-EXECUTION-PLAN-2026Q1.md`
  - 质量闸门：
  - `pnpm -C "apps/core-app" run typecheck:node` 通过；
  - `pnpm -C "apps/core-app" run typecheck:web` 通过。
  - `pnpm lint` 与 `pnpm quality:pr` 通过；release/milestone 追加 `pnpm quality:release`。

### Week 2：SDK Hard-Cut（E 批次）
- 目标：清理 renderer 侧主要直连调用点。
- 交付：
  - Settings / Permission / Intelligence 相关页面直连迁移；
  - Intelligence Agent 命名空间一次切换（Core IPC + Nexus API 同步切换）；
  - Prompt Registry（record + binding）落库并完成 capability 绑定迁移；
  - 增加迁移清单与剩余点位清单。
- 质量闸门：
  - 新增迁移点无 raw event；
  - 定向 lint + 回归测试通过。
- 进展（2026-03-12）：Network 相关 renderer/main/plugin 直连调用已完成全仓收口，root `ESLint network-boundary rules` 已硬禁生效。

### Week 3：SDK Hard-Cut（F 批次）
- 目标：清理 main/plugin 侧 legacy 分支并收口导出。
- 交付：
  - legacy handler 逐项下线；
  - hooks/SDK 对外入口统一。
  - Intelligence 类型与 runtime 统一归属 `@talex-touch/tuff-intelligence`，停止 `@talex-touch/utils/intelligence*` 外部依赖。
- 质量闸门：
  - 新增代码 0 个 legacy channel 直连；
  - 迁移报告可追踪（变更点、风险、回滚点）。

### Week 4.5：Pilot（Node Runtime）能力闭环
- 目标：完成 Pilot 会话链路与恢复语义联调。
- 交付：
  - Chat Sessions API、SSE stream（含内置 heartbeat 事件）、pause、trace 补播；
  - Postgres/Redis + JWT Cookie 主路径收敛；
  - Trace 抽屉与主聊天区分离展示。
- 质量闸门：
  - `apps/pilot` lint/typecheck/build 全通过；
  - 断线恢复与 `fromSeq` 补播用例可复现。
  - 路由指标可观测（TTFT/成功率/耗时）与熔断恢复行为可复现。

### Week 4：Storage 统一推进（配置域）
- 目标：把高风险配置域纳入 SoT 规则并完成迁移验证。
- 交付：
  - 完成至少 2~3 个配置域的 SQLite 化迁移；
  - 明确 sync-needed 与 local-only 边界。
- 质量闸门：
  - 迁移具备 fallback 与回滚验证记录；
  - 不出现明文敏感配置落盘。

### Week 5：Flow / DivisionBox 闭环
- 目标：补齐会话审计与联调验收，完成开发者文档最小集。
- 交付：
  - Flow 审计日志、失败原因记录；
  - DivisionBox 生命周期文档补齐；
  - 至少 1 组 sender/receiver 测试插件验证。
- 质量闸门：
  - 主流程无阻断回归；
  - 文档 + 示例 + 代码三者一致。

### Week 6：稳定性与性能治理
- 目标：处理事故遗留与性能噪声（VC-4/DB-6/PERF-1）。
- 交付：
  - ViewCache 失效日志节流与可观测补齐；
  - DB 单写入策略连通性核查；
  - suspend/resume 误报抑制。
  - 启动搜索卡顿治理落地（双库隔离 + QoS 调度 + 启动窗口降载 + 指标门禁），并保留 feature flag 灰度回滚能力。
- 质量闸门：
  - `SQLITE_BUSY(_SNAPSHOT)` 显著下降；
  - EventLoop 误报得到隔离。

### Week 7：发布链路闭环
- 目标：OIDC + RSA + Nexus release 同步打通。
- 交付：
  - `build-and-release` 统一产物、生成 `tuff-release-manifest.json` 并同步 Nexus release/assets；
  - CLI 四包自动发布与 Nexus updates 同步；
  - 官网部署由 Cloudflare Pages 平台侧 Git 自动部署；
  - build signature 生成与验签流程持续增强。
- 质量闸门：
  - 预发布链路全程可复现；
  - notes/assets 字段结构校验通过。

### Week 8：RC 验收与文档冻结
- 目标：形成可发布候选（RC）与统一对外文档。
- 交付：
  - 关键体验回归清单与验收结论；
  - 文档冻结版本（README/PRD/Nexus docs）；
  - 下一阶段 backlog 与风险登记。
- 质量闸门：
  - 核心质量门禁稳定通过；
  - 无 P0/P1 未评估风险项。

## 4.1 v2.4.7 GA 收口里程碑（发布推进）

- **Gate A（历史已完成）**：`v2.4.7` 历史发布窗口已满足版本基线；当前 `2.4.9-beta.4` 工作区不再阻塞历史 Gate。
- **Gate B（已完成）**：发布链路收敛（`build-and-release` + Nexus release 同步 + CLI 四包 npm 自动发布）。
- **Gate C（已完成）**：质量门禁清零（lint/typecheck 阻塞项收口）。
- **Gate D（已完成）**：`sha256 + manifest` 元数据回填已收口；执行来源为 GitHub `v2.4.7` manifest 与 release 资产列表。
  - 执行口径：Gate D 写入由 GitHub CI `build-and-release.yml` 的 `sync-nexus-release` 自动执行。
  - 验收证据：`Build and Release` run `23091014958`（`workflow_dispatch + sync_tag=v2.4.7`）成功，`/api/releases/v2.4.7/assets` 已补齐 manifest 与 sha256。
- **Gate E（历史已完成）**：`v2.4.7` tag 已存在且 Nexus release 已 `published`；`latest?channel=RELEASE` 命中 `v2.4.7`，不执行重发版。
- **签名缺口豁免（仅 v2.4.7）**：GitHub 原始 `v2.4.7` 无 `.sig` 资产，manifest 也无 signature 字段；按 `Accepted waiver` 处理，不扩展到 `>=2.4.8`。
- **执行入口**：`docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`

## 4.2 CoreApp 2.4.10 / 2.4.11 治理边界（当前主线）

- **状态（2026-04-20）**：插件完善主线已收口；当前主线切换为 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`。
- **Nexus 风控状态**：`docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md` 保留为实施入口与历史证据；Phase 1 频控、冷却、审计日志、长期授权后端时间窗与可信设备显式白名单已完成，不再作为当前主线。
- **Nexus Provider 聚合状态**：`docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md` 已作为架构蓝图入口；Phase 1 文档化已固定 Provider / Capability / Scene / Strategy / Metering、迁移映射、错误码、数据表草案、质量约束与验收清单。后续不再为汇率、AI、翻译分别建立孤立供应商模型，而是统一进入 Provider registry 并由 Scene 编排消费。
- **2.5.0 AI 状态**：`docs/plan-prd/03-features/ai-2.5.0-plan-prd.md` 已作为 AI 板块主 Plan PRD；版本定位为桌面 AI 入口收口，Stable 只承诺文本 + OCR；下个版本重点落地 OmniPanel Writing Tools、Workflow `Use Model` 节点、Review Queue、Desktop Context Capsule 与剪贴板整理/会议纪要/文本批处理模板；Skills / Background Automations / Pilot 联动为 Beta，Assistant、多模态生成编辑、多 Agent 长任务面板与 Nexus Scene runtime 编排不进入 2.5.0 必交付范围。
- **完成项**：
  - 权限中心 Phase 5：`PermissionStore` 切换 SQLite 主存储，支持 `JSON -> SQLite` 一次性迁移与失败只读回退；
  - 安装链路权限确认：安装阶段支持 `always/session/deny` 三分支并显式失败反馈；
  - View Mode 安全闭环：协议限制、路径规范化、hash 路由、非法路径拦截测试补齐；
  - View Mode Phase4：`touch-translation` 已启用 `dev.source` 与 `multi-source-translate` webcontent feature；
  - CLI 收口：`tuff` 主入口接管 + `tuff validate` 校验 + 旧入口 deprecation 提示。
- **历史完成（2.4.8）**：
  - OmniPanel 稳定版 MVP 已通过真实窗口 smoke 与关键失败路径回归，不再作为当前开发主线。
- **后续顺序（锁定）**：先完成 `2.4.10 Windows App 索引 + 基础 legacy/compat 收口`，再在 `2.4.11` 关闭剩余跨平台阻塞回归、Release Evidence 写入闭环与清册退场项；`Nexus 设备授权风控` 降为非当前主线（`OmniPanel Gate`、`SDK Hard-Cut E~F`、`v2.4.7 Gate D/E`、`权限中心 Phase 5`、`View Mode Phase2~4`、`CLI 分包迁移收口`、`主文档同步验收` 已完成）。
- **治理口径（锁定）**：Legacy/兼容/结构治理统一采用 `UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md`，按五工作包并行推进与统一里程碑验收。
- **硬切进展（2026-05-08）**：`apps/core-app` 已完成一轮兼容债硬切（权限/Storage/Channel/插件 API/更新占位/AgentStore/Extension unload）；下一步关闭或降权清册中的 `2.4.11` 项，并完成 Windows/macOS 阻塞级人工回归。Linux 仅记录 best-effort smoke 与限制说明。
- **CLI 兼容策略（锁定）**：`2.4.x` 保留 `@talex-touch/unplugin-export-plugin` CLI shim，`2.4.11` 退场。

## 5. 里程碑验收标准（跨周）

- **架构验收**：新增业务代码不再扩散 legacy channel。
- **质量验收**：核心门禁连续两周稳定通过。
- **发布验收**：预发布到正式发布流程具备同构能力。
- **文档验收**：项目入口文档与现状一致，避免“代码已变、文档失真”。

## 6. 风险与应对

- 风险：历史债务导致“修一个炸一片”。  
  应对：按模块分批 hard-cut，禁止跨域混改。
- 风险：发布链路变更影响现网节奏。  
  应对：先灰度到 snapshot，再放量 release。
- 风险：文档滞后导致执行偏差。  
  应对：将文档更新纳入每周验收 checklist。
