# 维护审计：需处理项（2026-08-20）

仅记录当前仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-19 审计](./maintenance-audit-2026-08-19.md) 作为当前问题索引，不建立第二套全局优先级。

## 合并、发布与真实环境门禁

- **`master` 仍没有要求 CI 状态，红色或未完成作业可以合并。** [#1716](https://github.com/talex-touch/tuff/issues/1716) 已经在真实合并上复现。维护者需要选定并启用确定性的代码检查（建议 `PR Quality`、两套 App suites、Integration suite、Plugin SQLite sandbox），将 Cloudflare Pages 与真实宿主验收保留为 advisory；随后用一个只失败一项必需检查的 PR 证明合并被拒绝。
- **发行流程仍不构建或验证 Cargo 截图 addon。** [#321](https://github.com/talex-touch/tuff/issues/321) 的 release workflow 不运行 Rust / `build:screenshot`，干净 runner 可产出缺 `tuff_native_screenshot.node` 的包。先决定截图是发行必需能力还是明确可降级能力；前者必须接入构建及 release-only preflight/afterPack 门禁。
- **真实宿主验收仍未补齐。** [#308](https://github.com/talex-touch/tuff/issues/308) 缺 Windows packaged CoreBox 的检索、结果、空态和降级态证据；[#326](https://github.com/talex-touch/tuff/issues/326) 缺 Windows/Linux OTA handoff、health、recovery 与 N/N-1 profile；[#482](https://github.com/talex-touch/tuff/issues/482) 仍缺 CoreApp desktop / 窄窗口 release-notes 与 Update-history 视觉验收。静态检查和历史构建不能替代这些运行证据。

## 数据库、索引与功能完整性

- **default-on search-index split 缺当前隔离 profile 的端到端证明。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 是 release blocker：需一次可复现运行同时证明首启重建、`search-index.db` 填充、代表检索与 app/file 计数一致、无 `SQLITE_BUSY`/WAL 风暴，以及 quiesce/restart 后 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 回退一致性。
- **SQLite writer 所有权仍只在搜索索引域被强制。** [#351](https://github.com/talex-touch/tuff/issues/351) 的守卫不覆盖下载、推荐、应用索引、分析、更新等可变域；先决定每域 owner 与合法入口，再将 admission、retry、transaction 和观测合同收敛到该 owner，并以真实锁竞争、恢复和关机测试验证。
- **用户目录中的普通名称仍可能被静默排除。** [#1727](https://github.com/talex-touch/tuff/issues/1727) 需要对用户根下 `tmp`、`cache`、`logs`、`build`、`out`、`bin` 作产品策略决定；无论选项如何，必须保留 `node_modules`、`target`、`dist` 深度排除并复测大目录边界。

## 安全门禁

- **强制 CSP 仍保留 `default-src *` 与 `connect-src *`。** [#689](https://github.com/talex-touch/tuff/issues/689) 的 `script-src` wildcard 和 `unsafe-inline` 已移除，但 report-only 策略尚未经过真实日常使用的日志验证；收集并审阅 `[csp-report-only]` 后才能提升候选策略。`unsafe-eval` 仍由预编译 widget 的字符串执行路径依赖，需独立迁移为模块加载，而非直接移除。
- **依赖安全处置的当前事实基线仍需维护。** [#483](https://github.com/talex-touch/tuff/issues/483) 已记录可达性和处置，但 GitHub Security Dashboard 的全 workspace 口径不同于 `pnpm audit --prod` 门禁。安全 owner 应重取 Dashboard、核对所有例外的到期处置，并避免用生产审计的数字替代 Dashboard 结论。

## 任务记录、文档与路线图

- **81 个活跃 Trellis 任务中，24 个缺少至少一项 `meta.nextAction`、`meta.blocker` 或 `meta.evidence`；其中一个陈旧 `in_progress` 记录三项全缺。** [#309](https://github.com/talex-touch/tuff/issues/309) 应先处理 TODO 第一 lane 的 OTA 规划任务，以及 2026-07-26 创建的本地安装记录：前者必须写明为何发布阻断 lane 未推进，后者必须补验收后归档或记录明确遗留动作。其余 planning 任务必须明确是被路线图阻塞、待人工输入，还是可执行的下一步。
- **CatalogService 与全仓治理审计的事实源收尾仍未完成。** [#1751](https://github.com/talex-touch/tuff/issues/1751) 要把 CatalogService 已完成/未完成边界写入 R8 PRD、执行计划、质量基线、changelog 和开发者文档；[#1752](https://github.com/talex-touch/tuff/issues/1752) 要让 454 条治理审计的 findings、filing ledger 与全部 PRD 验收逐项对账。全局 `TODO.md` 的暂停文字不能替代 task-local 证据。
- **工作区有未归属的在途实现与工具输出。** 当前有 4 个已修改、1 个新增 renderer 文件，以及 4 个 `.dsh-plugin-hub-*` 未跟踪目录/文件；在它们具备对应任务、验证和明确提交边界前，审计提交不得吸收或删除它们。
