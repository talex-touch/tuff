# 需求结构化抽取（Requirements Extract）

> 目标：把 plan/、PRD、issues 与规范类文档中的需求统一抽取，形成可追溯的结构化清单。

## Plan 来源

- 日志中的 IPC 卡顿与资源加载失败问题排查与优化方案（来源：`plan/2026-01-19_11-10-40-perf-log-analysis.md:4`）
- Config storage SQLite/JSON sync strategy (implementation plan)（来源：`plan/2026-01-20_18-47-35-config-storage-sqlite-json-sync.md:4`）
- Config storage strategy (SQLite vs JSON) + progress doc for related items（来源：`plan/2026-01-20_18-47-54-config-storage-sqlite-json-sync.md:4`）
- Refine plugin development CLI (tuff) and close feature gaps（来源：`plan/2026-01-20_18-48-52-plugin-cli-refine.md:4`）
- 扫描并迁移 $touchSDK / window 全局访问到 hooks（来源：`plan/2026-01-20_18-50-26-touchsdk-window-hooks-migration.md:4`）
- 整理 config storage（SQLite/JSON 同步）上下文与需求（来源：`plan/2026-01-20_18-55-03-context-requirements.md:4`）
- Tuffex components 3/4/5/7/8 plan and Vitest projects include（来源：`plan/2026-01-20_21-16-53-tuffex-components-34578.md:4`）
- 处理 stash 弹出冲突并恢复工作区（来源：`plan/2026-01-20_21-17-14-stash-pop-recovery.md:4`）
- 全量迁移到 TuffTransport，并补齐渲染器-主进程异步双向 IPC/任务能力（来源：`plan/2026-01-21_01-29-05-transport-migration-async.md:4`）
- transport 引入 MessagePort 升级与流式通道迁移（来源：`plan/2026-01-21_03-01-57-transport-message-port.md:4`）
- Nexus 融合根目录 examples 常用代码板块（来源：`plan/2026-01-21_13-22-14-nexus-examples-section.md:4`）
- Nexus 官网首页内容整改（现状梳理与补全）（来源：`plan/2026-01-21_13-25-00-nexus-homepage-revamp.md:4`）
- 内部下载任务隐藏与通知抑制（SVG 下载等）（来源：`plan/2026-01-21_13-25-11-download-internal-visibility.md:4`）
- 分析 SearchLogger 未走 BaseModule 生命周期导致 StorageModule 未就绪的问题并给出修复方案（来源：`plan/2026-01-21_13-39-30-basemodule-lifecycle-analysis.md:4`）
- PRD: App Indexing 补漏与周期全量对比（来源：`plan/planprd-app-indexing.md:1`）
- PRD: 自动发布与 Nexus 同步（OIDC + RSA + Notes/Assets）（来源：`plan/planprd-release-pipeline.md:1`）
- Provide script and native capability support (Python + DLL) with a cross-platform design（来源：`apps/core-app/plan/2026-01-21_13-21-43-script-python-dll-cross-platform.md:4`）
- 重新梳理自动更新方案并形成可执行计划（来源：`apps/core-app/plan/2026-01-21_13-31-08-auto-update-plan.md:4`）
- 整理所有相关需求并生成统一执行顺序文档（来源：`apps/core-app/plan/2026-01-21_14-50-21-requirements-consolidation.md:4`）

## PRD 来源（docs/plan-prd）

- 日历插件 PRD（来源：`docs/plan-prd/01-project/CALENDAR-PRD.md:1`）
- 变更日志（来源：`docs/plan-prd/01-project/CHANGES.md:1`）
- Tuff 项目设计改进建议（来源：`docs/plan-prd/01-project/DESIGN_IMPROVEMENTS.md:1`）
- 智能代理（Intelligence Agents）系统设计文档 (v1.2)（来源：`docs/plan-prd/02-architecture/intelligence-agents-system-prd.md:1`）
- PRD: Intelligence Power 泛化接口与能力路由 (v1.1)（来源：`docs/plan-prd/02-architecture/intelligence-power-generic-api-prd.md:1`）
- 模块日志系统 PRD（来源：`docs/plan-prd/02-architecture/module-logging-system-prd.md:1`）
- PRD: 通用平台型能力建设 (v1.0)（来源：`docs/plan-prd/02-architecture/platform-capabilities-prd.md:1`）
- 遥测与错误上报系统 PRD（来源：`docs/plan-prd/02-architecture/telemetry-error-reporting-system-prd.md:1`）
- 搜索系统重构 PRD（来源：`docs/plan-prd/03-features/SEARCH-REFACTOR-PRD.md:1`）
- 构建完整性验证系统 PRD（来源：`docs/plan-prd/03-features/build/build-integrity-verification-prd.md:1`）
- 构建信息与签名系统 PRD（来源：`docs/plan-prd/03-features/build/build-signature-system-prd.md:1`）
- CoreBox 剪贴板 → TuffTransport 迁移（来源：`docs/plan-prd/03-features/corebox-clipboard-transport-migration.md:1`）
- PRD: DivisionBox 交互容器能力深化 (v1.0)（来源：`docs/plan-prd/03-features/division-box-prd.md:1`）
- 下载中心参考文档（来源：`docs/plan-prd/03-features/download-update/DOWNLOAD_CENTER_REFERENCE.md:1`）
- PRD: GitHub 自动更新与下载包可视化 (v1.0)（来源：`docs/plan-prd/03-features/download-update/github-auto-update-prd.md:1`）
- PRD: Flow Transfer 插件间流转能力 - 详细设计 (v1.1)（来源：`docs/plan-prd/03-features/flow-transfer-detailed-prd.md:1`）
- PRD: 插件系统 "Flow Transfer" 流转能力 (v1.0)（来源：`docs/plan-prd/03-features/flow-transfer-prd.md:1`）
- MetaOverlay 三层架构 PRD（来源：`docs/plan-prd/03-features/meta-overlay/META-OVERLAY-PRD.md:1`）
- NEXUS 订阅系统 PRD（来源：`docs/plan-prd/03-features/nexus/NEXUS-SUBSCRIPTION-PRD.md:1`）
- Nexus Team Invite Feature PRD（来源：`docs/plan-prd/03-features/nexus/NEXUS-TEAM-INVITE-PRD.md:1`）
- Nexus Tuffex 组件展示整合 PRD（草案）（来源：`docs/plan-prd/03-features/nexus/NEXUS-TUFFEX-COMPONENTS-PRD.md:1`）
- Nexus TuffexUI 统一迁移 PRD（精简版）（来源：`docs/plan-prd/03-features/nexus/nexus-tuffexui-migration-prd.md:1`）
- Nexus x TuffexUI 样式冲突记录（来源：`docs/plan-prd/03-features/nexus/nexus-tuffexui-style-conflicts.md:1`）
- PRD: 插件权限中心 (Permission Center) v1.0（来源：`docs/plan-prd/03-features/plugin/permission-center-prd.md:1`）
- PRD: 插件市场 Provider Registry（前端版）（来源：`docs/plan-prd/03-features/plugin/plugin-market-provider-frontend-plan.md:1`）
- Widget 动态渲染策划 (v1.1)（来源：`docs/plan-prd/03-features/plugin/widget-dynamic-loading-plan.md:1`）
- Everything SDK 集成 PRD（来源：`docs/plan-prd/03-features/search/EVERYTHING-SDK-INTEGRATION-PRD.md:1`）
- 搜索 DSL 增强 PRD（来源：`docs/plan-prd/03-features/search/SEARCH-DSL-PRD.md:1`）
- Windows 文件搜索 PRD（来源：`docs/plan-prd/03-features/search/WINDOWS-FILE-SEARCH-PRD.md:1`）
- 智能推荐系统 PRD (精简版)（来源：`docs/plan-prd/03-features/search/intelligent-recommendation-system-prd.md:1`）
- 快速启动与搜索优化 PRD（来源：`docs/plan-prd/03-features/search/quick-launch-and-search-optimization-prd.md:1`）
- TuffTransport API 参考（来源：`docs/plan-prd/03-features/tuff-transport/API-REFERENCE.md:1`）
- TuffTransport 实现指南（来源：`docs/plan-prd/03-features/tuff-transport/IMPLEMENTATION-GUIDE.md:1`）
- TuffTransport 通信系统设计文档（来源：`docs/plan-prd/03-features/tuff-transport/TUFF-TRANSPORT-PRD.md:1`）
- TUFF UI 迁移优化 PRD（来源：`docs/plan-prd/03-features/tuff-ui/TUFF-UI-MIGRATION-PRD.md:1`）
- PRD: AttachUIView 缓存与自适应预加载策略 (v1.0)（来源：`docs/plan-prd/03-features/view/attach-view-cache-prd.md:1`）
- PRD: 多插件 AttachUIView 并行共存能力 (v1.0)（来源：`docs/plan-prd/03-features/view/multi-attach-view-prd.md:1`）
- PRD: 插件系统 "View Mode" 与开发模式增强 (v2.0)（来源：`docs/plan-prd/03-features/view/view-mode-prd.md:1`）
- Core-App 改造实施计划（来源：`docs/plan-prd/04-implementation/CoreAppRefactor260111.md:1`）
- FileProvider/AppProvider Worker+Idle 方案 260111（来源：`docs/plan-prd/04-implementation/FileWorkerIdlePlan260111.md:1`）
- 卡顿分析与迁移方案 260111（来源：`docs/plan-prd/04-implementation/PerformanceLag260111.md:1`）
- 质量审查 260111（来源：`docs/plan-prd/04-implementation/Quality260111.md:1`）
- 质量分析报告（环境判断/标志位抽离）（来源：`docs/plan-prd/04-implementation/QualityAnalysis260111.md:1`）
- Storage 统一封装分析 260111（来源：`docs/plan-prd/04-implementation/StorageUnified260111.md:1`）
- 后台任务调度方案 260111（来源：`docs/plan-prd/04-implementation/TaskScheduler260111.md:1`）
- TuffTransport 迁移清单 260111（来源：`docs/plan-prd/04-implementation/TuffTransportMigration260111.md:1`）
- TuffTransport Port 抽象方案 260111（来源：`docs/plan-prd/04-implementation/TuffTransportPortPlan260111.md:1`）
- 配置存储统一与同步策略（SQLite / JSON）（来源：`docs/plan-prd/04-implementation/config-storage-unification.md:1`）
- 性能优化参考（来源：`docs/plan-prd/04-implementation/performance/PERFORMANCE_REFERENCE.md:1`）
- 直接预览计算 PRD（来源：`docs/plan-prd/04-implementation/performance/direct-preview-calculation-prd.md:1`）
- 文档迁移总结（来源：`docs/plan-prd/05-archive/MIGRATION_SUMMARY.md:1`）
- Tuff 项目文档索引（来源：`docs/plan-prd/05-archive/PROJECT_DOCS_INDEX.md:1`）
- 插件加载优化说明（来源：`docs/plan-prd/05-archive/plugin-loading-refactor.md:1`）
- Tuff 生态工具文档（来源：`docs/plan-prd/06-ecosystem/README.md:1`）
- Tuff CLI 范围与清单（Scope + Inventory）（来源：`docs/plan-prd/06-ecosystem/TUFFCLI-INVENTORY.md:1`）
- TuffCLI - 插件开发命令行工具（来源：`docs/plan-prd/06-ecosystem/TUFFCLI-PRD.md:1`）
- 项目问题与清理候选（来源：`docs/plan-prd/ISSUES.md:1`）
- Talex Touch - 项目文档中心（来源：`docs/plan-prd/README.md:1`）
- Tuff 项目待办事项（来源：`docs/plan-prd/TODO.md:1`）
- AI SDK 使用指南（来源：`docs/plan-prd/docs/AISDK_GUIDE.md:1`）
- DivisionBox API 文档（来源：`docs/plan-prd/docs/DIVISION_BOX_API.md:1`）
- DivisionBox 开发者指南（来源：`docs/plan-prd/docs/DIVISION_BOX_GUIDE.md:1`）
- DivisionBox 文档索引（来源：`docs/plan-prd/docs/DIVISION_BOX_INDEX.md:1`）
- DivisionBox Manifest 配置文档（来源：`docs/plan-prd/docs/DIVISION_BOX_MANIFEST.md:1`）
- Tuff 打包策略（简化版）（来源：`docs/plan-prd/docs/build-strategy.md:1`）
- 利用 GitHub 实现发布日志与 AI 评审自动化（来源：`docs/plan-prd/docs/github-automation.zh-CN.md:1`）
- 下一次编辑 2（来源：`docs/plan-prd/next-edit/next-edit-2.md:1`）
- 需求汇总：PRD 状态梳理 + 下载链路统一 + SDK 优先 + 文档落地（来源：`docs/plan-prd/next-edit/需求汇总-PRD状态梳理-下载链路统一-SDK优先-文档落地.md:1`）

## Issues CSV 来源

- 2026-01-20_18-52-04-plugin-cli-refine.csv（来源：`issues/2026-01-20_18-52-04-plugin-cli-refine.csv:1`）
- 2026-01-20_18-52-09-config-storage-sqlite-json-sync.csv（来源：`issues/2026-01-20_18-52-09-config-storage-sqlite-json-sync.csv:1`）
- 2026-01-20_18-56-53-touchsdk-window-hooks-migration.csv（来源：`issues/2026-01-20_18-56-53-touchsdk-window-hooks-migration.csv:1`）
- 2026-01-20_19-01-23-context-requirements.csv（来源：`issues/2026-01-20_19-01-23-context-requirements.csv:1`）
- 2026-01-20_21-19-32-stash-pop-recovery.csv（来源：`issues/2026-01-20_21-19-32-stash-pop-recovery.csv:1`）
- 2026-01-20_21-20-03-tuffex-components-34578.csv（来源：`issues/2026-01-20_21-20-03-tuffex-components-34578.csv:1`）
- 2026-01-21_03-07-24-transport-message-port.csv（来源：`issues/2026-01-21_03-07-24-transport-message-port.csv:1`）
- 2026-01-21_13-25-58-nexus-examples-section.csv（来源：`issues/2026-01-21_13-25-58-nexus-examples-section.csv:1`）
- 2026-01-21_13-31-52-nexus-homepage-revamp.csv（来源：`issues/2026-01-21_13-31-52-nexus-homepage-revamp.csv:1`）
- 2026-01-21_13-32-17-download-internal-visibility.csv（来源：`issues/2026-01-21_13-32-17-download-internal-visibility.csv:1`）
- 2026-01-21_13-43-27-basemodule-lifecycle-analysis.csv（来源：`issues/2026-01-21_13-43-27-basemodule-lifecycle-analysis.csv:1`）
- 2026-01-21_13-24-48-script-python-dll-cross-platform.csv（来源：`apps/core-app/issues/2026-01-21_13-24-48-script-python-dll-cross-platform.csv:1`）
- 2026-01-21_13-34-51-auto-update-plan.csv（来源：`apps/core-app/issues/2026-01-21_13-34-51-auto-update-plan.csv:1`）
- 2026-01-21_15-00-02-requirements-consolidation.csv（来源：`apps/core-app/issues/2026-01-21_15-00-02-requirements-consolidation.csv:1`）

## 规范与约束来源

- Monorepo 标准（talex-touch）（来源：`docs/engineering/monorepo-standards.md:1`）
- AGENTS.md（来源：`AGENTS.md:1`）

