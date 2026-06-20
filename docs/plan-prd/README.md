# Talex Touch - 项目文档中心

> 更新时间：2026-06-19
> 定位：PRD / 规划主入口。这里只保留当前 SoT、下一动作和高价值导航；历史细节进入 `CHANGES`、`TODO`、专题文档或 archive。

## 快速入口

- [项目待办（2 周主清单）](./TODO.md)
- [AI Stable 收口 TODO](./TODO-AI.md)
- [R3 Search / Indexing Runtime 收口 TODO](./TODO-R3.md)
- [Roadmap vNext（R0-R9 当前 SoT）](./04-implementation/Roadmap-vNext-2026-06-18.md)
- [当前项目进程与执行计划](./04-implementation/Current-Execution-Plan-2026-06-17.md)
- [项目进展严重问题审计与收口口径](./04-implementation/Project-Roadmap-Audit-2026-06-18.md)
- [Pricing SoT](./04-implementation/Pricing-SoT-2026-06-18.md)
- [AI Stable Evidence Matrix](./04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md)
- [Nexus Governance Evidence Matrix](./04-implementation/Evidence-Matrix-Nexus-Governance-2026-06-18.md)
- [Platform Capability Smoke Matrix](./04-implementation/Evidence-Matrix-Platform-2026-06-18.md)
- [产品总览与路线图](./01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md)
- [文档质量基线](./docs/PRD-QUALITY-BASELINE.md)
- [变更日志（近 30 天 + 历史归档）](./01-project/CHANGES.md)
- [实施文档状态索引](./04-implementation/README.md)
- [全局文档索引](../INDEX.md)

## 当前单一口径

- 当前基线：`2.4.10` 已有 GitHub Release 与 Nexus release metadata sync；当前代码版本为 root/CoreApp `2.4.12-beta.8`，本地 `HEAD=9e78e67bc`，且工作区存在大量未提交改动，必须按 related-only 拆分验证。
- 最近完整发布链路证据仍是 `2.4.11-beta.6` GitHub prerelease、Nexus BETA latest sync 与发布后 Gate D strict；`2.4.11` checklist 通过不等于 R1 Release Integrity 完成。
- 当前主线：按 Roadmap vNext 推进 R0-R9，优先 R0 口径清理、R1 Release Integrity、R2 AI 2.5.0 Stable、R3 Indexing Runtime。
- 公共包发布不再作为独立 Roadmap / blocker / evidence 项；版本变更后以 GitHub 自动发版 workflow 结果为准。
- owner 已完成的平台人工验证不再作为 Roadmap 待办、平台后续或 release blocker。

## 当前验收边界

- R1 Release Integrity：Nexus 资产 `sha256`、`signatureUrl`、signature endpoint 与真实自动发版 workflow evidence 仍未闭环。
- R2 AI Stable：只承诺 CoreBox 文本 + 显式 OCR、provider routing 与固定失败路径；必须补 packaged Electron 文本/OCR 成功、固定失败路径与 Local/Ollama routing 证据，不能用 SDK/schema/focused tests 代替体验闭环。
- R7 Nexus Governance：本地代码、单元测试、Miniflare 或 memory/local-only smoke 只能算 partial；production/preview 完成以 live/D1/R2 evidence 为准。
- Platform Capability：平台 smoke 是非阻塞回归矩阵；要求 degraded/unsupported reason 与 fail-closed，不恢复为 release blocker。
- Pricing：当前公开站只承诺 Pioneer 阶段 `0 元 / $0`；`FREE / PRO / PLUS / TEAM / ENTERPRISE` 只是权限/套餐分层，不代表正式价格、credits 单价或团队席位价。

## 当前产品范围

- `2.5.0` Stable：CoreBox AI Ask 文本问答、显式 OCR → 文本问答、provider routing、明确错误与恢复建议。
- Beta：Workflow、Skills、Automation、Agent 工具执行、Review Queue、OmniPanel Writing Tools。
- Experimental / 后续：Assistant、语音、多模态生成、Computer Use、CDP 浏览器控制、可视化交互、Token 节省策略。
- 长期债务：AttachUIView、Multi Attach View、Widget Sandbox、Flow Transfer、DivisionBox 等统一进入 [长期债务池](./docs/TODO-BACKLOG-LONG-TERM.md)。

## 高价值专题入口

- [Tuff 2.5.0 AI 桌面入口收口 Plan PRD](./03-features/ai-2.5.0-plan-prd.md)
- [Tuff 2.5.3 本地知识检索 PRD](./03-features/ai-2.5.3-local-knowledge-retrieval-prd.md)
- [Tuff 2.5.4 ContextHygiene 与自动记忆治理 PRD](./03-features/ai-2.5.4-context-hygiene-memory-prd.md)
- [Tuff 2.5.5 本地开源模型运行时 PRD](./03-features/ai-2.5.5-local-model-runtime-prd.md)
- [Tuff 2.5.8 ASR Provider Runtime PRD](./03-features/ai-2.5.8-asr-provider-runtime-prd.md)
- [Tuff 2.6.0 i18n / Domain Lexicon / Cloud Catalog 收敛 PRD](./03-features/i18n-lexicon-catalog-2.6.0-prd.md)
- [Tuff QuickOps 本地系统快捷工具集 PRD](./03-features/tuff-quickops-prd.md)
- Nexus QuickOps 配套文档：[用户指南](../../apps/nexus/content/docs/guide/features/quickops.zh.mdc) / [Developer API](../../apps/nexus/content/docs/dev/api/quickops.zh.mdc)
- [Indexing Runtime V1 统一搜索源计划](./03-features/search/INDEXING-RUNTIME-V1-PLAN.md)
- [App Data Plugins 与 Everything 收口 Roadmap](./03-features/search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md)
- [Raycast / uTools 常用能力差距矩阵](./03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md)
- [Nexus Provider 聚合与 Scene 编排 PRD](./02-architecture/nexus-provider-scene-aggregation-prd.md)
- [Nexus Data Governance 当前进度快照](./01-project/NEXUS-DATA-GOVERNANCE-PROGRESS-2026-05-23.md)
- [Nexus Storage Governance Runbook](./04-implementation/NexusStorageGovernanceRunbook-2026-05-24.md)
- [Nexus Notification Governance Runbook](./04-implementation/NexusNotificationGovernanceRunbook-2026-05-24.md)
- [CoreApp 性能基线与优化执行计划](./04-implementation/performance/CoreAppPerformanceBaseline-2026-05-28.md)
- [Windows 启动优化 PRD](./04-implementation/performance/WindowsStartupOptimization-2026-06-18.md)
- [UI/兼容/占位审计历史索引](./report/)

## 文档治理规则

- 入口文档只保留当前事实、下一动作与高价值导航；历史细节进入 `CHANGES` 或 archive。
- 行为/接口/架构改动至少同步 `README / TODO / CHANGES / INDEX` 之一。
- 目标或质量门禁变化必须同时同步 Roadmap 与 Quality Baseline。
- `TODO.md` 只承载 2 周主清单；长期事项进入 `TODO-BACKLOG-LONG-TERM.md`。
- `CHANGES.md` 只保留近 30 天；完整压缩前快照见 `01-project/archive/changes/CHANGES-pre-doc-compression-2026-05-14.md`。
