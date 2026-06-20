# 文档索引

> 更新时间：2026-06-19
> 定位：仓库文档导航。当前执行状态以 `docs/plan-prd/TODO.md` 为准，历史事实以 `docs/plan-prd/01-project/CHANGES.md` 为准。

## 主入口

- `docs/plan-prd/README.md` - PRD / 规划主索引。
- `docs/plan-prd/TODO.md` - 当前 2 周执行清单。
- `docs/plan-prd/TODO-AI.md` - R2 AI 2.5.0 Stable packaged evidence 收口清单。
- `docs/plan-prd/TODO-R3.md` - R3 Search / Indexing Runtime 收口清单。
- `docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md` - R0-R9 阶段化执行路线与当前 SoT。
- `docs/plan-prd/04-implementation/Current-Execution-Plan-2026-06-17.md` - 当前项目进程与短期执行计划。
- `docs/plan-prd/04-implementation/Project-Roadmap-Audit-2026-06-18.md` - Roadmap / release / pricing / docs hygiene 审计记录。
- `docs/plan-prd/04-implementation/Pricing-SoT-2026-06-18.md` - Pioneer 免费阶段与未来定价待决策项 SoT。
- `docs/plan-prd/04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md` - AI 2.5.0 Stable 固定证据矩阵。
- `docs/plan-prd/04-implementation/Evidence-Matrix-Nexus-Governance-2026-06-18.md` - Nexus production governance 证据矩阵。
- `docs/plan-prd/04-implementation/Evidence-Matrix-Platform-2026-06-18.md` - 平台能力非阻塞 smoke 矩阵。
- `docs/plan-prd/01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md` - 产品总览与路线图。
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` - PRD 质量基线与门禁约束。
- `docs/plan-prd/01-project/CHANGES.md` - 近 30 天变更日志与历史归档入口。
- `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md` - 长期债务池。
- `docs/engineering/README.md` - 工程过程资料索引。

## 当前口径

- 版本：当前稳定基线为 `2.4.10`；当前代码版本为 root/CoreApp `2.4.12-beta.8`；本地 `HEAD=9e78e67bc`。
- 工作区：存在大量未提交改动，后续必须按 related-only 拆分验证，不能混合 QuickOps、Nexus、AI、docs、packages。
- 发布：最近完整发布链路证据仍是 `2.4.11-beta.6` GitHub prerelease、Nexus BETA latest sync 与发布后 Gate D strict；`2.4.11` checklist 通过不等于 R1 Release Integrity 完成。
- Roadmap：当前主线按 Roadmap vNext 推进 R0-R9，优先 R0 口径清理、R1 Release Integrity、R2 AI Stable、R3 Indexing Runtime。
- 发布策略：公共包发布不再作为独立 Roadmap / blocker / evidence 项；版本变更后只跟踪 GitHub 自动发版 workflow 结果。
- 平台验证：owner 已完成的平台人工验证不再作为 Roadmap 待办、平台后续或 release blocker；平台能力只保留 degraded / fail-closed 回归要求。

## 验收边界

- R1 Release Integrity：Nexus release asset `sha256`、`signatureUrl`、signature endpoint、manifest/download matrix 仍需真实链路 evidence。
- R2 AI Stable：只承诺 CoreBox 文本 + 显式 OCR、provider routing 与固定失败路径；必须按 AI Stable Evidence Matrix 补 packaged Electron 成功、失败路径与 Local/Ollama routing evidence。
- R7 Nexus Governance：production / preview 完成只接受 live/D1/R2 等可复现 evidence；memory/local-only 只能标记 partial。
- Platform Capability：平台 smoke 是非阻塞回归矩阵，不恢复为 release blocker；不可用能力必须展示 degraded/unsupported reason。
- Pricing：当前公开站只承诺 Pioneer `0 元 / $0`；`FREE / PRO / PLUS / TEAM / ENTERPRISE` 只是权限/套餐分层，不代表正式价格。

## 高价值专题入口

- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md` - Tuff 2.5.0 AI 桌面入口收口 Plan PRD。
- `docs/plan-prd/03-features/ai-2.5.3-local-knowledge-retrieval-prd.md` - 本地知识检索与上下文构建 PRD。
- `docs/plan-prd/03-features/ai-2.5.4-context-hygiene-memory-prd.md` - ContextHygiene 与自动记忆治理 PRD。
- `docs/plan-prd/03-features/ai-2.5.5-local-model-runtime-prd.md` - 本地开源模型运行时 PRD。
- `docs/plan-prd/03-features/ai-2.5.8-asr-provider-runtime-prd.md` - ASR Provider Runtime PRD。
- `docs/plan-prd/03-features/tuff-quickops-prd.md` - Tuff QuickOps 本地系统快捷工具集 PRD。
- `apps/nexus/content/docs/guide/features/quickops.zh.mdc` / `apps/nexus/content/docs/guide/features/quickops.en.mdc` - Nexus QuickOps 用户指南。
- `apps/nexus/content/docs/dev/api/quickops.zh.mdc` / `apps/nexus/content/docs/dev/api/quickops.en.mdc` - Nexus QuickOps 开发者 API。
- `docs/plan-prd/03-features/i18n-lexicon-catalog-2.6.0-prd.md` - i18n / Domain Lexicon / Cloud Catalog 收敛 PRD。
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md` - Indexing Runtime V1 统一搜索源计划。
- `docs/plan-prd/03-features/search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md` - App Data Plugins 与 Everything 收口 Roadmap。
- `docs/plan-prd/03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md` - Raycast / uTools 常用能力差距矩阵。
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md` - Nexus Provider 聚合与 Scene 编排 PRD。
- `docs/plan-prd/01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md` - Nexus Data Governance 当前进度快照。
- `docs/plan-prd/04-implementation/NexusStorageGovernanceRunbook-2026-05-24.md` - Nexus storage governance runbook。
- `docs/plan-prd/04-implementation/NexusNotificationGovernanceRunbook-2026-05-24.md` - Nexus notification governance runbook。
- `docs/plan-prd/04-implementation/performance/CoreAppPerformanceBaseline-2026-05-28.md` - CoreApp 性能基线与优化计划。
- `docs/plan-prd/04-implementation/performance/WindowsStartupOptimization-2026-06-18.md` - Windows 启动优化 PRD。
- `docs/plan-prd/report/` - UI/兼容/占位审计历史报告目录。
- `docs/plan-prd/04-implementation/README.md` - 实施文档状态索引。
- `docs/plan-prd/docs/NEXUS-RELEASE-ASSETS-CHECKLIST.md` - Release assets 核对入口。

## 归档与降权

- `docs/plan-prd/05-archive/*` - 历史 PRD 归档，不参与当前里程碑状态统计。
- `docs/plan-prd/next-edit/*` - 草稿池，不作为发布判定来源。
- `docs/plan-prd/docs/archive/TODO-pre-compression-2026-05-14.md` - TODO 压缩前快照。
- `docs/plan-prd/01-project/archive/changes/CHANGES-pre-doc-compression-2026-05-14.md` - CHANGES 压缩前快照。
- `docs/plan-prd/docs/archive/PRD-QUALITY-BASELINE-pre-compression-2026-05-14.md` - 质量基线压缩前快照。
- `docs/plan-prd/01-project/archive/PRODUCT-OVERVIEW-ROADMAP-2026Q1-pre-compression-2026-05-14.md` - 路线图压缩前快照。

## 文档维护规则

- 行为/接口/架构变更至少同步 `README / TODO / CHANGES / INDEX` 之一。
- 目标或质量门禁变化必须同步 Roadmap 与 Quality Baseline。
- 入口文档不承载长历史；长尾任务进入长期债务池，历史事实进入 CHANGES 或 archive。
