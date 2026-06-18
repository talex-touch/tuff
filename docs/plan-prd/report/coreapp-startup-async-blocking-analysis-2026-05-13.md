# CoreApp 启动异步化与首屏卡顿分析

> 状态：当前参考 / 压缩版
> 更新时间：2026-06-18
> 完整快照：`./archive/coreapp-startup-async-blocking-analysis-2026-05-13.full-2026-05-14.md`

## TL;DR

本报告确认 CoreApp 启动卡顿主要来自 main modules 串行 `await`、Database/Extension/Intelligence 等非首屏任务进入 critical path、Search provider 启动后集中抢资源，以及 renderer mount 前等待 storage/plugin store。

## 当前结论

- `2.4.10` 不把启动异步化升级为 release blocker；release blocker 仍是 Windows evidence。
- 已推进 P0/P1/P2/P3 代码切片：renderer plugin store 后台化、非首屏模块 handler-first + background runtime、Database critical/background 拆分、Search provider 后台 ready。
- 2026-06-18 已补第一组低风险切片：renderer `appSettings` hydration 首屏前 600ms soft timeout；main startup 拆为 foreground/deferred 两段，但首轮只将明确非首屏且低 handler 竞态风险的 `ExtensionLoader` 与 `FileSystemWatcher` 串行后台化。
- 2026-06-18 已补第二组低风险切片：`UpdateService` 保留 settings/transport handlers/UpdateSystem bridge 前台初始化，将 release cache hydrate、macOS autoUpdater setup、startup auto-check 排到 `ALL_MODULES_LOADED` 后；storage update stream 在销毁期直接 end，减少 dev benchmark 退出噪声。
- 2026-06-18 已补第三组低风险切片：`DownloadCenter` 保留队列、worker、notification service 与 transport handlers 前台可用，但把 network monitor 与 scheduler start 延后到 onInit 返回后的 timer，并把初始网络检查固定为 light mode，避免首屏阶段触发外部测速造成偶发 event-loop stall。
- 2026-06-18 已补第四组低风险切片：`SystemUpdate` onInit 只取得 DB 句柄，`ensureState()`、FX rate hydrate、poll/startup refresh 都排到 `ALL_MODULES_LOADED` 后，避免系统热数据/汇率缓存读写进入首屏模块串行链。
- 剩余是更大样本冷/热启动 benchmark、WAL/health 长尾、UI 观感与真实设备证据。

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
