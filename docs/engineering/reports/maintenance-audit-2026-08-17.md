# 维护审计：需处理项（2026-08-17）

仅记录当前仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-16 审计](./maintenance-audit-2026-08-16.md) 作为当前问题索引，不建立第二套全局优先级。

## 发布、运行与人工验收

- **截图 native addon 的发布合同未定且发布路径不构建它。** [#321](https://github.com/talex-touch/tuff/issues/321) 仍确认 `build-and-release.yml` 不构建 `tuff_native_screenshot.node`。需要产品 owner 选择：将截图视为发布必备并在 release-only preflight/afterPack fail closed，或明确把它保留为可降级能力；无论选择哪条，发布 job 都必须先构建真实 addon，不能先加硬检查。
- **Windows Everything 缺打包交互验收。** [#308](https://github.com/talex-touch/tuff/issues/308) 需要 Windows 打包 CoreBox 覆盖普通、`@file`、结构化筛选及结果/空态/降级态，并通过严格 manifest 验证。manifest 尚无结果/空态的专用字段；应在真机执行前决定字段承载方式，避免重跑。
- **OTA 与发布说明仍缺真实宿主证据。** [#326](https://github.com/talex-touch/tuff/issues/326) 缺 Windows/Linux handoff、health/recovery 与 N/N-1 兼容验证；[#482](https://github.com/talex-touch/tuff/issues/482) 只剩运行中 CoreApp 的桌面/窄窗口 release-notes 与 Update-history 截图。现有静态或 CI 证据不能替代这些运行时门。

## 数据库、索引与功能门禁

- **默认开启的 search-index 分库未获当前隔离 profile 运行证明。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 是 release-blocking：需证明首启重建、应用/文件结果与计数一致、`search-index.db` 有数据、无 WAL/`SQLITE_BUSY` 风暴，并证明 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 的静默、重启后回退一致性。#1745 已关闭，仅修正了 default-on/`=0` 文档方向，不能作为运行证据。
- **SQLite writer ownership 尚未覆盖大部分可变域。** [#351](https://github.com/talex-touch/tuff/issues/351) 的 CI 守卫仅覆盖 71 张 schema 表中的 3 张；59 张有 main-process 写入，31 张是单一写入者可直接登记，其余多写入者需要架构 owner 决定合法路径、准入、重试与观察责任。不要按现有写点机械固化 owner。
- **用户文件仍会因普通目录名被静默排除。** [#1727](https://github.com/talex-touch/tuff/issues/1727) 的 system-path 误排已修，但 `tmp`、`cache`、`logs`、`build`、`out`、`bin` 在用户目录任意深度仍是未决策略；这会造成无错误、无诊断、搜索无结果。决策必须保留 `node_modules`、`target`、`dist` 的深度排除，或重测 #318 的大目录内存边界。

## 安全门禁

- **Renderer CSP 仍等待真实使用观测后收紧。** [#689](https://github.com/talex-touch/tuff/issues/689) 的 `script-src` wildcard 与 `unsafe-inline` 已消除；剩余强制策略的 `default-src`/`connect-src` wildcard 只能在真实使用（含插件 widget、Nexus、Sentry）中收集并检查 `[csp-report-only]` 日志后提升。`unsafe-eval` 仍由预编译 widget 的字符串执行路径依赖，需独立改为模块加载并定义替代作用域接口，不能随 CSP 收紧删除。

## 任务记录、文档与路线图

- **三条 in-progress 记录实质陈旧，另有一条缺全部继续条件。** `07-17-windows-everything-productionization`、`07-24-harden-app-icon-self-healing`、`07-26-install-launch-v2-4-13-beta-23` 最近任务工件分别已约 29、19、21 天未更新；最后一条同时缺 `meta.blocker`、`meta.nextAction`、`meta.evidence`。按 [#309](https://github.com/talex-touch/tuff/issues/309) 逐条更新真实阻塞、下一动作和可核验证据，或归档已完成记录。
- **CatalogService 的完成边界仍未写回文档。** `07-13-catalog-service-mvp` 的前八项验收已勾选；剩余项要求将 completed/open boundary 写入 R8 PRD、执行计划、质量基线、changelog、任务工件与开发者文档。路线图中的“暂停”不能替代这一收尾。
- **全仓治理审计的 filing 未与 PRD 验收对账。** `08-05-full-repo-governance-audit` 已记录 454 个 verified finding，但 PRD 的证据、标签、去重、ledger、真实分域统计六项验收均未逐项回填。应以 `research/findings.jsonl`、`research/filed.jsonl` 与摘要对账；不要把已建 issue 直接等同于任务完成。

## 依赖安全

- **默认分支的 Dependabot 告警缺处置分流。** 上轮推送回执基线为 34 个告警（6 high、21 moderate、7 low），仅代表库存而非可达性或可利用性。安全负责人需逐项确认运行时 reachability、升级/缓解方案及关闭理由。
