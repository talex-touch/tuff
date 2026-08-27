# 维护审计：需处理项（2026-08-27）

仅记录本次复核后仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-26 审计](./maintenance-audit-2026-08-26.md) 作为当前问题索引，不建立第二套全局优先级。

## 发布与运行时门禁

- **截图会在正式发行包中整体失效，发布是否允许缺失该能力尚未决策。** [#321](https://github.com/talex-touch/tuff/issues/321) 确认 Cargo screenshot addon 仅由协议 CI 构建；release workflow 不安装 Rust、不构建、不在 preflight/afterPack 要求该模块。运行时没有软件截图后备，缺失即为用户功能不可用。需由产品在 #321 的 A/B/C 中明确选择；推荐 B：release-only 构建并硬要求模块存在，再以真实 tag 三平台产物验证。
- **OTA 的 Windows/Linux 真机证据当前会被验收 harness 拒绝。** [#326](https://github.com/talex-touch/tuff/issues/326) 的 validator 将非 `darwin/arm64` 运行证据强制为 `static-only`，因此先要泛化证据 schema 与 host-pair 校验；否则安排 Windows/Linux N/N+1 实跑只会生成被拒绝的证据。官方 macOS N/N+1 health-ack、生产 Nexus 同源签名下载投影也仍未闭环。

## 数据库、隐私与计费

- **“清理索引”仍可删除主库中全部应用目录，却没有清理实际 file index。** [#1770](https://github.com/talex-touch/tuff/issues/1770) 已对真实隔离数据库复现：默认 split 开启时，Settings 操作从 primary `database.db` 无条件删表，造成 229 个 app 行消失，而 `search-index.db` 的目标索引未触及。先修 split owner 路由、永久排除 `type='app'`，并让 writer guard 和 split-on 回归能重新抓到该路径。
- **默认开启的 search-index split 缺端到端运行和回滚证据。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 尚未记录同一隔离 profile 的首启重建、两库拓扑/查询结果、无 WAL/`SQLITE_BUSY` 异常及 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` quiesce/restart parity。静态 writer 检查不覆盖 #1770 所示的参数化删除路径，不能作为 release closure。
- **遥测、隐私删除和 Credits 存在可重复的假成功/部分扣账路径。** [#1788](https://github.com/talex-touch/tuff/issues/1788) 归属的验收任务确认：服务端忽略幂等键、必要写入分别提交且 D1 不可用仍可能 ACK；隐私开关未进入收集与接收双门；Credits 余额/ledger 不是一个原子、有业务幂等键的操作。必须以 scoped receipt、D1 atomic batch、准确 ACK、双端隐私门和最终删除 worker 收敛，不能用 local/mock 证据关闭。

## 安全与功能验收

- **Renderer CSP 仍处于 report-only 观察态。** [#689](https://github.com/talex-touch/tuff/issues/689) 需要在 widget、Nexus、Sentry 等常用路径收集并处置违规后，才能收紧 `default-src`/`connect-src`；`unsafe-eval` 也不能在字符串执行仍存在时直接移除。
- **生产依赖安全门仍由即将到期的 allowlist 维持。** [#1098](https://github.com/talex-touch/tuff/issues/1098) 中五个 `nuxt` High 条目均在 2026-11-09 到期；根因是 `unhead` 2→3 迁移未完成。到期会令 prod-audit 直接失败，不是风险已消除。迁移前先重新确认上游 Nuxt/Unhead 目标版本。

## 文档、路线图与工作治理

- **Trellis 活跃任务树当前不可作为可执行计划。** [#309](https://github.com/talex-touch/tuff/issues/309) 的本轮读取得到 88 个 active task，所有 task.json 的 `meta` 为空；`nextAction`、`blocker`、`evidence` 均不可机读。先收敛已经完成的工作到 archive，并为每个保留任务写明下一步、阻塞原因和可核验证据；全局 TODO 只保留排序，不承载易变状态。
- **Nexus 中英文 API 文档已经漂移，且 gate 仍未接入 CI。** [#1776](https://github.com/talex-touch/tuff/issues/1776) 的 `check:doc-parity` 本轮失败：`division-box` 少 9 个英文 heading、`flow-transfer` 少 5、`intelligence` 少 1。先按实现补齐三组英文 API 文档并使 check 变绿，再接入 blocking CI；不接受 `continue-on-error`。
- **全库文档质量门仍为红色。** `scripts/docs/verify-docs.mjs` 本轮报出两条 `DOC-TASK-CHILDREN`，分别来自 `07-27-optimize-core-utility-plugins` 和 `08-05-search-audit-remediation` 的未提交 child 引用。二者均由 [#309](https://github.com/talex-touch/tuff/issues/309) 统一收敛；在 child task 真正受控或父项移除失效引用前，路线图不能当作绿色发布证据。
- **四组 `.dsh-plugin-hub-*` 未跟踪生成物仍无所有者或保留边界。** [#1785](https://github.com/talex-touch/tuff/issues/1785) 所列 staging、install、config dump 和 root HTML 全部仍在工作区。它们同时阻断干净 source-based plugin release-audit；必须由生成者归属到任务/可重复流程，或由其所有者删除，审计提交不得吸收。

## 本次验证边界

Drizzle snapshot drift、已发布审计的 task/flag claims 与外围文档链接均通过。全库 docs verifier 仍因上述两条 `DOC-TASK-CHILDREN` 失败；`mise run docs:verify` 另因本机 Corepack 缓存中缺失 pinned pnpm 10.34.4 而无法启动，恢复工具链后仍必须先解决这两条真实文档错误。Nexus parity 失败如上；plugin release-audit 因工作树非干净而拒绝产生 release-candidate 证据。
