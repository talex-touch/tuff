# View Mode PRD

> 状态：历史 PRD / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/view-mode-prd.full-2026-05-14.md`

## TL;DR

本文原始版本记录插件 View Mode 能力设计。当前 View 生态长尾事项已进入长期债务池，不阻塞 `2.4.10` Windows release evidence。

## 历史有效结论

- 插件 view 需要生命周期、安全矩阵、权限与资源释放规则。
- 多窗口/嵌入式视图能力需要明确隔离边界。
- View Mode 与 AttachUIView / Multi Attach View 应统一开发者体验。

## 当前项目口径

- View Mode 长期事项：`plugin-core` 结构拆分、生命周期与安全矩阵回归补样本。
- 新增 View 能力必须走 SDK/typed transport，不新增 raw channel。
- UI 组件优先复用 tuffex。

## 关联入口

- `docs/plan-prd/docs/TODO-BACKLOG-LONG-TERM.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/TODO.md`
