# 维护审计：需处理项（2026-08-26）

仅记录本次复核后仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-25 审计](./maintenance-audit-2026-08-25.md) 作为当前问题索引，不建立第二套全局优先级。

## 发布与运行时门禁

- **截图能力不在发行构建合同内。** [#321](https://github.com/talex-touch/tuff/issues/321) 仍确认 release workflow 不构建、打包或加载校验 Rust screenshot addon；缺失时截图完全不可用。需先定“无截图发行包是否合格”的产品结论，推荐仅对 release 设硬门禁，然后以真实 tag 三平台产物证明。
- **OTA 多平台真机验收被 harness 拒绝。** [#326](https://github.com/talex-touch/tuff/issues/326) 的 validator 只接受 `darwin/arm64` runtime evidence，Windows/Linux 真机证据目前会被拒为 `static-only`。先泛化证据 schema 和 host-pair 验证，再安排 Windows/Linux N/N+1、恢复与 startup-health 实跑；macOS post-fix N/N+1 同样未闭环。

## 数据库、隐私与计费

- **“清理索引”仍有默认分库下的数据破坏路径。** [#1770](https://github.com/talex-touch/tuff/issues/1770) 记录 `cleanupFileIndex()` 从 primary 删除应用目录，却未清理 `search-index.db`。修复需按 split owner 路由并永久保留 `type='app'`；当前 open issue 已含真实数据库复现与验收条件。
- **默认启用的 search-index split 仍缺直接应用证据与安全回退。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 的隔离 profile 首启重建、两库计数/查询、无 `SQLITE_BUSY` 或 WAL 异常，以及 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 回退均未由真实 CoreApp run 证明。当前 writer guard 仅验证可见写法，不能替代运行证据。
- **遥测、隐私删除与 Credits 无原子可对账闭环。** 新建 [#1788](https://github.com/talex-touch/tuff/issues/1788) 归属：telemetry receipt/event/stats/governance 存在独立写入和假成功路径；隐私设置未形成采集/接收双门禁，删除没有最终到期处理；Credits 余额与 ledger 非原子且无业务幂等键。必须以 scoped idempotency、D1 atomic batch、真实分类 ACK 与可重放删除/扣费回归收敛。

## 安全与功能验收

- **CSP 收紧仍等待真实使用数据。** [#689](https://github.com/talex-touch/tuff/issues/689) 的 report-only 违规已可落入主进程日志；在插件 widget、Nexus、Sentry 等常用途径运行后检查 `[csp-report-only]`。无违规才将 `default-src`/`connect-src` 候选转为 enforcing；`unsafe-eval` 需先将预编译 widget 的字符串执行替换为模块加载，不能直接移除。
- **AI 权限与沙盒只完成 synthetic 合同，未完成真实闭环。** 新建 [#1789](https://github.com/talex-touch/tuff/issues/1789) 归属：隔离 profile 的真实 Provider 文本/流式调用、packaged Electron 的确认 UI 与 secure-store save/relaunch/delete 尚无脱敏运行证据。mock、typecheck 与本地 Nexus smoke 均不得替代。
- **五条 production High advisory 仍由到期 allowlist 放行。** [#1098](https://github.com/talex-touch/tuff/issues/1098) 当前 `check:prod-audit` 仍返回五条 `nuxt` High，allowlist 到 2026-11-09 失效。完成 unhead 2→3/Nuxt 迁移并重跑 production closure；allowlist 是期限门，不是风险消除。

## 文档、路线图与工作治理

- **文档质量门红，路线图无法作为绿色发布证据。** `mise run docs:verify` 当前有两条 `DOC-TASK-CHILDREN`，分别指向 `07-27-optimize-core-utility-plugins` 与 `08-05-search-audit-remediation` 的失效 child 引用。活跃任务 88 个中，31 个缺至少一个 `meta.nextAction`、`meta.blocker`、`meta.evidence`（26 planning、5 in_progress）；[#309](https://github.com/talex-touch/tuff/issues/309) 应修复 child 表达、归档真实完成项并补足保留任务的可执行状态。
- **Nexus 双语 API 文档持续漂移，parity gate 未接入 CI。** `pnpm -C apps/nexus check:doc-parity` 仍失败：`division-box` 缺 9 个英文 heading、`flow-transfer` 缺 5、`intelligence` 缺 1；[#1776](https://github.com/talex-touch/tuff/issues/1776) 需先按实现补齐文档，再以 blocking workflow 接入。
- **四组未归属 `.dsh-plugin-hub-*` 输出仍未有保留边界。** [#1785](https://github.com/talex-touch/tuff/issues/1785) 仍要求为 staging/install/config/root 四组输出指定生成任务、期限和验证方式，或由所有者移除。审计提交不得吸收或删除它们。

## 本次验证边界

`check-drizzle-snapshot-drift.mjs`、敏感数据清单、workflow 注入与第三方 Action pinning、插件 manifest 校验均通过，故不单列问题。`plugins:release:audit` 仍因脏源/构建工具拒绝生成 release-candidate 证据；它不是源码失败，但在工作树收敛前不能作为可发布的插件供应链证明。`check:audit-report-claims` 通过，说明本报告引用的现有任务路径均可解析。
