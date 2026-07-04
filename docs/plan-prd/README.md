# Talex Touch - 项目文档中心

> 更新时间：2026-07-04
> 定位：PRD / 规划主入口。这里只保留当前 SoT、下一动作和高价值导航。

## 快速入口

- [项目待办](./TODO.md)
- [AI Stable 收口 TODO](./TODO-AI.md)
- [R3 Search / Indexing Runtime 收口 TODO](./TODO-R3.md)
- [Nexus Performance TODO](./TODO-nexus.md)
- [Roadmap vNext](./04-implementation/Roadmap-vNext-2026-06-18.md)
- [当前项目进程与执行计划](./04-implementation/Current-Execution-Plan-2026-06-17.md)
- [R8 / R9 下一阶段分批执行计划](./04-implementation/R8-R9-Next-Stage-Execution-Plan-2026-06-24.md)
- [Pricing SoT](./04-implementation/Pricing-SoT-2026-06-18.md)
- [AI Stable Evidence Matrix](./04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md)
- [Nexus Governance Evidence Matrix](./04-implementation/Evidence-Matrix-Nexus-Governance-2026-06-18.md)
- [Platform Capability Smoke Matrix](./04-implementation/Evidence-Matrix-Platform-2026-06-18.md)
- [文档质量基线](./docs/PRD-QUALITY-BASELINE.md)
- [变更日志](./01-project/CHANGES.md)
- [实施文档状态索引](./04-implementation/README.md)
- [全局文档索引](../INDEX.md)

## 当前单一口径

- 当前代码版本为 root / CoreApp `2.4.13-beta.1`。
- 当前主线按 Roadmap vNext 推进 R0-R9，优先 R1 Release Integrity、R2 AI Stable、R3 Indexing Runtime。
- R8 / R9 已进入下一阶段执行：R8 locale core / localized value 与 plugin manifest localization foundation 已落；R9 2.5.3 local knowledge SQLite/FTS5/citation foundation 已接入 2.5.4 ContextPackage metadata；R9.2 ContextHygiene 已有 session/checkpoint/package log、Audit explain shell、MemoryPolicy 预览与 Memory Review 最小 list / enable-disable / tombstone delete，剩余 TODO 见 `TODO.md` 的 R9.2 专项表。
- 公共包发布不再作为独立 Roadmap / blocker / evidence 项；版本变更后以 GitHub 自动发版 workflow 结果为准。
- owner 已完成的平台人工验证不再作为 Roadmap 待办、平台后续或 release blocker。
- Nexus 性能线独立跟踪到 `TODO-nexus.md`，不与 CoreApp / AI / R3 工作混批；当前约 `98%` guarded，local Wrangler runtime、PWA precache trim、worker/runtime evidence guard 与 deployed preview collector guard 已闭合，最终 done 仍以 deployed Cloudflare Pages preview evidence 与 `check-runtime-evidence --require-deployed-preview` 为准。
- R3 Indexing Runtime：durable job history focused code/test、Settings diagnostics JSON verifier、packaged probe 入口、isolated controlled seeded evidence、isolated maintenance reset evidence、durable runtime-store resource migration、source-scoped `scan_progress` schema/resource migration 与生产迁移 readiness auditor 已完成；source-read-only readiness 已 ready，legacy `file_fts` 本批保留不改，仍需真实 SQLite/FTS/`scan_progress` migration/preflight evidence 和自然 recent task packaged Settings 截图/录屏 artifact。

## 当前验收边界

- R1 Release Integrity：Nexus 资产 `sha256`、`signatureUrl`、signature endpoint 与真实自动发版 workflow evidence 仍未闭环。
- R2 AI Stable：CoreBox AI Ask、CoreBox search states、App Index workbench、browser login recovery 与 OmniPanel writing tools packaged surfaces 已 passed；global visible gate 仍需 Assistant / Workflow / Provider broader visible surfaces。
- R3 Indexing Runtime：durable job history focused code/test、Settings diagnostics JSON verifier、packaged probe 入口、isolated controlled seeded evidence、isolated maintenance reset evidence、durable runtime-store resource migration、source-scoped `scan_progress` schema/resource migration 与生产迁移 readiness auditor 已完成；legacy `file_fts` 本批保留不改；仍需真实 SQLite/FTS/`scan_progress` migration/preflight evidence、自然 recent task packaged Settings 截图/录屏 artifact 与 durable scheduler 长尾。
- R9.2 ContextHygiene：当前是 partial / 约半程状态；已落 Memory Review 最小治理闭环，但未完成 CompressionSnapshot、Memory 搜索/编辑/来源审计、OmniPanel/Workflow/Assistant 最近路径与真实数据 evidence。
- R7 Nexus Governance：production / preview 完成只接受 live/D1/R2 等可复现 evidence；memory/local-only 只能标 partial。
- Nexus Performance：local/static/Wrangler evidence 只能标 guarded；production 完成必须有 deployed Cloudflare Pages preview HAR、真实 provider callback smoke、authenticated dashboard runtime smoke 与真实 bfcache hit。
- Platform Capability：平台 smoke 是非阻塞回归矩阵；要求 degraded/unsupported reason 与 fail-closed。
- Pricing：当前公开站只承诺 Pioneer 阶段 `0 元 / $0`。

## 高价值专题入口

- [Tuff 2.5.0 AI 桌面入口收口 PRD](./03-features/ai-2.5.0-plan-prd.md)
- [OmniPanel 与悬浮助手下一版本 PRD](./03-features/omnipanel-assistant-next-prd.md)
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
