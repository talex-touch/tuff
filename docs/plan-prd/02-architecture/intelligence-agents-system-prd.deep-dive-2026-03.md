# Intelligence Agents 系统 PRD（Deep Dive）

> 状态：历史参考 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/intelligence-agents-system-prd.deep-dive.full-2026-05-14.md`
> 当前入口：`./intelligence-agents-system-prd.md`、`../03-features/ai-2.5.0-plan-prd.md`、`../TODO.md`

## TL;DR

本文保留 Intelligence Agents 早期完整设想。当前项目已将 2.5.0 AI 范围收紧为桌面入口收口：Stable 只承诺文本 + OCR，Agent/Workflow 高级能力分层进入 Beta 或后续。

## 历史有效结论

- Agent / Workflow 需要审计、权限、工具调用、失败恢复与可观测性。
- 复杂自动化应进入 Review Queue 或审批流程，不应默认静默执行。
- 记忆系统、长任务与多 Agent 协作需要严格的数据边界与回滚策略。

## 当前项目口径

- CoreBox AI Ask 与 OmniPanel Writing Tools 是 2.5.0 用户主入口。
- Workflow `Use Model`、Review Queue 与 3 个 P0 模板是近期重点。
- 多 Agent 长任务、Assistant、全量多模态生成编辑保持 Experimental / 2.5.x 后续。
- 插件/Agent 调用工具必须遵守权限与审计规则。

## 关联入口

- `docs/plan-prd/02-architecture/intelligence-agents-system-prd.md`
- `docs/plan-prd/03-features/ai-2.5.0-plan-prd.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/TODO.md`
