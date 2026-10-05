# 实施计划：OTA 一键预下载与无感更新

## 1. Shared lifecycle push

1. 在 update transport types/events 增加 `lifecycleChanged: UpdateLifecycleSnapshot -> void`。
2. 在 update SDK 增加 `onLifecycleChanged`。
3. 给 `UpdateAttemptRepository` 注入 commit observer；create/transition transaction 返回后发布。
4. `UpdateService` 实现 snapshot publisher，并在 startup restore 后发布当前状态。
5. 补 producer/consumer 与 repository commit/CAS focused tests。

## 2. Ready notification cutover

1. 删除 `UpdateSystem.setupDownloadCompletionListener()` 及 download-completed ready 通知调用。
2. `NotificationService.showUpdateDownloadCompleteNotification` clean cutover 为 `showUpdateReadyNotification`，接收 main click callback。
3. `UpdateService` 仅在 lifecycle `ready` 后通知；按 attemptId 做进程内去重。
4. 通知单击直接调用 coordinator schedule；捕获 stale/permission/trust 错误并保持 ready。
5. 更新中英文通知文案和 focused tests。

## 3. Renderer background-preparation UX

1. `useUpdateRuntime` 订阅 lifecycle push并复用 revision guard。
2. 自动下载开启时抑制 available 阻塞弹窗；手动下载模式保留下载弹窗。
3. 将 available 人工按钮文案从“立即更新”改为“下载更新”。
4. ready 且 native notification 不可用时提供一次应用内 fallback，直接 install task。
5. 设置页继续只从 snapshot 派生动作，不新增第二状态源。

## 4. macOS strict silent preflight

1. 在 platform adapter 增加 mac bundle/parent writability preflight 与 stable error。
2. coordinator 在 `ready -> install-scheduled` 前检查 official build verification 和 destination writability。
3. preflight 失败保持 ready、返回错误、不设置 quit intent、不退出。
4. `macos-apply-update.sh` 删除 AppleScript/admin fallback，只保留 direct replace + backup restore + relaunch。
5. `macos-restore-update.sh` 删除 admin fallback；恢复失败保留证据并停止循环。
6. 覆盖 writable/unwritable、trusted/untrusted、TOCTOU direct failure/recovery tests。

## 5. Windows/Linux one-click handoff

1. 复用统一 ready 通知与 install coordinator click path。
2. 核对 Windows NSIS/MSI、Linux AppImage/deb 文案与实际命令一致。
3. 保持 UAC/package-manager 交互事实，不把 spawn/open 记为 healthy。
4. 覆盖平台命令选择和双击幂等 tests。

## 6. Verification

按最小范围顺序运行：

```bash
corepack pnpm -C "packages/utils" exec vitest run "__tests__/types/update.test.ts" "__tests__/transport-domain-sdks.test.ts"
corepack pnpm -C "apps/core-app" exec vitest run \
  "src/main/modules/update/UpdateService.test.ts" \
  "src/main/modules/update/update-system.test.ts" \
  "src/main/modules/update/update-attempt-repository.test.ts" \
  "src/main/modules/update/services/update-install-coordinator.test.ts" \
  "src/main/modules/update/services/update-platform-adapter.test.ts" \
  "src/main/modules/download/notification-service.test.ts" \
  "resources/scripts/update-handoff-helper.test.ts" \
  "src/renderer/src/modules/hooks/useUpdateRuntime.test.ts" \
  "src/renderer/src/views/base/settings/update-diagnostic-evidence.test.ts"
corepack pnpm -C "apps/core-app" run typecheck:node
corepack pnpm -C "apps/core-app" run typecheck:web
```

随后执行：

- shell syntax / focused script smoke；
- production build；
- 隔离 profile packaged macOS smoke：后台下载→ready→通知→单击→无权限弹窗→替换→自动重启→health；
- 记录 click、quit、helper start、replace complete、new process start、health ack 时间戳，验证点击到新进程启动不超过 15 秒。

## 7. Review gates

- 搜索生产代码中 `showUpdateDownloadCompleteNotification`，必须清零。
- 搜索 macOS update scripts 中 `administrator privileges` / updater AppleScript，必须清零。
- 搜索 renderer 对 DownloadCenter completion 推断 ready 的逻辑，必须不存在。
- lifecycle event 只能使用导出的 typed `UpdateEvents.lifecycleChanged`，不得复制 raw channel。
- macOS non-writable/untrusted 必须保持 `ready`，不得变 `failed` 或触发 quit。
- Windows/Linux 只报告 handoff/startup health 的真实状态。

## 8. 风险与回滚

- repository observer 必须 transaction commit 后执行，避免发布未提交 snapshot。
- ready 通知迁移必须一次完成，避免 raw completion 与 lifecycle ready 双通知。
- macOS 权限 preflight 存在 TOCTOU，脚本 direct failure 必须恢复旧 app。
- 不修改 DB schema；代码回滚不需要数据库 downgrade。

## 9. Execution result

- [x] Added typed committed lifecycle push and renderer revision-guarded subscription.
- [x] Moved ready notification ownership from raw DownloadCenter completion to authoritative `ready`; notification click calls the main install coordinator directly and is single-fire.
- [x] Suppressed blocking available dialogs when automatic download is enabled; manual mode now says Download Update.
- [x] Added macOS official-build/direct-writability preflight. Untrusted or non-writable installs remain `ready` and never request quit.
- [x] Removed AppleScript/admin fallback from macOS apply and restore scripts; direct replacement/backup/restore smoke passes and emits timestamped phases.
- [x] Windows NSIS/MSI and Linux AppImage/deb reuse the same ready-click coordinator without changing their truthful handoff semantics.
- [x] Focused Utils/CoreApp tests, scoped ESLint, node/web typecheck, production Vite build, shell syntax checks, `electron-builder --dir`, and isolated packaged startup passed.
- [ ] Real official-attested N+1 macOS ready→click→replace→health timing remains release-acceptance evidence, not workspace evidence. The local unpacked build reported `signing-key-unavailable`, so the new trust gate correctly blocks it from claiming silent OTA success.
- [ ] Windows/Linux real-host runtime handoff evidence remains required; this macOS session proves their shared contracts and static command selection only.

## 10. 2026-10-02 应用内就绪提示补齐

1. 新增侧栏业务组件 `ShellUpdateNotice.vue`，从共享 authoritative snapshot 派生 ready，仅保存当前 attempt 的提示折叠状态。
2. 接入 `ShellSidebar` 的常驻底部，保证路由切换不重新挂载；rail 模式使用安静图标入口，点击恢复提示。
3. 复用现有安装 SDK、平台动作文案和 build-verification 事件；安装 pending 去重，失败保留入口，中英文补齐最小提示文字。
4. 运行 focused lint/typecheck 与现有 update runtime 检查；复用现有 renderer server 启动隔离 Electron，验证 ready/稍后/恢复/跨路由/rail/平台门禁，不启动真实安装器。

本轮结果：

- 已实现 `ShellUpdateNotice` 与侧栏常驻接入；中英文文字走现有消息目录，未修改自动检查/下载默认值或安装器。
- 隔离 Electron 实测：verifying 无提示，ready 展示，稍后收成入口且键盘焦点保留，跨路由不重开，rail 图标可恢复，新 attempt 自动展示，renderer 重载通过真实 status SDK 恢复 ready。
- 720×520 viewport、约 195px 侧栏、英文提示与按钮均可见且无横向溢出。
- 连续点击安装只有一次真实安装 RPC；主进程拒绝当前不可信 dev build，返回 `MAC_UPDATE_BUILD_UNTRUSTED`，生命周期保持 ready、pending 清除、错误提示可见。未下载或替换真实应用；可信外观仅为隔离 renderer 状态输入，不作为官方 N+1 安装证明。
- Focused ESLint 零警告；现有 `useUpdateRuntime` 与 `update-status-display` 两套测试共 66 项通过；两份 locale JSON 解析通过。
- Renderer 全量 typecheck 一度通过；最终重跑被本轮未修改的 `src/shared/flow-target-icons.ts:61` 与 `src/shared/flow-target-icons.test.ts:113` 的 `string -> number` 类型错误阻断。提示组件未报类型错误，不修改其他并行工作的文件。
