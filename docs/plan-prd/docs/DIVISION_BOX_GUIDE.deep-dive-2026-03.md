# DivisionBox 开发者指南（Deep Dive）

> 状态：历史参考 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/DIVISION_BOX_GUIDE.deep-dive.full-2026-05-14.md`
> 当前入口：`./DIVISION_BOX_GUIDE.md`、`./DIVISION_BOX_API.md`、`../03-features/division-box-prd.md`、`../TODO.md`

## TL;DR

本文保留 2026-03 DivisionBox 插件接入指南的完整历史版本，覆盖 manifest 配置、打开/关闭会话、状态监听、常见模式、性能优化与调试技巧。当前开发者应优先阅读压缩版 `DIVISION_BOX_GUIDE.md` 与 `DIVISION_BOX_API.md`。

## 历史有效结论

- DivisionBox 是插件可用的独立交互容器，需要明确 session 生命周期。
- 插件 manifest 应声明默认尺寸、快捷键、header/actions 等 UI 能力。
- 插件应监听会话状态变化，并处理 attach/detach/keepAlive 等行为。
- 性能优化应关注 surface 加载、状态同步和资源释放。

## 当前项目口径

- 当前 release 关注 DivisionBox detached widget 真机 evidence，而不是扩展 API 范围。
- Windows acceptance 中 detached widget evidence 必须记录真实 pluginId、detached URL `source` / `providerSource`、`detachedPayload` itemId/query 与 no-fallback 日志摘录。
- 新增 DivisionBox 能力必须走 typed SDK / typed transport，不新增 raw channel。
- 现行行为与验收以 `TODO.md`、`PRD-QUALITY-BASELINE.md` 与压缩版 API/Guide 为准。

## 不再作为当前依据的内容

- 未对齐当前 detached widget evidence 的旧验收描述。
- 未对齐 typed transport/domain SDK 的旧示例。
- 可能与当前 manifest / SDK 命名不一致的历史代码片段。

## 关联入口

- `docs/plan-prd/docs/DIVISION_BOX_GUIDE.md`
- `docs/plan-prd/docs/DIVISION_BOX_API.md`
- `docs/plan-prd/03-features/division-box-prd.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
