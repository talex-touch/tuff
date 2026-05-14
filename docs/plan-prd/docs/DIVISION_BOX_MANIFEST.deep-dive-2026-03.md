# DivisionBox Manifest（Deep Dive）

> 状态：历史参考 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/DIVISION_BOX_MANIFEST.deep-dive.full-2026-05-14.md`
> 当前入口：`./DIVISION_BOX_MANIFEST.md`、`./DIVISION_BOX_API.md`、`./DIVISION_BOX_GUIDE.md`

## TL;DR

本文保留 DivisionBox manifest 的历史深度说明。当前 manifest 合同以压缩版文档和实际 SDK 类型为准；本文只用于追溯早期字段设计。

## 历史有效结论

- DivisionBox manifest 应声明默认尺寸、header、actions、shortcuts、keepAlive 等能力。
- 插件 UI 能力需要清晰的生命周期和权限边界。
- manifest 字段应可用于搜索、启动、attach/detach 与 detached widget 恢复。

## 当前项目口径

- 当前 release 重点是 detached widget 真机 evidence。
- 证据必须包含真实 pluginId、URL `source/providerSource`、`detachedPayload` itemId/query 与 no-fallback 日志。
- 新字段必须走 SDK/typed transport 文档同步，不新增 raw channel。

## 关联入口

- `docs/plan-prd/docs/DIVISION_BOX_MANIFEST.md`
- `docs/plan-prd/docs/DIVISION_BOX_API.md`
- `docs/plan-prd/docs/DIVISION_BOX_GUIDE.md`
- `docs/plan-prd/TODO.md`
