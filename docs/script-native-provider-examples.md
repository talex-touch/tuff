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

### 示例：Shell 脚本执行

**输入**
```
command: "ls -la ~/Downloads"
```

**流程**
1. 解析 shell（`$SHELL` / `/bin/bash`）。
2. 通过 `spawn` 执行脚本。

**输出**
```
stdout: "...", stderr: ""
```

**错误分支**
- shell 不存在 → 返回错误并提示配置 shell。
- 执行失败 → 返回 stderr 并标记失败。

**能力映射**
- `TerminalModule`：`src/main/modules/terminal/terminal.manager.ts`

---

## 4) 跨平台一致性约束

- 相同 action 需统一返回结构与错误码。
- 降级提示一致（缺依赖/权限不足/不可用）。
- 失败不影响主流程。
