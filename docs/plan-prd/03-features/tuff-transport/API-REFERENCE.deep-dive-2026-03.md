# TuffTransport API 参考（Deep Dive）

> 状态：历史参考 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/API-REFERENCE.deep-dive.full-2026-05-14.md`
> 当前入口：`./API-REFERENCE.md`、`./IMPLEMENTATION-GUIDE.md`、`../../TODO.md`

## TL;DR

本文保留 2026-03 版本的 TuffTransport API 深入说明，包含 `defineEvent`、`TuffEvent`、批量配置、流式配置与 SDK 使用示例。当前 API 与事件治理已演进到 typed builder + retained alias registry，因此本文件只作为历史参考。

## 历史有效结论

- 事件 API 应提供 namespace/module/action 元数据。
- request/response 类型需要在定义处固定。
- batch/stream 能力应由事件配置或领域 SDK 封装暴露。
- 业务侧不应散落 raw event 字符串。

## 当前项目口径

- 新增符合 `namespace/module/action` 的事件必须 typed builder。
- retained raw event 不直接 hard-cut wire name，需保留 alias 窗口与 hit evidence。
- 业务代码优先 domain SDK，不直接使用底层 transport 发送字符串。
- 当前 API 以 `packages/utils/transport/events/*` 的实际导出和测试为准。

## 关联入口

- `docs/plan-prd/03-features/tuff-transport/API-REFERENCE.md`
- `docs/plan-prd/03-features/tuff-transport/IMPLEMENTATION-GUIDE.md`
- `docs/plan-prd/04-implementation/TransportRetainedEventWireNamePlan-260514.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
