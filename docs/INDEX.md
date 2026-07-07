# 文档索引

> 更新时间：2026-07-04
> 定位：仓库文档导航。当前执行状态以 `docs/plan-prd/TODO.md` 为准，历史事实以 `docs/plan-prd/01-project/CHANGES.md` 为准。

## 主入口

- `docs/plan-prd/README.md` - PRD / 规划主索引。
- `docs/plan-prd/TODO.md` - 当前 2 周执行清单。
- `docs/plan-prd/TODO-AI.md` - R2 AI Stable 收口清单。
- `docs/plan-prd/TODO-R3.md` - R3 Search / Indexing Runtime 收口清单。
- `docs/plan-prd/TODO-nexus.md` - Nexus 性能收口清单。
- `docs/plan-prd/04-implementation/Roadmap-vNext-2026-06-18.md` - R0-R9 当前 SoT。
- `docs/plan-prd/04-implementation/Stability-Architecture-Optimization-2026-07-04.md` - 稳定性与架构优化执行导航。
- `docs/plan-prd/04-implementation/Current-Execution-Plan-2026-06-17.md` - 当前项目进程与短期执行计划。
- `docs/plan-prd/04-implementation/Pricing-SoT-2026-06-18.md` - Pioneer 免费阶段与未来定价待决策项 SoT。
- `docs/plan-prd/01-project/CHANGES.md` - 当前阶段变更索引。
- `docs/engineering/README.md` - 工程过程资料索引。

## 验收入口

- `docs/plan-prd/04-implementation/Evidence-Matrix-AI-Stable-2026-06-18.md` - AI Stable 固定证据矩阵。
- `docs/plan-prd/04-implementation/Evidence-Matrix-Nexus-Governance-2026-06-18.md` - Nexus production governance 证据矩阵。
- `docs/plan-prd/04-implementation/Evidence-Matrix-Platform-2026-06-18.md` - 平台能力非阻塞 smoke 矩阵。
- `docs/engineering/reports/release-integrity-2026-06-22/` - R1 Release Integrity Gate E 真实链路复采证据。
- `docs/engineering/reports/coreapp-visible-ai-stable-2026-06-18/` - CoreApp visible AI curated evidence。
- `docs/engineering/reports/startup-packaged-hot-runs-2026-06-21/` - packaged hot startup benchmark 摘要。
- `docs/engineering/reports/startup-packaged-cold-runs-2026-06-21/` - packaged cold startup benchmark 摘要。
- `docs/engineering/reports/nexus-performance-2026-06-21/` - Nexus performance 当前工作表。

## 高价值专题

- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md` - Tuff 2.5.0 AI 桌面入口收口 PRD。
- `docs/plan-prd/03-features/omnipanel-assistant-next-prd.md` - OmniPanel 与悬浮助手下一版本 PRD。
- `docs/plan-prd/03-features/ai-2.5.3-local-knowledge-retrieval-prd.md` - 本地知识检索与上下文构建 PRD。
- `docs/plan-prd/03-features/ai-2.5.4-context-hygiene-memory-prd.md` - ContextHygiene 与自动记忆治理 PRD。
- `docs/plan-prd/03-features/ai-2.5.5-local-model-runtime-prd.md` - 本地开源模型运行时 PRD。
- `docs/plan-prd/03-features/ai-2.5.8-asr-provider-runtime-prd.md` - ASR Provider Runtime PRD。
- `docs/plan-prd/03-features/native-rust-runtime-migration-prd.md` - Native Rust runtime migration PRD。
- `docs/plan-prd/03-features/tuff-quickops-prd.md` - Tuff QuickOps 本地系统快捷工具集 PRD。
- `docs/plan-prd/03-features/i18n-lexicon-catalog-2.6.0-prd.md` - i18n / Domain Lexicon / Cloud Catalog 收敛 PRD。
- `docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md` - Indexing Runtime V1 统一搜索源计划。
- `docs/plan-prd/03-features/search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md` - App Data Plugins 与 Everything 收口 Roadmap。
- `docs/plan-prd/03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md` - Raycast / uTools 常用能力差距矩阵。
- `docs/plan-prd/02-architecture/nexus-provider-scene-aggregation-prd.md` - Nexus Provider 聚合与 Scene 编排 PRD。
- `docs/plan-prd/04-implementation/performance/WindowsStartupOptimization-2026-06-18.md` - Windows 启动优化 PRD。
- `docs/plan-prd/04-implementation/Stability-Architecture-Optimization-2026-07-04.md` - 稳定性优先级、架构代码落点与最小验证矩阵。
- `docs/plan-prd/docs/NEXUS-RELEASE-ASSETS-CHECKLIST.md` - Release assets 核对入口。
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md` - PRD 质量基线与门禁约束。

## 文档维护规则

- 入口文档只保留当前事实、下一动作与高价值导航。
- 更早过程记录不再放入文档树，需要时从 Git 历史追溯。
- 行为/接口/架构变更至少同步 `README / TODO / CHANGES / INDEX` 之一。
- 目标或质量门禁变化必须同步 Roadmap 与 Quality Baseline。
- reports 只提交 curated 摘要、manifest/checklist 与最终证据；raw/log/user-data 进入本地忽略目录。
