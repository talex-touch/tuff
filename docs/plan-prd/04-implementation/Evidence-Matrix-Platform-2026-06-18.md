# Evidence Matrix: Platform Capability Smoke

> 更新时间：2026-06-18
> 定位：平台能力 smoke / regression 的非阻塞矩阵。owner 已完成的平台人工验证不再作为 Roadmap blocker；本文只保留后续能力回归与 degraded/fail-closed 要求。

## 1. 当前口径

- 平台人工验证不再作为当前 release blocker、Roadmap 待办或 P0/P1 evidence 缺口。
- 平台相关实现仍必须保留用户可见 degraded/unsupported reason 与 fail-closed 行为。
- 后续平台 smoke 只作为回归矩阵，避免新能力在 Windows/macOS/Linux 上静默假成功。

## 2. 平台 smoke 矩阵

| ID | 能力 | Windows | macOS | Linux | 最小要求 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| PLAT-01 | App indexing / app launch | Start Menu / UWP / Registry / App Paths | mdfind / mdls / Applications | desktop entries | 可搜索、可启动、不可用时有 reason | non-blocking |
| PLAT-02 | Everything | CLI/SDK strategy、PATH/registry probing、root policy | N/A | N/A | Windows 可用时走授权 root filter；不可用 fail-closed/degraded | non-blocking |
| PLAT-03 | local icon / `tfile` | file icon round-trip | file icon round-trip | best-effort | 图标失败不阻塞结果，展示 fallback | non-blocking |
| PLAT-04 | file access permission | admin/UAC 相关提示 | TCC Documents/Desktop/Downloads 等 | permission best-effort | 不触发静默敏感扫描；缺权限提示恢复入口 | non-blocking |
| PLAT-05 | packaged smoke | setup / unpacked / installed | app zip / notarization context | AppImage / deb | 启动、CoreBox、settings 基本可用 | non-blocking |
| PLAT-06 | Native transport | native addon load | screen/file/media permission | X11/Wayland best-effort | addon 缺失或权限缺失时明确 degraded reason | non-blocking |
| PLAT-07 | QuickOps system actions | PowerShell/CIM | pmset/scutil | sysfs/GNOME best-effort | 只读查询脱敏；高风险动作需权限/确认 | non-blocking |

## 3. 不可接受行为

- 平台能力不可用时返回固定成功或空成功。
- 读取浏览器历史、文件系统、屏幕、系统代理等敏感面时无用户同意或无 degraded reason。
- Windows-only 能力在 macOS/Linux 上伪装支持。
- Linux best-effort 失败时吞掉错误且无用户可见提示。

## 4. 推荐记录格式

| 字段 | 说明 |
| --- | --- |
| platform | `win32` / `darwin` / `linux` |
| appVersion | 当前 app version |
| buildType | dev / unpacked / snapshot / release |
| capability | 对应矩阵 ID |
| result | success / degraded / unsupported / failed |
| reason | 用户可见 reason 或内部 error code |
| evidence | 截图、日志、focused test 或 runbook 路径 |

## 5. Roadmap 绑定

- 本矩阵不恢复平台验证 blocker。
- 对应 Roadmap vNext：R3/R4/R5/R6/R9 中涉及平台能力的回归参考。
