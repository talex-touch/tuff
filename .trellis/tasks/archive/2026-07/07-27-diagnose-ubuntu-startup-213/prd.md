# 诊断 Ubuntu 启动失败 #213

## Goal

把 #213 从无法执行的旧截图报告推进为可复现的 Ubuntu 24.04 启动问题，并在可用环境中验证当前 AppImage/deb；在证据不足时保持开放而不猜测根因。

## Confirmed Facts

- 报告环境为 Ubuntu 24.04、Xorg、GNOME 46；Issue 未提供 Tuff 版本、安装包类型、启动命令、stderr、应用日志或系统架构。
- 仓库当前在 `ubuntu-latest` 构建 Linux，`electron-builder.yml` 产出 AppImage/deb，根与 CoreApp package scripts 均有 Linux release/snapshot 命令。
- 现有信息不足以判断是 sandbox 权限、缺失共享库、Wayland/X11、架构、打包资源、native addon 还是应用启动逻辑。

## Requirements

- 在 #213 请求：最新版 Tuff 版本与下载文件名、`uname -a`、`echo $XDG_SESSION_TYPE`、终端启动命令与完整 stderr、主进程日志、AppImage/deb 安装方式。
- 提供不暴露隐私的日志路径/脱敏提醒和 AppImage `--no-sandbox` 仅用于诊断的对照步骤，不将其作为正式修复。
- 检查最新 Linux CI artifact 是否生成；若可获得 Ubuntu 24.04 Xorg 环境，分别执行 AppImage 与 deb cold-start smoke。
- 收到证据后另行收敛根因与代码修复；没有新证据时记录 blocked，不关闭 Issue。

## Acceptance Criteria

- [x] #213 已收到具体、最小且可执行的信息请求评论。
- [x] 当前 Linux build/package 配置与最近 CI 状态已记录。
- [x] 当前执行面为 macOS arm64，无法完成 Ubuntu 24.04 Xorg AppImage/deb runtime smoke；该外部环境阻塞已明确记录并请求报告者复测。
- [x] 只有在最新版成功启动或根因修复并回归后才关闭 #213；当前保持 `OPEN`。

## Verification Evidence

- `v2.4.13` release 含 `ubuntu-latest-release-tuff-2.4.13.AppImage` 和 `.deb`；Linux build job `89906662623` success。
- 当前主会话平台为 Darwin arm64，不能伪造 Ubuntu 24.04 Xorg runtime 证据。
- 已在 #213 请求 package 类型、`uname -a`、desktop/session、带 Electron logging 的完整 stderr、main log 与 `--no-sandbox` 诊断对照，并提醒脱敏。
- Issue 保持开放，等待报告者回复后进入根因修复。

## Out Of Scope

- 因评论中的 Electron/Rust技术偏好重写应用架构。
- 在没有日志的情况下猜测或承诺具体根因。
