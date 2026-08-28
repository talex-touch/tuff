# 维护审计：需处理项（2026-08-28）

仅记录本次重新核验后仍需动作的问题。任务状态、负责人和验收证据以 Trellis 活跃任务树为准；本报告取代 [2026-08-27 审计](./maintenance-audit-2026-08-27.md) 作为当前问题索引，不建立第二套全局优先级。

## 数据库与数据完整性

- **新的手写迁移再次扩大了 Drizzle 快照缺口。** `node scripts/check-drizzle-snapshot-drift.mjs` 当前以退出码 1 失败：journal 已有 42 项、snapshot 14 项，缺口从受控的 27 扩大为 28，新增未覆盖的是 `0041`。这会继续把 `db:generate` 的差异基线推离实际 schema；需为该迁移补齐正确 snapshot，或由迁移历史 owner 重新设定并说明棘轮基线。此前的 [#1303](https://github.com/talex-touch/tuff/issues/1303) 已关闭，必须重开或建立继任 issue，不能把失败的棘轮当作既有债务。
- **默认开启的 search-index split 仍缺真实运行与回滚证据。** [#1748](https://github.com/talex-touch/tuff/issues/1748) 仍要求同一 disposable profile 的 default-on 首启/索引/查询/健康证据，以及 quiesce 后以 `TUFF_DB_SEARCH_SPLIT_ENABLED=0` 重启的 parity 证据。静态拓扑检查不能代替这两次 CoreApp 运行；在证据附加前仍是 release blocker。
- **遥测、隐私删除与 Credits 的原子幂等闭环仍未完成。** [#1788](https://github.com/talex-touch/tuff/issues/1788) 需要将可复核的 acceptance 工件纳入版本控制，或将 issue 的本机任务引用改为仓库内 `file:line` 证据；随后以 D1 原子写、幂等 receipt、双端隐私门与最终删除 worker 的真实环境证据关闭。当前 issue 指向未提交任务路径，外部协作者无法验证该依据。

## 发布、安全与功能门禁

- **正式发行包是否必须包含截图 native addon 仍未决。** [#321](https://github.com/talex-touch/tuff/issues/321) 确认 release workflow 不构建、不强制检查 Cargo screenshot addon；用户侧没有软件截图 fallback。需作出 A/B/C 产品决定；推荐 B：release-only 构建并硬要求模块存在，再以真实 tag 三平台产物验证。
- **OTA 的 Windows/Linux 真机证据仍被验收 harness 的 macOS-only 分支拒绝。** [#326](https://github.com/talex-touch/tuff/issues/326) 需先泛化 runtime evidence schema 与 host-pair 校验，再安排 Windows/Linux N/N+1 实跑；否则产物会被 validator 拒绝。macOS 官方 N/N+1 health acknowledgement 也未闭环。
- **生产依赖安全门仍有五条 Nuxt High allowlist，2026-11-09 到期。** [#1098](https://github.com/talex-touch/tuff/issues/1098) 仍由 `unhead` 2→3 迁移阻塞；同时 `^4.4.8` 允许 `@nuxt/kit` 单独前移，已观测到 family skew。迁移前应将 Nuxt family 约束收紧为一致版本并复查当前上游兼容目标；allowlist 到期会令 prod-audit 直接失败。

## 文档、路线图与工作治理

- **全库文档验证当前为红色。** `node scripts/docs/verify-docs.mjs` 以退出码 1 报两条 `DOC-TASK-CHILDREN`：两个已在工作区出现、但尚未 Git 跟踪的 child task 被父 task 引用。将 child task 提交为受控工件，或在父项移除无效引用；在此之前不能把 `docs:verify` 作为绿色发布证据。此治理边界由 [#309](https://github.com/talex-touch/tuff/issues/309) 追踪。
- **Nexus 文档 parity 已恢复，但 bundle analysis gate 仍未接入 CI。** `pnpm -C apps/nexus check:doc-parity` 当前通过；[#1776](https://github.com/talex-touch/tuff/issues/1776) 的剩余项是 `build:analyze-worker`。先解决 gzip/chunk budget 与 `i-carbon-fingerprint-recognition` 两个 guard 的矛盾，再将其设为 blocking；不得用 `continue-on-error` 掩盖。
- **工作树仍混有大量并行未提交变更，当前无法生成可信的 source-based plugin release audit。** 当前分支有 293 项未提交路径，其中包含插件、发布 workflow、CoreApp、Nexus 与新 task 工件。审计提交只会纳入本报告与路线图指针；各变更所有者必须分别完成 task 边界、验证与提交，不能把共享工作树的脏状态解释成 release evidence。

## 本次验证边界

本次实际失败：Drizzle snapshot 棘轮与全库 `docs:verify`。本次实际通过：已发布 audit claim/flag 校验、外围文档链接审计，以及 Nexus 中英文 API parity。未将任何本机成功结果外推为 packaged、跨平台或 Production 证据。
