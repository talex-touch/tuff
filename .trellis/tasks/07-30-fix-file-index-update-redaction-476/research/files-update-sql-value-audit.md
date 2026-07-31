# `files` UPDATE SQL 与值形态独立审计

## 结论

最符合 Issue #476 截图形态的具体失败是：`FileProvider.updateFileRecord()` 在主进程连接上执行普通 prepared `UPDATE files` 时，与 search-index worker 或另一个 SQLite writer 争用 WAL writer lock，重试耗尽后抛出 `DrizzleQueryError`。该错误的 message 由 Drizzle 固定拼接完整 SQL 和 `params:`，随后被 `FileProvider` 原样保存到状态并由 Settings UI 展示。

对应生产路径：

```text
incremental/reconciliation diff
  -> IndexedWriteUpdateExecutorService (10 records/chunk)
  -> FileProvider.updateFileRecord()
  -> main dbWriteScheduler + withSqliteRetry
  -> main-process LibSQL connection UPDATE files
  -> startIndexing.catch stores original Error
  -> getIndexingStatus().error = error.message
  -> Settings SDK transport
  -> SettingFileIndex.vue <pre>{{ indexStatus.error }}</pre>
```

关键证据：

- 普通文件元数据更新仍在主进程直接写 `files`，见 `apps/core-app/src/main/modules/box-tool/addon/files/file-provider.ts:3236-3253`。它更新 `extension,size,ctime,mtime,name,type,is_dir,last_indexed_at` 并按 `id` 定位。
- 该调用只受主进程 `dbWriteScheduler` 约束，见同文件 `:439-445`；worker 的写队列不受这个 scheduler 约束。
- 同一 `files` 域的 full-scan upsert、内容 enrichment、progress 和 embeddings 已由 `SearchIndexWriter` 暴露的 worker persistence port 写入，见 `search-index-writer.ts:127-166`、`file-index-persistence-repository.ts:91-157,230-325`。
- split 默认关闭时，worker path 回退到主 `database.db`，见 `modules/database/index.ts:151-158`，因此 main 和 worker 是同一文件的两个真实连接。`db/utils.ts:115-121` 自身也明确记录 direct main writes 会导致 `SQLITE_BUSY`。
- Drizzle 0.45.2 的 `DrizzleQueryError` 固定构造 `Failed query: ...\nparams: ...`，见安装源 `drizzle-orm/errors.js:10-18`。

## 临时库实测

使用当前锁定的 `@libsql/client 0.17.4`、`drizzle-orm 0.45.2` 和临时 SQLite 文件执行与 `updateFileRecord()` 同形的 UPDATE。第二个真实 connection 执行 `BEGIN IMMEDIATE` 后，普通 UPDATE 的结果为：

```text
DrizzleQueryError
Failed query: update "files" set "name" = ?, "extension" = ?, "size" = ?,
"mtime" = ?, "ctime" = ?, "last_indexed_at" = ?, "is_dir" = ?, "type" = ?
where "files"."id" = ?
params: locked.md,.md,2,3,2,4,0,file,1
cause.code: SQLITE_BUSY
cause.message: SQLITE_BUSY: database is locked
```

holder `ROLLBACK` 后，同一 UPDATE 成功。该实验只使用 `/tmp/files-update-canary-*` 和 synthetic rows，没有访问真实用户索引。

这与截图的两个特征同时吻合：语句以 `update "files" set ...` 开头，且 UI 可见 `params:`。单纯 `db.batch()` 失败不吻合：Drizzle 的 libSQL batch 直接调用 `client.batch()`，不会逐条包成 `DrizzleQueryError`；libSQL 返回的是带 statement index 的 `LibsqlBatchError`，见安装源 `drizzle-orm/libsql/session.js:36-46` 和 `@libsql/client/lib-esm/sqlite3.js:85-118`。

## 值形态审计

### File metadata UPDATE

`mapIndexedWritePathUpdateRecord()` 把输入投影为固定 scalar shape，见 `packages/utils/search/indexing-write-plan.ts:538-556`：

| 字段            | 实际 driver 值                   | 风险判断                                                |
| --------------- | -------------------------------- | ------------------------------------------------------- | --- | ---------------------------------------------- |
| `id`            | finite number，来自已有 DB row   | 低                                                      |
| `name`          | string，缺失回退 `""`            | 不会违反 NOT NULL                                       |
| `extension`     | string/null                      | 安全                                                    |
| `size`          | number/null                      | `0` 被 `                                                |     | null` 改成 null，是语义瑕疵，不会导致 SQL 失败 |
| `ctime`,`mtime` | Date                             | number/string/null 经 normalizer 变为有效 Date 或 epoch |
| `type`          | string，缺失回退 existing/`file` | 安全                                                    |
| `isDir`         | boolean                          | Drizzle/libSQL 映射 0/1                                 |
| `lastIndexedAt` | 当前有效 Date                    | 安全                                                    |

因此来自正常 filesystem/stat producer 的 metadata values 没有对象/数组/undefined 绑定；在这条路径上，`SQLITE_BUSY` 比 bind/constraint 失败显著更可信。

### Date / NaN 缺口

存在一个独立 hardening 缺口：`toIndexedWriteDate()` 对 `Date` 实例直接返回，不检查 `getTime()` 是否 finite，见 `indexing-write-plan.ts:363-375`；worker repository 的 `toDate()` 也有相同模式（`file-index-persistence-repository.ts:328-330`）。

临时库证明 `new Date(NaN)` 写 timestamp 会生成：

```text
Failed query: update "files" set "mtime" = ? where "files"."id" = ?
params: NaN,1
cause: Only finite numbers (not Infinity or NaN) can be passed as arguments
```

libSQL 明确拒绝非 finite number，见安装源 `sqlite3.js:385-390`。不过当前 App/File platform scanners 的时间来自 `fs.Stats.mtime` 或显式 `new Date(0)`，File scheduler 对 number/string invalid timestamp 已有 fallback 测试；没有发现能自然产生 invalid `Date` object 的生产 producer。因此它应作为边界校验补强和回归 case，但不是当前最可信现场根因。若原截图 params 明确含 `NaN`，则应立即把此项提升为根因。

### undefined / object / array

- Drizzle `.set({ field: undefined })` 会省略该列；临时库编译结果只保留其它 defined 列，因而 undefined 本身不会传给 libSQL。
- 强制把普通 object/array 绑定到 TEXT 会得到 `SQLite3 can only bind numbers, strings, bigints, buffers, and null`，外层同样是含 SQL/params 的 `DrizzleQueryError`。
- 生产 extension builder 的 `value` 类型严格为 string，空/undefined 被省略，`alternateNames` 先 JSON stringify，见 `app-index-metadata.ts:4,54-63,136-156`。icon、launch target、display path、description 都作为 string 写入，不直接绑定 object/array。
- worker file update 只产生 string/null content、固定 status、number arrays；mapper 将 optional scalar 归一为 null，见 `file-index-worker.ts:300-329` 和 `indexing-worker-persist-entry-mapper.ts:48-88`。embedding vector 由 schema custom type JSON stringify 后绑定为 TEXT。
- 这些边界主要依赖 TypeScript 和可信 worker，没有统一 runtime exact-shape normalizer。建议补 finite/scalar guards，但未发现正常 producer 会把 object/array 送进 `files` UPDATE。

### Path 与唯一约束

`files.path` 有 unique index。临时库证明把 row A 的 path 更新为 row B 已占用的 path，会产生截图同形错误，cause 为 `SQLITE_CONSTRAINT: UNIQUE constraint failed: files.path`。

App full-sync update 的确会更新 path，见 `app-provider.ts:559-566`，匹配依赖 stable identity，见 `:2650-2718`。但生产路径使用 `db.batch()`（`:616-667`），其失败通常是 `LibsqlBatchError` 而非 `Failed query ... params:`；platform app identity 在 macOS 又通常是 path 本身。因此 path collision 是可测的次级候选，不如普通 File metadata UPDATE 的 busy 失败匹配现场。若截图 SQL 明确包含 `"path" = ?` 且 cause 为 UNIQUE，再提升该候选。

## Extension rows、icon/path metadata 与批处理

- App extensions 使用 `(file_id,key)` primary key 和 `ON CONFLICT DO UPDATE`；optional key 缺失时会删除旧 row。正常值全是 string，未发现 object/array bind。
- icon pointer repair 和 hydration 写 `file_extensions`，不是 `UPDATE files`；即使失败也不能直接解释截图中的表名。
- File keyword extension 使用 `JSON.stringify(keywords)` 后写 string，见 `file-provider.ts:3320-3345`。
- File enrichment persistence 每 3 entries 一个 immediate transaction，并在 chunk 间 yield 30 ms，见 `file-index-persistence-repository.ts:12-13,102-114,230-325`。它先取得 write transaction，故外部 writer 已持锁时通常在 transaction admission 失败，不会走到内部 `UPDATE files content,embedding_status`。
- App additions 已按 50 apps 分 transaction，注释明确指出大 transaction 会长期占 WAL writer lock，见 `app-provider.ts:507-550`。
- App metadata updates 仍把全部 app 的 1-3 条 statement 聚成一个未分块 `db.batch()`，见 `:586-667`。它不直接生成截图错误文本，但可能成为持锁方，使并发的普通 File metadata UPDATE 重试耗尽。
- libSQL batch 默认 deferred transaction，任一 statement 失败整体 rollback，并报告 statement index。它不是逐 statement 自动重试；当前 `withSqliteRetry` 会重跑整个 batch。

## 候选排序

1. **高：SQLite writer contention / retry exhaustion。** 精确复现截图文本；当前 main direct File UPDATE 与 worker 同文件双连接；已有代码和历史审计明确承认该结构性竞争。
2. **中低：invalid Date -> NaN。** 也能精确产生 SQL/params 文本，且 persistence normalizer 对 invalid Date instance 有缺口；正常 producer 暂无来源。通过截图 params 是否出现 `NaN` 可直接判别。
3. **低：App path relocation unique collision。** 可确定复现，但生产 App batch 的错误类通常不含 Drizzle SQL/params；通过 SQL 是否更新 path、cause 是否 UNIQUE 判别。
4. **很低：object/array bind、undefined、extension/icon payload。** object/array 只有越过内部类型合同才可能；undefined 被 Drizzle 省略；extension/icon producer 已字符串化。

## 对实现阶段的建议

- 将 File metadata update 从 `dbUtils.getDb().update(files)` 迁入已有 `FilePersistencePort`/search-index worker queue，最好按现有 10-row chunk 一次原子 upsert/update，并保持“provider-local commit -> refresh/result -> Runtime FTS delta”的顺序。
- 在 worker persistence admission 增加 exact scalar/finite Date 校验；invalid Date 不应依赖 libSQL 抛原生错误。
- 不把 App 全量 single-writer 迁移并入本 Issue，但至少把 App unbounded metadata batch 记录为仍可能的外部持锁方；完整 App typed persistence port 属既有后续结构债。
- 不以增加 retry 次数作为根因修复。scheduler 只串行 main writer，不能串行 worker connection；真正修复点是 writer ownership。
