# DivisionBox API 参考（Deep Dive）

> 状态：历史参考 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/DIVISION_BOX_API.deep-dive.full-2026-05-14.md`
> 当前入口：`./DIVISION_BOX_API.md`、`./DIVISION_BOX_GUIDE.md`、`../03-features/division-box-prd.md`

## TL;DR

本文保留 2026-03 DivisionBox API 的深度说明。当前开发应优先使用压缩版 `DIVISION_BOX_API.md` 与现行 SDK 类型；本文仅作历史追溯。

## 历史有效结论

- DivisionBox API 需要覆盖 open/attach/detach/close/session state 等核心生命周期。
- 插件侧应处理可见状态、窗口分离、keepAlive、错误和资源释放。
- API 应避免插件直接依赖底层 raw channel。

## 当前项目口径

- 新能力必须走 typed SDK / typed transport。
- 当前 release 重点是 detached widget 真机 evidence。
- Windows acceptance 要求真实 pluginId、URL `source/providerSource`、`detachedPayload` itemId/query 与 no-fallback 日志。
- 旧 deep-dive 示例如与现行 SDK 类型不一致，以现行代码和压缩版 API 为准。

## 关联入口

- `docs/plan-prd/docs/DIVISION_BOX_API.md`
- `docs/plan-prd/docs/DIVISION_BOX_GUIDE.md`
- `docs/plan-prd/03-features/division-box-prd.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
