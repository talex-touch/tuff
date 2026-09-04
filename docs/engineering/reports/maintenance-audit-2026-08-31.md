# 维护审计：需处理项（2026-08-31）

仅记录本次重新核验后仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-30 审计](./maintenance-audit-2026-08-30.md) 作为当前问题索引，不建立第二套全局优先级。

## 数据库与数据完整性

- **默认开启的 search-index split 仍缺真实运行与回滚证据。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 仍要求同一 disposable profile 的 default-on 首启、索引、查询、健康证据，以及 quiesce 后以 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 重启的 parity 证据。静态拓扑检查和已合并的文件索引清理修复不能代替两次 CoreApp 运行；在证据附加前仍是 release blocker。
- **遥测、隐私删除与 Credits 的原子幂等闭环仍未完成，且其公共 owner 引用了不可复核的本地任务路径。** [#1788](https://github.com/talex-touch/tuff/issues/1788) 仍需 D1 原子写、业务幂等 receipt、收集和接收双端隐私门、最终删除 worker 及 Preview/Production 证据；先将 issue 的依据改为已提交的 `file:line` 锚点或提交相应任务材料，避免外部协作者无法核验问题前提。

## 发布、安全与功能门禁

- **正式发行包是否必须包含截图 native addon 仍未决。** [#321](https://github.com/talex-touch/tuff/issues/321) 确认 release workflow 仍未构建或强制检查 Cargo screenshot addon；缺失时用户侧没有截图能力，而非可用的软件 fallback。需要产品选择；建议只对 release 构建 Cargo addon 并硬要求模块存在，再以真实 tag 三平台产物验证。
- **OTA 的 Windows/Linux 真实运行证据当前会被验收 harness 拒绝。** [#326](https://github.com/talex-touch/tuff/issues/326) 的通用 host-match 逻辑已存在，但仍有 `darwin/arm64` 硬编码，导致 Windows/Linux runtime evidence 必然被标为 `static-only`。先泛化 schema 和 host-pair 校验，再采集三平台 N/N+1 证据；否则预订真机不会产出可接受的门禁材料。
- **生产依赖门当前通过，但依赖五项将于 2026-11-09 到期的 Nuxt High allowlist。** [#1098](https://github.com/talex-touch/tuff/issues/1098) 仍须完成 `unhead` 2→3 / Nuxt family 迁移；到期后 prod-audit 会直接失败。迁移前固定并复查 Nuxt family 的兼容目标，避免 caret 造成 family 版本偏斜。
- **Renderer CSP 收紧仍停在 report-only，需人工真实使用收集结果。** [#689](https://github.com/talex-touch/tuff/issues/689) 的候选策略尚未提升为 enforcing；需要覆盖 widget、Nexus 与 Sentry 的运行日志后按实际违规收紧 `default-src`/`connect-src`。`unsafe-eval` 仍由 widget 字符串执行依赖，不能直接删除。
- **issue 自动关闭防护未检查 squash 将使用的提交正文。** [#1792](https://github.com/talex-touch/tuff/issues/1792) 的当前 workflow 只将 PR body 传给 guard；本次复核未发现 constituent commit bodies 的扫描。应在合并前检查 `base..head` 的提交正文，并以误关 #1748 的引用文本做负向回归。

## 文档、路线图与工作治理

- **插件 source-package release-candidate 收据过时且失败。** 现有 receipt 生成于 2026-08-27，绑定 dirty revision 并明确为 `failed`；当前工作树干净，需重新运行 `plugins:release:audit` 生成 clean-source receipt，不得将旧工件作为发布证据。
- **Nexus worker bundle 分析 gate 仍未接入 CI。** [#1776](https://github.com/talex-touch/tuff/issues/1776) 的 `build:analyze-worker` 仍受 gzip/chunk budget 与 `i-carbon-fingerprint-recognition` guard 矛盾阻挡。先确认真实预算目标、删除或修正过时 icon budget，再把 gate 作为 blocking CI step 接入；不能以 `continue-on-error` 隐藏红灯。
- **活跃任务树仍含待收口和无行动元数据的记录。** 两个 `in_progress` skeleton 任务已写明全部 PRD 验收勾选但尚未归档；另有六个 P0/P1 planning 任务（含数据/计费验收）缺 `nextAction`、`blocker` 与 `evidence`。由 [#309](https://github.com/talex-touch/tuff/issues/309) 统一将已完成项归档，并为未启动的高优先级项写明可验证的阻塞边界或下一步，避免 roadmap 只表达优先级而不表达可执行状态。

## 本次验证边界

`node scripts/check-drizzle-snapshot-drift.mjs`、`mise run docs:verify`、直接 docs verifier、生产依赖审计及其 self-test、closing-keyword self-test、audit-claim self-test 均通过；因此未延续 2026-08-30 的 Drizzle 快照、文档 verifier、Corepack 启动失败或任务 metadata 红灯。工作树无生成文件漂移。本机结果未外推为 packaged、跨平台或 Production 运行证据。
