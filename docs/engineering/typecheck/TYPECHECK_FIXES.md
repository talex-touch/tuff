# TYPECHECK 修复记录

> 状态：历史记录 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/TYPECHECK_FIXES.full-2026-05-14.md`

## TL;DR

本文原始版本记录了 2026-02-21 一轮 typecheck 修复明细，覆盖 apps/nexus、apps/core-app、plugins/touch-translation、packages/utils、packages/tuffex 等。该轮修复后，简单/中等/困难 typecheck 问题清零。

## 历史基线

- 初始基线：简单 315 / 中等 137 / 困难 18，去重 470。
- 修复结果：简单 0 / 中等 0 / 困难 0。
- 主要错误码：TS7006、TS7016、TS7031、TS2578、TS2305、TS2488、TS2339、TS2322、TS2345、TS2532、TS18048、TS18047、TS2551、TS2352、TS2677、TS2769、TS2561、TS2353、TS2304。

## 历史有效结论

- Demo 组件需要显式状态与回调类型，避免模板隐式 any。
- API/table/search 等通用组件要通过安全 getter 和类型守卫收窄。
- server API query 参数需先判空/归一化再使用。
- workspace 内部类型声明应集中暴露，避免局部补丁散落。

## 当前项目口径

- 当前 typecheck 状态不以本文为准；以最近一次 `pnpm -C "apps/core-app" run typecheck`、`pnpm -C "apps/nexus" run typecheck`、`pnpm typecheck:all` 或对应 CI 为准。
- 新 typecheck 修复不再追加长表到本文件；应记录到 `CHANGES.md` 或对应工程报告。

## 关联入口

- `docs/engineering/README.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/01-project/CHANGES.md`
