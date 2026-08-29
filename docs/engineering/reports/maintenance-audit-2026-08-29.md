# 维护审计：需处理项（2026-08-29）

仅记录本次重新核验后仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-28 审计](./maintenance-audit-2026-08-28.md) 作为当前问题索引，不建立第二套全局优先级。

## 数据库与数据完整性

- **新的手写迁移再次扩大了 Drizzle 快照缺口。** `node scripts/check-drizzle-snapshot-drift.mjs` 以退出码 1 失败：42 个 journal 项、14 个 snapshot，缺口从记录值 27 增至 28；新增未覆盖项为 `0041_ai_orchestrator_run_retention`。该 SQL 为 `ai_orchestrator_runs` 终态记录新建 partial retention index，却未随迁移推进 snapshot，`db:generate` 的差异基线再次偏离实际 schema。已关闭的 [#1303](https://github.com/talex-touch/tuff/issues/1303) 必须重开或建立继任 issue，再补正确 snapshot 或明确调整棘轮基线；不能将失败棘轮视为既有债务。
- **默认开启的 search-index split 仍缺真实运行与回滚证据。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 仍要求同一 disposable profile 的 default-on 首启/索引/查询/健康证据，以及 quiesce 后以 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 重启的 parity 证据。静态拓扑检查不能代替两次 CoreApp 运行；证据附加前仍是 release blocker。
- **遥测、隐私删除与 Credits 的原子幂等闭环仍未完成。** [#1788](https://github.com/talex-touch/tuff/issues/1788) 需要 D1 原子写、业务幂等 receipt、收集和接收双端隐私门及最终删除 worker 的真实环境证据。AI 验收任务也明确 durable orchestrator 的 user-content 仍缺 typed privacy delete/自动 retention；不得把当前 partial evidence 归档为完成。

## 发布、安全与功能门禁

- **正式发行包是否必须包含截图 native addon 仍未决。** [#321](https://github.com/talex-touch/tuff/issues/321) 所述 release workflow 仍未构建或强制检查 Cargo screenshot addon，且无软件截图 fallback。应作出产品决策；推荐 release-only 构建并硬要求模块存在，再以真实 tag 三平台产物验证。
- **OTA 的跨平台真机验收仍未闭环。** [#326](https://github.com/talex-touch/tuff/issues/326) 要先泛化 runtime-evidence schema/host-pair 校验，再采集 Windows/Linux N/N+1；macOS 官方 post-fix N/N+1 health acknowledgement 也尚未完成。当前 `08-23-release-cicd-ota-acceptance` 的 AC5–AC8 仍是 partial/blocked，不能发布为已验证。
- **生产依赖安全门仍依赖将于 2026-11-09 到期的 Nuxt High allowlist。** [#1098](https://github.com/talex-touch/tuff/issues/1098) 的 `unhead` 2→3 迁移未完成；到期会令 prod-audit 直接失败。迁移前先固定并复查 Nuxt family 的兼容目标，不能继续以 allowlist 代替修复。
- **默认分支仍有 34 个 Dependabot 告警。** GitHub push 回执报告 6 high、21 moderate、7 low；这些告警由 [#483](https://github.com/talex-touch/tuff/issues/483) 统一完成 reachability 与发布影响归类，不能只依赖 Nuxt allowlist 项作为全量依赖安全结论。
- **Renderer CSP 仍为 report-only。** [#689](https://github.com/talex-touch/tuff/issues/689) 要先对 widget、Nexus、Sentry 等真实路径处理违规，再收紧 `default-src`/`connect-src`；字符串执行尚在时不可直接移除 `unsafe-eval`。

## 文档、路线图与工作治理

- **全库 docs verifier 当前为红色，且四个进行中任务缺少可执行元数据。** `node scripts/docs/verify-docs.mjs` 以退出码 1 报 12 项 `DOC-TASK-META`：`08-22-08-22-broaden-corebox-recommendations`、`08-22-autopaste-plugin-beta-e2e`、`08-23-release-cicd-ota-acceptance`、`08-27-nexus-docs-body-ssg` 的 `meta.nextAction`、`meta.blocker`、`meta.evidence` 均为空。每项需补真实下一步、阻塞边界与证据；统一由 [#309](https://github.com/talex-touch/tuff/issues/309) 收敛。
- **本机无法启动 canonical `mise run docs:verify`，Corepack 缺失 pinned pnpm 10.34.4。** 直接 verifier 已确认上述真实 task-metadata 错误；恢复该工具链后仍须重跑完整命令，不能把工具链失败误报为 docs gate 结果。
- **插件 source-package release-candidate 记录已过时且为失败态。** `.trellis/tasks/07-18-plugin-source-package-audit/evidence/source-package-audit.json` 记录于 2026-08-27，绑定旧 revision 并因当时 dirty source 失败；当前受控工作树干净，但本机同样缺 pinned pnpm/`tsx` 运行时，尚不能重生成可信 clean-source receipt。工具链恢复后重跑 `plugins:release:audit`，不要沿用旧失败工件。
- **Nexus 中英文 API parity 已通过，但 worker bundle gate 仍不能进入 CI。** 直接运行 `node build/check-doc-translation-parity.mjs` 已通过；[#1776](https://github.com/talex-touch/tuff/issues/1776) 剩余的 `build:analyze-worker` 仍需先解决 gzip/chunk budget 与 `i-carbon-fingerprint-recognition` guard 矛盾，再作为 blocking gate 接入，不能使用 `continue-on-error`。

## 本次验证边界

本次实际失败：Drizzle snapshot 棘轮、直接 docs verifier，以及 Corepack 启动的 canonical docs gate。实际通过：现有 maintenance-audit task/flag claims、README/manifest metadata 与 Nexus API 文档 parity。未将任何本机结果外推为 packaged、跨平台或 Production 证据。
