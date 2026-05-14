# Widget Dynamic Loading Plan

> 状态：Archived / 历史计划
> 更新时间：2026-05-14
> 完整快照：`./full/widget-dynamic-loading-plan.full-2026-05-14.md`

## TL;DR

本文是 Widget 动态加载历史方案。当前 Widget 生产链路已要求 packaged plugins 提供预编译 `widgets/.compiled/*.cjs` 与 `build.widgets` manifest metadata；生产包不应依赖启动时 runtime compilation，除非显式 debug fallback。

## 当前项目口径

- Widget production precompile gate 已完成。
- `tuff builder` 输出 `widgets/.compiled/*.cjs` 与 build metadata。
- packaged CoreApp 优先使用 precompiled widgets。
- 编译失败需有结构化 issue meta 与用户可见状态。

## 关联入口

- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
