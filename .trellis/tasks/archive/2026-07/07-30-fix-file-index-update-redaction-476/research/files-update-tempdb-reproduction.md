# `files` UPDATE 临时数据库复现设计

## 目标

用真实、隔离、可删除的 libSQL 文件证明四件事：

1. 旧 main-process metadata UPDATE 在第二 connection 持有 writer lock 时确定失败，并产生包含 SQL/params 的 `DrizzleQueryError`。
2. 锁释放后写入恢复，不需要读取或修复真实用户数据库。
3. 修复后 File metadata mutation 只进入 worker persistence port，内部 main/worker 正常并发不再形成两个 writer owner。
4. 外部/异常 lock 仍能得到稳定 public error、`retryable` 和 `reportId`，raw SQL/cause 只进入受控 local diagnostic sink。

## 建议测试位置

- 数据层真实锁测试：扩展 `apps/core-app/src/main/modules/box-tool/search-engine/file-index-persistence-repository.test.ts`，或新建相邻 `file-index-persistence-repository.lock.test.ts`。
- FileProvider ownership/source contract：扩展 `file-provider-startup.test.ts` 或新增窄测试，断言 update chunk 调用 `FilePersistencePort`，不调用 main `db.update(files)`。
- transport/UI redaction由主任务其它测试负责；本研究仅要求复用同一个 synthetic canary 值。

## Fixture

1. `mkdtemp(join(tmpdir(), 'file-index-update-'))`。
2. `createClient({ url: file:<temp>/index.sqlite })` 创建 `writerClient` 和 `lockClient` 两个真实 connection。
3. 两端设置 `PRAGMA journal_mode=WAL`、`PRAGMA foreign_keys=ON`、较短测试 `busy_timeout`。
4. 创建最小 `files`、`file_extensions`、`file_index_progress`、`embeddings` 表，shape 与 `db/schema.ts` 一致；或者使用项目 migration harness 跑完整 migration chain。
5. 只 seed synthetic rows，例如 `/synthetic/canary-alpha.txt`；不要使用 home、真实 watch root 或现有 DB path。
6. `afterEach` 关闭两个 client 并递归删除 temp dir。

## Case A：确定性复现旧错误

```ts
await lockClient.execute('BEGIN IMMEDIATE')

const oldMainUpdate = db
  .update(files)
  .set({
    extension: '.md',
    size: 2,
    ctime: new Date(2_000),
    mtime: new Date(3_000),
    name: 'canary.md',
    type: 'file',
    isDir: false,
    lastIndexedAt: new Date(4_000),
  })
  .where(eq(files.id, 1))

await expect(runWithShortDeterministicRetry(oldMainUpdate)).rejects.toSatisfy(error => {
  expect(error.message).toContain('Failed query: update "files"')
  expect(error.message).toContain('params:')
  expect(isSqliteBusyError(error)).toBe(true)
  return true
})
```

不要在测试日志或 snapshot 固化真实 path/完整 params；这里只检查 synthetic string 或布尔 leak marker。失败后查询 row，断言全部旧值未变化。

`withSqliteRetry` 默认约 9 秒 backoff。focused test 应允许注入较短 retry policy/clock，或直接执行一次 raw old query来证明错误 envelope；不要用 mock error 代替第二 connection。

## Case B：释放锁恢复

```ts
await lockClient.execute('ROLLBACK')
await expect(fixedPersistencePort.upsertFiles([syntheticUpdate])).resolves.toMatchObject([{ id: 1, name: 'canary.md' }])
```

随后从独立 reader 重新查询，断言所有 metadata 一致更新；再执行第二次相同 upsert，断言幂等且没有 duplicate row。

如果修复新增专用 `updateFiles` message，测试同理，但应让一个 chunk 在 worker 侧单 transaction 完成。不要用 `Promise.all` 逐 row 写。

## Case C：writer ownership 回归

构造 11 条 update records（跨过当前 chunk size 10）：

- 断言 persistence port 接到 2 个 bounded chunks，或一个明确有界 transaction plan。
- 断言 main `db.update(files)` mock 未调用。
- 第一 chunk 成功、第二 chunk 注入失败时，行为必须与设计明确一致：若逐 chunk commit，则第一 chunk可见、第二 chunk不产生 Runtime delta；若一个 operation 要求全原子，则两 chunk 都不可见。
- 每个成功 chunk 只能在 local commit 后发布对应 `IndexedSourceDelta`/batch；失败 chunk 不得更新 shared SearchIndex/FTS。
- drain/lease failure 必须使 initiating Runtime task failed，不能只 warning 后成功。

## Case D：外部 lock 的安全 public result

在 lock 持有期间触发 typed indexed-source update/reset boundary：

- internal error cause chain 应仍为 `DrizzleQueryError -> LibsqlError(SQLITE_BUSY)`。
- local logger 记录一次完整诊断并带 `reportId`。
- serialized public result 只能有 allowlisted fields：`success/errorCode/retryable/reportId` 和 safe localized-message key/projection。
- 对 `JSON.stringify(result)`、renderer log arguments、toast text、Sentry event 和 Nexus event 做 canary 断言，不含：`Failed query:`、`UPDATE files`、`params:`、synthetic absolute path、`stack`、`cause`。
- `reportId` 必须与 local diagnostic 记录一致。
- lock `ROLLBACK` 后重试同一 synthetic mutation 成功。

## Case E：值边界矩阵

在 repository boundary 增加 table cases：

| 输入                                            | 预期                                                                  |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| valid Date/number/ISO string                    | 正常写入                                                              |
| `new Date(NaN)`                                 | SQL 前稳定拒绝或归一化；不能泄露 native bind message                  |
| `NaN` / `Infinity` size/timestamp               | SQL 前稳定拒绝或 fail-safe normalization                              |
| undefined optional extension/size               | 明确映射 null；不能把 undefined 交给 libSQL                           |
| object/array as path/name/icon via hostile cast | boundary stable-invalid；不执行 SQL                                   |
| empty optional app extension                    | omit/delete stale row                                                 |
| `alternateNames: string[]`                      | 只写 serialized string                                                |
| duplicate `files.path`                          | stable conflict classification；old row 与 extension rows不发生半提交 |
| stale/missing file id during enrichment         | report `staleFileIds`，不写 orphan progress/embedding                 |

## 原子性检查

- File metadata row 和同 chunk 的本地附属写入如被合并，应使用一个 worker transaction。
- App `files` + `file_extensions` 当前 transaction/batch 原子性不能因本修复退化。
- provider-local persistence 成功后再进入 IndexingRuntime；Runtime FTS commit 失败时 task 必须失败并保留可重试状态，不能把 split write 报成成功。
- libSQL `batch()` 是 transaction 且返回 statement index；它的 error 文本与普通 Drizzle query 不同。测试应分别断言，不要把 batch error 当作截图复现。

## 本研究已执行的 synthetic canary

- normal UPDATE：成功。
- second connection `BEGIN IMMEDIATE`：普通 UPDATE 确定抛含 SQL/params 的 `DrizzleQueryError`，cause `SQLITE_BUSY`。
- holder `ROLLBACK`：同一 UPDATE 成功。
- invalid timestamp Date：params 显示 `NaN`，libSQL 拒绝 non-finite number。
- object/array TEXT bind：libSQL 拒绝非 scalar bind。
- undefined set field：Drizzle 从 SQL 中省略该 field。
- duplicate path：cause 为 `SQLITE_CONSTRAINT UNIQUE`。
- `db.batch()` under lock：`LibsqlBatchError` + statement index，不含 `Failed query ... params:` envelope。
