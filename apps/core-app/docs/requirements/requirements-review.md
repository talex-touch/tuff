# 需求评审记录（Internal Review Record）

> 说明：这是“整理与归档阶段”的评审记录，用于固化冲突处理结论、优先级与执行顺序。

## 结论摘要

- 状态权威来源：**issues CSV 为唯一执行状态源**。
- 冲突处理结论：重复主题已合并为单一需求索引（见冲突清单）。
- 执行顺序：按“基础能力 → 迁移改造 → 文档验证 → 收尾”推进（见执行顺序）。

## 冲突处理结论

- 处理策略：相同主题在 plan/PRD/issues 重复出现时合并为单一索引条目，状态以 issues CSV 为准。
- 合并清单：见 `apps/core-app/docs/requirements/requirements-conflicts.md`

## 优先级与执行顺序

- 优先级来源：沿用 issues CSV 中的 P0/P1/P2 标注。
- 执行顺序：见 `apps/core-app/docs/requirements/requirements-sequence.md`

## 可执行子任务 / Issue 清单

- 核心任务快照：`apps/core-app/issues/2026-01-21_15-00-02-requirements-consolidation.csv`
- 相关专项任务快照：`issues/*.csv`（按领域拆分）

## 待确认项

- 各任务优先级是否需要调整（以产品/技术负责人最终确认）。
- Nexus 相关内容是否需要双语并行更新。

## 维护说明

- 每次评审更新需追加记录时间与变更点。
