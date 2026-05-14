# TuffTransport 实现指南（Deep Dive）

> 状态：历史参考 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/IMPLEMENTATION-GUIDE.deep-dive.full-2026-05-14.md`
> 当前入口：`./IMPLEMENTATION-GUIDE.md`、`./API-REFERENCE.md`、`../../TODO.md`

## TL;DR

本文保留 2026-03 阶段式 TuffTransport 实现设计，包含 Event Builder、BatchManager、MessagePort Stream、SDK 封装与兼容层迁移。当前项目已进入 typed event boundary 与 retained alias 分批治理阶段，因此本文仅作历史参考。

## 历史有效结论

- 事件定义应集中管理并具备类型约束。
- 高频/流式场景应评估 MessagePort 或 stream 能力。
- SDK 封装优先于业务层直接触碰 channel。
- 兼容层必须可观测、可退场。

## 当前项目口径

- 新增事件优先 typed builder。
- retained raw event 迁移走 canonical event + legacy alias registry + dual listen。
- 不无损确认前不得改变既有 wire name。
- Transport Wave A 状态以 `TODO.md`、`TransportRetainedEventWireNamePlan-260514.md` 与 transport boundary tests 为准。

## 关联入口

- `docs/plan-prd/03-features/tuff-transport/IMPLEMENTATION-GUIDE.md`
- `docs/plan-prd/03-features/tuff-transport/API-REFERENCE.md`
- `docs/plan-prd/04-implementation/TransportRetainedEventWireNamePlan-260514.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
