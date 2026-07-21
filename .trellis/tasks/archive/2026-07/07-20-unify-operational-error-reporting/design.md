# 统一系统错误上报与数据库诊断 — Design

## 1. Architecture decision

采用一个进程内 `OperationalErrorService` 作为 CoreApp main 的唯一业务异常上报门面，并以 sink 适配现有设施：

```text
unknown error
  -> normalize (cause/code/retryable/public message)
  -> local structured log (always)
  -> dedupe/rate window
       -> Sentry detail sink (when enabled)
       -> Nexus aggregate health sink (counts only)
  -> safe result returned to transport/UI
```

业务模块不再直接调用 `@sentry/electron`，也不把 `error.message` 原样返回 renderer。Nexus Web 保留独立 Sentry 生命周期；Electron renderer 使用同一共享 report contract 的进程内 facade，不把任意 plugin payload 提升为主进程异常。

## 2. Ownership and files

- Shared contract: `packages/utils/observability/operational-error.ts`
  - enums/types、runtime guard、可序列化 public descriptor。
- Main service: `apps/core-app/src/main/modules/observability/operational-error-service.ts`
  - 归一化 cause 链、脱敏、日志、限流、早期缓冲、sink 注册。
- Main exports: `apps/core-app/src/main/modules/observability/index.ts`
  - singleton accessor；不得反向依赖 Sentry/database/file provider。
- Sentry adapter: existing `modules/sentry/sentry-service.ts`
  - pre-init 后注册 detail sink；shutdown/disable 时解除。
  - 使用稳定 tags/fingerprint；sanitizer 只保留 allowlisted operational context。
- Renderer facade: `renderer/src/modules/observability/operational-error-reporter.ts`
  - 复用 shared descriptor 和 renderer Sentry adapter；仅处理 renderer-owned failures。
- SQLite observer: existing `main/db/sqlite-retry.ts`
  - 暴露 retry-exhausted listener registration，底层不导入 observability service。

## 3. Report contract

```ts
interface OperationalErrorInput {
  domain: string
  operation: string
  error: unknown
  code?: string
  severity?: 'warning' | 'error' | 'fatal'
  retryable?: boolean
  userImpact?: 'none' | 'degraded' | 'blocked' | 'data-risk'
  context?: Record<string, string | number | boolean | null | undefined>
  publicMessage?: string
  dedupeWindowMs?: number
}

interface OperationalErrorReport {
  id: string
  domain: string
  operation: string
  code: string
  severity: 'warning' | 'error' | 'fatal'
  retryable: boolean
  userImpact: 'none' | 'degraded' | 'blocked' | 'data-risk'
  publicMessage: string
  occurredAt: number
  occurrenceCount: number
  context: Record<string, string | number | boolean>
}
```

内部 service 另持有原始 `Error`，但它不进入 transport。`id` 是本次本地关联 ID，不由路径、SQL 或用户内容生成。

## 4. Error normalization

按有界深度遍历 `cause`、`original`、`error` 和 `AggregateError.errors`：

1. 保留第一个真实 `Error` 作为 Sentry stack owner。
2. 收集首个稳定 `code` 与 SQLite `rawCode`，不复制 message/SQL 到 public descriptor。
3. SQLite busy family 统一为：
   - code: `FILE_INDEX_DATABASE_BUSY`（业务边界可覆盖通用 `DATABASE_BUSY`）
   - retryable: `true`
   - public message: 本地化的“数据库正忙，请稍后重试”。
4. 未知错误使用调用方稳定 code，不以动态 message 作为 fingerprint。
5. context 只接受 primitive；敏感 key（path/file/query/token/payload 等）直接拒绝。

## 5. Sink policy

### Local log

- 永远启用。
- 首次事件记录完整本地 stack/cause；重复事件只写计数汇总。
- 日志 metadata 不接受原始路径数组或 transport payload。

### Sentry detail sink

- 仅 `severity=error|fatal`，或显式要求的高影响 warning。
- fingerprint: `operational/<domain>/<operation>/<code>`。
- tags: domain、operation、code、retryable、userImpact。
- context: allowlisted 数值/枚举快照。
- exception value、SQL、params、绝对路径仍由 sanitizer 清除。
- sink 禁用/未初始化/失败均为 best-effort，不改变业务返回。

### Nexus aggregate sink

- 只发送时间窗汇总：code、domain、operation、count、平台/版本和数值健康指标。
- 不发送原始 Error、message、stack、SQL、路径或 payload。
- 默认不发送逐条 operational error。

## 6. Early errors and lifecycle

- `OperationalErrorService` 可在 Electron ready 前创建，容量固定（建议 64）。
- remote sink 未就绪时只缓冲 `error/fatal`；超出容量丢最旧项并增加本地 dropped 计数。
- `SentryServiceModule.preInitBeforeReady()` 初始化成功后绑定 sink并冲刷；同一个 report id 只交付一次。
- 配置关闭 Sentry 时清空待远端明细，但不关闭本地日志/聚合计数。

## 7. SQLite and rebuild data flow

### Current failure

```text
manual rebuild
  -> IndexingRuntime source reset
  -> FileProvider local reset
  -> main connection DELETE scan_progress
  X competing worker/main writes -> SQLITE_BUSY after retries
  -> raw Drizzle message -> renderer toast
```

### Target flow

```text
manual rebuild
  -> source mutation gate
  -> pause SearchIndexWriter admission
  -> drain active/pending worker writes
  -> interactive scheduler task clears scan_progress
  -> resume writer admission in finally
  -> clear/rebuild source through writer
  -> return safe FileIndexRebuildResult
```

`withPausedAdmission()` 不能包住随后调用 writer 的 `rebuildSourceFromSnapshot()`，否则 writer 自己等待 admission gate 形成死锁。暂停窗口只包住 `source.resetIndex({ clearSearchIndex:false })` 的本地数据库阶段；finally 恢复后再执行 writer rebuild。

`file-index.manual-rebuild.scan-progress-reset` 显式使用 `priority: interactive`、`dropPolicy: none`。retry exhaustion observer 向 OperationalErrorService 报告一次，FileProvider 业务边界覆盖为 `FILE_INDEX_DATABASE_BUSY`。

## 8. App Provider write governance

确认风险：`app-provider.ts:2319-2429` 通过 adaptive queue 并发直写 `files` 和 `file_extensions`，与 `db/utils.ts` 声明的单写者约束冲突。

本轮安全切口：

1. 删除 App Provider 私有 `isSqliteBusyError/createRetrier`。
2. 为遗留 App DB mutation 增加统一 `dbWriteScheduler + withSqliteRetry` 入口，批次内部以事务提交 file row + extensions，避免每个扩展再次竞争。
3. add/update/delete 使用明确 `app-provider.*` label 和 background priority；manual rebuild 路径提升为 interactive。
4. 报告中保留后续迁移：将 App Provider `files/file_extensions` 最终迁入 search-index worker 的 typed persistence port。当前 port 的 record shape 需要先覆盖 app display-name/extension 原子写，不能用不完整 adapter 强行切换。

## 9. Compatibility and rollout

- `FileIndexRebuildResult.error` 暂保留为脱敏 public message以兼容 renderer；新增 `errorCode`、`retryable`、`reportId`。
- 旧 callers 只判断 `success` 时行为不变。
- Sentry disabled 时服务退化为本地日志。
- 若新 reporter 产生启动循环，rollback 是解除 sink 注册并保留纯本地服务；业务模块不能直接回退到 Sentry imports。

## 10. Failure matrix

| Failure | Business result | Local log | Sentry | Nexus |
|---|---|---|---|---|
| SQLite busy eventually recovers | success | retry summary | no | aggregate count |
| SQLite busy retries exhausted | retryable failure | full cause | one deduped event | aggregate count |
| permission denied / user cancel | explicit expected result | optional info | no | no |
| unknown DB I/O error | blocked/data-risk | full cause | one event | aggregate code/count |
| reporter sink failure | original business result | reporter warning | no recursion | no |
| early fatal before Sentry ready | normal crash/handling policy | full cause | buffered once | count when ready |
