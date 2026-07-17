# Design — B1 deferred semantic recall (Option 3)

> Task: `07-13-fix-ranking-dead-features` · Decision: **B1 = 延迟召回二段推送**
> 记录本设计在真实代码约束下的最终形态与取舍。

## 已验证的关键事实

1. **embeddings 表确实被填充**——不是通过死掉的 `EmbeddingService.indexFile/indexFiles`（零调用方），而是 `search-index-worker.ts:361-379` 在索引时写入（file-index-worker 解析产出 `embeddings` → worker 持久化）。故语义召回有数据可查。
2. **`embeddings.sourceId = String(files.id)`**（worker `:356,362`），不是 path。召回结果须按 `files.id` 回查文件行再建 TuffItem。
3. `search-core.ts` **直接 import 并注册 `fileProvider`**（`:36,:248`），且拥有 sessionId 陈旧判断（`this.latestSessionId === sessionId`）、`mergeAndRankItems`、`sendUpdateToFrontend` 会话推送闭包（`:891`）。可复用。
4. `EmbeddingService.semanticSearch(query, N)` → `[{sourceId: fileId, score}]`（cosine>0.3，扫描封顶 1000，query 向量 30min 缓存）。**当前唯一调用是 `file-provider.ts:3009` 的 fire-and-forget，结果丢弃**（B1 症状根源）。

## 硬约束（决定最终形态）

- **渲染端 `search.update` 是合并而非替换**：`useSearch.ts:1330` 用 `mergeRenderedItems`；该函数（`:449-458`）按 id 合并、**保留原有顺序、新项追加末尾、不重排**、按 sessionId 隔离。
- **`useSearch.ts` / `CoreBox.vue` 是审计标注的受保护用户改动，禁止修改**（`docs/engineering/reports/optimization-dry-run-2026-07-11/` 明列）。
- launcher 逐键搜索是延迟敏感热路径，**不得**在同步 onSearch 里等 embedding 生成。

**推论**：延迟二段推送**只能追加、无法重排已渲染项**。因此 Option 3 的可交付形态 = **延迟语义召回**（surface missed files），而非"重排现有结果"。这仍是从"语义结果永不出现"到"按相关度追加出现"的严格改进，且不碰受保护文件、零热路径延迟。

## 设计

### 1. 移除浪费（B1 症状）
- 删除 `file-provider-search-result-service.ts:212` 的 `scheduleSemanticEnrichment(...)` fire-and-forget 调用。
- 删除 `file-provider.ts:2998-3014` 的 `scheduleSemanticEnrichment`（结果丢弃、纯烧 CPU）。

### 2. FileProvider 新增 `semanticRecall(query, excludeIds, signal): Promise<TuffItem[]>`
- 门控：`embeddingService` 可用、query.text 长度 ≥ 阈值、非 provider 过滤查询。
- `embeddingService.semanticSearch(text, K)` → `[{sourceId: fileId, score}]`。
- 过滤掉 `excludeIds`（已在主结果里的 file.id），只保留**新召回**项。
- 按 `inArray(files.id, ids)` 回查文件行（+extensions），复用 `createFileSearchItem` 建项。
- 每项写真实 `meta.extension.search.semanticScore = score`（修正 `semanticScore:0` 谎言），`scoring.match_details.type = 'semantic'`，`scoring.final = score`。
- 按 score 降序、bounded（top N，如 8）返回；调用方按此顺序追加。

### 3. search-core 延迟 pass
- 新增 `scheduleDeferredSemanticRecall(sessionId, query, providerFilter, baseItems, signal, sendUpdate)`。
- 挂载点：`search()` 的 `isDone && isFirstUpdate` 分支、首帧 `enrichAndPushSearchItems`（`:1025`）之后，单行调用。
- 内部 `void (async () => { ... })()`：
  - `await fileProvider.semanticRecall(query, baseItemFileIds, signal)`；
  - 若空 / `signal.aborted` / `this.latestSessionId !== sessionId` → drop；
  - `this._recordSearchResults` 记录；`sendUpdate(recallItems)` → 经既有会话推送合并追加。
- 不修改 tuffSorter（召回项作为独立批次追加，批内自排序即可；渲染端不重排，故无需语义排序项）。

## 验收
- [ ] typecheck 通过；`tuff-sorter`/`search-core.contracts`/`file-provider-search-result` 测试通过。
- [ ] 新增测试证明：`semanticRecall` 排除已存在 id、按 score 降序、语义项 `semanticScore` 为真实值（mock embeddingService + dbUtils）。
- [ ] 不再有 fire-and-forget 浪费；热路径首帧延迟不受影响。

## 未覆盖（记入父 backlog，非本任务）
- 延迟**重排**已渲染项：需改 `useSearch.ts` 合并语义或加 replace 事件（受保护文件，暂缓）。
- embedding **索引覆盖率**：依赖 file parser 是否产出 embeddings（需 AI 能力）；本任务只消费既有 embeddings，不改索引侧。
