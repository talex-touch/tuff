# 脚本/原生能力现状与约束清单

## Scope
- 盘点现有外部进程、IPC 与插件调用模式。
- 汇总平台限制与不支持场景，明确适配边界。

## Summary
- 现有外部执行集中在主进程，通过 IPC/Transport 触发，避免渲染进程直接执行。
- 平台差异以 Windows 专属集成、macOS 系统脚本与打包签名策略为主。
- 结论仅整理现状，不改变现有 API 行为。

## References
- apps/core-app/src/main/core/channel-core.ts
- apps/core-app/src/main/modules/plugin/plugin.ts
- apps/core-app/src/main/modules/terminal/terminal.manager.ts
- apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts
- plugins/touch-system-actions/index.js
- apps/core-app/electron-builder.yml

---

## 1) 现有模式示例（3+）

### 模式 A：主进程 IPC 通道（legacy channel）
- 事件注册：`regChannel` 维护监听列表。
- 请求发送：`_sendTo` 包含 `sync.timeout`，默认走 `CHANNEL_DEFAULT_TIMEOUT`。
- 位置：`src/main/core/channel-core.ts:362,413,434-517`

### 模式 B：插件侧 Transport 桥接（TuffTransport）
- 插件主进程通过 `transport.on(defineRawEvent(...))` 监听事件。
- `ChannelType.PLUGIN`/`ChannelType.MAIN` 在上下文内区分来源。
- 位置：`src/main/modules/plugin/plugin.ts:763-807`

### 模式 C：外部进程执行（TerminalModule）
- 通过 `child_process.spawn` 执行命令。
- Windows 使用 `cmd.exe`；macOS/Linux 使用 `$SHELL` 或 `/bin/bash`。
- 位置：`src/main/modules/terminal/terminal.manager.ts:12-89`

### 模式 D：外部 CLI 集成（Everything Provider）
- Windows 专属依赖 `Everything` + `es.exe`。
- 非 Windows 平台直接跳过初始化。
- 位置：`src/main/modules/box-tool/addon/files/everything-provider.ts:62-142`

### 模式 E：系统指令调用（System Actions 插件）
- 使用 `exec` 调用 `osascript`/`shutdown` 等系统命令。
- 含管理员权限提示与错误处理。
- 位置：`plugins/touch-system-actions/index.js`

---

## 2) 平台限制（5+）

1) **Windows-only 依赖**：Everything Provider 仅在 Windows 初始化，且要求 `es.exe` 可用。  
   参考：`src/main/modules/box-tool/addon/files/everything-provider.ts:62-142`

2) **系统指令权限**：关机/重启在 macOS/Windows 均需要管理员权限并可能弹窗提示。  
   参考：`plugins/touch-system-actions/index.js`

3) **Shell 差异**：命令执行依赖 OS Shell，Windows 为 `cmd.exe`，macOS/Linux 为 `$SHELL` 或 `/bin/bash`。  
   参考：`src/main/modules/terminal/terminal.manager.ts:12-89`

4) **原生二进制加载要求**：动态库需 `asarUnpack`，否则可能无法加载。  
   参考：`apps/core-app/electron-builder.yml:3-13`

5) **macOS 签名/公证未默认启用**：当前配置 `sign/notarize` 关闭，仅适用于非发布场景。  
   参考：`apps/core-app/electron-builder.yml:81-92`

6) **Linux 发布形态**：当前产物为 AppImage/DEB；Snap 严格沙箱限制了默认权限（home/network/removable-media）。  
   参考：`apps/core-app/electron-builder.yml:94-110`

7) **IPC 超时约束**：主通道请求采用默认超时策略，长耗时任务需具备超时/取消设计。  
   参考：`src/main/core/channel-core.ts:434-517`

---

## 3) 不支持的场景（明确边界）

- 非 Windows 平台使用 Everything Provider（初始化直接跳过）。  
  参考：`src/main/modules/box-tool/addon/files/everything-provider.ts:139-142`
- 插件主进程使用 `sendSync`（明确不支持）。  
  参考：`src/main/modules/plugin/plugin.ts:835-837`
- 运行时二进制仍处于 asar 内部直接加载（需解包）。  
  参考：`apps/core-app/electron-builder.yml:3-13`
- 在未获得管理员权限时执行关机/重启类系统指令。  
  参考：`plugins/touch-system-actions/index.js`
- 直接在渲染进程执行系统命令（现有执行入口均位于主进程）。  
  参考：`src/main/modules/terminal/terminal.manager.ts:1-89`

---

## 4) Electron Sandbox / 签名 / 权限影响

- 外部进程执行集中在主进程，渲染进程通过 IPC/Transport 访问，符合 sandbox 约束。  
  参考：`src/main/modules/terminal/terminal.manager.ts:1-89`
- macOS 发布版需额外签名/公证，否则可能触发 Gatekeeper 风险。  
  参考：`apps/core-app/electron-builder.yml:81-92`
- 系统级操作（关机/重启/锁屏）依赖系统权限，需明确提示与失败降级。  
  参考：`plugins/touch-system-actions/index.js`
