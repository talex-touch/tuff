# 卡顿分析与迁移方案 260111

## 日志样本归因（对应模块/文件）
- Perf:EventLoop / Perf summary -> `apps/core-app/src/main/utils/perf-monitor.ts`（100ms 采样，warn >= 200ms）
- FileProvider reconciliation / Updating modified files -> `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts`
- UsageSummaryService / TimeStatsAggregator -> `apps/core-app/src/main/modules/box-tool/search-engine/usage-summary-service.ts` / `apps/core-app/src/main/modules/box-tool/search-engine/time-stats-aggregator.ts`
- AppScanner / AppProvider mdls scan -> `apps/core-app/src/main/modules/box-tool/addon/apps/app-scanner.ts` / `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
- MarketApiService Checking for plugin updates -> `apps/core-app/src/main/service/market-api.service.ts`
- sentry:get-config slow -> `apps/core-app/src/main/modules/sentry/sentry-service.ts`
- storage:app:save channel.send.slow -> `packages/utils/renderer/storage/base-storage.ts` / `apps/core-app/src/main/modules/storage/index.ts`

## 卡顿判断（基于日志时序）
- 同一时间段出现：UsageSummaryService 汇总、AppScanner mdls 扫描、FileProvider reconciliation、插件更新检查。
- Event loop lag 连续 200ms~260ms，且出现 4.0s 尖峰；Perf summary 显示 31/31 为 event_loop.lag，说明主进程被长任务占用。
- `channel.send.slow`（如 sentry:get-config）更像是被阻塞的结果，不是根因。

## 高概率阻塞点（按影响排序）
1. FileProvider reconciliation 扫描 + DB 全量读取 + 对比更新
   - 全量读取 dbFiles + 扫盘 + 批量更新/索引，虽然有 yield 但仍是主线程重 IO/CPU。
2. AppScanner/AppProvider 的 mdls 扫描
   - dev 模式或启动时集中触发，扫描/解析可能与 FileProvider 叠加。
3. UsageSummaryService/TimeStatsAggregator
   - DB 读写聚合在启动期执行，放大尖峰。
4. Storage 大 payload 序列化
   - 渲染端频繁 `JSON.stringify` + IPC 传输导致 `channel.send.slow`。

## 近期落地建议（优先解决卡顿）
- 启动期重任务错峰：为 PollingService 任务统一 `initialDelayMs + jitter`，避免多个任务同秒启动。
- FileProvider reconciliation 限流：小批量对比 + 更频繁 yield；大规模变更时推迟到 idle/后台。
- AppScanner mdls 扫描：启动后延时/后台执行，避免与文件索引撞车。
- Perf 监控联动：当 `Perf:EventLoop` 连续 warn 时，自动降级或暂停非关键任务。
- 关键链路降级：当 lag 持续时，暂停图标提取/内容索引/统计聚合，仅保留最小可用搜索。

## 可抽离为 Worker/Idle 的任务清单（卡顿优先）
### FileProvider（文件扫描/索引）
- 扫盘与元数据采集：放入 Worker/子进程；主进程只做结果合并与 DB 写入。
- reconciliation 对比：Worker 生成 diff（新增/更新/删除），主进程分批写库。
- 内容索引与全文索引：单独 Worker 队列，低优先级 + 可暂停/恢复。
- 图标提取：独立 Worker，按需懒加载 + 缓存，优先返回文本结果。

### AppScanner / AppProvider（mdls 扫描）
- mdls 解析放到子进程，限制并发；启动后延迟执行。
- dev 模式首次扫描推迟到 idle，避免与文件索引撞车。

### UsageSummaryService / TimeStatsAggregator（统计聚合）
- 聚合任务改为低优先级后台队列；进入 idle/低负载时执行。
- 大表读写分批处理，降低单次事务耗时与 IO 峰值。

### MarketApiService / SentryService（网络/配置）
- 网络拉取与配置加载改为延迟触发；失败后退避重试。
- 可选：合并到统一的后台任务队列，避免与扫描任务同时间窗触发。

## 调度策略建议（已抽离）
- 详见 `plan-prd/04-implementation/TaskScheduler260111.md`，统一定义 “App 优先、文件靠后” 的调度规则与互斥策略。

## FileProvider / AppProvider Worker+Idle 设计细化（落地路线）
### 设计目标
- 主进程只做轻量协调与状态合并；重 IO/CPU 任务移出主线程。
- App 相关任务优先；文件相关任务后置且可暂停。

### 任务拆分与归属
- FileProvider
  - 扫盘与元数据采集 -> Worker/子进程（扫描进度流式上报）
  - reconciliation diff 计算 -> Worker（新增/更新/删除列表）
  - 内容索引/全文索引 -> 独立低优先级 Worker 队列
  - 图标提取 -> 独立 Worker，按需懒加载 + 缓存
- AppProvider / AppScanner
  - mdls 解析 -> 子进程，限制并发
  - dev 模式首次扫描 -> idle 触发，避免与文件索引撞车

### 调度与互斥规则（App 优先）
- 高优先级：AppScanner/mdls、AppProvider 变更同步、核心 UI 相关任务
- 中优先级：网络更新检查、统计聚合
- 低优先级：FileProvider 扫描/索引/图标
- 互斥：高优先级执行时，低优先级全部暂停；中优先级只在无高优先级时执行。

### 落地分阶段
1. 把 FileProvider 扫描/对比分离为 Worker（先做 diff 生成 + 主进程分批写库）。
2. 图标提取与内容索引拆成独立队列，默认 idle 执行。
3. mdls 扫描迁移到子进程，并加启动延迟与互斥策略。

## TuffTransport 统一迁移范围（你提到的全部）
> 目标：所有 IPC/事件统一 TuffTransport，避免 legacy channel 混用导致的阻塞与难追踪。

- FileProvider：索引进度、rebuild、openers 等事件统一 TuffTransport。
- AppScanner/AppProvider：扫描状态、变更通知统一 TuffTransport。
- UsageSummaryService：统计完成/失败通知统一 TuffTransport。
- MarketApiService：插件更新检查事件统一 TuffTransport。
- SentryService：配置与状态读取统一 TuffTransport。
- CoreBox/Storage/Clipboard 等已有迁移继续收口，移除 legacy 事件。

## Storage 命名统一为 TuffStorage（建议）
> 目标：对外只暴露 TuffStorage，内部逐步淘汰 Storage/TouchStorage 旧命名。

- 统一命名建议：
  - `StorageModule` -> `TuffStorageModule`
  - `StorageEvents` -> `TuffStorageEvents`
  - `TouchStorage` -> `TuffStorage`
  - `storage:*` legacy IPC -> 逐步替换为 `tuff-storage:*`（或 TuffStorageEvents）
- 迁移策略：
  1) 新 API 先落地，旧 API 保留 bridge。
  2) 业务模块切换到 TuffStorage API。
  3) 最后移除 legacy 通道与命名。

## BaseModule 生命周期收敛方案（PollingService + TuffTransport + TuffStorage）
### 目标
- 模块内定时任务、事件订阅、TuffTransport handler/stream 全部自动跟随生命周期。
- 模块卸载时统一清理，减少遗忘、泄漏与阻塞风险。

### 设计建议（接口形态）
- `BaseModule` 内置 `disposables` 与 `pollingTaskIds`：
  - `protected onDispose(fn: () => void)`：注册清理函数。
  - `protected registerPollingTask(id, cb, options)`：自动做模块前缀并记录 taskId，destroy 时统一 unregister。
- `BaseModule` 内置 `useTransport(ctx)`：
  - 返回 `transport` 并提供 `onTransport/onStream` 包装，自动记录 disposer。
- 统一在 `destroy()` 中执行：先调用 `onDestroy`，再清理 `disposables/pollingTaskIds/stream`（或反之，需明确顺序）。

### TuffStorage 适配点
- `TuffStorageEvents` 的 `.on/.onStream` 直接通过 BaseModule 包装，移除手写 `transportDisposers`。
- `updateStreams` 可通过 BaseModule 注册 `onDispose` 统一 `.end()`。
- `StoragePollingService` 的任务注册可通过 BaseModule 收口（或仅在 stop 中调用 unregister，由 BaseModule 兜底）。

## 迁移优先级（以卡顿优先）
1. FileProvider / AppProvider / UsageSummaryService（重任务）
2. Storage/TuffStorage / CoreBox / Clipboard（高频 IPC）
3. SentryService / MarketApiService / UpdateService（后台任务）
4. 其它零散 PollingService 使用点

## 搜索排序过滤（需要更细分析）
- 需要补充：搜索 pipeline 分段耗时（拉取/排序/过滤/渲染）与输入节流策略。
- 建议追加：搜索链路的 perf trace，分离 “数据准备” 与 “展示排序” 的耗时。

## 已完成优化（2026-02 FileProvider 性能修复）

### 问题背景
fullScan / reconciliation 期间，event loop lag 持续 500-900ms，严重时出现 4s 尖峰。
根因：SQLite 驱动层操作是同步的（即使包裹了 async/await），单条 INSERT 可阻塞 50-200ms，
加上批量事务、同步图标提取、串行 await 等因素叠加，导致主线程长时间被占用。

### 修复清单

#### 1. 移除同步图标提取回退（extractFileIconQueued）
- **文件**: `file-provider.ts`
- **问题**: Worker 图标提取失败时回退到同步 `extractFileIcon()` 原生调用，阻塞事件循环
- **修复**: Worker 失败直接返回 null，不做同步回退；移除 `extract-file-icon` 同步导入

#### 2. processFileExtensions 全面异步化
- **文件**: `file-provider.ts`
- **问题**: `ensureFileIcon` 在文件数 ≤ 200 时同步 await，`processFileExtensions` 在扫描流水线中被 await
- **修复**:
  - `ensureFileIcon` 改为始终 fire-and-forget（`void this.ensureFileIcon(...)`）
  - 所有 4 处 `await this.processFileExtensions(...)` 改为 `void this.processFileExtensions(...).catch(...)`

#### 3. DbWriteScheduler 逐任务让出
- **文件**: `db-write-scheduler.ts`
- **问题**: 原实现每 3 个任务才让出一次事件循环，SQLite 同步 I/O 导致连续阻塞
- **修复**: 每完成 1 个任务即 `setImmediate` 让出

#### 4. 分批粒度大幅缩减
- **文件**: `file-provider.ts`, `search-index-service.ts`
- **修复**:
  - fullScan INSERT 分片: 100 → 50 → 30 → **20 条/批**
  - reconciliation INSERT 分片: 500 → 50 → 30 → **20 条/批**
  - delete 分片: 500 → **100 条/批**
  - `FLUSH_BATCH_SIZE`: 5 → **2 条/批**
  - `estimatedTaskTimeMs`: 6/10 → **20**（batch=1，每个任务后 yield）

#### 5. 逐条事务拆分
- **文件**: `search-index-service.ts`, `file-provider.ts`
- **问题**: 批量事务（一次 transaction 包含多条 INSERT）阻塞时间过长
- **修复**: `indexItems`、`removeItems`、`flushIndexWorkerResults` 拆分为逐条/逐文档独立事务，使 DbWriteScheduler 可在每条之间让出

#### 6. 生产者背压机制（waitForCapacity）
- **文件**: `db-write-scheduler.ts`, `file-provider.ts`
- **问题**: fire-and-forget 的 DB 写入调用导致队列无限膨胀，等待时间从 500ms 增长到 1300ms+
- **修复**:
  - `DbWriteScheduler` 新增 `waitForCapacity(maxQueued)` 方法：队列深度 ≥ maxQueued 时挂起生产者
  - fullScan / reconciliation / processFileUpdates 的分片处理循环中加入 `await dbWriteScheduler.waitForCapacity(15)`
  - 每个任务完成后通过 `notifyCapacityWaiters()` 唤醒等待的生产者

### 优化效果
| 阶段 | Event Loop Lag | 说明 |
|------|---------------|------|
| 优化前 | 500-900ms，峰值 4s | 多任务叠加 + 同步 I/O |
| 第一轮（同步回退移除 + fire-and-forget） | 500-900ms | 瓶颈在 SQLite 同步 I/O |
| 第二轮（逐任务 yield + 分片缩减） | 200-217ms，首次 737ms | 明显改善 |
| 第三轮（逐条事务 + 背压） | ~200ms，队列稳定 | 接近目标 |

### 架构要点
- **SQLite 同步本质**: LibSQL 本地模式下所有 SQL 语句在驱动层同步执行，async 包裹不改变阻塞本质
- **串行写队列**: 所有 DB 写操作通过 `DbWriteScheduler` 串行执行，逐任务 yield 防阻塞
- **背压控制**: 生产者（扫描循环）通过 `waitForCapacity` 自动限流，防止队列失控
- **fire-and-forget 模式**: 非关键路径（图标提取、关键词索引、扩展信息处理）不阻塞主扫描流水线

## 预期收益
- 启动期任务拥挤降低（任务错峰 + 统一调度）。
- 重任务后台化，event loop lag 明显下降。
- 模块卸载自动清理，减少隐藏订阅与幽灵任务。
- Perf 日志可快速定位到具体模块与生命周期阶段。
