# Research: CoreBox 结果列表"老是刷新"——索引提交刷新风暴的根因

- **Query**: 老板 2026-09-26 反馈「这个怪怪的 老是刷新」：查询 `wx` 时，结果列表自己不停刷新；结果全是 `apps/core-app/out/renderer/assets/` 下带 hash 的构建产物；顶部有两行看起来一样的 `KaTeX_Caligraphic…`（12.05 KB）；日志里有 Spotlight provider、`IndexingDiagnostics.source` 慢上下文、`FILE_INDEX_WORKER_BATCH_FAILED:26/30`。本文件回答"为什么会一直触发"，视觉层面（快照删行、延迟批次插回）见 `09-25-corebox-list-motion/research/motion-audit.md` §2.2，方案 B 已批准。
- **Scope**: internal（代码阅读、git 历史、dev 日志只读统计、/tmp 探针）
- **Date**: 2026-09-26
- **行号基准**: 2026-09-26 工作区。`useSearch.ts` 含 09-25-corebox-keyboard-jump 未提交的修复（`focus > 0` 才跟随），行号按工作区计。
- **路径简写**: `R/` = `apps/core-app/src/renderer/src/`，`M/` = `apps/core-app/src/main/modules/box-tool/`，`U/` = `packages/utils/`

---

## 0. 结论速览

1. **直接触发者是渲染层的 index-commit 刷新，而且它对"哪些提交"完全不设门槛。** 查询非空时，主进程推来的**任何**一次索引提交（不看 provider、不看与查询是否相关、不看是扫描还是富化）都会在 500ms 后强制重跑整次搜索；上一次搜索一结束就排下一次（`R/modules/box/adapter/hooks/useSearch.ts:1408-1452`）。/tmp 探针用真实的 `useSearch` 实测：提交每 300ms 来一次时，**每 0.6–1.6s 重搜一次**，间隔只取决于上一次搜索多久结束（§1.4）。
2. **主进程在这台机器上几乎一直在发提交。** 写路径只要 `affectedItems > 0` 就发，而重写内容不变的文档也计入 affectedItems（`M/search-engine/search-index-writer.ts:661-690`、`search-index-service.ts:404-455,1195-1231`）。持续的生产者有三个：
   - **a. 启动全量扫描永远扫不完**：macOS 默认根是整个 `~`（72bb2f855）。`scan_progress` 只在整棵根扫完后才写，所以 dev 每重启一次就从头扫。日志：23:08 开始的一轮跑了 ≥9.5h，被 08:38 的重启打断仍未完成；08:44 又从头开始，09:09 仍在跑。每批 → 1 次提交，该批的内容富化 flush → 再 1 次提交。
   - **b. 富化恢复（enrichment-resume）会自我续命**：每次 mutation drain 都会 `resume()`，包括富化结果自己的 lease-free 发布；每轮从 id 0 重新挑未完成的行，每次 flush 都把全部结果（包括失败的）当索引项重写，所以每次都有提交。老板日志里的 `reason: 'enrichment-resume.indexed-source.mutation…'` 正是这条回路。
   - **c. 监听增量**：每个被接受的文件变更都会产生一个 delta，进而发一次提交，不检查内容是否真的变了。
3. **提交为什么会变成"看得见的刷新"**：
   - 搜索缓存按全局 revision 失效（`search-core.ts:1025-1048`），所以提交触发的刷新**必定**缓存未命中，只能整轮重跑；
   - 快层快照会整体替换列表（`useSearch.ts:960`），而 macOS 上两个文件 provider 都是 deferred；
   - Spotlight 约 264ms 之后才把文件行补回来，这就是 motion-audit §2.2 的"删掉再插回"。
4. **截图里的 `out/renderer/assets` 行来自 Spotlight provider（mdfind），不是我们的文件索引。** Spotlight 结果只过 `getSearchExclusionReason`，不排除构建产物、`node_modules`、`~/Library`（`M/addon/files/native-file-search-provider.ts:365-374`）。
   - 实测 mdfind 对 `*wx*` 返回 155 条，前 13 条都在 `talex-touch/apps/core-app/out/renderer/assets`，provider 截取前 50 条。
   - 另外，这些 assets 最后一次写入是 09-25 19:07 的一次生产构建，dev 服务器并不会反复重写它们。
5. **两行 KaTeX 不是去重失败**，而是两个不同路径下同名、同内容的文件（内容 hash 命名，sha1 相同，都是 12,344 B）：`talex-touch/apps/core-app/out/renderer/assets/…` 和 `~/Workspace/mikobot/nanobot/web/dist/assets/…`。
6. **`IndexingDiagnostics.source 293–340ms` 并不是主线程阻塞**，而是 app-provider 健康检查在单槽读 worker 上排队加执行 FTS5 全表 `count(*)` 的墙钟时间。它是同源噪声，也是放大器，但不是刷新的触发者：
   - 每个通过 watcher 的文件事件都会路由给 app 源一次，而且是先做健康检查、后判断路径在不在 `/Applications` 下；
   - 一次 tuffex 构建（2,759 个 `dist/` 文件，watcher 放行）≈ 14 分钟的饱和；
   - 它和 CoreBox 的 FTS 查询、提交可见性屏障共用同一个读 worker。
7. **26/30 失败**：唯一注册的解析器是 `TextFileParser`，"failed" 就是 `fs.readFile` 抛错（ENOENT/EACCES/EPERM…）。
   - 不会对同一批原地循环重试：失败项会被持久化为 `failed`；
   - 但它会让本轮 resume 中止，下一次 lease-free 发布又从 id 0 开新一轮；
   - 并且这批 30 个结果照样会发布、照样提交。

---

## 1. 因果链（每一环附 file:line）

### 1.1 渲染层：哪个事件、怎么变成重搜

- **订阅**：`onMounted` → `startIndexCommitStream()`（`useSearch.ts:1934`）→ `transport.stream(CoreBoxEvents.search.indexCommitted, …)`（`useSearch.ts:1469-1517`，stream 在 1482）。事件定义在 `U/transport/events/index.ts:1147`（`core-box:search:index-committed`，stream），默认走 MessagePort 长连接（`U/transport/sdk/port-policy.ts:8-12`）。
- **每条 payload** → `scheduleIndexCommitRefresh(payload.recommendationsInvalidated === true)`（`useSearch.ts:1485`）。
- **门槛**：`shouldRefreshForIndexCommit`（`useSearch.ts:1408-1414`）有两种情况：
  - 查询非空时恒为 `true`（1413），`providerIds` 和 `recommendationsInvalidated` 都不看；
  - 空查询只看 `recommendationsInvalidated`。

  可见性只看 `document.hidden`（1410）。规范说 keep-alive 窗口隐藏时它可能仍然是 false（`.trellis/spec/frontend/hook-guidelines.md`「CoreApp window visibility and continuous work」），这一点未验证。
- **节流**：`INDEX_COMMIT_REFRESH_INTERVAL_MS = 500`（`useSearch.ts:616`）。
  - 同一时刻只有一个 500ms 尾沿定时器（1416-1428）；
  - 到点时，如果 `loading || inFlightQuery` 就再等 500ms（1437-1440）；
  - 否则 `handleSearchImmediate({ force: true, preserveSelection: true, refreshClipboard: false })`（1444-1448）；
  - 快照返回后，只要期间又有提交就立刻重新排队（1449-1451）。

  **没有**上限、退避，也不检查相关性。
- **引入**：b80730046（07-15，「refresh search during indexing」）。当时的 PRD R3 写的是「提交后 1 秒内可见；用完整新快照，不做 append」，场景是**首次建库**。

### 1.2 主进程：谁发这个事件

1. 渲染层开流 → `M/core-box/ipc.ts:370-374` → `searchEngineCore.registerIndexCommitStream(context)`（`M/search-engine/search-core.ts:458-468`）。
2. `SearchIndexCommitHub.markCommitted(providerIds)`（`M/search-engine/search-index-commit-hub.ts:13-37`）递增全局 revision 并同步通知 → `search-core.ts:2066-2069` 订阅 → `handleSearchIndexCommit`（519-548）→ `emitIndexCommit`（488-496）推给每个渲染层流。
   - `recommendationsInvalidated` 只对 app 提交置 true；文件提交最多每 60s 置一次 true（557-565，`FILE_COMMIT_INVALIDATION_INTERVAL_MS` 在 134）。但**非空查询根本不看这个字段**。
   - 另外，`invalidateAppRecommendationPresentation`（475-486，app 图标补齐）也会发一次"提交"，同样会让非空查询重搜。
3. **唯一调用 `markCommitted` 的地方**是 `SourceScopedIndexWriterRouter.publishCommit`（`M/search-engine/search-index-writer.ts:661-690`）：
   - `affectedItems <= 0` 时不发（668-670）；
   - 否则等可见性屏障（674，`waitUntilReadable` → 读 worker 上的 `SELECT item_id FROM search_index LIMIT 1`），然后发；
   - **屏障失败也照发**（682-689，打 "degraded reader visibility"）。

   它的调用方有：`indexItems`（534-545）、`persistAndIndexFiles`（546-577）、`commitSourceReplacement`（591-605）、`removeProviderItems`（611-618）、`clearSource` / `cleanupSource`。
4. **重写同样内容也算 affected**：`SearchIndexService.applyProviderItems` 返回 `indexedItems: preparedDocs.length`（`search-index-service.ts:454`）；`applyDocument` 无条件 `DELETE` + `INSERT`（1195-1231），只有 keyword 映射会按 hash 跳过（1233-1249）。`SearchIndexWriter.indexItems` 把 `removedItems + indexedItems` 当 affected（`search-index-writer.ts:262-272`）。

### 1.3 持续发提交的三个生产者

#### a. 全量扫描：每次启动从头扫 `~`，扫几个小时

- macOS 的根是整个 home：`resolveFileProviderBaseWatchPaths` 在 darwin 上只返回 `['home']`（`M/addon/files/file-provider-watch-paths.ts:24-32`，72bb2f855，09-13）。
- `_initialize` 对 `newPathsToScan` 做全量扫描（`M/addon/files/file-provider.ts:3883-3899`）。**`scan_progress` 只在整棵根扫完后才写**（3921-3928；`fullScanRunService` 在 `completedPaths.push(rootPath)` 之前必须把整个根走完，见 `services/file-provider-full-scan-run-service.ts:72-100`）。扫描策略把"没有完成记录"的根判为新根（`services/file-provider-scan-strategy-service.ts:38-72`），所以被重启打断的扫描下次会从头来。
- **每批都提交**：`scanSource` → 每个 batch 调一次 `store.applyBatch`（`M/search-engine/indexing-scan-scheduler.ts:150-165`）→ `SearchIndexStoreAdapter.applyBatch` → `indexItems`（`indexing-store-adapter.ts:295-311`）→ `publishCommit`。
- **每批还会触发一轮富化**：`onBatchApplied` → `fileProvider.handleIndexedSourceRuntimeRecordsApplied`（`search-core.ts:2091-2098`；`file-provider.ts:1082-1107`，只处理 `runtimePublication === 'base'`，在 1873-1876 打标）→ `writeSideEffectService.dispatch` → `scheduleIndexing`（`U/search/indexing-write-side-effect.ts:33-50`）→ worker 结果 flush → `publishCommittedWorkerRecords`（`file-provider.ts:1935-1964`）→ `applyBatch` → 又一次提交。
- **日志证据**：按 perf context 的 `FileProvider.fullScan` 时长反推起点，结果如下：

  | 起点 | 观察到的持续时间 | 结局 |
  |---|---|---|
  | 09-25 18:15、20:07、20:10 | 很短 | 被重启打断 |
  | 21:09 | ≥1.98h | 23:08 被重启打断 |
  | 23:08 | ≥9.49h | 08:38 被重启打断 |
  | 09-26 08:44:45 | 09:09:50 时已跑 1,505s | 仍在跑 |

  老板截图正好在 08:4x。

#### b. 富化恢复：自己的发布又把自己踢起来

- `drainIndexedSourceMutations(reason)`：drain 成功后**无条件** `enrichmentResumeService.resume(reason)`（`file-provider.ts:2284-2290`）；drain 超时的恢复路径也会调（2329）。
- `reason` 的来源（`M/search-engine/file-indexed-source.ts:239-243`，拼成 `indexed-source.${reason}`）：
  - `'watch'`：每个监听事件路由完都会 drain（`indexing-watch-router.ts:118-120`），**包括被判定为排除、没有产生 delta 的事件**；
  - `'mutation'`：每个不带 lease 的 `applySourceBatch` / `applySourceBatchWithPersistence` / `applySourceDelta`（`indexing-runtime.ts:284-367`）；
  - `'scan'`、`'reconcile'`。
- **自我续命**：resume 这一轮调用 `scheduleIndexing(rows, reason)` 时不带 lease（`file-provider.ts:900`）。它的 worker 结果经 `publishCommittedWorkerRecords` 以 `mutationLeaseId = undefined` 调 `applyBatch` → `indexing-runtime.ts:295-300` 走 lease-free 分支 → `drainMutations({ reason: 'mutation' })` → 又 `resume('indexed-source.mutation')`。这一轮还在跑时，`resumePromise` 会让新请求直接返回（`services/file-provider-enrichment-resume-service.ts:30-41`）；这一轮一结束（跑完或抛错），下一次发布就开新一轮。老板日志的 `reason` 就是 `enrichment-resume.indexed-source.mutation…`：`enrichment-resume.` 是 resume 服务加的前缀（83-84），`:depth-N` 是深度延迟分组加的后缀（`services/file-provider-index-scheduler-service.ts:182`）。截图里的 "mutation-9" 应该是 `mutation:depth-9`。
- **每轮从头开始**：`afterId = 0`，每批 200 行，条件是 `files.type='file' AND (progress IS NULL OR status IN ('pending','processing'))`（`enrichment-resume-service.ts:47-88`，WHERE 在 69-78）。这个查询走的是主线程 libsql 连接（`getFileIndexReadDb`），而本地 libsql 是同步的。每一轮开头的这个查询在大表上会不会卡主线程，**未测量**。
- **每次 flush 都提交**：flush 的 `afterPersist` 会把本批全部未 stale 的结果都发布出去（`services/file-provider-index-flush-executor-service.ts:110-133`）。worker 对每个文件都附带一个 `indexItem`，不管成功、跳过还是失败（`workers/file-index-worker.ts:193-369`）；`mapWorkerResultToIndexedSourceRecord` 也不按状态过滤。
- **backlog 一直有**：全量扫描不断插入还没有 progress 的新行，每次重启又会取消扫描 lease 下还没 flush 的富化结果（`file-provider.ts:2299-2324`、`isIndexWorkerMutationLeaseCancelled`），所以"未完成"的集合一直不空。另外，代码类扩展名（`.js .ts .tsx .py .go .rs …`）都在 `CONTENT_INDEXABLE_EXTENSIONS` 里（`M/addon/files/constants.ts:535-539`），整个 home 下的代码仓库都要读一遍内容。

#### c. 监听增量：每个被接受的变更都会提交

`handleIndexedSourceWatchEvent`（`file-provider.ts:2366-2395`）先跑增量写入：planner 能识别出"没变"（`unchangedCount`），这种情况不写库。但函数随后**无条件**用 `buildFileRecord` 构造 delta 并返回。watch router 拿到后调 `store.applyDelta` → `indexItems([item])`（`indexing-store-adapter.ts:388-402`），发一次提交。所以仅仅是 touch 或 xattr 变化产生的 `change` 事件，也会导致一次提交和一次重搜。

### 1.4 频率：用真实 hooks 实测

提交本身没有日志，所以主进程每秒发多少次只能从代码推断：至少每个扫描批次一次（AIMD 目标 ~300ms/批，见 `services/file-provider-full-scan-insert-service.ts:14-20`），外加每次富化 flush 一次。渲染层这一侧可以测。

- **探针**：`/private/tmp/refresh-churn-probe/cadence/cadence.test.ts`。它是 `useSearch.core.test.ts` 的副本，mock 路径改成了绝对路径；在第一个 describe 的 `beforeEach` 之后插入一个参数化用例：
  - 查询设为 `wx`，快照 80ms 返回，complete 在 N ms 后到达；
  - 每 300ms 推一次 `{ providerIds: ['file-provider'] }`，持续 10s；
  - 统计 `state.searchRequests` 的增量。

  运行命令：`apps/core-app/node_modules/.bin/vitest run --config $PWD/apps/core-app/vitest.config.ts --root /private/tmp/refresh-churn-probe/cadence cadence.test.ts -t "CADENCE PROBE"`。

  | 搜索完成耗时 | 10s 内提交 | 10s 内重搜 | 重搜间隔中位数 |
  |---|---|---|---|
  | 300ms | 34 | 16 | 600ms |
  | 700ms | 34 | 9 | 1,200ms |
  | 1,500ms | 34 | 6 | 1,600ms |

- **结论**：只要提交持续，CoreBox 就**背靠背**地重搜。间隔 = 上一次搜索的尾巴 + ≤500ms。读 worker 越拥堵（见 §4），尾巴越长，但重搜永远不会停。

### 1.5 为什么每次重搜都"看得见"

- **缓存必然失效**：缓存条目带着写入时的 revision，查找时 revision 对不上就判为 miss（`search-core.ts:1025-1048`，写入时的拒绝在 222-256）。index-commit 刷新本身就是 revision 变化引起的，所以**必然 miss**，必须整轮重跑：spawn 一次 mdfind，加上若干次 FTS 读。
- **快照先删、延迟层再插回**：快层 80ms，延迟层再等 50ms（`search-gather.ts:53-64`）。`macos-spotlight-provider` 和 `file-provider` 都是 deferred（`native-file-search-provider.ts:255`、`file-provider.ts:310`）。快照整体替换列表（`useSearch.ts:960`），文件行先消失，Spotlight 那批（日志里 264ms）和索引那批再把它们合并回来并重排（`useSearch.ts:1106-1143`、`564-579`）。这就是 motion-audit §2.2。
- **Spotlight 顺序是稳定的**：同一查询连跑 3 次 mdfind，前 50 条完全一致（§6 已排除）。所以"跳"来自快照删行和重排，不是 Spotlight 每次返回的集合不同。
- **顶部为什么全是 `out/renderer/assets`**：mdfind 的输出顺序决定了截取哪 50 条（`native-file-search-provider.ts:365-374`）。tuffSorter 用 mtime recency 参与打分（`sort/tuff-sorter.ts:286-291`），而 09-25 19:07 刚构建的 assets recency 最高，所以排在最上面。

---

## 2. 主进程：worker 批失败、重试与提交

- **抛出位置**：`FileProviderIndexSchedulerService` 的 dispatch 在 worker 返回 `failed > 0` 时 `throw new Error('FILE_INDEX_WORKER_BATCH_FAILED:${failed}/${processed}')`（`services/file-provider-index-scheduler-service.ts:71-81`）。日志里的两个栈帧：
  - `Object.dispatch` 对应这个闭包；
  - `async out/main/index.js:11359` 对应 `U/search/indexing-worker-scheduler.ts:147-151` 里的 `await this.deps.dispatch(context, chunk)`（已在当前的 `out/main/index.js:11359` 核对）。
- **记录，但不重试**：`scheduleChunks` 的 catch 把失败推进 `dispatchFailures`，然后打 `Index worker failed`，被映射成 `File index worker failed`（`indexing-worker-scheduler.ts:153-161`；`file-provider-index-scheduler-service.ts:254-256`）。块大小 30（67）、深度 >2 的文件每多一层延迟 750ms（65-66、203-206）、≥5MB 的文件后台延迟 5s（63-64）。**调度器本身不重试**。
- **下一次不限作用域的 drain 会抛错**：`drain()` 在等待结束后，如果本作用域里有记录的失败，就清掉并抛 `AggregateError('INDEXED_WORKER_SCHEDULER_DISPATCH_FAILED')`（`indexing-worker-scheduler.ts:79-112`）。
  - resume 这一轮调用 `waitForSearchIndexDrain(reason)`（不带 lease，`file-provider.ts:4233-4257`）会抛出 → `run()` reject → 打 `Deferred file enrichment recovery paused` → `resumePromise` 置空（`enrichment-resume-service.ts:33-40`）。
  - 带 lease 的 drain（watch 或 mutation 触发的那种）只看自己 lease 的失败（`matchesScope`，185-187），不受影响。
- **为什么是 26/30**：
  - 只注册了一个解析器 `TextFileParser`（`U/electron/file-parsers/index.ts:1-4`）。
  - pdf、docx、xlsx 这类可做内容索引、却没有解析器的扩展名 → `null` → 结果是 `skipped: parser-not-found`，不算失败（`registry.ts:56-91`；`file-index-worker.ts:278-295`）。
  - 文本和代码类走 `fs.readFile(path, 'utf8')`，抛错才返回 `status: 'failed'`（`parsers/text-parser.ts:84-106`）→ worker 计 `failed += 1`（`file-index-worker.ts:353-369`）。
  - 所以 **26/30 意味着一个深度为 9 的 30 文件块里有 26 个文件读不出来**。候选解释（未能确认，按可能性排）：
    1. **行已过时，文件已经被删除或移走（ENOENT）**：同一目录的一整块一起失败，最像"整个目录没了但索引行还在"。常见来源是 worktree、临时目录、被重建的产物目录；应用没在运行时的删除要等 reconcile 才清理，而 reconcile 只有全量扫描完成后才轮到，但全量扫描永远完不成（§1.3a）。
    2. **读权限（EACCES/EPERM，TCC 受保护目录）**。
    3. **与并发重建赛跑**：扫描到的那一刻文件还在，读的时候已经被删。
- **不会对同一批原地死循环**：
  - worker 对每个文件都会发一条 `failed` 的 progress；按 fileId 缓冲后 flush 持久化；
  - resume 的查询排除 `failed`（`enrichment-resume-service.ts:69-78`）；
  - 所以同一批文件不会被立刻再选中。但每失败一次，这一轮 resume 就暂停；下一次 lease-free 发布又从 id 0 开一轮。

  **一个待核实的竞态**：新一轮的 SELECT 可能在上一批 progress 落库之前执行，那样同一批文件会被重复调度。这一点是从代码推断的，没有观测到。
- **部分失败会不会发"新数据"提交**：**会**。这 30 个结果（含 26 个失败）都会以 `worker-enrichment` 记录发布 → `indexItems` 的 affected 为 30 → 提交 → 渲染层重搜（§1.3b）。
- **日志局限**：`[file-provider]`、`[search-engine]` 这类 `U/common/logger` 的 `getLogger` 输出只进 dev 控制台，**不进** `tuff-dev/logs/D.*.log`；D 日志里只有 `createLogger`（主进程 `utils/logger`）的输出。所以 worker 失败的频率无法从日志文件统计。

---

## 3. 构建产物与排除规则

一共三层过滤，口径各不相同：

| 层 | 函数 | `out/` `dist/` `build/` `target/` `coverage/`（旁边有 package.json 等项目标记时） | `node_modules`、`.git`、dot 目录 | `~/Library` |
|---|---|---|---|---|
| FSEvents watcher（home 根，depth 24） | `isExcludedFileWatchPath`，传 `siblingNames: []`（`M/file-system-watcher/file-system-watcher.ts:38-54,112-119`） | **放行**：空兄弟列表等于"没有项目标记"，这是有意为之，注释说「decided downstream」 | 排除 | 排除 |
| 文件索引（扫描和监听入库） | 扫描时带真实兄弟列表（`U/common/file-scan-utils.ts:350-372`）；监听入库走 `getFileTraversalExclusionReason`，会 readdir 父目录（`M/addon/files/utils.ts:56-81`，在 `file-provider.ts:3695-3700` 使用） | **排除** | 排除 | 排除 |
| Spotlight provider | 只调 `getSearchExclusionReason`（`native-file-search-provider.ts:372`；`U/common/file-filter-service.ts:431-458`） | **放行** | `node_modules` **放行**，只拦 dot 段 | **放行** |

- **不是 gitignore 感知的**：只有名字黑名单（`U/common/file-scan-constants.ts:30-57`）加 #1727 的"项目标记"上下文（156-204）。`.gitignore` 只被当作项目标记之一。设置里也没有用户可配的排除列表，`FileIndexSettings` 只有 `extraPaths`（`M/addon/files/types.ts:1-7`）。
- **截图里的行是怎么来的**：
  - `mdfind -0 -onlyin ~ 'kMDItemFSName == "*wx*"cd'` 返回 155 条：前 13 条是 `talex-touch/apps/core-app/out/renderer/assets/*`，其后还有 `apps/nexus/dist/_nuxt/*`、`packages/tuff-native/*/target/debug/*`、`mikobot-run/webui/node_modules/…`、`~/Library/Application Support/…` 等。
  - provider 过滤之后截取前 50 条（`NATIVE_SEARCH_MAX_RESULTS`，`native-file-search-provider.ts:50,365-374`），和日志 "finished in 264.0ms with 50 results" 对得上。
  - 按代码，文件索引不收这些路径。**未查库验证**（遵照约束，没有碰 DB）。
- **哪些目录真的在变**：
  - 08:30 之后被修改的非隐藏文件（排除 `node_modules`、`.git`、`Library`）共 2,975 个：`packages/tuffex/dist` 2,751 个（全部在 09:15 被重写，是一次 tuffex 构建）、`apps/core-app/out` 90 个（dev 重启重写 `out/main`、`out/preload`）、`packages/tuff-native/target` 32 个、`packages/tuff-native/build` 7 个。
  - `out/renderer/assets` 本身停在 09-25 19:07，并**不**在反复变化。
- **tuffex 构建的全部产物都会穿过 watcher**：用 /tmp 复刻的 `isExcludedFileWatchPath` 检查 `packages/tuffex/dist` 下全部 2,759 个文件，**全部放行**。

**附带发现（不属于本次刷新问题，建议另开任务）**：文件级入库排除 `getIndexExclusionReason` → `getContainingPathExclusionReason`（`file-filter-service.ts:365-416,487-501`）调用 `getTraversalExclusionReason(parentDir)` 时不带上下文，于是会套用**没有锚定路径段**的 `DEV_PATHS` 正则（`/out\//`、`/build\//`、`/dist\//`…，`file-scan-constants.ts:516-533`）。探针实测：
- `~/Workspace/Projects/app/src/layout/components/Button.vue` → `development-path`（`layout/` 命中 `/out\//`）；
- `~/Documents/about/team/notes.md` → `development-path`；
- `~/Documents/build/2026/report.pdf` → `development-path`（#1727 本来要放行这种情况）。

也就是说，只要路径中有一段以 out、build、dist、target、coverage 结尾（比如 about、layout、checkout、rebuild、redist），它**下面更深层**的文件都进不了索引。

---

## 4. `IndexingDiagnostics.source`（mode=blocking，293–340ms）

- **执行的内容**：`SourceDiagnosticsService.getDiagnostics([appSource], 'routing')`（`M/search-engine/indexing-diagnostics-service.ts:34-99`）用 `Promise.all` 并行等两件事：
  - `appProvider.getIndexedSourceHealth()`（`M/addon/apps/app-provider.ts:920-935`）。它包含：
    - `getAppSearchIndexHealth`（1631-1670）：
      - `dbUtils.getFilesByType('app')`：主线程同步 libsql，约 156 行，走 `idx_files_type`；
      - `searchIndex.countByProvider('app-provider')`：`SELECT count(*) FROM search_index WHERE provider = ?`（`search-index-service.ts:664-674`）。`search_index` 是 FTS5 表，`provider` 是 **UNINDEXED** 列（1084-1095），所以要**扫整张 FTS 内容表**；这个查询经 `readExecutor` 在读 worker 上执行（209-216；接线在 `search-core.ts:2070-2078`）。
    - `isAppIndexWarming()`：读一次配置（1736-1740）。
  - `getIndexedSourceRoots()`：同步、便宜（937-944）。
- **"blocking" 只是标签**：`enterPerfContext` 包住了整个 await；`mode: 'blocking'` 的上下文只要 ≥200ms 就告警，不管事件循环有没有卡（`apps/core-app/src/main/utils/perf-context.ts:11,53-83`，判断在 67）。工作区里另一会话刚补的规范也写明了这一点（`.trellis/spec/main-process/background-task-timeout-contracts.md`「Diagnosing」，未提交）。今天 31 条 `Event loop lag` 里，只有 2 条的主上下文是它：08:38:30 启动时的全量诊断 536ms，08:40:21 的 217ms。
- **多久执行一次**：每个进入 app 队列的**不同路径**执行一次。
  - 入口：`IndexedSourceEventRouter.subscribe()` 把 **FILE_ADDED、FILE_CHANGED、FILE_UNLINKED 同时发给文件队列和 app 队列**（`M/search-engine/indexed-source-event-router.ts:92-98`；darwin 上还有 DIRECTORY_ADDED 和 DIRECTORY_UNLINKED，99-102）。app 队列 `shouldAccept: () => true`（59），400ms 合并窗口（24），`processEntries` **串行**逐条路由（63-67）。87e40d94a（07-12）引入。
  - 顺序：`routeWatchEventWithResultInternal` **先**做健康和根目录诊断（`indexing-runtime.ts:538-542`），**后**在 watch router 里发现路径不在 `/Applications` 下，才标 `source-watch-filtered`（`indexing-watch-router.ts:258-304`；`U/search/indexing-source.ts:2091-2114`）。
  - 被跳过的事件还会写一次 task state（`indexing-runtime.ts:1394-1422` → `IndexingTaskStateStore.save`，`indexing-task-state-store.ts:80-122`，走 best_effort 的 dbWriteScheduler）。c07064db7（09-25 20:34）把原来的全源诊断收窄成了只查本源，但**仍然是每个事件都做一次、并且在判断根目录之前**。
  - **chokidar 放大**：新建目录的 `addDir` 会触发 `_addToFsEvents(path, false, true)`，这时 forceAdd = true，会 readdirp 整棵新目录，并**无视 `ignoreInitial`**，为里面每个文件都发一次 add（`chokidar@3.6.0/lib/fsevents-handler.js:292,422,492`）。所以"删掉整个目录再重建"这类构建会逐文件上报。
  - **实测数量**：
    - D.2026-09-26.log 中该警告全部是 `sourceId=app-provider`。按小时：00 点 9,743；01 点 10,958（01:48:06 突然停止）；02–07 点为 0；08 点 3,371；09 点 1,699（截至 09:06）。活跃的分钟里每分钟 195–233 条；
    - 08:44 之后 n=1,871，p10 250 / p50 276 / p90 325 / max 4,268 ms；
    - 同期 `indexing.task-state.save` 的累计数从 172（08:47:25）涨到 4,162（09:06:27），约 210/分，与路由一一对应；
    - 09-25（18:11 起）共 21,348 条。
  - **队列饱和**：每条路由约 0.28–0.31s，串行上限约 200–217 条/分，**观测值就是这个上限**，说明队列处于饱和状态。
  - **来源是积压，而不是实时事件**：09:05 时用 /tmp 探针做 60s FSEvents 采样（`node fs.watch(~, recursive)`，再套上 watcher 的过滤器），原始事件 10,885 个，**通过过滤的只有 9 个不同路径**。所以当时的饱和来自早先突发事件积压的队列。一次 tuffex 构建放行 2,759 个路径 ≈ 14 分钟饱和；两次构建间隔不到 14 分钟，就会一直饱和。凌晨没人干活时（02–07 点）降到 0，也符合这个解释。
- **不在主线程热路径上，但在读 worker 热路径上**：
  - 读 worker 是"一次只执行一条原生读、带有界队列"（`M/search-engine/workers/search-index-read-worker-client.ts:145-152`，超时 15s、队列 64 条，14-15）；规范规定 FTS、计数、**提交可见性**读都走它（`.trellis/spec/main-process/search-hotpath-contracts.md` §4）。
  - 每秒约 3.4 次、每次 ≥250ms 的计数请求，让 CoreBox 的 app/file FTS 查询和每次提交的可见性屏障都要排队。08:40:05 出现过 `SEARCH_INDEX_READ_TIMEOUT:search-index-read-128:15000`：读 worker 被回收，同时 app-provider 和 file-provider 的提交都报 "degraded reader visibility"，08:40:03 那一次诊断耗时 9,776ms。
- **和刷新风暴的关系**：同源（都来自 FSEvents 抖动），并且放大刷新风暴，但它**本身不产生提交**（app 路由全部被 filtered）。放大的方式有两种：
  - 搜索尾巴变长，`loading` 挂得更久；
  - 可见性屏障排队，文件索引管线整体变慢，全量扫描更难完成。

  另外它每分钟产生约 210 次写 `database.db` 的 task state，最长等过 21s，然后被丢弃（08:39:21 `Dropping stale task after 21029ms: indexing.task-state.save`）。

---

## 5. 两行一样的 KaTeX

- 名字里带 `wx` 的只有 `KaTeX_Caligraphic-Regular-wX97UBjC.ttf`。Bold 版本是 `…-Bold-ATXxdsX0.ttf`，12,368 B，不含 `wx`。
- home 下这个文件共有 5 份：`talex-touch/apps/core-app/out/renderer/assets`（mdfind 第 12 行）、`mikobot/nanobot/web/dist/assets`（第 27 行）、`mikobot-run/nanobot/web/dist/assets`，以及 ego lite 的两个扩展目录（这三份都在第 100 行之后，超出了截取的前 50 条）。大小都是 12,344 B（12.05 KB）；抽查的两份 sha1 相同（`26f26a13…`），是 Vite 按内容 hash 命名的同一个字体。
- 行的 id 就是路径（`M/addon/files/utils.ts:232`，经 `mapFileToTuffItem`）。渲染层按 id 合并（`useSearch.ts:564-579`），主进程累计已发布结果时也按 id 用 Map 去重（`search-core.ts:1231-1234`）；同一路径不可能出现两行。
- **结论**：这是两个不同的文件，不是去重失败。列表只显示文件名和大小，所以看起来一模一样。要不要按内容 hash 或文件名折叠，是产品问题（D-b）。

---

## 6. 置信度与已排除的假设

**置信度**

| 结论 | 置信度 | 依据 |
|---|---|---|
| 渲染层对任何提交都重搜；无相关性判断、无退避 | 高 | 代码 + 现有测试 + /tmp 实测 |
| 主进程每次写入（含内容不变的重写）都发提交 | 高 | 代码 |
| 老板截图时（08:4x）全量扫描正在跑，并且每批提交 | 高（在跑）/ 中高（逐批提交） | 日志 perf context；逐批提交靠代码推断，提交本身无日志 |
| 全量扫描每次重启从头来、永远扫不完 | 高 | 代码 + 6 次起点 |
| 富化恢复自我续命 | 中高 | 代码 + 老板日志里的 reason 字符串 |
| 26/30 的机制是 readFile 抛错 | 高 | 代码 |
| 26/30 的具体原因（ENOENT、权限还是竞态） | 中低 | 需要查 progress 表 |
| app 路由 = 每个文件事件一次 FTS 全表计数 | 高 | 代码 + 速率与饱和上限吻合 |
| app 路由的积压来自构建突发 | 中 | 时间线和采样吻合，但看不到队列长度 |
| 截图行来自 Spotlight，不来自索引 | 高（Spotlight 返回它们）/ 中高（索引不收） | mdfind 实测 / 代码，未查库 |
| 两行 KaTeX 是不同文件 | 高 | mdfind + sha1 |

**已排除**

| 假设 | 排除依据 |
|---|---|
| Spotlight 每次返回的集合或顺序不同，导致列表跳 | 同一查询连续 3 次 mdfind，前 50 条完全一致（`/tmp/refresh-churn-probe/run{1,2,3}.txt`）；构建进行中是否会变没有测 |
| 渲染层有自激循环（没有新数据也重渲染） | 自动重搜的触发点只有：输入 watch（`useSearch.ts:1872-1895`）、`corebox:shown`（1955-1964）、setQuery 和 contextActions（1899-1928）、剪贴板变化（`R/views/box/CoreBox.vue:372-375`，需要剪贴板内容真的变化且窗口可见，`useClipboard.ts:379-416`）、index-commit 流。查询和窗口都稳定时，只有 index-commit 是周期性的 |
| 两行 KaTeX 是同一路径未去重 | 见 §5 |
| `out/renderer/assets` 被 dev 构建反复重写 | 文件时间停在 09-25 19:07；dev 渲染层走 Vite 5173；dev 重启只重写 `out/main`、`out/preload` |
| `IndexingDiagnostics.source` 真的阻塞了主线程 300ms | 'blocking' 是标签，时长包含 await；事件循环监控只在 2 次 lag 中把它记为主上下文 |
| 失败批次在调度器里被原地循环重试 | 调度器不重试；失败项持久化为 `failed` 后不会再被选中 |
| app 路由会产生提交 | 路由全部是 `source-watch-filtered`，没有 delta |

---

## 7. 修复方案（B 之外）

方案 B（complete 时再对账）只解决"删行再插回"的视觉问题，解决不了"每 0.6–1.6s 整轮重搜一次"的负载：每轮都要 spawn mdfind、做若干次 FTS 读，而且扫描期间结果确实在变，行仍然会动。下面三组可以组合使用。

### 7.1 渲染层

| 编号 | 改什么 | 风险 | 验证 |
|---|---|---|---|
| R1 自适应退避 | `scheduleIndexCommitRefresh` 在提交连续到来时逐级拉长间隔（例如 500ms → 2s → 5s）；用户输入或窗口重新显示时复位 | 低，只改渲染层；新提交里真匹配的条目最多晚几秒出现，与 07-15 R3「1 秒内可见」冲突，需要 **D-a** | 复用 §1.4 的 cadence 探针：持续提交 10s，重搜次数从 16 降到 ≤4；`useSearch.core.test.ts` 现有的 4 个 index-commit 用例改期望 |
| R2 用原生可见性门控 | `shouldRefreshForIndexCommit` 在 `document.hidden` 之外，再看 `useVisibility` 的原生 show/hide 信号（`R/modules/box/adapter/hooks/useVisibility.ts:59-66`）；隐藏时只记 pending，显示时再补刷一次 | 低 | 单测：模拟原生 hide 后推送提交，不应发起搜索；show 之后补刷一次 |
| R3 相关性判断交给主进程 | 效仿 `recommendationsInvalidated`（`U/transport/events/types/core-box.ts:274-290`）新增一个字段（例如 `queryRefreshWarranted` 或 `commitKind`），让主进程区分"扫描批次 / 富化 / 监听 / app"，渲染层对 bulk 类型只做低频刷新 | 中，跨层；需要 **D-a**、**D-d** | search-core 合约测试 + 渲染层测试 |

### 7.2 主进程

| 编号 | 改什么 | 风险 | 验证 |
|---|---|---|---|
| M1 通知合并 | `SearchEngineCore.emitIndexCommit` 对每个流做尾沿合并（例如 1–2s，bulk 期间更长）；hub 的 revision 仍然立即递增，缓存正确性不变 | 低到中 | fake timers 合约测试：100 次提交合并成 ≤N 次 emit；运行时统计全量扫描期间 CoreBox 的搜索会话数 |
| M2 不变不提交 | `applyProviderItems` 计算文档 hash，与存储值相同就跳过 DELETE+INSERT，只把真正变化的数量计入 `affectedItems`。可以扩展 `search_index_meta` 加 `doc_hash`（现在只有 `keyword_hash`，`apps/core-app/src/main/db/schema.ts:63-77`） | 中，改 worker 写路径和 meta 表结构 | `search-index-service.delta.test.ts`：重写同样内容时 `affectedItems=0` 且不 `markCommitted`；运行时富化未变文件时不发提交 |
| M3 富化恢复去自激 | 自己的 lease-free 发布不触发 `resume`（例如给 resume 自己一个 lease 或标记）；每轮结束后冷却（例如 ≥30–60s）；游标跨轮保留，不从 id 0 重来；遇到失败块跳过继续，不整轮暂停 | 中，影响新文件内容检索的时效 | `file-provider-startup.test.ts` 里的 resume 用例；运行时给"开始/结束一轮"加计数日志，确认频率 |
| M4 读失败分类 | ENOENT → 删除过时行（或把该目录排进 reconcile）；EACCES/EPERM → `skipped: permission`，权限不变就不重试；`File index worker failed` 警告里带上若干条 `lastError` 样例 | 低到中 | 先查现状：停掉 app 后只读执行 `SELECT last_error, count(*) FROM file_index_progress WHERE status='failed' GROUP BY 1 ORDER BY 2 DESC LIMIT 20`（split 默认开启，在 `search-index.db` 里，见 `apps/core-app/src/main/db/runtime-flags.ts:26`） |
| M5 全量扫描可续扫 | 按顶层子树记检查点，重启后从中断处继续；或者中断过的根下次改走 reconcile | 中到高，`scan_progress` 的"覆盖"语义、删除判定；需要 **D-c** | 扫描中途重启，确认 `FileProvider.fullScan` 不再从头；覆盖统计一致 |
| M6 app 事件按根过滤 | 只把 app 根（`appScanner.getWatchPaths()`：darwin 上是 `/Applications` 和 `~/Applications`，`M/addon/apps/app-scanner.ts:51-54`）下的路径放进 app 队列（`indexed-source-event-router.ts:59` 的 `shouldAccept`）；或者在 `routeWatchEventWithResultInternal` 里先判断根目录（便宜）再做健康检查（贵）。根外事件也不再写 task state。这不缓存权限或启用状态，符合规范「Never cache permission/enabled decisions」 | 低 | router 单测：根外路径不调 `getHealth`、不写 task state；运行时一次 tuffex 构建期间 `IndexingDiagnostics.source` 警告约为 0，`indexing.task-state.save` 速率明显下降 |
| M7 健康检查变便宜 | 把 FTS5 全表 `count(*)` 换成对 `search_index_meta` 按 PK 前缀计数（PK 是 `(provider_id, item_id)`，便宜），或者由写入端维护计数。注意 meta 与 FTS 可能不一致（例如 FTS 被重建之后）；只需要判断"是否 >0"时，`EXISTS … LIMIT 1` 在 FTS 上最坏仍会扫到尾 | 低到中 | 健康检查耗时 <10ms；读 worker 排队下降 |

### 7.3 排除规则

| 编号 | 改什么 | 风险 | 验证 |
|---|---|---|---|
| X1 Spotlight 与索引同口径 | 在 `MacSpotlightFileProvider.searchNative` 截 50 条之前，套用和文件索引相同的排除：带兄弟上下文的祖先遍历（可按父目录缓存）、`~/Library`、`node_modules`、dot 段。候选池可以取大一些再截 | 低到中，每条结果可能多一次 readdir，需要缓存；需要 **D-b** | `native-file-search-provider.test.ts`；手工搜 `wx` 不再出现 `out/`、`dist/`、`node_modules`、`~/Library` |
| X2 watcher 带项目上下文 | 对 `out/dist/build/target/coverage/logs/tmp/cache` 这类名字，在 `ignored` 里用**同步且有缓存**的方式检查项目标记（例如 `existsSync` 检查少数几个 marker，按父目录 LRU 缓存），让构建产物的抖动根本不进两个队列 | 中，`ignored` 是同步热回调；缓存失效要处理 | `file-system-watcher.test.ts`；用 FSEvents 探针确认 tuffex 构建时 `dist/` 事件被忽略 |
| X3（附带） | 把 `DEV_PATHS`、`CACHE_PATHS` 改成按路径段锚定，修复 `layout/`、`about/` 下的文件被误排除 | 中，影响索引覆盖面，需要重建索引；与本任务无关，应另开任务 | `file-filter-service` 单测覆盖 §3 探针里的三条路径 |

**建议的最小组合**：
- M6：一处改动，消掉约 2 万条每日诊断和对读 worker 的挤占；
- M1 或 R1：先把重搜频率降下来；
- X1：先和老板对齐 D-b，再去掉截图里那类结果；
- M3 + M4：让富化不再自激，并弄清 26/30。

M5、X2 属于结构性修复，另开任务。

---

## 8. 需要老板拍板

- **D-a**：07-15 R3「提交后 1 秒内可见」在**批量建库**期间是否仍然成立？
  - (1) 保持 1 秒，但只对相关提交生效（R3，需要跨层）；
  - (2) 批量期间放宽到 N 秒（R1、M1）；
  - (3) 批量期间不自动刷新，建库完成时刷一次，或者只在用户输入时刷新。
- **D-b**：CoreBox 要不要展示构建产物、依赖目录、`~/Library` 下的文件？这类结果目前全部来自 Spotlight。另外，同名同内容的多份文件要不要折叠或区分显示，比如显示父目录？
- **D-c**：macOS 默认以整个 `~` 为根（72bb2f855）的代价要不要重新评估？
  - dev 机器上一轮全量扫描超过 9.5 小时，而且每次重启从头来；
  - 代码类文件都做内容富化，这是富化量的主体。

  可选：保留整个 home 但做可续扫（M5）；收窄默认根；代码文件不做内容索引。
- **D-d**：CoreBox 隐藏时，还保留着的查询要不要继续响应索引提交？建议不响应（R2），但需要确认没有依赖这个行为的功能。

---

## 9. 附：证据与可复现探针（均在 /tmp，未写仓库）

- **dev 日志**：`~/Library/Application Support/@talex-touch/core-app/tuff-dev/logs/D.2026-09-26.log`、`D.2026-09-25.log.1.gz`，只读统计。
  - `IndexingDiagnostics.source` 的小时和分钟分布、耗时分位数见 §4；
  - 全量扫描起点用 `"label":"FileProvider.fullScan","durationMs"` 反推（python 脚本内联执行，未落盘）；
  - 08:40:05 读 worker 超时并回收，同时出现 "degraded reader visibility"；08:39:53 `search-index-worker.execWrite … FOREIGN KEY constraint failed`；08:38:08 `before-quit handlers timed out`（search-engine-core）。
- **`/tmp/refresh-churn-probe/`**：
  - `filter-probe.ts`、`watch-probe.ts`、`dist-probe.ts`：用 tsx 直接 import `U/common/file-filter-service.ts`，复刻 watcher、Spotlight、文件级三层判断；
  - `fsevents-sample.mjs`、`fsevents-filtered.ts`：对 `~` 做 30s / 60s 的 FSEvents 采样，后者套用 watcher 过滤；
  - `refresh-churn-mdfind-wx.txt`、`run{1,2,3}.txt`：mdfind 输出；`recent-files.txt`：08:30 之后被修改的文件；
  - `cadence/cadence.test.ts`：刷新频率探针，命令见 §1.4。
- **运行时核实（下次方便时，需要协调共享的 dev 实例）**：
  - CoreBox 打开并停在 `wx`，用只读 CDP 统计 60s 内 `core-box:search:session` 的发起次数；
  - 同时触发一次 tuffex 构建，观察 `IndexingDiagnostics.source` 警告和 `indexing.task-state.save` 计数；
  - 停掉 app 后只读查询 `file_index_progress`（§7.2 M4）和 `indexed_source_task_state` 中 `app-provider` 的 `recentTasks[*].path`（可确认 app 队列里积压的是哪些路径）。

---

## Files Found

| File Path | Description |
|---|---|
| `R/modules/box/adapter/hooks/useSearch.ts` | index-commit 流订阅（1469-1517）、门槛（1408-1414）、500ms 节流与尾沿（616,1416-1452）、快照替换（960）、update 合并（1106-1143） |
| `M/core-box/ipc.ts` | 注册 index-commit 流（370-374） |
| `M/search-engine/search-core.ts` | 流注册与发送（458-496）、提交处理（519-565）、缓存 revision（1025-1048,222-256）、读 worker 接线（2070-2078）、store adapter 与 onBatchApplied（2080-2108） |
| `M/search-engine/search-index-commit-hub.ts` | revision 与监听（13-37） |
| `M/search-engine/search-index-writer.ts` | `publishCommit`：屏障失败也提交（661-690） |
| `M/search-engine/search-index-service.ts` | `applyProviderItems` 计数（404-455）、无条件 DELETE+INSERT（1195-1231）、FTS5 `provider UNINDEXED`（1084-1095）、`countByProvider`（664-674） |
| `M/search-engine/indexing-runtime.ts` | lease-free drain 'mutation'（284-367）、watch 路由先诊断后判根（526-546）、跳过事件也写 task state（1310-1423） |
| `M/search-engine/indexing-watch-router.ts` | 每源路由与 drain 'watch'（80-127）、根不匹配时跳过（258-304） |
| `M/search-engine/indexed-source-event-router.ts` | 文件事件同时进 app 队列（92-102）、串行处理（52-77） |
| `M/search-engine/indexing-diagnostics-service.ts` | 'blocking' perf 上下文包住 await（34-99） |
| `M/search-engine/indexing-scan-scheduler.ts` | 扫描逐批 `applyBatch`（136-179） |
| `M/search-engine/indexing-store-adapter.ts` | applyBatch / applyDelta → indexItems（295-414） |
| `M/search-engine/workers/search-index-read-worker-client.ts` | 单槽读 worker、15s 超时、队列 64（14-15,145-189） |
| `M/search-engine/file-indexed-source.ts` | drainMutations 的 reason 映射（239-243） |
| `M/addon/files/file-provider.ts` | drain 后 resume（2284-2332）、watch delta 不比较内容（2366-2395）、富化发布（1935-1964）、全量扫描与 scan_progress（3833-3938）、buildFileRecord 排除（3683-3710） |
| `M/addon/files/services/file-provider-enrichment-resume-service.ts` | 每轮从 id 0 开始、每批 200 行（5,43-93） |
| `M/addon/files/services/file-provider-index-scheduler-service.ts` | `FILE_INDEX_WORKER_BATCH_FAILED`（78-80）、块大小与深度延迟（62-88,157-206） |
| `U/search/indexing-worker-scheduler.ts` | 失败记录、drain 抛 AggregateError（79-112,139-168） |
| `M/addon/files/workers/file-index-worker.ts` | 逐文件状态与 failed 计数（182-373） |
| `U/electron/file-parsers/{index,registry,parsers/text-parser}.ts` | 只注册了文本解析器；readFile 失败即 failed |
| `M/addon/files/services/file-provider-index-flush-executor-service.ts` | flush 后发布全部条目（110-133） |
| `M/addon/files/services/file-provider-full-scan-run-service.ts` | 根扫完才算完成（59-105） |
| `M/addon/files/file-provider-watch-paths.ts` | macOS 默认根为整个 home（24-32） |
| `M/file-system-watcher/file-system-watcher.ts` | `siblingNames: []` 放行项目产物目录（38-54,112-119） |
| `node_modules/.pnpm/chokidar@3.6.0/node_modules/chokidar/lib/fsevents-handler.js` | 新目录 forceAdd，逐文件上报（292,422,492） |
| `U/common/file-filter-service.ts`、`U/common/file-scan-constants.ts` | 三层排除口径、未锚定的 DEV_PATHS |
| `M/addon/files/utils.ts` | 带兄弟上下文的祖先排除（56-81）；id=path（232） |
| `M/addon/files/native-file-search-provider.ts` | mdfind 查询、只按 search 口径过滤、截 50 条（50,346-377） |
| `M/addon/apps/app-provider.ts` | 健康检查里的 FTS 全表计数（920-935,1631-1670） |

## Related Specs

- `.trellis/spec/main-process/search-hotpath-contracts.md` §4：运行时索引读由专用读 worker 承担，一次一个原生读；计数和提交可见性读也走它。
- `.trellis/spec/main-process/background-task-timeout-contracts.md`「Diagnosing」「Index watch and shutdown lifecycle」（工作区里另一会话未提交的修改）：'blocking' 时长可能包含异步等待；watch 准入读当前的健康状态和根目录，不得缓存权限或启用状态的判断。
- `.trellis/spec/frontend/hook-guidelines.md`「CoreApp window visibility and continuous work」：keep-alive 窗口隐藏时 `document.hidden` 可能仍然是 false。
- `.trellis/spec/main-process/recommendation-freshness-contracts.md`：推荐失效只看 app 提交（与本问题相邻）。
- `b80730046:.trellis/tasks/07-15-progressive-corebox-index-search/prd.md` R2、R3：index-commit 刷新的原始契约。
- `.trellis/tasks/09-25-corebox-list-motion/research/motion-audit.md` §2.2、方案 B；`.trellis/tasks/09-25-corebox-keyboard-jump/research/root-cause.md`（`useSearch.ts` 里已有它未提交的 `focus > 0` 修复）。

## Caveats / Not Found

- **提交次数没有直接日志**，主进程的提交频率靠代码推断。可以在 `markCommitted` 或 `emitIndexCommit` 加计数日志核实。
- **`[file-provider]` 的 worker 失败日志只在 dev 控制台**，D 日志里没有，所以 26/30 的出现频率和具体错误码无法统计；需要按 M4 查 `file_index_progress.last_error`。遵照约束，**没有碰数据库**。
- **app 队列的积压长度看不到**："构建突发导致积压"这个结论来自时间线、FSEvents 采样和 tuffex/dist 的时间戳相互吻合，没有直接观测。
- 没有驱动正在运行的 dev Electron；它在调查期间又被别的会话重启过（约 09:17），`out/main/index.js` 的行号已经变化。
- 隐藏窗口下 `document.hidden` 的真实取值没有验证（R2 / D-d）。
- 附带发现 X3（`layout/`、`about/` 等路径被误排除）已用探针证实，但不属于本任务，建议另开任务。
