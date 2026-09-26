# Design — 快层 provider 独立读车道

## Boundary

`search-engine/workers/search-index-read-worker-client.ts`（加 lane 标签）、`search-engine/search-core.ts`（第二个 client + 第二个 reader 模式 `SearchIndexService`、销毁、deps）、`search-engine/search-provider-registry.ts`（按 provider 解析 `searchIndex`）。不改 worker 脚本、不改构建、不改 `ProviderContext` 类型。

## Facts the design rests on

- 读 client 是单 worker FIFO：`active` 一个槽 + `queued` ≤ 64，超时 15s 才 `failWorker`；abort 只能移除排队项，正在执行的查询占槽到返回。
- reader 模式 `SearchIndexService.initialize` 只做 `readiness.waitUntilReady()` + `verifySearchIndexSchema()`（主线程 pragma 读，无写）；`repair()` 在 reader 模式直接抛错。两个 reader 实例指向同一库是安全的。
- 只有 app-provider（fast）与 file-provider（deferred）读 `context.searchIndex`；`LegacySearchIndexWriter` 与提交可见性屏障 `waitUntilReadable` 复用原实例，必须留在原实例上。
- 同一 worker 脚本可以 `new Worker` 两次，各自独立连接与 resourceLimits。

## Changes

### 1. `SearchIndexReadWorkerClient` lane 标签

```ts
export interface SearchIndexReadWorkerClientOptions {
  workerPath?: string
  timeoutMs?: number
  maxQueueDepth?: number
  /** Diagnostic label; requestIds and retire logs carry it so two lanes can be told apart. */
  lane?: string
}
```
- `requestId` 变为 `search-index-read-${lane}-${n}`（默认 lane `'deferred'`，与现状日志兼容）。
- `readWorkerLog.warn('Search index read worker retired', { meta: { lane, ... } })`。
- `SearchIndexReadWorkerTimeoutError` message 不变（仍含 requestId，因此已带 lane）。

### 2. search-core 第二车道

在 `init()` 现有构造后：
```ts
instance.searchIndexFastReadWorker = new SearchIndexReadWorkerClient(
  databaseModule.getSearchDatabaseFilePath(),
  { lane: 'fast', timeoutMs: FAST_READ_LANE_TIMEOUT_MS } // 3000
)
instance.searchIndexFastService = new SearchIndexService(searchDb, {
  logger: searchLogger,
  initializationMode: 'reader',
  readiness: searchIndexWriter,
  readExecutor: instance.searchIndexFastReadWorker
})
```
- 不对 fast 实例调用 `preloadPinyin()`（拼音只用于写路径 prepareDocument）。
- `beforeProvidersLoad` 不变（warmup/waitUntilReadable 仍在原实例）。
- destroy 的 `finally` 同时 `close()` 两个 client，均置 null。

### 3. 按 provider 分流

`search-provider-registry.ts`：
```ts
getSearchIndexService: (provider?: ISearchProvider<ProviderContext>) => SearchIndexService | null
...
const searchIndex = this.deps.getSearchIndexService(provider)
```
search-core：
```ts
getSearchIndexService: (provider) =>
  provider?.priority === 'fast'
    ? (this.searchIndexFastService ?? this.searchIndexService)
    : this.searchIndexService
```
现有测试中 `getSearchIndexService: () => null` 的写法无需修改（多余实参被忽略）。

## Failure / rollback

- fast 车道 client 构造失败（worker 文件缺失）时与现有 client 同样 throw；两者路径相同，不会出现只有一个失败的情况。
- fast 车道 15s→3s 的超时对齐 gather `taskTimeoutMs`，超时后 retire+rebuild，deferred 车道不受影响。
- 回滚：删除第二实例与三元分流即可。

## Tests

- `search-index-read-worker-client.test.ts`：lane 出现在 requestId 与 retire 日志 meta。
- `search-provider-registry.test.ts`：fast 与 deferred provider 分别拿到 `getSearchIndexService` 对应实参的返回值（用 spy 断言实参为 provider）。
- 契约测试（`search-core.contracts.test.ts` / `trace`）中的假类构造两次不影响断言；跑一遍确认。
