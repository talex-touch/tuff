# Implement — 应用搜索脱离共享读路径：内存匹配

## Checklist

1. [x] 新建 `addon/apps/services/app-search-catalog-service.ts`：`AppSearchCatalogService`（entries、`reload(reason)` 去抖/单飞、`isReady()`、`recall(query) → { rows, isFuzzySearch, stats }`、`subscribeCommits`、`dispose`）。纯函数部分（keyword/ngram/ftsToken 构建、漏斗）独立导出便于测试。
2. [x] `app-provider.ts`：
   - 字段 `searchCatalog`；`onLoad` 在 `userAliases.load()` 后 `void this.searchCatalog.reload('load')`。
   - `onSearch`：`ready` → `searchViaCatalog`；否则原 SQL 逻辑；尾段抽成 `finishSearch`（噪声过滤、processSearchResults、慢搜索日志）。
   - 触发点：commit hub（覆盖所有经 worker 的写，含 `_runFullSync` / mdls / watch / runtime upsert）、图标指针修复末尾、`userAliases.onChanged`、搜索时发现快照过期的异步重载。
   - `onDestroy`：`searchCatalog.dispose()`。
3. [x] 测试：
   - `services/app-search-catalog-service.test.ts`：15 条（精确交集、phrase、前缀、fts 近似、n-gram 错字 `aplpe`、子序列 `wc`、isFuzzySearch 判定、120 上限、folded 变音、生命周期）。
   - `app-provider.test.ts`：现有用例中依赖 `searchIndex.lookupByKeywords` 等 spy 的断言改为内存路径断言；新增"目录未就绪回退 SQL 路径"和"commit 后重载"用例。
4. [ ] 验证：
   - `pnpm -C apps/core-app exec vitest run src/main/modules/box-tool/addon/apps`
   - `pnpm -C apps/core-app exec vitest run src/main/modules/box-tool/search-engine/sort`
   - `pnpm -C apps/core-app run typecheck:node`
   - `git diff --check`
5. [ ] 真机：dev 应用输入 `code` / `obs` / `wx`，searchLogger 显示 app-provider 在快层完成；日志无 `Performing search` 后的 SQL 阶段耗时行。

## Review gates

- 不动 `app-provider.ts` L1641-1660（peer hunk）。
- 内存路径不得调用 `this.searchIndex.*` 与 `this.dbUtils.getDb()`。
- 重载失败必须保留旧快照。

## Rollback

- `onSearch` 的分支开关：`ready` 判定前加常量 `APP_SEARCH_MEMORY_PATH_ENABLED`（默认 true），置 false 即回到 SQL 路径。
