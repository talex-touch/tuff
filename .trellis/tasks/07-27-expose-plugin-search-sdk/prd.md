# 开放插件 SearchSDK（候选待办）

## Status

本任务已从 Clipboard History 优化范围移出，优先级降为 P3。当前不进入设计或实现。

## Problem Statement

仓库已有 `fuzzyMatch`、`matchFeature` 等共享底层函数，但没有面向插件普通候选集合的高层 SearchSDK。单一 Clipboard History 消费者可以直接使用领域数据库查询，尚不足以证明需要新增通用抽象。

## Start Conditions

仅在以下条件同时成立时重新规划：

- 至少两个真实插件需要对各自已持有的候选集合执行相同的快速匹配、排序或高亮。
- 现有领域查询或直接复用底层函数会造成可证明的重复、行为漂移或维护问题。
- 候选规模、执行进程、排序语义和权限边界已有具体消费者证据。

## Acceptance Criteria For Replanning

- [ ] 列出至少两个真实消费者及各自候选数据规模。
- [ ] 明确现有 API 无法满足的共同需求。
- [ ] 先定义最小共享契约，再决定是否需要会话、增量 Top-K、transport 或权限。

## Out of Scope

- 为 Clipboard History 单独包装一个通用 SDK。
- 在没有消费者证据时预先设计全历史扫描、Search transport 或复杂排名系统。
