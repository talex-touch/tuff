# 维护审计：需处理项（2026-08-19）

仅记录当前仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-18 审计](./maintenance-audit-2026-08-18.md) 作为当前问题索引，不建立第二套全局优先级。

## 发布与合并门禁

- **`master` 没有必需状态检查，红色或未完成 CI 仍可合并。** [#1716](https://github.com/talex-touch/tuff/issues/1716) 已在真实合并上复现；需要维护者决定只要求确定性的代码检查，还是接受人工判断替代门禁。建议要求 `PR Quality`、两套 App suites、Integration suite 与 Plugin SQLite sandbox，保留 Cloudflare Pages 和真实主机验收为 advisory。
- **发布流程不构建或验证 Cargo 截图 addon。** [#321](https://github.com/talex-touch/tuff/issues/321) 复核确认 `build-and-release.yml` 不运行 Rust / `build:screenshot`，clean runner 可发布缺 `tuff_native_screenshot.node` 的包。先选择「发布必须带截图能力」或「明确记录为可降级能力」；若选前者，先接入构建，再加 release-only preflight/afterPack 门禁。
- **真实宿主证据仍缺。** [#308](https://github.com/talex-touch/tuff/issues/308) 缺 Windows packaged CoreBox 的 normal、`@file`、结构化过滤、空态和降级态；[#326](https://github.com/talex-touch/tuff/issues/326) 缺 Windows/Linux OTA handoff、health、recovery 与 N/N-1 profile 证据；[#482](https://github.com/talex-touch/tuff/issues/482) 仅剩 CoreApp desktop / 窄窗口 release-notes 与 Update-history 视觉验收。自动化或 static-only 结果不得替代这些证据。

## 数据库、索引与功能完整性

- **default-on search-index split 尚无当前隔离 profile 的端到端证明。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 是 release blocker：需一次可复现运行证明首次重建、`search-index.db` 填充、app/file 计数与代表结果一致、无 `SQLITE_BUSY`/WAL 风暴，并在 quiesce/restart 后验证 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 回退一致性。
- **SQLite writer 所有权未覆盖大部分可变域。** [#351](https://github.com/talex-touch/tuff/issues/351) 的 search-index guard 不等于全库策略；下载、推荐、应用索引、分析、更新等仍需确定 owner、admission/retry 合同及锁竞争、恢复、关机的真实证据。
- **Drizzle 生成基线依然不可用，虽未发生新的快照漂移。** 快照棘轮检查通过，但 `db:generate` 的 baseline guard 仍因 journal 与最新 snapshot 相隔 23 条迁移而故意 fail-closed；当前没有专门的开放 owner（关闭的 #1303 不应被当作完成）。维护者应确认「重建历史快照」或「从当前 schema 建新基线」，并为该决定建立继任 owner；不得用抬高棘轮常量掩盖问题。
- **用户目录的普通名称仍可能被当成系统目录深度跳过。** [#1727](https://github.com/talex-touch/tuff/issues/1727) 需要决策 `tmp`、`cache`、`logs`、`build`、`out`、`bin` 在用户根下的策略，同时保留 `node_modules`、`target`、`dist` 的深度排除并复测大目录边界。

## 安全门禁

- **Renderer 强制 CSP 仍以 `default-src *`、`connect-src *` 和 `unsafe-eval` 放行。** [#689](https://github.com/talex-touch/tuff/issues/689) 的 `script-src` 已收紧，复合插件执行链已关闭；剩余风险必须先依据 report-only 运行日志盘点实际 origin，再提升候选策略。`unsafe-eval` 受 widget `new Function` 依赖，需独立迁移为模块加载，不能直接删除。
- **依赖安全处置需要重新取得事实基线。** [#483](https://github.com/talex-touch/tuff/issues/483) 的历史 Dependabot 清单不能证明当前状态；安全 owner 应复核 Security Dashboard、每个例外的到期处置与全 workspace 口径，不能把 `pnpm audit --prod` 当成其替代。

## 任务记录、文档与路线图

- **任务元数据仍不完整。** [#309](https://github.com/talex-touch/tuff/issues/309) 需逐项写明阻塞原因和下一步，尤其是 TODO 第一 lane 的 OTA 规划任务；一个 2026-07-26 创建的本地安装记录仍是无元数据的陈旧 `in_progress`，应补验收后归档或记录具体遗留动作。`_example` JSONL 是 sub-agent context 模板，不应被误报为验收记录。
- **两个文档收尾阻塞事实源完整性。** [#1751](https://github.com/talex-touch/tuff/issues/1751) 必须把 CatalogService 已完成/未完成边界写入其 PRD、执行计划、质量基线、changelog 与开发者文档；[#1752](https://github.com/talex-touch/tuff/issues/1752) 必须将全仓治理审计 findings/filing ledger 与六条 PRD 验收逐项对账。全局 `TODO.md` 的暂停描述不能替代这些 task-local 记录。
