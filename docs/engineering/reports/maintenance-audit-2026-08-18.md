# 维护审计：需处理项（2026-08-18）

仅记录当前仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-17 审计](./maintenance-audit-2026-08-17.md) 作为当前问题索引，不建立第二套全局优先级。

## 失败的验证与生成物漂移

- **Drizzle 快照棘轮已失效，新增迁移没有对应快照。** `node scripts/check-drizzle-snapshot-drift.mjs` 当前以退出码 1 失败：journal 有 41 条、快照 14 个、缺口从受控的 25 扩大到 27，新增未覆盖 `0039`、`0040`。这是会让 `db:generate` 再次针对过期基线生成错误 SQL 的数据库发布门禁。已关闭的 [#1303](https://github.com/talex-touch/tuff/issues/1303) 不再覆盖该回归；应重开它或建立继任 owner，在确认真实 schema/migration 历史后补齐快照或明确更新棘轮基线，不能直接抬高常量。
- **文档验证失败，五条链接不可解析。** `mise run docs:verify` 失败：Nexus 组件索引的中英文 `BorderBeam`、`Liquid` 四个目标不是 Git 跟踪文件；[ROADMAP.md](../../../ROADMAP.md) 仍链接已归档的 `07-27-optimize-clipboard-plugin` 活动任务路径。前四条需要把已存在的组件页纳入版本控制或改为实际已跟踪目标；后者应改到 archive 路径或移除历史活跃状态。`peripheral-docs-link-audit.mjs` 同样检出前四条，说明专项与全量文档门禁都受影响。

## 发布、运行与人工验收

- **Cargo 原生能力未进入发行构建。** [#321](https://github.com/talex-touch/tuff/issues/321) 确认 release workflow 不构建 `tuff_native_screenshot.node`，因此干净 runner 的发布包可无声降级截图。需产品 owner 在「发行必需（先构建，再 release-only fail-closed）」与「明确可降级且发布证据记录缺失」之间作出决定；不能先把 preflight 设为必需，否则全部发布立即失败。
- **真实宿主门禁仍未收集。** [#308](https://github.com/talex-touch/tuff/issues/308) 缺 Windows 打包 CoreBox 的普通、`@file`、结构化检索及结果/空态/降级态证据；先确定 manifest 是否增加 result/empty 专用字段。[#326](https://github.com/talex-touch/tuff/issues/326) 缺 Windows/Linux OTA handoff、health、recovery 与 N/N-1 真实证据；[#482](https://github.com/talex-touch/tuff/issues/482) 仅剩运行 CoreApp 的桌面/窄窗口 release-notes 与 Update-history 视觉验收。
- **默认开启的 search-index 分库没有当前隔离 profile 运行证明。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 仍是 release-blocking：默认 on 首启重建、结果/计数一致、`search-index.db` 实际写入、无 WAL/`SQLITE_BUSY` 风暴，以及 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 经 quiesce/restart 后的回退一致性都必须在一次可复现运行中证明。

## 数据库、索引与功能风险

- **SQLite writer owner 守卫只覆盖局部表域。** [#351](https://github.com/talex-touch/tuff/issues/351) 已有搜索索引 3 表的阻断守卫，但 71 张 schema 表中 59 张有 main-process 写点：31 张可直接登记唯一 owner，28 张多写入者仍需架构 owner 定义合法入口、admission、重试与观测职责。不要把当前调用点机械冻结为 owner。
- **用户目录的普通名称仍可能被静默排除。** [#1727](https://github.com/talex-touch/tuff/issues/1727) 的系统根路径误排已修；`tmp`、`cache`、`logs`、`build`、`out`、`bin` 在用户根下是否继续深度排除仍缺策略决定。该决定必须保留 `node_modules`、`target`、`dist` 的深度排除，或重测 [#318](https://github.com/talex-touch/tuff/issues/318) 的大目录内存边界。

## 安全与依赖门禁

- **CSP 的强制策略仍含 `default-src`/`connect-src` 通配符。** [#689](https://github.com/talex-touch/tuff/issues/689) 的 `script-src` wildcard 与 `unsafe-inline` 已移除；剩余收紧须先从真实日常使用收集并核验 `[csp-report-only]` 日志，再将候选策略提升为强制。`unsafe-eval` 仍由预编译 widget 的字符串执行路径依赖，不能借 CSP 收紧直接删除；需独立迁移为模块加载并定义作用域注入替代接口。
- **依赖安全处置需要刷新事实基线。** [#483](https://github.com/talex-touch/tuff/issues/483) 最近一次完整清单（2026-08-12）为 19 个 Dependabot 告警，Critical/High 已有 owner、expiry 与 `pnpm audit --prod` 门禁，但该门禁的生产依赖口径不等于 Dependabot 的全 workspace 口径。安全 owner 应重新核验当前 Security Dashboard，续办 #1098、Astro 与 MCP SDK 上游路径，并保持每个例外的到期处置。

## 任务记录、文档与路线图

- **12 个活跃任务缺 `meta.blocker` 与 `meta.nextAction`。** 其中 `07-17-unify-ota-update-flow` 位于 TODO 的第一发布阻断 lane，却完全无状态；其余为 `08-05-ai-toolchain-suite`、`08-05-skeleton-loading-default`、`08-06-home-chat-pipeline-fixes`、`08-06-reco-negative-feedback`、`08-06-reco-scenario-playbook`、`08-06-web-search-tool`、`08-07-home-chain-and-native-search`、`08-07-native-web-search`、`08-09-home-panel-layering-v2`、`08-14-mobile-tuff-chat-draft`。它们必须写明受阻原因和下一步，或转回明确 backlog 状态。
- **`07-26-install-launch-v2-4-13-beta-23` 是陈旧的 `in_progress` 记录。** 创建于 2026-07-26，任务工件约 22 天未更新，且 `meta` 为空；安装动作已不应以无验收边界的活跃任务形式留在树中。[#309](https://github.com/talex-touch/tuff/issues/309) 应承接其真实结论：补证据后归档，或记录具体未完成动作。
- **两个文档型收尾仍未完成。** [#1751](https://github.com/talex-touch/tuff/issues/1751) 要把 CatalogService 已完成/未完成边界写入 R8、任务工件、质量基线、changelog 与开发者文档；[#1752](https://github.com/talex-touch/tuff/issues/1752) 要让全仓治理审计的 findings/filing ledger 与六项 PRD 验收逐条对账。二者都不能由全局 TODO 的“暂停”文字替代。
