# Search Engine

该目录承载 CoreApp 的搜索编排与索引运行时。查询侧通过 Search Provider
拉取、聚合和排序结果；索引侧通过 Indexed Source 执行 scan、watch、
reconcile，并将记录写入 SQLite/FTS 搜索索引。

## 当前架构

- [search-core.ts](search-core.ts)：
  搜索会话生命周期、分层结果推送和兼容入口。
- [search-query-orchestrator.ts](search-query-orchestrator.ts)：
  查询规范化、Provider 过滤和平台文件搜索路由。
- [search-provider-registry.ts](search-provider-registry.ts)：
  Search Provider 注册与健康状态入口。
- [search-gather.ts](search-gather.ts)：Fast/Deferred Provider 聚合。
- [indexing-runtime.ts](indexing-runtime.ts)：
  Indexed Source 的 scan、watch、reconcile 和任务状态编排。
- [search-index-writer.ts](search-index-writer.ts)：
  索引写入模式和 admission/drain 边界。
- [workers/search-index-worker.ts](workers/search-index-worker.ts)：
  搜索索引 worker 入口。

查询 Provider 与 Indexed Source 是两类接口：前者服务当前查询，后者维护
可搜索数据。新增数据源必须接入现有注册、诊断、权限和降级路径，不能创建
绕过 Settings diagnostics 的私有扫描入口。

## Search DB split 边界

`TUFF_DB_SEARCH_SPLIT_ENABLED` 当前默认关闭。启用后 search-index worker
使用独立的 `search-index.db`，但目录中已经存在 split 相关适配并不表示
所有写路径已经迁移完成，也不表示 flag-on 应用验收通过。在剩余 writer、
首次全量重建、回滚和真实 app-run 证据完成前，不应把该开关描述为生产
默认能力。

## 维护中的文档

- [Indexing Runtime V1 Plan](../../../../../../../docs/plan-prd/03-features/search/INDEXING-RUNTIME-V1-PLAN.md)
- [App Data, Plugins, and Everything Roadmap](../../../../../../../docs/plan-prd/03-features/search/APP-DATA-PLUGINS-AND-EVERYTHING-ROADMAP.md)
- [Windows File Search PRD](../../../../../../../docs/plan-prd/03-features/search/WINDOWS-FILE-SEARCH-PRD.md)
- [Raycast/uTools Capability Gap Matrix](../../../../../../../docs/plan-prd/03-features/search/RAYCAST-UTOOLS-CAPABILITY-GAP-MATRIX.md)
- [Project documentation index](../../../../../../../docs/INDEX.md)

历史 Search DSL、旧版 Quick Launch、旧推荐系统和旧 Everything 集成页面
已无维护目标，因此不在此处保留失效链接。
