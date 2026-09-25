# Design — 应用新鲜度加固

## A. 稳定探针（`_waitForItemStable`）

```ts
const stat1 = await fs.stat(itemPath)
await delay
const stat2 = await fs.stat(itemPath)
const fingerprint = (s) => s.isDirectory() ? `${s.mtimeMs}` : `${s.size}:${s.mtimeMs}`
if (fingerprint(stat1) === fingerprint(stat2)) → 稳定
```

目录 mtime 在直接子项增删时变化；bundle 深层拷贝时 `Contents/` 等子目录持续变化会让顶层 mtime 在拷贝初期变化，再配合 R-B 的重试，足以覆盖拖入场景。现有测试 `probes at 300ms and settles for 250ms once the bundle stops growing` 用 `{ size: 4096 }` mock，需补 `isDirectory`/`mtimeMs`。

## B. 分类（`app-scanner.ts resolveAppInfoByPath`）

`isResolvableAppCandidate` 已要求 `Contents/Info.plist` 可访问才判 `failed`。改为：darwin 下 `fs.access(filePath)` 目录存在即视为候选（`failed` 可重试）；只有目录本身不存在才 `not-app`。重试阶梯 2s/8s/30s 覆盖拷贝完成。`darwin.ts getAppInfoUnstable` 缺 plist 抛错的路径不变。

## C. 事件重排（`processAppPath`）

- 新增 `private readonly dirtyProcessingPaths = new Set<string>()`。
- 早退分支：`this.dirtyProcessingPaths.add(appPath)`，返回 `reason: 'processing'`。
- `finally`：`processingPaths.delete` 后若 `dirtyProcessingPaths.delete(appPath)` 为真且未 shuttingDown，`void this.rerunDirtyAppPath(appPath, options)`：调用 `processAppPath(appPath, options)`，成功则 `publishAppRuntimeUpsert(appInfo, 'app-provider-watch-rerun')`（与 retry 路径一致）。

## D. mdls 删除走宽限账本

`_performMdlsUpdateScan` 中 `deletedApps` 分支改为构造 `missingApps`（`{ id, path, uniqueId }`）并 `await this._processAppsForDeletion(missingApps)`，对返回的 confirmed ids 执行既有删除语句。

## E. 补全开关

`_performStartupBackfill` 开头：`if (!this.appIndexSettings.startupBackfillEnabled) { logApp('Startup backfill disabled, skipping'); return }`。`scanIndexedSource` 仍会 `buildChangedIndexedSourceRecordBatches`，索引从现有 DB 记录产出。

## 测试落点

- A：`app-provider.realtime-freshness.test.ts` F3：目录 mtime 变化 → 重试；mtime 稳定 → true。
- B：`app-scanner.test.ts`：目录存在、plist 缺失 → `failed`；目录不存在 → `not-app`。
- C：`app-provider.realtime-freshness.test.ts`：第一个 `processAppPath` 挂起时第二个调用返回 `processing`，第一个完成后自动重跑并发布。
- D：`app-provider.test.ts` mdls：`deletedApps` 非空且账本为空 → 不删、写入 pending。
- E：`app-provider.test.ts`：`startupBackfillEnabled=false` 时 `_performStartupBackfill` 不调用 `getApps`。
