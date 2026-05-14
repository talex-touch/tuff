# TuffTransport 通信系统设计文档

> 状态：Archived / 历史设计
> 更新时间：2026-05-14
> 完整快照：`./full/TUFF-TRANSPORT-PRD.full-2026-05-14.md`
> 当前入口：`../04-implementation/TransportRetainedEventWireNamePlan-260514.md`、`../TODO.md`、`../docs/PRD-QUALITY-BASELINE.md`

## TL;DR

本文是早期 TuffTransport 设计文档，定义了 Event Builder、Batch Request、MessagePort Stream、统一 SDK 与兼容层方向。当前项目已进入 typed transport / domain SDK / retained alias 分批治理阶段，因此本文件仅作历史参考。

## 历史有效结论

- 事件应通过 builder 定义，避免业务层硬编码 raw event 字符串。
- 跨层调用应具备 request/response 类型约束。
- 高频流式场景适合 MessagePort / stream 能力。
- 兼容层必须有退场窗口，不得无限期承载新能力。

## 当前项目口径

- 新增事件优先 typed builder。
- retained raw event 必须区分 production raw send violation 与 retained definition。
- 不直接改变既有 wire name；迁移应走 canonical event + legacy alias registry + dual listen + legacy hit evidence + hard-cut 条件。
- 当前执行状态以 `docs/plan-prd/TODO.md` 和 transport boundary tests 为准。

## 不再作为当前依据的内容

- 早期 BatchManager / StreamServer / StreamClient 交付排期。
- 早期兼容层长期并存叙事。
- 与当前 retained alias registry 不一致的实现细节。

## 关联入口

- `docs/plan-prd/04-implementation/TransportRetainedEventWireNamePlan-260514.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
