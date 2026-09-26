# Design — CoreBox 刷新风暴治理

依据：`research/root-cause.md` §7（编号沿用）；决策见 `prd.md` 的 Decisions。

## 分两部分实施（避免与 list-motion 同时改 `useSearch.ts`）

**Part A：主进程与索引，现在就可以做**

- **M6 app 事件按根过滤**
  - 改哪里：`indexed-source-event-router.ts` 的 `shouldAccept` 用 `appScanner.getWatchPaths()`（darwin 上是 `/Applications`、`~/Applications`）先判断路径是否在 app 根下；或者在 `routeWatchEventWithResultInternal` 里先判断根目录，再做健康检查。
  - 要求：根外事件不调 `getHealth`，也不写 task state。
  - 边界：不缓存权限 / 启用状态的判断（遵守 spec「Never cache permission/enabled decisions」）。
- **M7 健康检查变便宜**：FTS 全表 `count(*)` 改为对 `search_index_meta` 按 PK 前缀计数（`EXISTS`，或 `count` 加上 `provider_id` 前缀），耗时 <10ms。如果 meta 与 FTS 不一致（例如 FTS 重建后），要保持健康检查的原有语义。
- **M1 提交通知尾沿合并**
  - 改哪里：`SearchEngineCore.emitIndexCommit` 对每个流做尾沿合并；hub 的 revision 仍然立即递增，缓存正确性不变。
  - 合并窗口：常态 1s；判定为批量期（全量扫描 / 富化进行中，或短时间内提交密集）时 3s。
  - 事件结构：推给渲染层的事件保持原有结构；如需区分批量，只追加可选字段 `bulk?: boolean`。
- **M3 富化恢复去自激**：
  - 自己的发布不触发 resume（给 resume 自己一个 lease 或标记）；
  - 每轮结束后冷却 45s；
  - 游标跨轮保留，不从 id 0 重来；
  - 失败块跳过继续，不整轮暂停。
- **M4 读失败分类**：
  - ENOENT → 删除过时行（或把所在目录排进 reconcile）；
  - EACCES / EPERM → 标为 `skipped: permission`，权限不变不重试；
  - `File index worker failed` 警告带上前 3 条 `lastError` 样例。
- **X1 Spotlight 与索引同口径**
  - 改哪里：`MacSpotlightFileProvider.searchNative` 截取前 50 条之前，套用文件索引的排除规则，复用 `file-filter-service`：
    - 构建产物目录带项目上下文判断；
    - `node_modules`、`~/Library`、dot 段。
  - 候选池：放大到 150 条后过滤，再截 50。
  - 缓存：判断结果按父目录缓存（LRU）。
  - Linux 原生 provider 如果走同一抽象，同步处理。

**Part B：渲染层，等 list-motion 阶段 1 落地后再做**

- **R1 刷新退避**：`scheduleIndexCommitRefresh` 在提交连续到来时逐级拉长间隔（500ms → 2s → 5s），用户输入或窗口重新显示时复位；收到 `bulk: true` 时直接从 2s 起。
- **R2 隐藏时不刷新**：`shouldRefreshForIndexCommit` 在 `document.hidden` 之外，再看 `useVisibility` 的原生 show/hide 信号；隐藏时只记 pending，显示时补刷一次。
- **R7.1 同名区分**：结果集中同名的 file 条目，副标题显示父目录（取 `meta.file.path` 的上两级目录，前面加 `…/`）。在渲染层按当前 `res` 计算，放在 BoxItem 的副标题渲染处，不改主进程的 item 结构。

## 兼容与回滚

- 事件结构只追加可选字段；主进程合并窗口和冷却时长做成常量，方便调参。
- Part A 与 Part B 可以分别回退。
