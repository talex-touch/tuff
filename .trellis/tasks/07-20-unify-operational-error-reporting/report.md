# CoreApp 运行时错误上报与数据库写入整体审计

## Executive summary

本轮已完成 CoreApp 统一运行时错误上报边界和首个真实 SQLite 故障闭环。`OperationalErrorService` 现在统一负责错误归一化、本地明细日志、稳定分类、去重和 sink 分发；业务模块不再依赖 Sentry SDK，也不再把原始异常文本交给 renderer。

数据库侧确认没有 schema 或 SQL 语义错误。根因仍是 SQLite WAL 的单 writer 约束与多连接写竞争；本轮通过统一 scheduler/retry、writer admission barrier、retry exhaustion observer 和健康快照降低并显式观测竞争。App Provider 已进入共享调度与 retry 过渡层，但最终迁入 search-index worker typed persistence port 仍是 R9 后续项。

真实隔离 Electron 已完成 `BEGIN IMMEDIATE` 持锁验收：transport 返回 `FILE_INDEX_DATABASE_BUSY`、`retryable: true` 和脱敏消息；最终生产包 UI 只显示本地化安全提示；本地日志以同一 `reportId` 保留 SQL、参数、stack 和嵌套 `SQLITE_BUSY` cause；释放锁后 reset、scan 与 task gate 全部恢复。

## 1. Reporting ownership after cutover

| Boundary                         | Owner                                                          | Local sink                                | Remote sink                                              | Current state                                       |
| -------------------------------- | -------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| Main operational failures        | `modules/observability/operational-error-service.ts`           | structured log with reportId + full cause | Sentry detail + Nexus aggregate adapters                 | ✅ single facade                                    |
| Main Sentry lifecycle            | `modules/sentry/sentry-service.ts`                             | Sentry lifecycle log                      | allowlisted detail events                                | ✅ adapter only; business modules do not import SDK |
| Renderer-owned failures          | `renderer/modules/observability/operational-error-reporter.ts` | renderer logger                           | renderer Sentry adapter                                  | ✅ explicit facade                                  |
| Bootstrap rejection              | `core/precore.ts`                                              | full local error                          | bounded pre-init detail buffer                           | ✅ migrated                                         |
| Transport safe handler           | `utils/safe-handler.ts`                                        | original error + reportId                 | stable operational event                                 | ✅ raw message no longer crosses IPC                |
| File rebuild                     | IndexingRuntime + CommonChannel                                | full reset failure                        | deduped operational detail/aggregate                     | ✅ stable safe result and localized UI              |
| Search-index worker remote error | worker client                                                  | serialized cause/code/rawCode             | operational event at main boundary                       | ✅ migrated                                         |
| SQLite retry exhaustion          | `db/sqlite-retry.ts` + DatabaseModule listener                 | retry/exhaustion detail                   | aggregate warning; business boundary may escalate detail | ✅ one low-level observer                           |
| Database health                  | DatabaseModule                                                 | periodic numeric snapshot                 | threshold aggregate only                                 | ✅ busy/queue/writer/WAL/FD fields                  |
| App scanner                      | app reporter facade + platform scanners                        | original scanner error                    | stable platform/source/stage classification              | ✅ no orphan handler                                |
| Update                           | UpdateService + action controller                              | update error log/store                    | operational detail + existing feature telemetry          | ✅ expected vs exceptional paths split              |
| Sync                             | SyncModule                                                     | recovery/status log                       | operational report for unexpected failure                | ✅ migrated P1 boundaries                           |
| Module lifecycle                 | ModuleManager                                                  | lifecycle log                             | operational detail + existing aggregate metadata         | ✅ migrated                                         |
| Renderer process gone            | TouchWindow                                                    | process-gone log                          | stable fatal/degraded operational event                  | ✅ migrated                                         |
| Analytics outbox                 | analytics modules                                              | queue/retry logs                          | Nexus telemetry                                          | retained; not an exception-detail sink              |
| Electron crashReporter           | PreCore                                                        | local dump                                | disabled (`submitURL=''`, `uploadToServer=false`)        | retained explicitly                                 |
| Trusted plugin runtime           | plugin host/session logs                                       | plugin-scoped local log                   | none in this wave                                        | ⏳ P2; payload must remain local                    |
| Nexus Web                        | Nuxt Sentry module                                             | Web-owned logs                            | independent Sentry project                               | intentionally separate                              |

## 2. Failure chain and repaired boundary

修复前：

```text
SQLite/Drizzle Error
 -> FileProvider catch converts to string
 -> transport returns raw message
 -> renderer wraps the message again
 -> SQL, params and absolute paths reach toast
```

这些异常都已被 catch，因此 Sentry 的 uncaught instrumentation 不会自动捕获它们；logger 与 Sentry 也不存在隐式桥接。

修复后：

```text
unknown Error with cause/code
 -> OperationalErrorService keeps the original Error locally
 -> stable domain/operation/code + dedupe
 -> Sentry detail adapter / Nexus aggregate adapter
 -> safe serializable result
 -> renderer maps errorCode to localized copy
```

Sentry sanitizer 继续移除 exception value、路径、source context、SQL 和 params，只保留稳定 fingerprint/tags 与 allowlisted operational context。

## 3. SQLite evidence and current write topology

### Completed controls

- `scan_progress` 使用 `(source_id,path)` 复合主键；原始路径与 lower-case 兼容路径是历史清理策略，不是缺陷。
- search-index worker 保留单写者队列，并能跨 worker 边界保留 `cause/code/rawCode`。
- 手动重建先暂停 writer admission，等待 active/pending 归零，只在 local reset 窗口内清理进度，并在 `finally` 恢复；writer snapshot rebuild 在窗口外执行，避免自锁。
- `file-index.manual-rebuild.scan-progress-reset` 使用 `interactive + dropPolicy:none`，并复用共享 `withSqliteRetry`。
- App Provider add/update/delete、backfill、mdls 与 rebuild 已进入共享 scheduler/retry；生产 DB adapter 支持时 file row 与 extensions 在同一 transaction 提交。
- retry exhaustion observer 同时覆盖 scheduler 内和直接 `withSqliteRetry`；DatabaseModule 健康快照包含 busy delta、scheduler queue、writer pending/active/admission、WAL 和 open FD。

### Remaining structural contention

- main libSQL connection、search-index worker connection、配置/usage 写入和兼容 mirror 仍共享同一个 WAL writer lock。
- `db/utils.ts` 仍暴露 policy-free mutation helpers，调用方所有权尚未在类型层强制。
- App Provider 当前是统一调度过渡层，尚未迁入 search-index worker typed persistence port。
- aux compatibility mirror 和短生命周期 libSQL client 仍需 owner registry 与退场条件。

```text
Main shared scheduler writes ───────────┐
Search-index worker transactions ──────┼─> core database WAL writer lock
Compatibility / auxiliary writers ────┘
```

SQLite WAL 允许并发读，但同一时刻仍只有一个 writer。retry 是恢复机制；scheduler、typed port 与明确 owner 才是所有权模型。

## 4. Remediation status

### Completed in this task

- Main/renderer `OperationalErrorService` facade、shared contract 和有界 pre-init buffer。
- Sentry detail 与 Nexus aggregate sink 分离；Sentry disabled 或 sink 失败不改变业务结果。
- SQLite retry exhaustion observer、contention health snapshot 和稳定去重分类。
- 文件重建安全 result、writer quiescence barrier、脱敏 UI 与真实锁竞争恢复。
- App Provider 私有 busy retrier 删除；已确认 mutation 路径进入共享 scheduler/retry/transaction。
- Bootstrap、CommonChannel、worker、Update、Sync、module lifecycle、renderer-process-gone、App scanner 等 P0/P1 边界接入。

### Remaining P2 work

- 扩展 search-index worker typed persistence port，使 App Provider file row + extensions 原子写入最终单写者。
- 收口 `db/utils.ts` mutation API：读 facade 与写 port 分离，禁止 policy-free write helper。
- 建立 libSQL client/session owner registry，并定义 aux compatibility mirror 退场条件。
- 完成 trusted plugin-host runtime 分类与限流；插件 payload/session detail 仍只留本地。
- Nexus Web 保留独立 observability 生命周期和独立后续审计。

## 5. Privacy and user experience contract

Transport/UI 只接收稳定字段：`errorCode`、`retryable`、脱敏 `error` 和关联 `reportId`。最终中文 UI 文案为：

```text
数据库正忙，索引重建尚未开始，请稍后重试。
```

本地日志是受控诊断 sink，故意保留原始 Error、SQL、params、绝对路径、stack 和嵌套 cause，并以 reportId 关联。Sentry 只接收稳定 fingerprint/tags 与脱敏 stack；Nexus 只接收分类、count 和安全数值。原始错误细节不得进入 transport、UI、Sentry 或 Nexus。

## 6. Definition of done

- [x] 可控写锁场景稳定返回单个安全业务失败，并生成可关联的 operational report。
- [x] 释放写锁后同一隔离 profile 成功 reset、scan 并结束 task gate。
- [x] 最终生产包 UI 与 transport 均无 SQL、params 或绝对路径泄露。
- [x] writer barrier 聚焦测试与真实恢复均无 admission 泄漏或死锁。
- [x] App Provider 已确认 mutation 不再绕过共享 scheduler/retry。
- [x] 报告矩阵中 P0/P1 owner、sink、隐私边界和迁移状态已更新；P2 明确保留。

## 7. Acceptance evidence — 2026-07-21

### Real packaged Electron lock failure

- Artifact: `apps/core-app/dist/mac-arm64/tuff.app`。
- Isolation: temporary profile and fixture root under `/tmp`; Sentry config disabled; native OCR disabled only to avoid the independent packaged OCR crash recorded below。
- Lock holder: second SQLite connection executed `BEGIN IMMEDIATE` and held the transaction open。
- Final-build IPC result after 17,879 ms:

```json
{
  "success": false,
  "error": "Database is busy. Please retry.",
  "errorCode": "FILE_INDEX_DATABASE_BUSY",
  "retryable": true,
  "reportId": "0de62e37-9dee-44ca-b2f7-540b27792ac3"
}
```

- Result leak checks: SQL=false, `params:`=false, absolutePath=false。
- Final-build UI: `数据库正忙，索引重建尚未开始，请稍后重试。`; the extracted toast had the same three leak checks all false。
- Local log: `/tmp/.../tuff/logs/E.2026-07-21.err:1-16` contains the same reportId, full query/params/stack and `Caused by: LibsqlError: SQLITE_BUSY: database is locked`。

### Recovery after releasing the lock

- IPC returned `{ success: true, message: "Index rebuild started" }`。
- Reset: `file-provider:reset:2`, started `1784618082229`, completed `1784618082317`, `clearedScanProgress=true`, `scanProgressRows=1`。
- Scan: `file-provider:scan:3`, started `1784618082327`, completed `1784618082354`, status `complete`, progress `100`。
- Task gate: `runningEntries=0`, `blockedEntries=0`。

### Engineering checks

- Update action controller: 1 file / 3 tests passed。
- Final focused suite after formatting: 21 files / 240 tests passed。
- Scoped Prettier: all changed CoreApp and utils TS/Vue/JSON files completed。
- Scoped ESLint: CoreApp and utils changed TS/Vue files exited 0 with no findings。
- `build:unpack`: node typecheck, web typecheck, TuffEx build, production Vite build and macOS arm64 unpack all passed。
- Local logger cause smoke: persisted `Caused by: Error: SQLITE_BUSY: database is locked` after the outer query error。

## 8. Independent observation

The first packaged smoke with native OCR enabled exited on an uncaught `Napi::Error` after automatic OCR invocation. Final acceptance disabled native OCR via environment flags and otherwise used the production package. This is independent of the SQLite/reporting flow and requires a separate native OCR lifecycle task; it is not hidden as part of this completion.
