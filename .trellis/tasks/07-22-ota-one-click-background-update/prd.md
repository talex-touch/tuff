# OTA 一键预下载与无感更新

## Goal

将现有安全、持久化 OTA 状态机收敛为“后台准备、就绪后一次提醒、单击完成交接”的跨平台更新体验。macOS 必须在官方已签名/公证构建的常规安装场景中完成静默替换和自动重启，不要求用户再次打开设置页、选择安装包或确认应用内第二个对话框。

## Confirmed Background

- Packaged CoreApp 已默认启用自动检查、自动下载与 `installOnNormalQuit`；启动约 5 秒后检查，发现 release 后会进入 DownloadCenter。
- `app_update_attempts` 是 authoritative lifecycle 真源；只有下载完成并通过 SHA-256 与 pinned detached signature 后才能进入 `ready`。
- 当前 `available` 会先通知 renderer 并弹窗，弹窗“立即更新”只启动下载；这与后台预下载目标冲突。
- 当前原生“更新已就绪”通知由 DownloadCenter `completed` 触发，早于 authoritative `ready`；通知点击只广播 `download:push:notification-clicked`，仓库中没有 CoreApp renderer 安装消费方。
- macOS 当前使用 `macos-apply-update.sh` 替换 `.app` 并自动 `open` 新版本；直接替换失败时会通过 AppleScript 请求管理员权限，因此尚不能保证零权限弹窗。
- Windows 当前使用交互式 NSIS/MSI；Linux 使用 AppImage 启动或 `xdg-open` 打开 deb。跨平台统一目标是“一次点击进入真实平台交接”，不伪造三平台完全静默。
- 产品决策：macOS 采用严格零权限弹窗策略。常规可写安装位置静默替换；若当前 `.app` 不可写，则不得退出、不得 AppleScript 提权，保持 `ready` 并给出明确手动处理入口。

## Requirements

### R1 — 静默后台准备

- 自动下载开启时，`available` 只进入后台下载，不弹阻塞式“立即更新”对话框。
- 下载、重启恢复、流式 SHA-256、pinned detached signature 与 manifest/rollback compatibility 门禁保持不变。
- DownloadCenter `completed` 只能触发 `verifying`，不得产生“已就绪”通知或安装动作。

### R2 — Authoritative lifecycle 推送

- main 在每次成功提交 lifecycle revision 后推送 typed `UpdateLifecycleSnapshot`；renderer 继续使用 revision guard 拒绝旧状态。
- 原生通知、设置页、更新弹窗和诊断只从 authoritative snapshot 判断 `ready`，不得从 DownloadCenter completion 或本地 boolean 推断。
- 应用重启后恢复出 `ready` 时应重新提供一次就绪提醒，不重复下载或验证已确认失效的旧资产。

### R3 — 一次点击更新

- `ready + taskId` 后只提醒一次，通知和应用内入口使用准确的平台文案。
- 用户点击后直接调用唯一 `UpdateInstallCoordinator.scheduleInstallNow(taskId)`，不先打开设置页，不要求第二次应用内确认。
- 点击后 1 秒内必须提交 `install-scheduled` 并进入 typed quit；`BEFORE_APP_QUIT` 仍完成本地二次校验、计划持久化和业务 flush。
- 点击去重；重复通知、双击和 stale task 不能启动第二个 helper。

### R4 — macOS 静默快速更新

- 只允许官方签名、公证且 runtime attestation 通过的包进入 macOS 静默更新；native trust 非 `pass` 时 fail closed。
- 常规受支持安装场景中，用户单击后不再出现应用内确认、Finder、DMG 或安装器界面；应用退出、原位替换并自动重启新版本。
- 替换前保留 rollback backup；新版本 health ack 前不得清理；失败继续执行一次性恢复与防循环契约。
- 目标体验：已处于 `ready` 时，从用户点击到新版本进程启动在基准 macOS 主机上不超过 15 秒，并记录分段耗时证据。

### R5 — Windows 与 Linux 一键交接优化

- Windows 就绪通知单击后直接退出并启动已验证 NSIS/MSI；当前阶段如仍需 UAC/安装器交互必须如实展示，不称为静默成功。
- Linux AppImage 就绪通知单击后启动已验证的新 AppImage；deb 单击后交给系统 opener。两者均只在新版本 health ack 后报告成功。
- 不因 macOS 静默目标绕过 Windows/Linux 的 signature、rollback compatibility、typed quit 或 recovery 门禁。

### R6 — 通知与打扰策略

- 同一 attempt 的 `available/downloading/verifying` 不重复打扰用户；只在 `ready` 发一次高优先级通知。
- 用户忽略就绪通知后保持 `ready`；设置页仍提供安装入口，兼容 release 仍可在用户正常退出时安装。
- system shutdown、crash、startup failure 与 duplicate-instance 不得触发通知点击等价安装或自动 handoff。

## Acceptance Criteria

- [x] 自动检查发现更新后静默进入下载；`available` 不弹阻塞式更新对话框。
- [x] 原生“更新已就绪”通知只在 authoritative `ready` 后出现；raw DownloadCenter completion 不通知。
- [x] ready 通知单击直接 schedule + typed quit，无第二次应用内确认；双击只产生一个 helper。
- [x] lifecycle push 覆盖 available/downloading/verifying/ready/failed，renderer stale revision 不覆盖新状态。
- [x] 重启恢复 downloading/verifying/ready 时行为正确；ready 不重复下载并可重新提醒。
- [ ] macOS 官方可信包完成后台准备、单击、静默替换、自动重启、health ack；基准主机点击到新进程启动不超过 15 秒。
- [x] macOS 替换/health 失败时保留 backup，并最多恢复一次；不产生循环。
- [x] Windows NSIS/MSI 与 Linux AppImage/deb 从 ready 通知一次点击进入各自真实 handoff，文案不夸大静默能力。
- [x] Provider/manifest/hash/signature/rollback compatibility/quit intent/recovery 既有安全测试保持通过。
- [x] CoreApp main/renderer、packages/utils focused tests、node/web typecheck 与 packaged macOS smoke 通过。

## Constraints

- SQLite lifecycle 仍是业务真源；通知状态和 helper marker 不得成为第二状态库。
- 不允许 renderer 提供下载 URL、checksum、signature 或任意本地路径。
- 不在 DownloadCenter completion 路径直接安装。
- 不以关闭 Gatekeeper、移除安全门禁或静默丢弃用户 profile 换取无感体验。
- 不在本任务新增差分更新、强制更新、灰度分桶或新增 CPU 架构。
