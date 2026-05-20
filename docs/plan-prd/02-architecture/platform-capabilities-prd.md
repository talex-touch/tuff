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
- MetaK / QuickActions SDK 的原生分享入口复用 FlowBus native share，不新增独立分享协议；插件必须先查询 native share targets 再选择 AirDrop / Mail / Messages / fallback。

## Native Share SDK 口径

- macOS：`system-share`、`airdrop`、`mail`、`messages` 是真实 native share targets；AirDrop 仅对文件 / 图片类 payload 有意义。
- Windows / Linux：当前只暴露明确 `mail` fallback，不把 mailto 或外部协议伪装为系统分享面板。
- 插件侧入口：`context.utils.quickActions.getNativeShareTargets(payloadType)`、`createSharePayloadFromItem(item)`、`nativeShare(payload, { target })`。
- 权限与降级：继续复用 FlowBus / permission guard 口径；能力不可用时返回失败或 fallback，不返回 fake success。
- 后续配置：按插件和 item kind 记住默认分享目标，暴露 unsupported/degraded reason，并允许批量文件分享。

## 未闭环

- 插件 shell capability 统一诊断。
- Native transport V1 macOS/Windows/Linux 真机 smoke。
- MetaK native share 的 macOS AirDrop / Mail / Messages 真机 smoke。
- Windows/macOS 阻塞级回归与 Linux best-effort 记录。

## 关联入口

- `docs/plan-prd/TODO.md`
- `docs/plan-prd/docs/PRD-QUALITY-BASELINE.md`
- `docs/plan-prd/report/cross-platform-compat-placeholder-deep-review-2026-05-13.md`
