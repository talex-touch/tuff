# Base Surface Refraction Advanced Rendering

> 状态：历史工程说明 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/base-surface-refraction-advanced-rendering.full-2026-05-14.md`

## TL;DR

本文原始版本记录 base surface / refraction / advanced rendering 的视觉实现说明。当前该主题不参与 `2.4.10` release gate；后续 UI 能力应优先复用 tuffex 组件与现行视觉规范。

## 历史有效结论

- 高级渲染效果需要兼顾性能、平台差异与降级路径。
- 视觉效果不能阻塞主交互或首屏渲染。
- 复杂视觉能力应有 feature flag 或可降级方案。

## 当前项目口径

- UI 组件优先使用 tuffex。
- 性能敏感路径需记录预算与回归方式。
- 该文仅作历史参考，不作为当前验收标准。

## 关联入口

- `docs/engineering/README.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
