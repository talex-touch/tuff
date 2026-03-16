# 智能代理（Intelligence Agents）系统设计文档（压缩版）

> 状态: 活跃（Phase 3 持续收口）
> 更新时间: 2026-03-16
> 适用范围: `apps/core-app` Agents 子系统、`packages/*` 智能体能力
> 替代入口: `docs/plan-prd/TODO.md`、`docs/plan-prd/01-project/CHANGES.md`
> 深入文档: `intelligence-agents-system-prd.deep-dive-2026-03.md`

## TL;DR

- Agents 已完成 Phase 1/2 与 Phase 3 的核心能力落地（命名空间切换、Prompt Registry、状态机接管等）。
- 当前主线是“能力稳定化 + 回归补齐 + 生态可维护”，不是大规模扩面。
- 本页保留执行边界与验收口径，完整架构细节放在 deep-dive。

## 当前执行重点

1. Workflow 编辑器与高级协作能力补齐。
2. 记忆系统治理与回归用例补齐。
3. 能力/渠道/审计 UI 的一致性与可观测性提升。

## 约束与边界

- 输入/输出保持 schema 可校验。
- 跨层调用必须使用 typed transport/SDK。
- 任务链路必须具备超时与降级策略，错误可解释。

## 验收口径

- 任务执行稳定回归（成功率、可观测、失败可追踪）。
- 文档与实现同日闭环（`README/TODO/CHANGES` 同步）。
- 不新增破坏性接口变更。

## 追溯

- 完整架构、类型与分阶段实施细节：`intelligence-agents-system-prd.deep-dive-2026-03.md`
