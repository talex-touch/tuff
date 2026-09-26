# Implement — CoreBox 刷新风暴治理

老板 2026-09-26 批准开工并补单测。每处改动都要有回归单测，并证明不修时测试会失败（用 /tmp 副本或编译期变异，仓库里不留变异）。

## Part A（现在）

1. [x] M6 app 事件按根过滤，并补 router 单测：根外路径不调 `getHealth`、不写 task state。
2. [x] M7 健康检查变便宜，并补单测或基准：耗时 <10ms，语义不变。
3. [x] M1 提交通知尾沿合并，并补 fake timers 合约测试：100 次提交合并成 ≤N 次 emit，revision 立即递增。
4. [x] M3 富化恢复去自激（冷却、游标、失败块跳过），`file-provider-startup.test.ts` 相关用例要覆盖。
5. [x] M4 读失败分类，补单测。
6. [x] X1 Spotlight 排除规则（放大候选池、按父目录缓存），补 `native-file-search-provider.test.ts`。

## Part B（list-motion 阶段 1 落地后）

7. [x] R1 刷新退避 + R2 隐藏时不刷新（`useSearch.ts`），更新 `useSearch.core.test.ts` 里 index-commit 相关的 4 个用例。
8. [x] R7.1 同名区分（BoxItem 副标题），补单测。

另外按老板决定（D-b）给 iCloud Drive 开了例外：Spotlight 结果里 `~/Library/Mobile Documents` 下的文件不按 `~/Library` 排除，由 `native-file-search-provider.test.ts` 的 "keeps iCloud Drive…" 覆盖。

检查结果（2026-09-26）：

- **主进程**（M6 / M7 / M1 / X1、iCloud 例外、M3 / M4）已通过 trellis-check。
  - 修掉一个问题：冷却剩余时间按系统时钟算，时钟回拨会把冷却拉长，现在封顶 45s。
  - 性能：M7 实测从 50.6ms 降到 0.03ms。
  - 变异测试：Part A 25 个杀掉 24 个，剩下 1 个与原代码行为等价。
  - iCloud 例外：用 14 条路径探针验证，没有泄漏。
- **决定 2 已被其他会话的租约方案取代**：富化恢复每页先拿 `withMutationLease`，`contentPublicationScope` 已删。自激在结构上仍然不会发生。
- **偏离 R5**：文件不存在时标成 `skipped:file-missing`，不发布、不重试，过时行靠 `cleanupStaleSearchCandidates`（搜索命中时）或 reconcile 懒清理，不在发布链路里主动删。原因是 FTS 按 `provider` / `item_id` 删除时这两列都是 UNINDEXED，每删一行就要全表扫描（talex-touch-31 实测 500 行约 2 分钟，见 `09-26-file-index-bloat-control/research/fts-delete-cost-2026-09-26.md`）。
- **Linux**：原生搜索按文件索引同一口径排除 `/mnt`、`/media`（D-b）。
- **渲染层**（R1 / R2 / R7.1）与 list-motion 阶段 1–2 一起通过 trellis-check。同名区分改为逐层分组，每次约 0.1ms。
- 5 个失败的测试都来自其他会话的改动：写锁表、persist-entry 字段、`search-core.trace` 负载超时、`win.test.ts` 的图标路径。

提交安排（老板 2026-09-26）：M3 / M4 的改动与 #1964（`09-26-bound-indexing-memory-icons`，现由 talex-touch-31 负责）逐行交织，由 31 的 PR 原样带走，并在提交说明和 PR 描述中注明出自本任务。涉及的文件：

- `workers/file-index-worker.ts`、`file-index-worker-client.ts` 及测试；
- `services/file-provider-index-scheduler-service.ts` 及测试；
- `services/file-provider-enrichment-resume-service.ts` 及测试；
- `workers/index-worker-read-failure.ts` 及测试；
- `packages/utils/electron/file-parsers`（`errorCode`）；
- `file-provider.ts` 的两处改动；
- startup 测试中的「缺失文件不发布」。

本任务其余改动由本会话在老板要求时提交：M6、M7、M1、X1、iCloud 例外、渲染层。

- 已发出：PR #1965（https://github.com/talex-touch/tuff/pull/1965，分支 `fix/file-index-memory-corebox-fast-lane`），提交 `cc7c3fdb6`。31 在隔离 worktree 中验证：M3 / M4 测试 87/87 通过，19 个变异杀掉 18 个；未杀掉的 `m3-self-trigger` 在当前代码里已找不到注入点。
- **注意**：PR 合并并同步 master 之前，这些改动仍以未提交状态留在主工作区。本会话提交时必须排除它们：上面列出的文件，以及 `file-provider.ts` 中 `isIndexWorkerFileMissing` 的 import 和 `publishCommittedWorkerRecords` 里的跳过。

## Validation

```bash
cd apps/core-app
node_modules/.bin/vitest run src/main/modules/box-tool src/renderer/src/modules/box/adapter/hooks
node_modules/.bin/tsc --noEmit -p tsconfig.node.json; echo $?      # 主进程
node_modules/.bin/vue-tsc --noEmit -p tsconfig.web.json --composite false; echo $?
node_modules/.bin/eslint <changed files>; node_modules/.bin/prettier --check <changed files>
git diff --check -- <each changed file>
```

- 运行时（dev 日志，只读）：
  - 一次 tuffex 构建期间，`IndexingDiagnostics.source` 慢日志约为 0；
  - 富化 resume 的轮次频率不超过冷却设定；
  - CoreBox 开着查询时，每分钟的重搜次数明显下降。
- 不动数据库文件，不跑 `pnpm run` / `pnpm install`。dev Electron 是共享的，只读查看日志。
