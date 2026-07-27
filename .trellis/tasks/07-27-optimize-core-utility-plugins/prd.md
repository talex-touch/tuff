# 优化核心效率插件

## Goal

系统审计并优化 Translation、Intelligence 与 Clipboard 三个高频效率插件，使核心工作流更直接、一致、稳定，并由三个可独立交付的子任务承载实现。

## Background

- 用户已确认目标是 Translation、Intelligence、Clipboard 三个插件；“定调优化”描述的是本轮工作方向，不是第四个插件。
- 仓库中的对应实现目录为 `plugins/touch-translation`、`plugins/touch-intelligence`、`plugins/clipboard-history`。
- 本父任务负责统一目标、任务边界、跨插件体验原则和最终集成验收，不直接承载插件实现。

## Requirements

- R1：分别审计三个插件的现有功能、用户主路径、交互状态、可靠性、性能和测试覆盖，并将证据落入对应子任务。
- R2：每个插件必须形成独立的 PRD、技术设计、实施计划和可验证验收标准。
- R3：优先优化用户可感知的高频路径，避免无证据的架构重写和跨插件大范围重构。
- R4：三个插件的交互、状态反馈、错误恢复和宿主能力使用应遵循项目现有插件规范，并在最终集成检查中保持一致。
- R5：首轮以 Clipboard 作为体验与验收样板，完成后依次推进 Translation、Intelligence。

## Task Map

- `07-27-optimize-translation-plugin`：Translation 插件。
- `07-27-optimize-intelligence-plugin`：Intelligence 插件。
- `07-27-optimize-clipboard-plugin`：Clipboard 插件。

## Delivery Order

1. Clipboard：先完成高频工作流优化并沉淀体验与验收样板。
2. Translation：复用样板，收敛普通翻译与多 Provider 主路径。
3. Intelligence：在前两项经验基础上处理更复杂的 AI 问答与命令体验。

## Acceptance Criteria

- [ ] 三个子任务均有基于代码证据的现状审计、明确范围和可测试验收标准。
- [ ] 三个子任务均完成自身质量门禁，相关测试、类型检查和构建通过。
- [ ] 三个插件的关键主路径、加载态、空状态、错误态和恢复路径经过最终集成复核。
- [ ] 最终交付未引入未经批准的跨插件重构，也未破坏插件宿主契约。
- [ ] 父任务记录三个子任务的完成证据和剩余风险。

## Out of Scope

- 与三个目标插件无直接关系的其他内置插件。
- 无现有问题或产品目标支撑的插件平台重写。
- 本规划阶段直接开始业务代码实现。

## Decisions

- 2026-07-27：用户选择 Clipboard 优先，随后推进 Translation，最后推进 Intelligence。
