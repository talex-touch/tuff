# 后台任务调度方案 260111

## 目标
- 降低主进程 event loop lag 尖峰。
- 明确 “App 优先、文件靠后” 的统一调度规则。
- 让重任务可暂停、可恢复、可错峰。

## 设计原则
- App 优先：AppScanner/AppProvider/用户可见 UI 相关任务优先调度。
- 文件后置：FileProvider 扫描/索引/图标一律低优先级，且可被抢占。
- 低干扰：不与输入、搜索、窗口展示等 UI 关键路径抢资源。
- 自适应：lag 连续 warn 时降级；idle 时补偿执行。

## 任务分类与优先级
- P0（最高）：App 相关任务（AppScanner/mdls、AppProvider 变更同步）
- P1：用户可见 UI 相关任务（CoreBox、窗口状态）
- P2：网络与统计（Update/MarketApi/Sentry/UsageSummary）
- P3（最低）：文件扫描/索引/图标/内容提取

## 调度规则（核心）
- 全局最大并发：重任务 1~2 个（默认 1）。
- 互斥策略：
  - App 相关任务执行时，P2/P3 暂停。
  - FileProvider 与 mdls 扫描互斥。
- idle 窗口：
  - event loop 连续 1~2s 无 warn 才允许启动 P2/P3。
  - lag 连续 warn 时暂停 P2/P3，仅保留 P0/P1。
- 任务错峰：
  - 启动期任务统一加 `initialDelayMs + jitter(0~3s)`。
  - 避免多个 PollingService 任务同秒触发。

## 调度器模型（建议）
- 维护 `priorityQueue` + `runningSet`。
- 任务状态：scheduled / running / paused / cancelled。
- 任务字段：
  - `id`、`priority`、`costEstimateMs`、`category`、`canPause`、`run`
  - `mutualExclusionKey`（如 `file-scan`、`mdls`）
- 触发入口：
  - `schedule(task)`、`pauseLowPriority()`、`resumePaused()`、`cancel(id)`

## 与 PollingService 的关系
- PollingService 只负责定时触发，真正执行交给调度器。
- 调度器负责：
  - 负载判断（lag/idle）
  - 互斥与优先级
  - 执行/暂停/恢复

## 与 PerfMonitor 的联动
- 使用 PerfMonitor 的 event loop lag 作为调度信号：
  - 连续 warn 进入降级模式（只允许 P0/P1）。
  - 恢复期需要连续无 warn 才允许 P2/P3。
- 需要补充：lag 统计窗口与阈值（如 1s 内 >= 3 次 warn）。

## 迁移路径（分阶段）
1. 建立 TaskScheduler 框架（主进程 utils）。
2. 把 AppScanner/AppProvider 任务接入 P0。
3. 把 FileProvider 扫描/索引接入 P3。
4. 把 MarketApi/Sentry/UsageSummary 接入 P2。
5. 用统一日志输出调度决策（方便定位卡顿来源）。
