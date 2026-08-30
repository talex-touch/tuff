# 维护审计：需处理项（2026-08-30）

仅记录本次重新核验后仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-29 审计](./maintenance-audit-2026-08-29.md) 作为当前问题索引，不建立第二套全局优先级。

## 数据库与数据完整性

- **手写迁移再次扩大了 Drizzle 快照缺口。** `node scripts/check-drizzle-snapshot-drift.mjs` 以退出码 1 失败：42 个 journal 项、14 个 snapshot，缺口从记录值 27 增至 28；新增未覆盖 `0041_ai_orchestrator_run_retention`。该迁移为 `ai_orchestrator_runs` 终态记录增加 retention index，却未推进 snapshot，`db:generate` 的差异基线继续偏离实际 schema。已关闭的 [#1303](https://github.com/talex-touch/tuff/issues/1303) 不再覆盖该回归；需重开或建立继任 owner，并补正确 snapshot 或明确重新设定棘轮基线。
- **默认开启的 search-index split 仍缺真实运行和回滚证据。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 要求同一 disposable profile 的 default-on 首启/索引/查询/健康证据，以及 quiesce 后以 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 重启的 parity 证据。`#1770` 的数据删除缺陷虽已修复，但尚不能替代该两次 CoreApp 实跑；在证据附加前仍是 release blocker。
- **遥测、隐私删除与 Credits 的原子幂等闭环仍不完整。** [#1788](https://github.com/talex-touch/tuff/issues/1788) 的本地合同已有进展，但仍缺完整 D1 atomic ingest、receipt retention、全量 privacy export/delete/finalization，以及 Preview/Production 的可复核证据。该 issue 目前引用未推送的本地任务路径；应改为已提交的证据或仓库内 `file:line` 锚点，避免外部协作者无法验证前提。

## 发布、安全与功能门禁

- **正式发行包是否必须包含截图 native addon 仍未决。** [#321](https://github.com/talex-touch/tuff/issues/321) 确认 release workflow 既不构建 Cargo screenshot addon，也不在 release preflight/afterPack 强制要求它；运行时没有软件截图 fallback。需作出 A/B/C 产品决策；基于「缺失即全部截图功能不可用」的已证实事实，建议选择 B：release-only 构建并硬要求模块存在，再用真实 tag 三平台产物验证。
- **OTA 的 Windows/Linux 真机验收先被 harness 自身阻断。** [#326](https://github.com/talex-touch/tuff/issues/326) 的 validator 仍把非 `darwin/arm64` runtime evidence 拒绝为 `static-only`。先泛化 evidence schema 与 host-pair 校验，再安排 Windows/Linux N/N+1；否则会生产必然被拒的证据。macOS 官方 post-fix N/N+1 health acknowledgement 也尚未闭环。
- **Renderer CSP 仍停在 report-only 收集阶段。** [#689](https://github.com/talex-touch/tuff/issues/689) 已收紧 `script-src` 并移除 inline script，但 `default-src`/`connect-src` 的强制策略仍待真实日常使用中收集的 `[csp-report-only]` 日志；`unsafe-eval` 仍受 widget 字符串执行依赖。需人工运行覆盖 widget、Nexus、Sentry 后，根据日志提升候选策略或补白名单；不能把 report-only 当作已强制。
- **生产依赖门虽然当前通过，但仍有五项 High 临时豁免。** `node scripts/check-prod-audit.mjs` 显示 5 个 Critical/High 均被 allowlist，另有 17 Moderate、5 Low；[ #1098 ](https://github.com/talex-touch/tuff/issues/1098) 的五项 `nuxt` High 豁免于 2026-11-09 到期。`unhead` 2→3 / Nuxt family 迁移须在到期前完成，并避免 caret 引入 Nuxt family 版本偏斜。
- **Issue 自动关闭防护没有覆盖 squash commit 正文。** [#1792](https://github.com/talex-touch/tuff/issues/1792) 已实证一个解释性提交正文意外关闭 #1748；现有 guard 只检查 PR body。应在合并前扫描 constituent commit bodies，并用该事故的引用文本做负向回归。

## 文档、路线图与工作治理

- **全库文档 gate 为红色，四项进行中任务缺可执行元数据。** `node scripts/docs/verify-docs.mjs` 报 12 项 `DOC-TASK-META`：`08-22-08-22-broaden-corebox-recommendations`、`08-22-autopaste-plugin-beta-e2e`、`08-23-release-cicd-ota-acceptance`、`08-27-nexus-docs-body-ssg` 的 `meta.nextAction`、`meta.blocker`、`meta.evidence` 均为空。由 [#309](https://github.com/talex-touch/tuff/issues/309) 统一补充真实下一步、阻塞边界与可核验证据；不可用占位文本骗过 gate。
- **canonical `mise run docs:verify` 无法启动。** Corepack 缓存缺少 pinned pnpm 10.34.4，命令在运行 verifier 前失败。直接 verifier 已证明上述真实元数据错误；恢复工具链后必须重跑 canonical gate，不能将启动错误标为 docs 通过。
- **Nexus worker bundle 分析 gate 仍未接入 CI。** [#1776](https://github.com/talex-touch/tuff/issues/1776) 的 `build:analyze-worker` 仍需先解决 gzip/chunk budget 与 `i-carbon-fingerprint-recognition` 规则和测试的矛盾，再作为 blocking gate 接入；禁止以 `continue-on-error` 隐藏红灯。
- **插件 source-package release-candidate 收据已过期且失败。** `.trellis/tasks/07-18-plugin-source-package-audit/evidence/source-package-audit.json` 固定在 2026-08-27 的 dirty source revision，并明确为 `failed`。当前工作区已干净，但仍需在恢复 pinned pnpm/`tsx` 后重新生成 clean-source receipt；不得复用该旧失败工件作为发布证据。

## 本次验证边界

实际失败：Drizzle snapshot 棘轮、直接 docs verifier、以及 Corepack 启动的 canonical docs gate。生产依赖门在其五条带到期时间的 High allowlist 下通过；Nexus 中英文文档 parity、审计报告 claim 校验和外围文档链接均通过。未将本机结果外推为 packaged、跨平台或 Production 证据。
