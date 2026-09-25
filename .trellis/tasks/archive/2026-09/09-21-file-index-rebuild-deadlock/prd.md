# 修复手动重建文件索引自锁

## Goal

让「重建文件索引」（设置页按钮与 `app:file-index:rebuild` IPC）在 search-split 模式下真正完成：清空 scan_progress、清空索引、重新全量扫描，并且重建期间与之后 file-provider 的 watch 事件继续被处理。

## Background

真机复现（2026-09-21，隔离 profile，split 开启，scan_progress 非空）：

- `app:file-index:rebuild {force:true}` IPC 20s 超时，日志只有 `Manual index rebuild triggered`，永远没有 `File index runtime state reset completed`。
- 诊断里 file-provider 的 `taskRunGate.reset.runningSince` 一直不清空，此后每个 watch 任务 `skipped errorCode=eligibility`，新建文件直到重启后手动 reconcile 才入库。
- 用真实 `SearchIndexWriter` + stub client 的 3 秒竞速测试复现 `HUNG`。

根因链：`file-provider.ts rebuildIndex` → `indexing-runtime.ts resetSourceRuntimeStateInternal` 在 `clearSearchIndex:true` 时用 `writerRouter.withPausedSelectedAdmission(sourceId, resetLocalState, 10_000)` 暂停写入口 → `resetLocalState` → `file-provider-runtime-reset-service.ts clearScanProgress` 在 split 模式下走 `execSearchIndexWrite` → `searchIndexWriter.execWrite` → `withAdmission` 的 `while (this.admissionGate) await this.admissionGate` 等待自己持有的门。`withPausedAdmission` 只对 drain 设了超时，operation 本身无超时。

## Requirements

### R1 暂停窗口内的自有写入必须放行

- 由 `withPausedAdmission` 的 operation 自身（同一异步上下文）发起的 writer 写入不得被 admission 门阻塞。
- 暂停窗口外的其他写入（其他异步上下文）仍必须等到 resume，现有「drain 后阻塞新写入、回调结束后恢复」的保证不变。

### R2 重建链路端到端可完成

- 真机：`app:file-index:rebuild {force:true}` 在秒级内返回 `success:true`，日志出现 `File index runtime state reset completed`，`taskRunGate.reset.runningSince` 归零，之后全量扫描把 bench 目录重新索引到与磁盘一致。
- 重建完成后新建文件仍能在 5s 内入索引（watch 未被 reset 门堵死）。

### R3 回归测试

- writer 层：暂停窗口内 `execWrite` 可完成，同时窗口外的写入仍被阻塞到 resume。
- router 层：`withPausedSelectedAdmission` 的 operation 内调用同一 writer 的 `execWrite` 可完成（与生产调用形状一致）。

## Acceptance Criteria

- [x] 新增测试在修复前失败（自锁/超时）、修复后通过。
- [x] `search-index-writer.test.ts` 全部用例通过；`indexing-runtime.test.ts` 通过。
- [x] 真机隔离实例：重建 IPC 成功返回；重建后新建文件 5s 内可搜。
- [x] `database-write-contracts.md` 记录「暂停窗口内自有写入放行」契约。

## Notes

- 旁路：`withPausedAdmission` 的 operation 无超时，本任务不加（重建可能很长）；`indexing-runtime.test.ts` 把 `withPausedSelectedAdmission` mock 成直接 resolve，测不到本 bug，故回归测试放在 writer 测试文件。

## Verification record (2026-09-21)

- 回归测试：3 条新用例修复前全部 `self-deadlock`（1s 竞速），修复后通过；`search-index-writer.test.ts` 11/11、`indexing-runtime.test.ts` 与 `modules/database` 共 135/135 通过；`typecheck:node` 通过；eslint 通过。
- 真机（隔离实例，split 开启）：`app:file-index:rebuild {force:true}` <1s 返回 `success:true`；日志 `File index runtime state reset completed`（clearedSearchIndexRows=297, scanProgressRows=1）；`taskRunGate.reset.runningSince` 为空；全量重扫后索引 298 = 磁盘 298；重建后新建文件 2s 入索引、可搜索，watch 任务 `succeeded`。
