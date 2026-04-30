# Tuff 产品总览与 8 周路线图（2026-Q1）

> 更新时间：2026-04-30
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

## 3. 质量约束（全项目强制）

### 3.1 代码质量门禁
- 不允许新增未类型约束的跨层调用（禁止新增 raw event 直连）。
- 新增模块必须提供最小可回归验证（lint/typecheck/test 至少 1 项）。
- 不得通过“关闭规则/降级配置”绕过质量问题（除非有明确豁免文档）。
- 兼容债务冻结门禁：`legacy:guard` 必须通过，禁止新增 `channel.send('x:y')` 与新增 `legacy` 分支；存量债务仅允许白名单承载并附 `expiresVersion`（当前收口版本 `2.5.0`）。`2.5.0` 前 CoreApp 清册项必须关闭或显式降权，不得保留未说明的旧 storage protocol、旧 SDK bypass 或伪成功兼容分支。
- 兼容债务清册门禁：`compatibility-debt-registry.csv` 必须覆盖全部存量兼容债务；新增债务无登记禁止合入。
- CoreApp 平台适配门禁：`2.5.0` 前 Windows/macOS 为 release-blocking，必须完成搜索、应用扫描、托盘、更新、插件权限、安装卸载、退出释放回归；Linux 保留 `xdotool` / desktop environment documented best-effort，不作为 `2.5.0` blocker。
- 超长文件门禁：`size:guard` 必须通过，阈值 `>=1200` 的存量文件禁止继续增长，新增超长文件禁止合入。
- 网络边界硬约束：业务层禁止新增 direct `fetch/axios`，统一走 `@talex-touch/utils/network`（network 套件内部除外），并由 root `network:guard` + ESLint 双门禁拦截。
- 门禁脚本工程约束：`legacy/compat/size/network` 共享 `scripts/lib/*` 基础能力；workspace 侧门禁优先复用 root 实现（参数化 scope），禁止重复维护同类脚本。
- 桌面打包质量门禁必须覆盖 `PACKAGED_RUNTIME_MODULES` 的完整运行时依赖闭包；当前基线至少覆盖 Sentry/OpenTelemetry、LangChain 关键依赖（`@langchain/core`、`p-retry`、`retry`、`langsmith`）与 `compressing -> tar-stream -> readable-stream` 缺包闭包真实进入可解析产物路径。
- 对于显式落在 `resources/node_modules` 的运行时模块，质量门禁必须递归校验其依赖闭包也位于 `resources/node_modules`，禁止“根模块存在但其二级/三级依赖仍从 asar 漏解析”。
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

### 3.4 文档约束
- 功能行为变化需同步 `README.md` / `plan-prd` / `docs/INDEX.md` 至少一处。
- 活跃 PRD 必须包含“最终目标、验收标准、质量约束、回滚策略”。

### 3.5 文档治理执行锚点（2026-03-17）
- 文档盘点历史快照保留在 `docs/plan-prd/docs/DOC-INVENTORY-AND-NEXT-STEPS-2026-03-17.md`；当前下一步路线以六主文档、`TODO` 与 `CHANGES` 为准。
- 当前执行优先级调整为：先 `CoreApp legacy 清理`，再完成 `Windows/macOS 2.5.0 阻塞级适配`；`Nexus 设备授权风控` 保留实施文档与历史入口，降为非当前主线。
- 升级 strict 前置条件固定：连续 5 次 `docs:guard` 零告警 + 连续 2 周无口径漂移。

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
  - `pnpm legacy:guard`（含 `compat:registry:guard` + `size:guard`）通过。

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
- 进展（2026-03-12）：Network 相关 renderer/main/plugin 直连调用已完成全仓收口，root `network:guard` 已硬禁生效。

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

## 4.2 CoreApp 2.5.0 前置治理（当前主线）

- **状态（2026-04-20）**：插件完善主线已收口；当前主线切换为 `CoreApp legacy 清理 + Windows/macOS 2.5.0 阻塞级适配`。
- **Nexus 风控状态**：`docs/plan-prd/04-implementation/NexusDeviceAuthRiskControl-260316.md` 保留为实施入口与历史证据，不再作为当前主线。
- **完成项**：
  - 权限中心 Phase 5：`PermissionStore` 切换 SQLite 主存储，支持 `JSON -> SQLite` 一次性迁移与失败只读回退；
  - 安装链路权限确认：安装阶段支持 `always/session/deny` 三分支并显式失败反馈；
  - View Mode 安全闭环：协议限制、路径规范化、hash 路由、非法路径拦截测试补齐；
  - View Mode Phase4：`touch-translation` 已启用 `dev.source` 与 `multi-source-translate` webcontent feature；
  - CLI 收口：`tuff` 主入口接管 + `tuff validate` 校验 + 旧入口 deprecation 提示。
- **历史完成（2.4.8）**：
  - OmniPanel 稳定版 MVP 已通过真实窗口 smoke 与关键失败路径回归，不再作为当前开发主线。
- **后续顺序（锁定）**：先 `CoreApp legacy 清理`，再完成 `Windows/macOS 2.5.0 阻塞级适配`；`Nexus 设备授权风控` 降为非当前主线（`OmniPanel Gate`、`SDK Hard-Cut E~F`、`v2.4.7 Gate D/E`、`权限中心 Phase 5`、`View Mode Phase2~4`、`CLI 分包迁移收口`、`主文档同步验收` 已完成）。
- **治理口径（锁定）**：Legacy/兼容/结构治理统一采用 `UNIFIED-LEGACY-COMPAT-STRUCTURE-REMEDIATION-PRD-2026-03-16.md`，按五工作包并行推进与统一里程碑验收。
- **硬切进展（2026-04-20）**：`apps/core-app` 已完成一轮兼容债硬切（权限/Storage/Channel/插件 API/更新占位/AgentStore/Extension unload）；下一步关闭或降权清册中的 CoreApp `2.5.0` 项，并完成 Windows/macOS 阻塞级人工回归。Linux 仅记录 best-effort smoke 与限制说明。
- **CLI 兼容策略（锁定）**：`2.4.x` 保留 `@talex-touch/unplugin-export-plugin` CLI shim，`2.5.0` 退场。

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
