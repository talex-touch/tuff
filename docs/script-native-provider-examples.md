# 平台 Provider 设计与示例流程

## Scope
- 设计 Windows/macOS/Linux 适配器与示例场景。
- 每个平台至少一个流程，覆盖输入/输出/错误分支。

## Summary
- Windows：文件搜索/系统指令示例（Everything / shutdown）。
- macOS：AppleScript 系统脚本示例。
- Linux：Shell 脚本示例。

## References
- docs/script-native-constraints.md
- docs/script-native-capability-matrix.md
- plugins/touch-system-actions/index.js
- apps/core-app/src/main/modules/box-tool/addon/files/everything-provider.ts

---

## 1) Windows Provider 示例

### 示例 A：Everything 文件搜索（系统依赖）

**输入**
```
query: "report 2025"
limit: 20
```

**流程**
1. 检测平台 `win32`，读取 Everything 设置。
2. 检测 `es.exe` 可用性，不可用则记录不可用状态。
3. 通过 CLI 执行查询，返回路径列表。

**输出**
```
results: [{ path, name, size, mtime }]
```

**错误分支**
- `es.exe` 缺失 → 返回空结果 + 提示“Everything 未安装或不可用”。
- CLI 返回错误 → 降级到 file provider 或提示失败。

**能力映射**
- `EverythingProvider`：`src/main/modules/box-tool/addon/files/everything-provider.ts`

---

### 示例 B：系统关机（权限相关）

**输入**
```
action: shutdown
```

**流程**
1. 权限检测（管理员权限）。
2. 调用 `shutdown /s /t 0`。

**输出**
```
success: true
```

**错误分支**
- 权限不足 → 弹窗提示并返回 `success: false`。

**能力映射**
- `touch-system-actions`：`plugins/touch-system-actions/index.js`

---

## 2) macOS Provider 示例

### 示例：AppleScript 关机

**输入**
```
action: shutdown
```

**流程**
1. 弹窗确认。
2. 调用 `osascript` 执行系统事件。

**输出**
```
success: true
```

**错误分支**
- `osascript` 不可用 → 返回错误提示。
- 用户取消 → 返回 `cancelled: true`。

**能力映射**
- `touch-system-actions`：`plugins/touch-system-actions/index.js`

---

## 3) Linux Provider 示例

### 示例：显式 PTY 命令执行

**输入**
```ts
const session = await createTerminalSdk(transport).create({
  command: '/bin/ls',
  args: ['-la', '/tmp'],
  cols: 100,
  rows: 30,
}, { onData, onExit, signal })
```

**流程**
1. 主进程确认可信 sender、插件身份和 `system.shell` 权限。
2. 共用 PTY 核心解析并核验可执行文件，以独立参数启动 `node-pty`。
3. SDK 接收完整输出与真实退出状态。用户关闭或 signal 取消时收尾会话。

**错误分支**
- 可执行文件或 PTY 不可用：创建失败，不返回可用会话。
- 权限不足或 owner 不匹配：拒绝操作，不启动或触碰其他会话。

**能力映射**
- `TerminalModule`：`src/main/modules/terminal/index.ts`。
- 共用 PTY 生命周期：`src/main/modules/terminal/pty-session-core.ts`。
- domain SDK：`packages/utils/transport/sdk/domains/terminal.ts`。

这个示例只在拥有主进程 transport 的受信任 Electron 调用方运行。网页 `TxTerminal` 只负责显示，不启动 shell。

---

## 4) 跨平台一致性约束

- 相同 action 需统一返回结构与错误码。
- 降级提示一致（缺依赖/权限不足/不可用）。
- 失败不影响主流程。
