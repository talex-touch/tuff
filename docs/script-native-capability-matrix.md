# 脚本/原生能力矩阵与降级策略

## Scope
- 明确脚本类型与原生集成方式。
- 列出跨平台支持矩阵与降级策略。

## Summary
- Python 与系统脚本优先以主进程 spawn/sidecar 执行。
- 原生库优先走 sidecar 或 N-API，避免 renderer 直接加载。
- 不可用能力统一给出降级提示与可探测性要求。

## References
- apps/core-app/src/main/modules/terminal/terminal.manager.ts
- plugins/touch-system-actions/index.js
- apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts
- apps/core-app/src/main/modules/update/update-system.ts
- docs/script-native-constraints.md
- docs/script-native-build-distribution.md

---

## 1) 能力矩阵

| 能力类型 | Windows | macOS | Linux | 实现方式 | 依赖可探测性 |
| --- | --- | --- | --- | --- | --- |
| Python（系统） | ✅ | ✅ | ✅ | `child_process.spawn` + system python | 检查 `python`/`python3` 路径 |
| Python（嵌入式） | ⚠️ | ⚠️ | ⚠️ | `resources/runtime/python` | 检查资源路径/版本文件 |
| Shell 脚本（cmd/powershell） | ✅ | N/A | N/A | `cmd.exe` / PowerShell | 检查 `cmd.exe`/`powershell` |
| Shell 脚本（bash/zsh） | N/A | ✅ | ✅ | `$SHELL` / `/bin/bash` | 检查 `$SHELL` 可用性 |
| AppleScript | N/A | ✅ | N/A | `osascript` | 检查 `/usr/bin/osascript` |
| Windows 原生库（DLL） | ✅ | N/A | N/A | N-API / sidecar | 检查架构匹配 |
| macOS 原生库（dylib） | N/A | ✅ | N/A | N-API / sidecar | 检查签名/公证 |
| Linux 原生库（so） | N/A | N/A | ✅ | N-API / sidecar | 检查 glibc/架构 |
| Everything 搜索 | ✅ | ❌ | ❌ | Everything CLI (`es.exe`) | 检查 `es.exe` |
| 系统指令（关机/重启等） | ✅ | ✅ | ✅ | `exec` 系统命令 | 权限/提示可用 |

说明：
- ✅：默认支持；⚠️：可选支持（需资源/配置）；❌：不支持。
- 运行时需要区分 `x64/arm64` 架构，构建时应提供对应资产。

---

## 2) 降级策略

| 不可用项 | 降级策略 | 提示策略 |
| --- | --- | --- |
| 系统 Python 缺失 | 回退嵌入式 Python（若存在），否则禁用 provider | 提示“未检测到 Python，功能已禁用” |
| 嵌入式 Python 缺失 | 回退系统 Python 或禁用 | 提示“运行时资源缺失” |
| AppleScript 不可用 | 禁用该脚本类型 | 提示“仅 macOS 支持” |
| Windows DLL 不匹配 | 退回 sidecar 进程 | 提示“架构不匹配，已降级” |
| macOS dylib 未签名 | 禁用原生库 | 提示“签名/公证校验失败” |
| Linux so 依赖缺失 | 禁用原生库 | 提示“系统依赖缺失” |
| Everything 不可用 | 使用 File Provider（macOS/Linux）/跳过 | 提示“Everything 未安装或不可用” |
| 系统指令权限不足 | 返回错误并不中断主流程 | 提示“需要管理员权限” |

---

## 3) 兼容性与回归注意

- 降级必须不影响主流程：搜索/插件功能仍可运行。
- 不改变现有 IPC 事件名与调用方式，仅新增能力时扩展。
- 更新包与运行时资产版本绑定，避免跨版本 ABI 不兼容。
