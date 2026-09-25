# Design — 搜索热路径卫生

## A. 首批完成分支的 abort 复查（`search-core.ts`）

`isDone && isFirstUpdate` 分支在 `await this.mergeAndRankItems(...)` 之后插入：

```ts
if (gatherController!.signal.aborted || session.signal.aborted) {
  const cancelledResult = new TuffSearchResultBuilder(query).setItems([]).setDuration(Date.now() - startTime).setSources(update.sourceStats || []).build()
  cancelledResult.sessionId = sessionId
  cancelledResult.activate = session.getActivationState() ?? undefined
  resolve(cancelledResult)
  this.searchFirstResultMetrics.delete(sessionId)
  session.complete({ cancelled: true, activate: cancelledResult.activate, sources: update.sourceStats ?? [] })
  return
}
```

不能只 `return`：该分支已置 `didResolveInitial = true`，且 gather 已发出 isDone，之后不会再有 cancelled terminal，`result` promise 会悬挂。

## B. `SearchSession.complete()`（`search-session.ts`）

```ts
const cancelled = payload.cancelled === true || this.signal.aborted
this.stateValue = cancelled ? 'cancelled' : 'completed'
this.pendingTerminal = { ...payload, cancelled, searchId: this.id }
```

`publishSnapshot` 不改：取消路径今天就是「空快照 + cancelled terminal」，渲染端依赖该顺序。

## C. mtime（`app-provider.ts` reconcile）

```ts
const toSeconds = (value: Date | number | string) => Math.floor(new Date(value).getTime() / 1000)
toSeconds(scannedApp.lastModified) > toSeconds(dbApp.mtime)
```

`files.mtime` 由 drizzle `mode:'timestamp'` 以秒入库，读出为秒精度 Date；磁盘 mtime 带小数秒。

## D. 别名针（`app-semantic-catalog.ts`）

`match: ['terminal', 'iterm', 'warp', …]` → `['terminal', 'iterm', 'dev.warp.warp', …]`。tokenizer 以非字母数字切分，`dev.warp.warp` 是三 token 连续针，只命中 Warp 的 bundleId（`dev.warp.Warp-Stable`）。

## 测试

- A：`search-core.gather-ordering.test.ts` 新用例：首个 update 即 `isDone` 且带 items，merge 期间 cancel 会话 → 快照 items 为空、恰好一个 `complete{cancelled:true}`、`result` promise 已 resolve。
- B：`search-session.test.ts`：`cancel()` 后 `complete()` → sink.complete 收到 `cancelled: true`，`state === 'cancelled'`。
- C：`app-provider.test.ts`：db mtime 整秒、扫描 mtime 同秒 +400ms、其余无漂移 → `changed: 0`。
- D：`app-semantic-catalog.test.ts`：`{ name: 'Cloudflare WARP', bundleId: 'com.cloudflare.1cloudflare' }` 不含 `terminal`；`{ name: 'Warp', bundleId: 'dev.warp.Warp-Stable' }` 含。
