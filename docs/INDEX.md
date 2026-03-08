# 文档索引

本仓库包含多个文档集合。

## 主要入口

- `docs/plan-prd/README.md` - PRD / 规划索引（产品 + 架构 + 实现）
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` - 产品总览 + 8 周路线图（目标与节奏）
- `docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md` - v2.4.7 发版推进清单（文档进展 + 发布门禁）
- `docs/plan-prd/01-project/WEEK1-EXECUTION-PLAN-2026Q1.md` - Week 1 执行清单（质量基线）
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` - PRD 最终目标与质量约束基线（含质量执行记录）
- `docs/plan-prd/docs/PILOT-INTELLIGENCE-API-CONTRACT.md` - Pilot Chat API 与 SSE/恢复语义契约
- `docs/plan-prd/docs/PILOT-NEXUS-OAUTH-CLI-TEST-PLAN.md` - Pilot 下一阶段执行文档（测试优先 + OAuth + CLI + channel routing）
- `docs/` - 仓库文档（分析、事故报告、集成指南）

## 状态快照（压缩版，代码核对）

- 2026-02 新增：`v2.4.7` 发版推进清单落地，明确 Gate A-E（版本基线/发布链路/质量门禁/发布资产/发布动作）与当前阻塞项，作为发布执行入口（`docs/plan-prd/01-project/RELEASE-2.4.7-CHECKLIST-2026-02-26.md`）。
- 2026-02 新增：CoreApp 新增 `FlipDialog` 统一封装并完成 16 个 `TxFlipOverlay` 场景迁移，默认宽弹框规格（`md/lg/xl/full`）与 reference 隐藏/恢复行为统一，页面侧不再重复声明 `Teleport`。
- 2026-02 新增：Nexus 业务场景完成 15 处 `TxFlipOverlay -> FlipDialog` 迁移，统一 reference/source 隐藏恢复与 `size=md/lg/xl` 宽弹框策略；`pages/test` 与 `content/demos` 继续保留 `TxFlipOverlay` 作为测试/演示边界。
- 2026-02 新增：Intelligence Agent 一次切换（Nexus + Core-App）完成 `intelligence-agent` 命名空间上线；旧 `intelligence-lab` 路由统一返回 `410`；Prompt Registry（registry + binding）完成 schema 对齐与默认提示词落库引导；`session/stream` 主链切换 LangGraph 五阶段状态机并提供 Prompt Registry 管理 API/UI。
- 2026-03 新增：OmniPanel 进入 40 点推进批次，已落地默认加载、执行门禁去除、错误码与刷新原因收敛、键盘交互、组件拆分与主/渲定向单测（`docs/plan-prd/03-features/omni-panel/OMNIPANEL-FEATURE-HUB-PRD.md`）。
- 2026-03 新增：Pilot（`apps/pilot`）完成首版 Chat-first 落地（会话 API + SSE + `fromSeq` 补播 + Trace 抽屉），并将 Intelligence 核心类型/Runtime 收口到 `packages/tuff-intelligence`（`docs/plan-prd/docs/PILOT-INTELLIGENCE-API-CONTRACT.md`）。
- 2026-03 新增：Intelligence 流式链路完成兼容增强：Core-App 新增 `intelligence:agent:session:subscribe` 真推流，旧 `session:stream` 保持查询语义；runtime trace 引入单调 `seq` 与 `fromSeq` 续播能力，Nexus `session/stream` keepalive 同步补齐 `stream.heartbeat` 事件（`docs/plan-prd/docs/PILOT-INTELLIGENCE-API-CONTRACT.md`）。
- 2026-03 新增：Pilot DeepAgent 输出链路补齐增量渲染：runtime 支持 `engine.runStream()` 优先分发，后端持续输出 `assistant.delta`；前端补齐 `assistant.final` 去重拼接，避免“delta + final”重复渲染（`docs/plan-prd/docs/PILOT-INTELLIGENCE-API-CONTRACT.md`）。
- 2026-03 新增：Pilot 下一阶段执行文档落地，明确“测试优先 -> Nexus OAuth -> tuff-pilot-cli -> 后端渠道可配置”的硬顺序（`docs/plan-prd/docs/PILOT-NEXUS-OAUTH-CLI-TEST-PLAN.md`）。
- 2026-02 新增：发布链路收敛到 `build-and-release.yml`（失败不再创建 Release），并增加 Nexus release 自动同步、CLI 四包 npm 自动发布；官网部署改由 Cloudflare Pages 平台侧 Git 自动部署（仓库不再维护 `nexus-deploy.yml`）。
- 2026-02 新增：Nexus 汇率服务（USD 基准换算 + D1 历史快照 + telemetry 错误归档），入口 `/api/exchange/convert`；高级历史查询 `/api/exchange/history`
- 已完成（指南/报告）：`docs/updates-module.md`; `docs/search-logger-lifecycle-analysis.md`; `docs/clipboard-mechanism-analysis.md`; `docs/script-native-build-distribution.md`; `docs/script-native-constraints.md`; `docs/analytics-data-prd.md`; `docs/everything-integration.md`; `docs/engineering/everything-sdk-rollout-status.md`; `docs/engineering/audits/*`; `docs/engineering/optimization/*`; `docs/engineering/ci-cd/*`; `docs/engineering/typecheck/*`; `docs/engineering/reports/*`; `docs/engineering/notes/*`; `docs/engineering/monorepo-standards.md`; `docs/plan-prd/docs/build-strategy.md`; `docs/plan-prd/docs/github-automation.zh-CN.md`; `docs/plan-prd/04-implementation/QualityAnalysis260111.md`; `docs/plan-prd/04-implementation/Quality260111.md`; `docs/plan-prd/04-implementation/performance/PERFORMANCE_REFERENCE.md`; `docs/plan-prd/05-archive/*`
- 已完成（功能 PRD，代码一致）：`docs/plan-prd/03-features/search/*`; `docs/plan-prd/03-features/SEARCH-REFACTOR-PRD.md`; `docs/plan-prd/03-features/corebox-clipboard-transport-migration.md`; `docs/plan-prd/03-features/meta-overlay/META-OVERLAY-PRD.md`; `docs/plan-prd/03-features/flow-transfer-*.md`; `docs/plan-prd/03-features/division-box-prd.md`; `docs/plan-prd/docs/DIVISION_BOX_*`; `docs/plan-prd/03-features/tuff-transport/*`; `docs/plan-prd/03-features/download-update/*`; `docs/plan-prd/03-features/build/*`; `docs/plan-prd/03-features/plugin/*`; `docs/plan-prd/02-architecture/{intelligence-agents-system-prd.md,intelligence-power-generic-api-prd.md,telemetry-error-reporting-system-prd.md,module-logging-system-prd.md,platform-capabilities-prd.md}`; `docs/plan-prd/docs/AISDK_GUIDE.md`; `docs/plan-prd/04-implementation/TuffTransportMigration260111.md`; `docs/plan-prd/04-implementation/performance/direct-preview-calculation-prd.md`
- 部分完成：`docs/plan-prd/04-implementation/{StorageUnified260111.md,config-storage-unification.md,CoreAppRefactor260111.md,TuffTransportPortPlan260111.md,TaskScheduler260111.md,FileWorkerIdlePlan260111.md,PerformanceLag260111.md}`; `docs/plan-prd/03-features/view/attach-view-cache-prd.md`; `docs/plan-prd/03-features/tuff-ui/TUFF-UI-MIGRATION-PRD.md`; `docs/plan-prd/03-features/nexus/*`; `docs/nexus-everything-integration.md`; `docs/incident-2026-01-16-longterm-fixes.md`（VC-4/DB-6/PERF-1 待完成）
- 待完成 / 未发现：`docs/plan-prd/06-ecosystem/*`; `docs/plan-prd/03-features/view/{multi-attach-view-prd.md,view-mode-prd.md}`; `docs/plan-prd/01-project/{DESIGN_IMPROVEMENTS.md,CHANGES.md,CALENDAR-PRD.md}`; `docs/plan-prd/next-edit/*`; `docs/plan-prd/TODO.md`; `docs/plan-prd/ISSUES.md`; `docs/engineering/todo.md`

- `AGENTS.md` - Monorepo 架构 + 开发命令（实用）
- `.github/docs/contribution/CONTRIBUTING.md` - 贡献指南
- `CLAUDE.md` - AI 开发备注（根目录）

## 仓库文档（`docs/`）

- `docs/analytics-data-prd.md` - Analytics 数据 PRD
- `docs/clipboard-mechanism-analysis.md` - 剪贴板机制分析
- `docs/engineering/monorepo-standards.md` - Monorepo 工程规范
- `docs/everything-integration.md` - Everything 集成指南
- `docs/nexus-everything-integration.md` - Nexus + Everything 集成指南
- `docs/engineering/everything-sdk-rollout-status.md` - Everything SDK 落地状态（Done/In Progress/Todo）
- `docs/updates-module.md` - 更新模块说明
- `docs/incident-2026-01-16-longterm-fixes.md` - 事故与长期修复

## 工程笔记 / 报告

- `docs/engineering/audits/260109-LOGANALY.md` - 日志分析笔记
- `docs/engineering/audits/260114-CODE-SCAN.md` - 代码扫描笔记
- `docs/engineering/optimization/OPTIMIZATION_SUMMARY.md` - 优化汇总
- `docs/engineering/ci-cd/CI_CD_OPTIMIZATION.md` - CI/CD 优化
- `docs/engineering/typecheck/TYPECHECK_FIXES.md` - 类型检查修复
- `docs/engineering/reports/report.md` / `docs/engineering/reports/report-scroll-followup.md` - 调查报告
- `docs/engineering/reports/sdk-unification-progress-2026-02-08.md` - SDK 统一收口与质量治理进展
- `docs/engineering/legacy-debt-report-2026-02-21.md` - 深度技术债与兼容性分析报告（P0）
- `docs/engineering/todo.md` - 工作 TODO 清单

## 功能文档（Plan-PRD）

- `docs/plan-prd/03-features/tuff-transport/` - TuffTransport 设计 + API 参考
- `docs/plan-prd/03-features/flow-transfer-prd.md` - Flow Transfer PRD
- `docs/plan-prd/03-features/flow-transfer-detailed-prd.md` - Flow Transfer 详细 PRD
- `docs/plan-prd/03-features/division-box-prd.md` - DivisionBox PRD
- `docs/plan-prd/03-features/omni-panel/OMNIPANEL-FEATURE-HUB-PRD.md` - OmniPanel Feature Hub（插件 Feature 执行与上下文注入）
- `docs/plan-prd/04-implementation/WidgetSandboxIsolation260221.md` - Widget 沙箱隔离与持久化收口计划
- `docs/plan-prd/docs/DIVISION_BOX_INDEX.md` - DivisionBox 文档索引

## 迁移参考

- `docs/plan-prd/04-implementation/TuffTransportMigration260111.md` - TuffTransport 迁移清单
- `docs/plan-prd/04-implementation/LegacyChannelCleanup-2408.md` - Legacy Channel 清理（2.4.8）
