# SDK Unification Progress

> 状态：历史工程报告 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/sdk-unification-progress-2026-02-08.full-2026-05-14.md`

## TL;DR

本文原始版本记录 SDK 统一迁移阶段性进展。当前 SDK 统一已进入 SDK hard-cut、typed transport、domain SDK 与 retained alias 分批治理阶段，执行状态以 TODO、Quality Baseline 和 transport boundary tests 为准。

## 历史有效结论

- renderer/main/plugin 跨层调用应统一走 SDK，不应散落 raw channel。
- 迁移需要分批推进，并为保留兼容项记录退场窗口。
- SDK 出口需要统一，避免多个旧路径并存。

## 当前项目口径

- 新增跨层能力优先 domain SDK。
- 缺失/低版本/非法/不支持 SDK marker 的插件直接 `SDKAPI_BLOCKED`。
- retained raw event 按 canonical event + legacy alias registry + dual listen 迁移。
- `2.4.11` 前继续关闭或显式降权 legacy/compat 债务。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/04-implementation/TransportRetainedEventWireNamePlan-260514.md`
