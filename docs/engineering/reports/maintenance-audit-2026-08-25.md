# 维护审计：需处理项（2026-08-25）

仅记录本次复核后仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-22 审计](./maintenance-audit-2026-08-22.md) 作为当前问题索引，不建立第二套全局优先级。

## 发布与运行时门禁

- **截图功能不在发行构建合同内。** [#321](https://github.com/talex-touch/tuff/issues/321) 仍确认 release workflow 不安装 Rust、不构建 `tuff_native_screenshot.node`，且 release preflight/afterPack 不要求它；缺模块会让用户侧截图完全不可用，而不是有软件回退。先由产品在 #321 选择“发行包缺截图是否允许”——建议仅对 release 采用硬门禁——再用一次真实 tag 发布证明三平台打包产物可加载模块。
- **OTA 的跨平台真机验收仍被 harness 本身阻断。** [#326](https://github.com/talex-touch/tuff/issues/326) 的 validator 只接受 `darwin/arm64` runtime evidence，Windows/Linux 的真实证据会被判为 `static-only`；同时 macOS post-fix 官方 N/N+1 health-ack 也未完成。先扩展证据 schema 与 host-pair 验证，再预约各平台 N/N+1、恢复与 startup-health 实跑；不要把现有静态 CI 当运行通过。

## 数据库、隐私与计费

- **默认分库下“清理索引”有已复现的数据破坏路径。** [#1770](https://github.com/talex-touch/tuff/issues/1770) 表明 `cleanupFileIndex()` 会从 primary `files` 删除应用目录，却不清理 `search-index.db`；修复必须按 split owner 路由、永久保留 `type='app'`，并用真实双库回归验证。
- **默认启用的 search-index split 仍缺应用级证据和安全回退。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 未证明隔离 profile 的首启重建、两库查询/计数、无 busy/WAL 异常及 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 一致回退。未验证 writer 必须继续视为发布阻断，不得从类型检查推断。
- **遥测、隐私删除和 Credits 仍不能安全宣称端到端完成。** 当前数据验收已确认 telemetry receipt 不幂等且写入非原子、隐私开关未进入采集/接收双门禁、删除缺最终到期处理、Credits 余额与 ledger 分三次写入。该项尚无专属 GitHub owner；由 [#959](https://github.com/talex-touch/tuff/issues/959) 先完成归属，随后以 D1 原子批和业务幂等键落地，禁止以 local/mock 或成功 ACK 掩盖丢写。
- **生产依赖门禁允许五条 High 风险暂存到 2026-11-09。** 本次 `check:prod-audit` 仍显示 5 条 allowlisted High advisory；[#1098](https://github.com/talex-touch/tuff/issues/1098) 说明根因是 `unhead` 2→3 迁移阻塞 `nuxt@4.4.8`。在到期前完成 Nexus 的兼容迁移并重跑 production closure；allowlist 是到期失败门，不是风险消除。

## 安全与人工证据

- **CSP 收紧仍等待真实使用证据。** [#689](https://github.com/talex-touch/tuff/issues/689) 已移除 `script-src *` 与 `unsafe-inline`，但 enforcing policy 的 `default-src`、`connect-src` 仍为通配符；report-only 违规日志已能进主进程。人工以插件 widget、Nexus、Sentry 等日常路径运行应用并检查 `[csp-report-only]`：无违规才提升候选策略；有违规则按 directive/origin 收敛。`unsafe-eval` 另需替换预编译 widget 的字符串执行模型，不能直接删指令。

## 文档、路线图与工作治理

- **文档质量门当前失败。** `mise run docs:verify` 报两条 `DOC-TASK-CHILDREN`：两个活跃 parent/child 关系无法按 verifier 的路径约定解析。先统一 Trellis child 表达与 verifier，再恢复 docs gate。归属 [#309](https://github.com/talex-touch/tuff/issues/309)。
- **Nexus 双语 API 文档仍漂移，且 parity gate 未接入 CI。** `pnpm -C apps/nexus check:doc-parity` 当前失败：`division-box`（21/12 标题）、`flow-transfer`（14/9）、`intelligence`（20/19）。先补齐英文标题并将该检查接入 blocking workflow；不要以 `continue-on-error` 放行。归属 [#1776](https://github.com/talex-touch/tuff/issues/1776)。
- **活跃 Trellis 树仍不能作为可靠的执行看板。** 本次扫到至少 19 个活跃 `task.json` 为空 `meta`；其中一条已全部勾选验收的 legacy beta.23 安装任务仍标记 `in_progress`，另有 2026-08-23 的发布、AI、数据和产品验收任务均无 machine-readable blocker/nextAction/evidence。先归档真实完成项，并为保留任务写入准确状态、下一动作、阻塞与证据；归属 [#309](https://github.com/talex-touch/tuff/issues/309)。
- **四组未跟踪 `.dsh-plugin-hub-*` 生成物仍无归属。** 当前工作树保留两个目录和两个文件；审计提交不得吸收或删除它们。生成者应给出任务、保留期限和验证边界，或由所有者清理；归属 [#1785](https://github.com/talex-touch/tuff/issues/1785)。

## 本次验证边界

`check-drizzle-snapshot-drift.mjs` 无 drift；本报告不把它列为问题。工作区另有 146 个修改文件和 25 个未跟踪项，属于并发在途批次；本次仅提交本报告与路线图指针，未吸收任何在途代码或生成物。
