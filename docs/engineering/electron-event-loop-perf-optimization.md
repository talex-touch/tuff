# Electron 主线程 Event Loop 性能优化实战

> 状态：历史工程报告 / 压缩索引
> 更新时间：2026-05-14
> 完整快照：`./archive/electron-event-loop-perf-optimization.full-2026-05-14.md`

## TL;DR

本文记录 Electron 主线程 event loop lag 的定位与优化经验。核心结论：`channel.send.slow` 多数是主线程被占用后的症状，不是根因；真正阻塞源来自启动期 AppScanner/AppProvider、同步 FS 调用、批处理无 yield、后台任务与搜索交互争用。

## 历史结论

- 使用 `Perf:Context` 能把 lag 定位到具体代码段。
- `existsSync` / 同步 stat 批量调用应改为异步 `fs.access` 并定期 yield。
- 启动期重任务不得用 `queueMicrotask` 伪后台化；应使用 idle gate / background runtime / 分批执行。
- AppScanner、mdls、搜索索引、剪贴板、推荐、文件 watcher 等后台任务必须避让首屏与 CoreBox 搜索窗口。
- PollingService 诊断需要区分 active task 与 recent task，避免把症状误判为根因。

## 当前项目口径

- 当前 `2.4.10` release blocker 是 Windows 真机 evidence 与性能 evidence，不是继续扩大 event-loop 专项。
- CoreApp 启动异步化 P0/P1/P2/P3 代码切片已推进；剩余为真实设备冷/热启动 benchmark、WAL/health 长尾与 UI 观感证据。
- 相关当前入口：
  - `docs/plan-prd/report/coreapp-startup-async-blocking-analysis-2026-05-13.md`
  - `docs/plan-prd/TODO.md`
  - `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`

## 后续使用方式

- 新问题排查时参考完整快照中的方法论与优化点。
- 不把本文作为当前 release gate 的权威清单。
- 新启动期性能要求应同步到 Quality Baseline 与 TODO。
