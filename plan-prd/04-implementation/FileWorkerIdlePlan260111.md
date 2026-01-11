# FileProvider/AppProvider Worker+Idle 方案 260111

## 目标
- 将重 IO/CPU 任务从主进程剥离，降低 event loop lag。
- 统一 App 优先、文件后置的执行规则，避免启动期尖峰。
- 任务可暂停/可恢复/可降级，保证 CoreBox 与关键 UI 流畅。

## 范围与优先级
- P0（最高）：AppScanner/AppProvider 相关任务（mdls、App 变更同步）
- P3（最低）：FileProvider 扫描/索引/图标/内容提取
- P2：网络与统计（Update/MarketApi/Sentry/UsageSummary）仅作为调度互斥参考

## 架构概览
- 主进程：调度与状态汇总（轻量）
- Worker/子进程：扫描、diff 计算、图标/内容提取
- 通信：使用 TuffTransport 事件或内部消息通道（后续统一到 TuffTransport）

## 任务拆分
### FileProvider
- 扫盘与元数据采集 -> Worker
- reconciliation diff 计算 -> Worker
- DB 写入与索引提交 -> 主进程分批执行
- 内容索引/全文索引 -> 低优先级 Worker 队列
- 图标提取 -> 独立 Worker，懒加载 + 缓存

### AppScanner/AppProvider
- mdls 扫描/解析 -> 子进程（并发限制）
- dev 模式首次扫描 -> idle 触发，避免与文件索引撞车

## Worker 角色划分
- FileScanWorker：扫描目录、返回文件元数据列表（分批）
- FileReconcileWorker：输入 db 快照 + 磁盘快照，输出 add/update/delete
- IconWorker：按需生成图标缓存
- ContentIndexWorker：内容提取与全文索引（可暂停）

## Icon 现状审查（FileProvider）
### 现有实现
- 同步提取：`extract-file-icon` 在主线程同步执行。
- 队列模型：单队列串行处理，每个任务后 `setTimeout(8ms)` 让步。
- 缓存存储：
  - DB `fileExtensions` 存 `icon`（base64）
  - `iconMeta` 记录 mtime/size，用于是否需要重新提取
- 触发时机：
  - 批量扫描时 `processFileExtensions()` 触发
  - 搜索/结果渲染时 lazy-load 触发
  - opener 图标会二次提取并写入缓存

### 问题与风险
- 同步提取仍占用主线程，lag 高峰期会被放大。
- base64 存储放大 DB 体积，读写成本高。
- 缺少统一调度/优先级，App 任务无法抢占图标提取。
- 无统一 backpressure，扫描期容易堆积。

### 建议
- IconWorker 化：图标提取全部迁移到 Worker，主线程只做调度与结果落库。
- 缓存改为磁盘文件 + DB 记录路径/哈希，减少 base64 存储。
- 调度接入 TaskScheduler（P3），App 任务可抢占/暂停。
- lazy-load 优先：先返回默认/扩展名图标，异步补全。

## 缓存现状与优化建议（FileProvider）
### 已有缓存（是什么 + 干什么）
- `fileExtensions.icon` + `iconMeta`：DB 内缓存 icon/base64 与 mtime/size，用于是否需要重新提取。
- `openerCache`（内存）+ `StorageList.OPENERS`（落盘）：扩展名 -> 默认打开程序的解析结果缓存，减少系统查询。
- `bundleIdCache`/`utiCache`（内存）：LaunchServices/UTI 查询缓存，避免重复调用 `plutil`/`mdls`。
- `failedContentCache`（内存）+ `fileIndexProgress`（DB）：内容解析失败的冷却缓存，避免重复失败重试。

### 风险点
- base64 icon 写 DB 体积放大，读写成本高，容易放大索引期 IO。
- opener/bundleId/uti cache 无容量上限，长时间运行可能增长。
- `failedContentCache` 无 TTL/上限，极端情况下增长并影响内存。

### 优化建议（渐进）
- icon 缓存改为文件系统路径 + hash；DB 只记录引用与元信息。
- opener/bundleId/uti 增加 LRU 或 TTL，并在 LaunchServices mtime 变化时批量失效。
- failedContentCache 增加 TTL（如 24h）或最大条数上限，避免无限增长。

## 消息协议草案
### 通用字段
- `taskId`、`kind`、`payload`、`meta`、`progress`

### FileScanWorker
- request: `{ paths, excludePaths, batchSize }`
- response: `{ batch: ScannedFileInfo[], done, scannedCount }`

### FileReconcileWorker
- request: `{ diskFiles, dbFilesSnapshot, paths }`
- response: `{ add, update, remove }`

### IconWorker
- request: `{ path }`
- response: `{ path, iconPath | iconBuffer, cached }`

## 调度规则（App 优先、文件靠后）
- App 任务执行时，文件任务全部暂停或排队。
- FileProvider 与 mdls 扫描互斥。
- idle 窗口触发低优先级任务：
  - event loop 连续 1~2s 无 warn
  - lag 连续 warn 进入降级，仅允许 P0/P1

## 回退策略
- Worker 不可用：退回主进程分批执行（严格限流 + 更频繁 yield）
- Worker 超时/失败：自动降级到更小 batch 或延后到 idle
- 异常保护：避免阻塞 UI；任何失败不影响主流程

## 可观测性
- 在 PerfMonitor 中输出：
  - 任务排队/执行/暂停原因
  - Worker 任务耗时与 batch 大小
- 统一日志标签：
- `TaskScheduler` / `FileScanWorker` / `FileReconcileWorker`

## 分阶段落地
1. FileProvider 扫盘迁移到 FileScanWorker（输出 diskFiles 分批）
2. reconciliation diff 迁移到 FileReconcileWorker（主进程分批写库）
3. 图标提取迁移到 IconWorker（懒加载）
4. 内容索引迁移到 ContentIndexWorker（低优先级队列）
5. mdls 扫描迁移到子进程，接入 P0 调度

## 风险与注意
- Worker 数据量大：分批传输，避免一次性大 payload。
- DB 写入仍在主进程：需严格分批 + throttle。
- 搜索体验：低优先级任务暂停时，结果可能不完整；需要 UI 状态提示。

## 需要确认的问题
- Worker 通信是否直接基于 TuffTransport，还是先用内部通道后迁移？
- FileProvider 的 db 快照大小与序列化策略是否需要优化？
- Icon 缓存存储位置与淘汰策略是否复用现有机制？
