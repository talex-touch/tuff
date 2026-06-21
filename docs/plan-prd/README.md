# Talex Touch - 项目文档中心

> 更新时间：2026-06-21
> 定位：PRD / 规划主入口。这里只保留当前 SoT、下一动作和高价值导航。

## 快速入口

- [项目待办](./TODO.md)
- [AI Stable 收口 TODO](./TODO-AI.md)
- [R3 Search / Indexing Runtime 收口 TODO](./TODO-R3.md)
- [Nexus Performance TODO](./TODO-nexus.md)
- [Roadmap vNext](./04-implementation/Roadmap-vNext-2026-06-18.md)
- [当前项目进程与执行计划](./04-implementation/Current-Execution-Plan-2026-06-17.md)
- [Pricing SoT](./04-implementation/Pricing-SoT-2026-06-18.md)
- [AI Stable Evidence Matrix](./04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md)
- [Nexus Governance Evidence Matrix](./04-implementation/Evidence-Matrix-Nexus-Governance-2026-06-18.md)
- [Platform Capability Smoke Matrix](./04-implementation/Evidence-Matrix-Platform-2026-06-18.md)
- [文档质量基线](./docs/PRD-QUALITY-BASELINE.md)
- [变更日志](./01-project/CHANGES.md)
- [实施文档状态索引](./04-implementation/README.md)
- [全局文档索引](../INDEX.md)

## 当前单一口径

- 当前代码版本为 root / CoreApp `2.4.12-beta.8`。
- 当前主线按 Roadmap vNext 推进 R0-R9，优先 R1 Release Integrity、R2 AI Stable、R3 Indexing Runtime。
- 公共包发布不再作为独立 Roadmap / blocker / evidence 项；版本变更后以 GitHub 自动发版 workflow 结果为准。
- owner 已完成的平台人工验证不再作为 Roadmap 待办、平台后续或 release blocker。
- Nexus 性能线独立跟踪到 `TODO-nexus.md`，不与 CoreApp / AI / R3 工作混批。

## 当前验收边界

- R1 Release Integrity：Nexus 资产 `sha256`、`signatureUrl`、signature endpoint 与真实自动发版 workflow evidence 仍未闭环。
- R2 AI Stable：CoreBox AI Ask packaged surface 已 passed；global visible gate 仍需 broader visible surfaces。
- R3 Indexing Runtime：仍需 FileProvider SQLite/FTS runtime-store migration、source-scoped `scan_progress`、durable scheduler evidence。
- R7 Nexus Governance：production / preview 完成只接受 live/D1/R2 等可复现 evidence；memory/local-only 只能标 partial。
- Platform Capability：平台 smoke 是非阻塞回归矩阵；要求 degraded/unsupported reason 与 fail-closed。
- Pricing：当前公开站只承诺 Pioneer 阶段 `0 元 / $0`。

## 高价值专题入口

- [Tuff 2.5.0 AI 桌面入口收口 PRD](./03-features/ai-2.5.0-plan-prd.md)
- [本地知识检索 PRD](./03-features/ai-2.5.3-local-knowledge-retrieval-prd.md)
- [ContextHygiene 与自动记忆治理 PRD](./03-features/ai-2.5.4-context-hygiene-memory-prd.md)
- [本地开源模型运行时 PRD](./03-features/ai-2.5.5-local-model-runtime-prd.md)
- [ASR Provider Runtime PRD](./03-features/ai-2.5.8-asr-provider-runtime-prd.md)
- [Native Rust Runtime Migration PRD](./03-features/native-rust-runtime-migration-prd.md)
- [i18n / Domain Lexicon / Cloud Catalog 收敛 PRD](./03-features/i18n-lexicon-catalog-2.6.0-prd.md)
- [Tuff QuickOps PRD](./03-features/tuff-quickops-prd.md)
- [Indexing Runtime V1](./03-features/search/INDEXING-RUNTIME-V1-PLAN.md)
- [App Data Plugins 与 Everything Roadmap](./03-features/search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md)
- [Raycast / uTools 能力差距矩阵](./03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md)
- [Nexus Provider 聚合与 Scene 编排 PRD](./02-architecture/nexus-provider-scene-aggregation-prd.md)
- [Windows 启动优化 PRD](./04-implementation/performance/WindowsStartupOptimization-2026-06-18.md)

## 文档治理规则

- 入口文档只保留当前事实、下一动作与高价值导航。
- 6 月以前过程记录不再放入文档树，需要时从 Git 历史追溯。
- 行为/接口/架构改动至少同步 `README / TODO / CHANGES / INDEX` 之一。
- 目标或质量门禁变化必须同步 Roadmap 与 Quality Baseline。
- `TODO.md` 只承载当前 2 周主清单；长期事项进入专题 TODO 或后续单独恢复。
