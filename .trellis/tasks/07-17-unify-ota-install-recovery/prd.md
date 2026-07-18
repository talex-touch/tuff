# 统一 OTA 安装协调与恢复

## Goal

以 main-process `UpdateInstallCoordinator` 统一立即安装、正常退出安装、三平台 handoff、启动健康确认和一次性 previous recovery；彻底删除 macOS electron-updater 双路径，使所有平台消费同一 verified DownloadCenter task 与持久化 lifecycle attempt。

## Requirements

### R1 — Typed Quit Intent

- 退出意图固定为 `user-normal/update-now/system-shutdown/startup-failure/duplicate-instance/other`，由 main 单例持有并按安全优先级覆盖。
- `before-quit` 只在没有显式意图时归类为 `user-normal`；shutdown/startup/duplicate 不得被后续普通退出覆盖。
- 只有 `user-normal` 且 `installOnNormalQuit=true`，或 `update-now`，允许准备 OTA handoff。

### R2 — 单一安装协调器

- 安装动作不直接 spawn/open/quit；只由 coordinator 将 `ready -> install-scheduled` 并请求 typed quit。
- `BEFORE_APP_QUIT` 完成二次验证、attempt/plan 持久化、recovery 选择和业务 flush。
- `WILL_QUIT` 只同步启动已经准备好的 detached helper；不得网络、hash、迁移或复制大文件。

### R3 — 平台 Handoff

- macOS 只走 DownloadCenter + `macos-apply-update.sh`；删除 `MacAutoUpdaterAdapter`、`electron-updater` 与 app-update.yml 运行时分支。
- Windows 使用显式 NSIS/MSI handoff，不把进程启动/UAC 交接报告为安装成功。
- Linux 只接受 AppImage/deb；AppImage 启动包，deb 交给系统 opener，二者都只提交 `handoff-started`。

### R4 — Helper Plan 与安全边界

- plan/ack/marker 只能位于 update storage root，包含 schema、attempt id、target/current version、随机 token、平台命令和 recovery 信息。
- helper 拒绝路径逃逸、token/attempt 不匹配、未知 schema、重复 recovery；每个 attempt 最多一次 recovery。
- helper 必须先等待 parent PID 退出，再 handoff；health timeout 才执行 previous recovery。

### R5 — Health 与 Previous Recovery

- 新版本只在 target version 匹配、foreground/deferred modules 完成、renderer/main readiness 成功且 update repository 可写后提交 `awaiting-health -> healthy` 并写幂等 ack。
- successful health 将当前 verified package 提升为唯一 previous asset；下一次安装前删除更旧 previous，只保留一份。
- macOS 使用替换前 `.app` backup；Windows/Linux 使用 previous verified package。首次无 previous 时显式 `recoveryAvailable=false`。
- recovery marker 在 previous version 启动后驱动 `recovery-required -> recovering -> recovered`；失败或无 previous 停在 `recovery-required`。

### R6 — 边界

- 不实现差分更新、强制更新、灰度或真实生产系统包数据库测试。
- helper tests 使用临时目录、伪命令与伪安装资产，不修改 `/Applications`、系统包数据库或用户 profile。

## Acceptance Criteria

- [x] typed quit intent 覆盖所有可控退出入口；仅 user-normal/update-now 允许 handoff。
- [x] install action 只 schedule + quit；BEFORE/WILL_QUIT 阶段职责可测试且无重复 helper。
- [x] macOS electron-updater adapter/dependency/配置分支完全删除，DownloadCenter 为唯一下载路径。
- [x] Windows NSIS/MSI、Linux AppImage/deb、macOS script plan 选择正确；不支持资产 fail closed。
- [x] plan/ack/marker 路径、schema、attempt、token 校验拒绝逃逸与重放。
- [x] target version startup 提交 awaiting-health/healthy；ack 幂等；wrong version 不确认。
- [x] health timeout 最多发起一次 previous recovery；recovered/recovery-required 状态正确；只保留一个 previous asset。
- [x] lifecycle、quit intent、coordinator、helper、平台 adapter、startup health focused tests 与 node/web typecheck 通过。

## Constraints

- 继承 Provider 完整性门禁与 `app_update_attempts` CAS/revision 契约。
- SQLite 仍是业务真源；helper JSON 仅作跨进程协调，不可反向覆盖不匹配 attempt。
- macOS `waived` native trust 风险继续显式报告；detached signature 不等于 Developer ID/Gatekeeper。
