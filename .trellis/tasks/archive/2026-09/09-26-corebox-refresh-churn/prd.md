# CoreBox 结果反复刷新（索引提交刷新风暴）

父任务：`09-25-corebox-ux-polish`。调研：`research/root-cause.md`（机制置信度高，已用真实 hooks 实测频率）。

## Goal

CoreBox 开着一个查询时，结果列表不再因为后台索引活动而每隔一两秒整轮重搜、抖动。后台建索引与富化不再持续打扰前台，也不再挤占搜索用的读 worker。

## Background（调研结论）

- 老板原话：「这个怪怪的 老是刷新」（2026-09-26，附截图：查询 `wx`；日志里有 `FILE_INDEX_WORKER_BATCH_FAILED:26/30`、`IndexingDiagnostics.source` 293–340ms）。
- **渲染层**：查询非空时，任何索引提交都会在 500ms 后强制重搜；上一次搜索结束就排下一次，没有上限、没有退避（`useSearch.ts:1408-1452`）。
  - 实测提交每 300ms 来一次时，每 0.6–1.6s 重搜一次。
  - 每次重搜都会让缓存失效，快照先删掉文件行，Spotlight 约 264ms 后再插回，就是"一直在刷"。
  - 删插的视觉问题由 `09-25-corebox-list-motion` 方案 B 处理；本任务处理"为什么一直在重搜"。
- **主进程几乎不停地发提交**：内容没变也发（`search-index-writer.ts:661-690`）。持续来源有三个：
  1. 全量扫描永远扫不完：macOS 默认扫整个 `~`，而进度只在整棵根扫完后才记录，每次重启都从头扫（观察到一轮跑了 9.5 小时被重启打断）。每一批都发提交。
  2. 富化恢复自己再启动自己：发布结果触发的 drain 又开新一轮，而且每轮从头挑未完成的文件（日志里的 `enrichment-resume.indexed-source.mutation`）。
  3. 文件变更：每个被接受的变更都发一次提交。
- **26/30 失败**：唯一的解析器只做 `fs.readFile`，失败就是读错误（文件已删 / 没权限 / 正在重建）。这批结果仍然会发布，并触发一次刷新。具体错误要停掉 app 后只读查 `file_index_progress.last_error`。
- **`out/renderer/assets` 那些行来自 Spotlight**，不是我们的索引。Spotlight 结果不过滤构建产物、`node_modules`、`~/Library`。
- **两行 KaTeX** 是两个不同路径下同名同内容的文件（talex-touch 的 `out` 与 mikobot 的 `dist`），不是去重失败。
- **`IndexingDiagnostics.source` 300ms**：app 健康检查在唯一的读 worker 上做全表计数，而且每个文件事件都先做这次检查、之后才判断路径在不在 `/Applications` 下。一次 tuffex 构建（约 2,759 个 dist 文件）会让它饱和约 14 分钟，同时拖慢 CoreBox 搜索。
- 附带发现：路径里含 `layout/`、`about/` 这类段的深层文件会被误排除出索引（探针已证实），需要另开任务。

## Decisions（老板 2026-09-26）

- **D-a**：批量建库期间，「提交后 1 秒内可见」放宽到几秒。做法是主进程合并提交通知，渲染层遇到连续提交时退避。
- **D-b**：排除构建产物、依赖目录、`~/Library`，Spotlight 结果与文件索引同一口径；同名文件在副标题显示父目录以示区分。
- **D-d**：CoreBox 隐藏时不响应提交，重新显示时补刷一次。
- **D-c**（默认扫描根、代码文件内容索引）：本次不动，随 M5 另开任务。

## Requirements

- **R1（M6）app 事件按根过滤**：只把 app 根（darwin 上是 `/Applications`、`~/Applications`）下的路径放进 app 队列；先判断根目录（便宜）再做健康检查（贵）；根外事件不写 task state。
- **R2（M1 / R1）提交通知合并与刷新退避（D-a）**：
  - 主进程对推给渲染层的提交通知做尾沿合并（1–2s，批量期间更长），hub 的 revision 仍立即递增，缓存正确性不变；
  - 渲染层在提交连续到来时逐级拉长刷新间隔，用户输入或窗口重新显示时复位。
- **R3（R2）隐藏时不刷新（D-d）**：CoreBox 隐藏时只记下"有待刷新"，重新显示时补刷一次。
- **R4（M3）富化恢复去自激**：
  - 自己的发布不再触发 resume；
  - 每轮结束后冷却（≥30–60s）；
  - 游标跨轮保留，不从头来；
  - 失败块跳过，不整轮暂停。
- **R5（M4）读失败分类**：ENOENT → 删除过时行；EACCES / EPERM → 标为 `skipped: permission`，权限不变不重试；警告日志带若干条 `lastError` 样例。
- **R6（M7）健康检查变便宜**：全表 FTS `count(*)` 改为对 `search_index_meta` 按 PK 前缀计数，或由写入端维护计数；耗时 <10ms。
- **R7（X1）Spotlight 结果排除规则（D-b）**：在 Spotlight 结果截取之前，套用与文件索引相同的排除规则（构建产物带项目上下文判断、`node_modules`、`~/Library`、dot 段），并按父目录缓存判断结果。
- **R7.1 同名区分（D-b）**：结果集中出现同名文件时，这些行的副标题显示父目录（例如 `…/talex-touch/out/…` 与 `…/mikobot/dist/…`）。只对同名项生效，不改变其他行。
- **R8（M2，可选）内容不变不提交**：写入时比对文档 hash，相同就跳过、不计入 `affectedItems`。涉及 meta 表结构，视 R2 效果再决定。

## Acceptance Criteria

- [ ] 持续推送提交 10s（沿用 `/tmp` 的节奏探针），渲染层重搜次数从 ~16 降到 ≤4（或按 D-a 的口径）。
- [ ] 一次 tuffex 构建期间，`IndexingDiagnostics.source` 慢日志约为 0；`indexing.task-state.save` 速率明显下降。
- [ ] 富化恢复"开始一轮"的频率不超过冷却设定；未变化的文件不产生提交。
- [ ] 搜 `wx` 不再出现 `out/`、`dist/`、`node_modules`、`~/Library` 下的结果（取决于 D-b）。
- [ ] CoreBox 隐藏期间收到提交不发起搜索，重新显示时补刷一次（取决于 D-d）。
- [ ] 相关单测（router、search-core 合约、native-file-search-provider、file-provider-startup、useSearch.core）通过；core-app `tsc -p tsconfig.node.json` / `vue-tsc -p tsconfig.web.json` 通过。

## Out of Scope（另开任务）

- M5 全量扫描可续扫、X2 watcher 带项目上下文过滤构建目录：结构性改动。
- X3 `DEV_PATHS` / `CACHE_PATHS` 按路径段锚定（修复 `layout/`、`about/` 误排除），需要重建索引。
- D-c：默认扫描根（整个 home）与代码文件内容索引的范围调整。
