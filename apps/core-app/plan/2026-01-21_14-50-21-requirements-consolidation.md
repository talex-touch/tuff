---
mode: plan
cwd: /Users/talexdreamsoul/Workspace/Projects/talex-touch/apps/core-app
task: 整理所有相关需求并生成统一执行顺序文档
complexity: complex
planning_method: builtin
created_at: 2026-01-21T14:50:26+0800
---

# Plan: 需求汇总与执行顺序整合

🎯 任务概述
本计划的目标是把当前仓库内分散在 plan、PRD、issues、工程规范等多处的需求与约束统一汇总，
形成一份“完整、细粒度、可执行、带顺序”的需求总表，并明确每条需求的范围、依赖、状态与验收口径。

📋 执行计划
1. 需求源清单化：列出所有可能的需求来源并建立索引，至少覆盖根目录 `plan/`、`docs/plan-prd/`、
   `issues/`、`docs/engineering/monorepo-standards.md`、`AGENTS.md`，并确认是否存在 core-app
   私有文档或其他隐藏入口。
2. 统一抽取模板：设计统一的需求抽取字段（如：ID、标题、描述、优先级、范围、平台差异、
   依赖、验收标准、来源链接、当前状态），并规定命名与编号策略，确保跨文档一致。
3. 逐文档结构化抽取：按文档类型依序抽取需求（plan/、PRD、issues、规范/约束），记录原始
   文本片段与来源路径，避免信息丢失，必要时保留“原文引用”字段。
4. 去重与冲突处理：对重复/近似需求合并，保留差异点；若出现冲突（目标、口径、优先级），
   标注为待澄清并输出“冲突清单”。
5. 需求分组与标签化：按系统域划分（core-app 主进程、renderer、plugin SDK、transport、
   Nexus 文档/网站、构建/CI、tuffex 组件等），并给出跨域标签（如性能、权限、兼容性、可观测性）。
6. 现状与缺口对齐：对每条需求标注当前代码/文档完成度（已完成/部分完成/未开始），
   并用路径引用到关键实现或缺失点，形成“需求-实现对照表”。
7. 依赖与执行顺序：为需求建立依赖关系（技术前置、文档前置、工具链前置、平台差异），
   输出线性执行顺序与阶段里程碑（基础能力 → 迁移/改造 → 文档/验证 → 收尾）。
8. 生成统一需求文档：创建统一的需求总表文档，结构包含：范围说明、来源索引、需求清单、
   执行顺序、依赖矩阵、风险与待澄清问题、验收标准。
9. 评审与确认：与需求方确认冲突项、优先级与执行顺序；需要时拆分为可执行子任务或 issue。
10. 维护机制：定义后续新增需求的归档流程（更新统一文档 + 原文链接 + 状态同步），避免再次分散。

⚠️ 风险与注意事项
- 文档来源分散且口径不一，若不统一字段与编号，后续很难维护与追踪。
- 需求之间存在隐性依赖（例如 transport 迁移先于插件 SDK 调整），需要明确顺序以免返工。
- 平台差异（macOS/Windows/Linux）可能导致执行顺序不同，需在需求中明确平台限定条件。
- 已完成/部分完成的需求若缺少证据链接，会影响执行顺序与评审可信度。

📎 参考
- `plan/2026-01-19_11-10-40-perf-log-analysis.md`
- `plan/2026-01-20_18-47-54-config-storage-sqlite-json-sync.md`
- `plan/2026-01-20_18-50-26-touchsdk-window-hooks-migration.md`
- `plan/2026-01-20_18-55-03-context-requirements.md`
- `plan/2026-01-20_18-48-52-plugin-cli-refine.md`
- `plan/2026-01-20_21-16-53-tuffex-components-34578.md`
- `plan/2026-01-20_21-17-14-stash-pop-recovery.md`
- `plan/2026-01-21_01-29-05-transport-migration-async.md`
- `plan/2026-01-21_03-01-57-transport-message-port.md`
- `plan/2026-01-21_13-22-14-nexus-examples-section.md`
- `plan/2026-01-21_13-25-00-nexus-homepage-revamp.md`
- `plan/2026-01-21_13-25-11-download-internal-visibility.md`
- `plan/2026-01-21_13-39-30-basemodule-lifecycle-analysis.md`
- `plan/planprd-release-pipeline.md`
- `plan/planprd-app-indexing.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/03-features/plugin/permission-center-prd.md`
- `docs/plan-prd/03-features/search/EVERYTHING-SDK-INTEGRATION-PRD.md`
- `docs/plan-prd/04-implementation/CoreAppRefactor260111.md`
- `docs/plan-prd/06-ecosystem/TUFFCLI-PRD.md`
- `docs/engineering/monorepo-standards.md`
- `issues/2026-01-20_18-52-04-plugin-cli-refine.csv`
- `issues/2026-01-20_18-56-53-touchsdk-window-hooks-migration.csv`
- `AGENTS.md`
