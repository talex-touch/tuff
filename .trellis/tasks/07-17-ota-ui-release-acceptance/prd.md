# 闭环 OTA UI 发布与验收

## Goal

以 authoritative `UpdateLifecycleSnapshot` 闭环设置页、诊断证据、manifest v2 rollback metadata 与 host/static-only 验收门禁；任何缺少 N/N-1 兼容证据的 release 自动降级为仅手动安装，不伪造跨平台 runtime pass。

## Requirements

### R1 — Lifecycle-only UI

- `useUpdateRuntime` 暴露单一 revision-guarded snapshot；设置页不得再用 DownloadCenter completion/appState booleans推断 lifecycle。
- available/downloading/verifying/ready/install-scheduled/handoff-started/awaiting-health/healthy/recovery-required/recovering/recovered/failed 均有准确状态、tone、动作门禁与诊断字段。
- ready 仅显示立即安装；normal-quit 开关遵循 attempt 的 `installOnNormalQuit`/rollback compatibility。Windows、macOS、Linux 分别使用启动安装器、重启更新、打开安装包文案。
- macOS native trust 仍为 `waived` 时，设置页与 evidence 显式显示风险，不得描述为 Developer ID/Gatekeeper pass。

### R2 — Manifest v2 rollback contract

- `UpdateReleaseManifest.schemaVersion=2`；release 必填 `rollbackFromVersion`（无 `v` 的同渠道 N-1 精确版本）与 `rollbackCompatible`。
- shared validator、CLI validator、release gates、workflow、CoreApp、Nexus metadata 使用同一字段；不得本地推断第二个 rollback target。
- shared/runtime 校验 rollback 版本非当前版本、早于当前版本且 channel 一致；发布 CLI 用 `--expected-rollback-from-version` 校验精确 N-1。

### R3 — Runtime compatibility enforcement

- lifecycle attempt 持久化 `rollbackCompatible`；manifest false 时 `installOnNormalQuit=false`、`recoveryAvailable=false`，仍允许用户明确立即安装。
- manifest true 只能由通过 N/N-1 evidence validator 的发布生成；缺失/失败 evidence 默认 false。
- normal quit 与 automatic previous recovery 必须同时受 attempt compatibility 限制，不能只依赖用户全局设置。

### R4 — Acceptance evidence

- acceptance evidence 固定覆盖 win32/x64、darwin/arm64、linux/x64；host pair 才能是 `host-runtime`，非 host 必须是 `static-only`。
- host-runtime 检查 discovery/download/integrity/normal-quit handoff/health/recovery/profile compatibility；static-only 只证明 manifest/asset/signature metadata，不冒充运行时。
- evidence 绑定 current/rollback version、pair、artifact 来源与 disposable/real profile scope；workspace dist、临时 profile 和生产 profile 结论不可混淆。

### R5 — 边界

- 本轮不生成 Apple Developer 凭据，不从 macOS 声称 Windows/Linux runtime pass，不发布真实 release。
- 不用恢复旧 profile 规避数据不兼容；兼容失败只关闭 normal-quit/automatic recovery。

## Acceptance Criteria

- [x] 设置页和诊断只读 authoritative snapshot，所有 lifecycle phase 与 action gating 有 focused tests（renderer 15 tests）。
- [x] 平台动作和 macOS waived 风险文案准确，packaged Settings smoke 显示 exact waiver 且未提前显示安装成功。
- [x] manifest v2 的 rollbackFromVersion/rollbackCompatible 从 generator 到 shared/CLI/remote gates/Nexus/CoreApp 单一传播。
- [x] attempt 持久化 rollbackCompatible；false release 不能 normal-quit handoff 或 automatic recovery，但可显式 install-now（main 79 tests）。
- [x] N/N-1 evidence gate 拒绝版本漂移、缺失步骤、伪 host runtime、static-only 冒充 pass 与临时 profile 冒充 real profile（release 97 tests）。
- [x] 本机 darwin/arm64 仅报告实际执行的 isolated packaged Settings/check smoke；win32/linux 保持 static-only。
- [x] utils/CoreApp/Nexus focused tests、node/web/Nexus typecheck、workflow/manifest validators 通过。

## Constraints

- SQLite 是 attempt/compatibility 真源；manifest 是发布输入，renderer/evidence 都是只读投影。
- `rollbackFromVersion` 由发布生成器解析同渠道 N-1；Nexus 与 Runtime 只消费，不重算。
- 当前 Apple native trust policy 继续为 `waived: apple-developer-not-configured`。
