# 统一系统错误上报与数据库诊断

## Goal

为 CoreApp 建立单一、可审计的运行时错误上报边界：业务异常保留完整 cause/code，用户只看到脱敏且可操作的错误；本地日志、Sentry 与聚合健康遥测各司其职。以文件索引手动重建的 `SQLITE_BUSY` 为首个端到端落地点，同时盘点全系统漏报、重复上报与数据库直写风险。

## Background

- 文件索引重建在 `file-provider-runtime-reset-service.ts:76-101` 删除 `scan_progress` 时耗尽 SQLite busy 重试；现场日志确认 `file-index.manual-rebuild.scan-progress-reset` 出现 `SQLITE_BUSY`，不是 SQL、大小写路径或 schema 错误。
- `file-provider.ts:2279-2283`、`common.ts:1481-1487` 和 `SettingFileIndex.vue:1006-1014` 将异常依次降级为字符串、业务失败和 toast。主进程 `SentryServiceModule.captureException()` 没有业务调用点，因此已捕获异常不会进入 Sentry。
- `safe-handler.ts:20-55` 直接返回原始 `error.message`，既丢失 cause/code，也可能把 SQL 参数和完整用户路径暴露给 renderer。
- `telemetry-sanitizer.ts:377-414` 会清除 Sentry 异常文本和路径，但现有 `captureException` 附带的 `extra` context 也会被整体丢弃，远端只剩无法定位业务操作的红点。
- `precore.ts:35-45` 的早期 unhandled rejection 只写日志；Electron crashReporter 明确关闭上传。
- `app-error-reporter.ts` 是无已注册 handler 的孤立报告器；Update、Sync、Flow、Analytics 各自维护不兼容的错误记录路径。
- 数据库审计 R9 已确认写入治理分散。`app-provider.ts:2319-2429` 仍并发直写共享 `files/file_extensions` 域，而 `db/utils.ts:83-86,169-171` 已声明该域应由单写者负责。
- `DatabaseModule.reportDatabaseHealth()` 目前只写日志，健康级别只由 WAL 大小决定；累计 busy retry、队列峰值和打开句柄不会触发结构化上报。

## Scope

- CoreApp main、renderer、worker 和受信任 plugin-host 的运行时异常边界。
- Sentry 作为异常明细 sink；本地日志作为始终可用 sink；Nexus 只接收脱敏聚合健康事件，不接收原始异常文本、路径或堆栈。
- 文件索引手动重建与 SQLite retry exhaustion 作为首个完整接入场景。
- 全系统错误上报矩阵和数据库写入风险报告。
- Nexus Web 应用保留独立 Sentry 生命周期；只列入边界盘点，不与 Electron 进程服务合并。

## Requirements

1. 抽离 `OperationalErrorService`，统一完成错误归一化、脱敏、本地日志、去重/限流和远端 sink 分发；业务模块不得直接依赖 Sentry SDK。
2. 归一化结果必须保留内部 `Error` 与 cause 链，并导出稳定的 `code`、`domain`、`operation`、`severity`、`retryable` 和脱敏 `publicMessage`。
3. Sentry 事件只能包含稳定 code/tag、有限数字/枚举 context 和脱敏堆栈；不得包含 SQL 文本、参数、用户路径、搜索词、剪贴板或 payload。
4. 远端 sink 未初始化、禁用或发送失败时不得影响业务路径；初始化前的 P0/P1 报告使用有界缓冲，sink 就绪后至多交付一次。
5. 对相同 `domain + operation + code` 的高频错误进行时间窗聚合；本地首次和汇总日志保留，Sentry 不得被 `SQLITE_BUSY` 风暴刷屏。
6. SQLite retry exhaustion 必须在低层观察点统一产生报告；数据库健康快照必须按 busy 增量、队列峰值、WAL 与句柄阈值生成聚合事件。
7. 文件重建失败返回稳定 `errorCode/retryable` 和脱敏提示；renderer 不再展示 Drizzle SQL/params。
8. 手动重建在清理本地进度前必须阻止新 search-index writer admission 并等待在途写完成；重建清理使用交互优先级且不得被 drop/circuit 策略丢弃。
9. App Provider 已确认的并发主线程直写必须纳入统一 DB 调度与 retry，或迁移到既有单写者端口；不得再维护私有 SQLite busy retrier。
10. 输出完整报告，列出每个现有上报入口的 owner、sink、隐私边界、漏报/重复风险、迁移优先级与是否本轮修复。

## Acceptance Criteria

- [x] 文件索引重建在可控 `SQLITE_BUSY` 下返回 `FILE_INDEX_DATABASE_BUSY`、`retryable: true` 和脱敏消息，UI 中不出现 `DELETE FROM`、`params:` 或 `/Users/...`。
- [x] 同一重建失败在本地日志保留完整 cause，在 Sentry sink 仅交付一次稳定业务事件；关闭 Sentry 时业务结果不变。
- [x] retry exhaustion observer 覆盖 scheduler 内和直接 `withSqliteRetry` 调用，不要求每个调用点手写 `captureException()`。
- [x] 手动重建的 scan-progress reset 发生在 writer admission 已暂停且 pending/active 均为 0 的窗口内；窗口结束后 admission 必须恢复。
- [x] App Provider 批量 add/update/delete 不再并发绕过统一写策略；既有扫描与 reconcile 行为保持一致。
- [x] 早期 unhandled rejection、transport safe handler、worker 远端错误、renderer 显式业务失败在报告矩阵中均有明确 owner；至少所有 P0/P1 漏报入口接入统一服务。
- [x] 数据库健康事件包含 busy delta、scheduler queue、writer pending/active、WAL 和 open FD 的脱敏数值，不包含路径。
- [x] 使用临时或复制 SQLite 数据库完成“持锁 → 重建失败/上报 → 释放锁 → 重建成功”的真实场景验证。
- [x] CoreApp 受影响 typecheck、生产构建与真实 Electron 重建 smoke 通过。
- [x] 整体审计报告与 R9 backlog 同步，明确本轮完成项和后续数据库单写者迁移项。

## Non-goals

- 不把 Nexus Web 与 Electron 共用一个运行时 singleton。
- 不上传原始日志、SQL、堆栈上下文行或用户文件路径。
- 不把所有 warning 当异常；可预期取消、离线、权限拒绝和业务校验失败默认不上报 Sentry。
- 不在本轮重写全部数据库 schema 或替换 libSQL/Drizzle。

## Remote Reporting Decision

- 采用隐私优先策略：异常明细只进 Sentry，Nexus 只接收时间窗聚合健康计数。Nexus 不接收逐条 operational error、原始 message、SQL、路径或堆栈。
