# Design — 文件索引减负

## A. 排除规则（packages/utils/common）

### A1 DEV_PATHS 锚定（X3）
`file-scan-constants.ts` `PATH_PATTERNS.DEV_PATHS` 中没有前导 `/` 的正则改为路径段锚定：
```
/node_modules/      → /(^|\/)node_modules(\/|$)/
/\.git\//           → /(^|\/)\.git\//
/dist\//            → /(^|\/)dist\//      （build、target、out、coverage、.nyc_output、.vscode、.idea、.next、.nuxt、.vuepress、.docusaurus 同理）
```
`CACHE_PATHS` 已以 `\/` 开头，本就锚定，不改。`SYSTEM_PATHS` 不改。

### A2 home 锚定的工具链缓存
`file-filter-service.ts`：在 `HOME_ANCHORED_SYSTEM_DIRS` 判断之后，新增
```ts
/** Toolchain caches that live directly under a home directory without a dot prefix. */
const HOME_ANCHORED_TOOLCHAIN_PATHS: ReadonlyArray<readonly string[]> = [
  ['go', 'pkg'],          // GOPATH module cache + build artefacts; 222k of 276k rows in the 2026-09-26 dev DB
  ...(darwin ? [['orbstack']] : [])   // OrbStack VM mounts
]
```
- 匹配方式：取 home 相对段（`/Users/<u>/…`、`/home/<u>/…`、`C:/Users/<u>/…`），小写后与规则逐段比较，规则是被扫描目录的前缀（`~/go/pkg` 与其任意后代都命中）。返回 `'cache-path'`。
- 与 `siblingNames`/`walksEveryLevel` 无关：每一层都判定，因为规则是路径前缀。
- 不新增 `~/Library/*` 规则，iCloud 例外不受影响。

### A3 测试
`packages/utils/__tests__/file-filter-traversal-anchor.test.ts`（已有锚定主题）新增用例：
- `~/go/pkg/mod/github.com/x` → cache-path；`~/go/src/project` → null；`~/OrbStack/docker/volumes` → cache-path（darwin）；`/home/u/go/pkg` → cache-path。
- `~/Workspace/Projects/app/src/layout/components` → null；`~/Documents/about/team` → null；`~/Workspace/app/dist` → development-path；`~/Workspace/app/dist/2026` → development-path。

## B. 断点续扫（addon/files/services/file-provider-full-scan-run-service.ts）

### B1 Deps 扩展
```ts
listChildDirectories: (rootPath: string, context) => Promise<string[]>   // readdir withFileTypes，只取目录，应用 excludePathsSet 与 traversal 排除，按名排序
getCompletedCheckpoints: (paths: string[]) => Promise<Set<string>>       // scanProgressService.getCompletedPaths(paths)
recordCheckpoint: (path: string) => Promise<void>                        // scanProgressService.upsertCompletedPaths([path], now, 'scan-progress.checkpoint')
clearCheckpoints: (paths: string[]) => Promise<void>                     // scanProgressService.deletePaths(db, paths)
```
### B2 执行流程（每个 root）
1. `children = listChildDirectories(root)`；`done = getCompletedCheckpoints(children)`。
2. 对 `pending = children − done` 逐个：`scanDirectory(child, excludePathsSet, ctx)` → 插入 → `recordCheckpoint(child)`；`emitProgress(doneCount, children.length + 1)`。
3. 根自身顶层文件：`scanDirectory(root, excludePathsSet ∪ children, ctx)`（把所有子目录放进排除集，walker 只产出根一级文件）。
4. `completedPaths.push(root)`；`clearCheckpoints(children)`（在调用方写入根记录之后执行，避免窗口期两者皆无——由 run service 返回 `checkpointsToClear`，file-provider 在 `upsertCompletedPaths(root)` 成功后清理）。
5. abort：任何一步抛出即中止，已写检查点保留。
### B3 策略服务不变
`resolveIndexedScanStrategy` 仍以根是否完成判定 new/reconcile；子目录检查点不在 watchPaths 内，不影响。
### B4 兼容
- 根没有子目录（或 readdir 失败）→ 退化为现状（整根一次扫描）。
- 检查点行的 `last_scanned` 语义与根一致；`buildEvidence`/`getSummary` 只按 watchPaths 统计，不受影响。

## C. 排除子树内遗留行的清理（addon/files/services/file-provider-cleanup-delete-service.ts）

现有 cleanup 每次 `_initialize` 分页（500 行）遍历全部 `files`，删除不在 watch roots 内的行，页间让出事件循环、删除经写 worker。扩展其判定：
```ts
isStaleIndexPath: (path) => !isWithinWatchRoots(path) || fileFilterService.getIndexExclusionReason({ path, isDirectory: false }) !== null
```
即"现在会被排除的路径"与"根外路径"同等清理。首次生效时 go/pkg/mod 的 22 万行会在启动 cleanup 阶段分页删除（444 页，每页一次 worker 删除 + 让出），此后为零成本。日志沿用 `Removing stale database entries`。

## D. 图标遗留（不做）
由 `09-26-bound-indexing-memory-icons` 负责，本任务不触碰 `file_extensions.icon`。

## Rollback
- A：还原正则/规则；B：deps 缺省时走整根扫描；C：去掉 predicate 扩展。
