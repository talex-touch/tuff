# PRD: 通用平台型能力建设

> 状态：当前参考 / 压缩版
> 更新时间：2026-05-14
> 完整快照：`./archive/platform-capabilities-prd.full-2026-05-14.md`

## TL;DR

平台能力需要统一 capability、权限、unsupported/degraded reason、审计与 SDK 调用面。当前重点是避免平台能力伪成功，并为 Windows/macOS release-blocking 与 Linux best-effort 提供可复核证据。

## 当前原则

- 能力不可用必须返回明确 `unsupported/degraded reason`，不得伪成功。
- 插件调用平台能力必须声明 permission、platform、command source 与审计字段。
- 高风险 shell/PowerShell/AppleScript 优先参数化执行或 safe-shell。
- Native transport V1 已覆盖 screenshot、capabilities、file-index、file、media 五域。

## 未闭环

- 插件 shell capability 统一诊断。
- Native transport V1 macOS/Windows/Linux 真机 smoke。
- Windows/macOS 阻塞级回归与 Linux best-effort 记录。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/report/cross-platform-compat-placeholder-deep-review-2026-05-13.md`
