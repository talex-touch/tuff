# Transport Legacy Cutover Evidence

## Goal

对 CoreBox、Auth/Account、Sync、Terminal、Opener 共 71 个 legacy aliases 执行 clean hard-cut：迁移全部仓库内 producer/consumer，删除 raw alias exports 与双监听，同时产出可复跑、可严格校验且不伪造线上零命中的 `legacy-alias-evidence/v1`。

## Confirmed Facts

- 当前 alias inventory：CoreBox 40、Auth/Account 18、Sync 3、Terminal 5、Opener 5。
- CoreBox canonical events 已迁到 typed builder，但 `CoreBoxRetainedEvents.legacy` 仍被 main/renderer/plugin SDK 多处发送或监听。
- Auth、Sync、Terminal 使用 `withLegacyAliasTelemetry` 双监听；Opener 直接双发/双监听且没有 telemetry；Terminal data/exit 仍双发。
- 当前 telemetry 仅证明 alias hit 可上报，不提供本机可验证的生产观察窗口；不得把“未采集”写成 `0 hits`。
- 用户本轮明确要求 hard-cut，可作为 operator decision；静态 source inventory 与 focused regression 仍必须全通过。

## Requirements

### Alias hard-cut

- CoreBox、Auth/Account、Sync、Terminal、Opener 的所有生产 producer、listener、export、aggregate entry 必须迁到 canonical typed events。
- 删除 `CoreBoxRetainedEvents`、各 event family 的 `legacy` property、legacy telemetry wrapper 与永久去重逻辑。
- 不保留 deprecated alias、re-export、raw resolver、fallback listener 或 silent translation。
- canonical handler 只注册一次；canonical main→renderer/plugin event 只发送一次。

### Tombstone registry

- 保留 data-only removed-alias tombstones：family、legacy event、canonical event、direction、source owner、removed version。
- registry 不能构造 `TuffEvent`、注册 listener 或解析旧名字，只用于 audit/evidence 防回归。
- legacy event string 在生产代码中只允许出现在 tombstone registry、evidence tooling 与明确的 test/fixture negative assertions。

### Legacy hit evidence

- 产出 `legacy-alias-evidence/v1`，逐 alias 记录 canonical mapping、生产 source hits、test/fixture hits、runtime observation 状态、operator decision 与 gate result。
- source scan 必须区分 producer/listener/export 与文档/测试字符串，输出可定位的相对路径与行号。
- runtime observation 只接受聚合元数据；当前没有真实 export 时写 `status: not-collected`，禁止写 `hitCount: 0`。
- evidence 不得包含 payload、用户输入、路径内容、token、设备 ID 或其它隐私；仓库相对 source anchor 除外。

### 双监听关闭门禁

- strict gate 同时要求：71/71 tombstone coverage；canonical mapping 唯一；生产 alias producer/listener/export 为 0；focused canonical regressions 通过；operator decision 为 `explicit-hard-cut`；evidence schema 完整。
- 任一条件失败时 verifier 非零退出；不得以 warning 代替 hard-cut gate failure。
- gate 通过后代码中不再存在双监听；关闭条件成为 verifier contract，而不是 runtime feature flag。

## Non-goals

- 不恢复兼容窗口或按 alias 个别豁免。
- 不声称本地 evidence 等同生产 telemetry、真实用户覆盖或 release cohort 观测。
- 不处理 Widget Sandbox、配置 SQLite 或插件发布供应链。

## Acceptance Criteria

- [x] 71/71 aliases 均进入 tombstone registry，canonical mapping 无重复/缺失。
- [x] 生产代码中 legacy family export、producer、listener、telemetry wrapper 与 `CoreBoxRetainedEvents` 为零。
- [x] CoreBox/Auth/Account/Sync/Terminal/Opener focused regressions只观察 canonical event，且无重复 handler/delivery。
- [x] evidence builder 生成 `legacy-alias-evidence/v1`；严格 verifier 对 production hit、缺失 mapping、缺失 decision、不完整 coverage 与 payload-like 字段均失败。
- [x] 当前 evidence 明确记录 runtime observation `not-collected` 和 `explicit-hard-cut` operator decision，不伪造零命中。
- [x] scoped lint、Utils/CoreApp focused tests、CoreApp web typecheck、plugin preload smoke 与应用启动 smoke 通过；node typecheck不得新增本切片错误。

## Rollback

- hard-cut 只能按完整 family 回退，并同时恢复该 family 的 alias definitions、producer/listener、telemetry 与 evidence decision；禁止恢复单个 listener。
- tombstone registry/evidence verifier 继续保留，防止回滚后出现未登记 alias。
