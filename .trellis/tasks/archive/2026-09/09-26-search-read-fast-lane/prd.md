# 快层 provider 独立读车道

## Goal

`SearchIndexReadWorkerClient` 是单 worker、FIFO、队列上限 64、超时 15 秒，正在执行的查询不能被中断；文件 provider 的 FTS 与前缀 LIKE 单条 0.5 到 1.2 秒。所有 provider 共用这一条队列，于是下一次敲键的快层查询必须等上一键的文件查询跑完。今天日志里 4 次 `SEARCH_INDEX_READ_TIMEOUT`（15 秒）都把整个 CoreBox 搜索一起拖垮。
本任务给快层 provider 一条独立的读车道。

## Requirements

- R1 新增第二个读 worker 实例（同一 `search-index-read-worker.js`，同一数据库路径，`query_only`），专供 `priority === 'fast'` 的 provider 使用；文件 provider（deferred）继续使用现有实例。
- R2 快层车道的 `SearchIndexService` 与现有实例共享同一 db 句柄与初始化状态，不重复建表/修复（`ensureInitialized` 的副作用只允许发生一次）。
- R3 `ProviderContext` 暴露的 `searchIndex` 对快层 provider 解析为快车道实例；不改变 provider 接口签名；插件 provider 走快车道。
- R4 车道超时与重建策略：快车道超时 ≤ 3 秒（与 gather 的 `taskTimeoutMs` 对齐，避免 15 秒占位），失败后按现有 retire/rebuild 逻辑重建；`close()` 在 search-core 销毁时同时关闭两条车道。
- R5 诊断：`Perf`/searchLogger 能区分车道（日志字段 `lane: 'fast' | 'deferred'`），读超时告警带车道名。
- R6 测试 mock：`search-core.contracts.test.ts`、`search-core.trace.test.ts`、`channel/common.test.ts` 等对 `databaseModule` / read worker 的 stub 同步更新，不留下"mock 缺方法"的红灯。

## Acceptance Criteria

- [ ] 单测：文件 provider 的一次慢查询占住 deferred 车道时，快车道的查询独立完成（用两个 fake worker 模拟）。
- [ ] 单测：快车道超时 3 秒后 retire 并在下一次查询重建；deferred 车道不受影响。
- [ ] 单测：`ProviderContext.searchIndex` 对 fast provider 与 deferred provider 分别解析到不同 executor。
- [ ] `apps/core-app` 内 `search-engine` 相关 vitest 全绿；`typecheck:node` 通过。
- [ ] 真实 dev 应用：连续快速输入时，快层 provider 完成时间不随文件查询时长增长（searchLogger 输出）。

## Notes

- 与 09-26-app-search-in-memory-match 互补。
- `search-core.ts` 的 index-commit coalescer hunk 属于 talex-touch-40，只改读 worker 构造与 context 装配区域。
