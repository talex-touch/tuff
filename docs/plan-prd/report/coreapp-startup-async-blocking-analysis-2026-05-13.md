# CoreApp 启动异步化与首屏卡顿分析

> 状态：当前参考 / 压缩版
> 更新时间：2026-05-14
> 完整快照：`./archive/coreapp-startup-async-blocking-analysis-2026-05-13.full-2026-05-14.md`

## TL;DR

本报告确认 CoreApp 启动卡顿主要来自 main modules 串行 `await`、Database/Extension/Intelligence 等非首屏任务进入 critical path、Search provider 启动后集中抢资源，以及 renderer mount 前等待 storage/plugin store。

## 当前结论

- `2.4.10` 不把启动异步化升级为 release blocker；release blocker 仍是 Windows evidence。
- 已推进 P0/P1/P2/P3 代码切片：renderer plugin store 后台化、非首屏模块 handler-first + background runtime、Database critical/background 拆分、Search provider 后台 ready。
- 剩余是冷/热启动 benchmark、WAL/health 长尾、UI 观感与真实设备证据。

## 必采指标

- Electron ready → first window show。
- renderer script start → app mount。
- app mount → plugin list ready。
- all modules loaded → providers ready。
- Search provider ready/degraded 与 Database aux/WAL health 长尾。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/engineering/electron-event-loop-perf-optimization.md`
