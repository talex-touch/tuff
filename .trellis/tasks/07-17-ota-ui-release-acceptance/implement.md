# 实施计划：OTA UI、Manifest v2 与验收

## 1. Shared foundation

1. manifest schema v2 + rollback validation/comparison helpers。
2. lifecycle snapshot/reducer/repository 新增 rollbackCompatible，migration 旧行默认 false。
3. generator/CLI/fixtures/remote gate 切换 v2，增加精确 expected N-1 校验。

## 2. Runtime propagation

1. UpdateSystem candidate/download task 保存 rollback metadata。
2. UpdateService 将 compatibility 投影到 attempt，normal-quit 设置取交集。
3. coordinator 禁止 incompatible normal-quit 与 automatic recovery，install-now 保留。
4. Nexus create/patch/latest/sync 原样存储字段。

## 3. Renderer

1. `useUpdateRuntime` 暴露 readonly authoritative snapshot。
2. 新增 lifecycle display pure mapper。
3. SettingUpdate 删除 booleans，展示 phase/revision/previous/error/compatibility 和精确平台动作。
4. diagnostic evidence 增 lifecycle 与 macOS waived trust 字段。
5. 补中英文 catalog。

## 4. Acceptance gate

1. 新增三 pair host-runtime/static-only evidence validator。
2. rollbackCompatible=true 必须要求完整 N/N-1 evidence；默认 false manual-only。
3. release summary/workflow 接入 manifest v2 与 evidence 分类，不发布真实 release。
4. macOS 仅运行 controlled host script/helper smoke；Windows/Linux 只产 static-only validator fixture。

## 5. Review gates

- 搜索旧 schemaVersion=1 manifest fixtures/validators 并全部 clean cutover。
- renderer 不再从 DownloadCenter completion/appState 推断 lifecycle。
- Nexus/CoreApp 不重算 rollback target。
- static-only 不进入 runtime pass；waived 不进入 native trust pass。

## 6. Execution result

- [x] Shared manifest/lifecycle/SQLite foundation and migration `0030`.
- [x] Runtime exact N-1 propagation, normal-quit/recovery compatibility gates, and manual install carve-out.
- [x] Authoritative renderer lifecycle UI, 14 phase projections, rollback diagnostics, and explicit macOS native-trust waiver.
- [x] Deterministic remote N-1 resolver, canonical signed downgrade evidence, schema-v2 workflow, Nexus passthrough, and three-pair remote gates.
- [x] Focused regression: CoreApp 94, utils 37, release scripts 97, Nexus 5; node/web/Nexus typechecks pass.
- [x] `build:unpack` and isolated packaged macOS Settings/check smoke pass; Windows/Linux remain static-only by contract.
