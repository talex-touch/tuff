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
4. diagnostic evidence 增加 native trust projection，SettingUpdate 与 evidence 共用 build verification SoT。
5. 同步中英文 official-pass / unverified 文案。
6. `resolveMacNativeTrustDisplay` 单一拥有 alert/tone/i18n/risk keys；SettingUpdate 在 `unverified` 时渲染 `role=alert` 的高对比安全警告；SettingHeader 在同一状态隐藏 Chromium/Node.js/Vue 徽章并渲染 danger 红色边缘；pass/not-applicable 不渲染 danger alert。

## 4. Acceptance gate

1. 新增三 pair host-runtime/static-only evidence validator。
2. rollbackCompatible=true 必须要求完整 N/N-1 evidence；默认 false manual-only。
3. release summary/workflow 接入 manifest v2 与 evidence 分类，不发布真实 release。
4. macOS 仅运行 controlled host script/helper smoke；Windows/Linux 只产 static-only validator fixture。

## 5. Review gates

- 搜索旧 schemaVersion=1 manifest fixtures/validators 并全部 clean cutover。
- renderer 不再从 DownloadCenter completion/appState 推断 lifecycle。
- Nexus/CoreApp 不重算 rollback target。
- native trust 只由 typed build verification status 派生；不得按 `darwin` 硬编码 waiver 或 pass。
- unverified native trust 必须在首屏可见、不可 dismiss，并同时保留 compact lifecycle 状态；页头必须隐藏运行时徽章并显示红色边缘；pass 不得出现 danger 风险列表。

## 6. Execution result

- [x] Shared manifest/lifecycle/SQLite foundation and migration `0030`.
- [x] Runtime exact N-1 propagation, normal-quit/recovery compatibility gates, and manual install carve-out.
- [x] Authoritative renderer lifecycle UI, 14 phase projections, rollback diagnostics, and typed macOS native-trust `pass | unverified | not-applicable` projection。
- [x] Deterministic remote N-1 resolver, canonical signed downgrade evidence, schema-v2 workflow, Nexus passthrough, and three-pair remote gates.
- [x] Focused regression: CoreApp 94, utils 37, release scripts 97, Nexus 5; node/web/Nexus typechecks pass.
- [x] `build:unpack` and isolated packaged macOS Settings/check smoke pass; Windows/Linux remain static-only by contract.
- [x] Native-trust cleanup: packaged Settings smoke removed the retired waiver sentinel; focused renderer/utils regression added 27 passing cases.
- [x] Untrusted packaged Settings smoke: `role=alert` 呈现稳定原因码和三项风险；页头实测 class=`is-native-trust-unverified`、border=`rgb(245, 108, 108)`，且 Chromium/Node.js/Vue 徽章 DOM 不存在。
