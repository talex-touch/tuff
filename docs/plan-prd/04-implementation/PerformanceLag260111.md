# Performance Lag 实施记录

> 状态：历史实施记录 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/PerformanceLag260111.full-2026-05-14.md`

## TL;DR

本文记录早期性能卡顿治理方案。当前性能治理重点已转向 CoreApp 启动异步化、Windows search trace 真机采样、clipboard stress 和 release acceptance evidence。

## 历史有效结论

- 需要区分启动 critical path 与后台任务。
- 后台索引、剪贴板、推荐、telemetry hydrate 等任务不能抢占首屏和 CoreBox 搜索窗口。
- 性能问题必须有可复现指标，而不是仅靠主观卡顿描述。

## 当前项目口径

- CoreApp 启动异步化 P0/P1/P2/P3 代码切片已推进，剩余真实设备 benchmark。
- Windows release performance evidence：`search-trace-stats/v1` 200 样本与 `clipboard-stress-summary/v1` 120000ms。
- 质量基线要求采集 Electron ready → first window show、renderer script start → app mount、app mount → plugin list ready、all modules loaded → providers ready。

## 关联入口

- `docs/plan-prd/report/coreapp-startup-async-blocking-analysis-2026-05-13.md`
- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
