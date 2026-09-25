# Design — 修复手动重建文件索引自锁

## 1. 根因

`SearchIndexWriter.withPausedAdmission`（`search-index-writer.ts:310-335`）在 drain 完成后把 `admissionGate` 置为未决 promise，随后 `await operation(status)`；`withAdmission`（`:351-366`）对每次写入先 `while (this.admissionGate) await this.admissionGate`。operation 内部经 `file-provider-runtime-reset-service.ts clearScanProgress → execSearchIndexWrite → searchIndexWriter.execWrite → withAdmission` 发起的写入因此永远等待 operation 自己结束，形成自锁。

调用形状（生产）：`indexing-runtime.ts:834-840` → `SourceScopedIndexWriterRouter.withPausedSelectedAdmission`（`:543-558`）→ `SearchIndexWriter.withPausedAdmission`。

## 2. 方案：按异步上下文识别「暂停者自己的写入」

复用仓库已有模式（`db/db-write-scheduler.ts:15` 用 `AsyncLocalStorage<boolean>` 识别调度任务内的重入）：

```ts
const pausedAdmissionScope = new AsyncLocalStorage<true>()

async withPausedAdmission(reason, operation, timeoutMs) {
  ...
  this.admissionGate = new Promise(...)
  try {
    await this.drain(timeoutMs)
    return await pausedAdmissionScope.run(true, () => operation(this.getStatus()))
  } finally { ...resume... }
}

private async withAdmission(operation) {
  if (this.closed) throw ...
  // The pauser's own writes are the point of the pause; only foreign contexts wait.
  if (!pausedAdmissionScope.getStore()) {
    while (this.admissionGate) await this.admissionGate
  }
  ...
}
```

- 语义：暂停 = 把**其他**写者挡在门外并排空在途写入；暂停者自身的写入本来就是暂停的目的，放行不破坏排他性（drain 已完成、门仍关闭）。
- 计数不变：放行的写入仍走 `activeAdmissions` 计数与 `waitUntilReady`，`finally` 平衡不受影响。
- 不改 `withPausedSelectedAdmission`、不改 reset 服务、不改 runtime，只改 writer 一处。

## 3. 备选（未采用）

- 把 `clearScanProgress` 提到暂停窗口之外：改变 reset 的原子性（其他写者可能在清空 scan_progress 与 rebuild 之间插入），且需要改 runtime 与 reset 执行器两处。
- 给 operation 加超时：只把死锁变成失败，不修根因。

## 4. 兼容性

- 第二个调用方 `database/index.ts:562`（WAL checkpoint）在暂停窗口内只写主库（`dbWriteScheduler`），不经 search writer，行为不变。
- `getStatus().admissionPaused` 在窗口内仍为 true；WAL checkpoint 依赖的 `isSearchIndexWriterPausedAndDrained` 判断不变。

## 5. 回滚

单文件改动，`git checkout -- search-index-writer.ts search-index-writer.test.ts` 即回滚。
