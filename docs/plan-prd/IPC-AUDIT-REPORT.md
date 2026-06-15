# TouchChannel 直接调用点审计报告

> 审计日期：2026-06-14
> 审计范围：`apps/core-app/src/main` 和 `apps/core-app/src/renderer`
> 审计目标：识别所有 TouchChannel 直接调用点，为 TuffTransport 迁移提供依据

---

## 1. 审计摘要

| 类别 | 数量 | 说明 |
|------|------|------|
| `touchApp.channel.*` 调用 | 13 处 | 主进程通过 touchApp 访问 channel |
| `channel.broadcastPlugin` 调用 | 5 处 | 插件广播专用方法 |
| `touchChannel.send` 调用 | 1 处 | 插件模块直接发送 |
| `regChannel` 定义 | 2 处 | 渲染进程 channel 核心实现 |
| `ipcRenderer.send` 调用 | 2 处 | 底层 IPC 发送 |
| **总计** | **23 处** | 需迁移到 TuffTransport |

---

## 2. 详细调用点清单

### 2.1 主进程 - touchApp.channel 调用（13 处）

#### BoxTool / CoreBox 模块（7 处）

| 文件 | 行号 | 调用方式 | 用途 |
|------|------|----------|------|
| `box-tool/core-box/window.ts` | 135 | `this.touchApp.channel` | 获取 channel 引用 |
| `box-tool/core-box/window.ts` | 1650 | `this.touchApp.channel.broadcastPlugin(...)` | 插件广播 |
| `box-tool/core-box/ipc.ts` | 74 | `this.touchApp.channel` | 获取 channel 引用 |
| `box-tool/core-box/meta-overlay.ts` | 465 | `touchApp.channel` | 获取 channel 引用 |
| `box-tool/core-box/meta-overlay.ts` | 490 | `touchApp.channel` | 获取 channel 引用 |
| `box-tool/core-box/transport/core-box-transport.ts` | 31 | `this.touchApp.channel` | 获取 channel 引用 |

#### SearchEngine 模块（3 处）

| 文件 | 行号 | 调用方式 | 用途 |
|------|------|----------|------|
| `box-tool/search-engine/search-core.ts` | 408 | `this.touchApp.channel` | 获取 channel 引用 |
| `box-tool/addon/files/file-provider.ts` | 1553 | `context.touchApp.channel` | 获取 channel 引用 |
| `box-tool/addon/files/file-provider.ts` | 1589 | `this.touchApp.channel` | 获取 channel 引用 |

#### 其他模块（3 处）

| 文件 | 行号 | 调用方式 | 用途 |
|------|------|----------|------|
| `box-tool/addon/files/everything-provider.ts` | 430 | `context.touchApp.channel` | 获取 channel 引用 |
| `tray/tray-menu-builder.ts` | 138 | `touchApp.channel` | 获取 channel 引用 |
| `tray/tray-menu-builder.ts` | 167 | `touchApp.channel` | 获取 channel 引用 |
| `box-tool/addon/system/system-actions-provider.ts` | 656 | `this.context.touchApp.channel` | 获取 channel 引用 |

### 2.2 主进程 - channel.broadcastPlugin 调用（5 处）

| 文件 | 行号 | 调用方式 | 用途 |
|------|------|----------|------|
| `box-tool/core-box/window.ts` | 1650 | `this.touchApp.channel.broadcastPlugin(pluginName, eventName, data)` | 插件广播 |
| `plugin/adapters/plugin-features-adapter.ts` | 152 | `channel.broadcastPlugin(plugin.name, ...)` | 插件特性广播 |
| `plugin/plugin-module.ts` | 940 | `channel.broadcastPlugin(...)` | 插件模块广播 |
| `plugin/plugin-module.ts` | 983 | `channel.broadcastPlugin(...)` | 插件模块广播 |
| `ocr/ocr-service.ts` | 1570 | `channel.broadcastPlugin(activePlugin.name, ...)` | OCR 结果广播 |

### 2.3 主进程 - touchChannel.send 调用（1 处）

| 文件 | 行号 | 调用方式 | 用途 |
|------|------|----------|------|
| `plugin/plugin.ts` | 1741 | `touchChannel.send(eventName, payload)` | 插件 SDK 直接发送 |

### 2.4 渲染进程 - channel-core 实现（4 处）

| 文件 | 行号 | 调用方式 | 用途 |
|------|------|----------|------|
| `channel/channel-core.ts` | 51 | `regChannel` | 注册 IPC 处理器 |
| `channel/channel-core.ts` | 119 | `ipcRenderer.send(...)` | 底层 IPC 发送 |
| `channel/channel-core.ts` | 177 | `regChannel` | 注册 IPC 处理器 |
| `channel/channel-core.ts` | 230 | `ipcRenderer.send(...)` | 底层 IPC 发送 |

---

## 3. 按模块分类

### 3.1 高优先级模块（P0）

| 模块 | 调用点数 | 主要问题 |
|------|----------|----------|
| Plugin Module | 8 处 | `broadcastPlugin` 是插件通信核心，需确保 TuffTransport 支持 |
| CoreBox Window | 4 处 | 窗口管理与插件广播交织 |

### 3.2 中优先级模块（P1）

| 模块 | 调用点数 | 主要问题 |
|------|----------|----------|
| SearchEngine | 3 处 | 搜索结果广播 |
| Tray Menu | 2 处 | 系统托盘交互 |
| OCR Service | 1 处 | OCR 结果广播 |

### 3.3 低优先级模块（P2）

| 模块 | 调用点数 | 主要问题 |
|------|----------|----------|
| Everything Provider | 1 处 | Windows 文件搜索 |
| System Actions | 1 处 | 系统操作提供者 |
| Channel Core (Renderer) | 4 处 | 底层 IPC 实现（需保留作为 TuffTransport 桥接层） |

---

## 4. 调用模式分析

### 4.1 主要调用模式

```
┌─────────────────────────────────────────────────────────────────┐
│  TouchChannel 调用模式                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  模式 1: touchApp.channel 获取引用                               │
│  ┌─────────────────────────────────────────────┐                │
│  │ const channel = this.touchApp.channel        │                │
│  │ channel.broadcastPlugin(...)                 │                │
│  └─────────────────────────────────────────────┘                │
│  出现次数: 13 处                                                 │
│                                                                  │
│  模式 2: 直接 touchChannel.send                                  │
│  ┌─────────────────────────────────────────────┐                │
│  │ touchChannel.send(eventName, payload)        │                │
│  └─────────────────────────────────────────────┘                │
│  出现次数: 1 处（插件 SDK）                                       │
│                                                                  │
│  模式 3: regChannel 注册处理器                                   │
│  ┌─────────────────────────────────────────────┐                │
│  │ regChannel(type, eventName, callback)        │                │
│  └─────────────────────────────────────────────┘                │
│  出现次数: 2 处（channel-core.ts 实现）                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 广播调用分布

| 广播方法 | 调用次数 | 主要使用者 |
|----------|----------|------------|
| `broadcastPlugin` | 5 处 | CoreBox, Plugin, OCR |
| `broadcast` | 0 处 | （未发现直接调用） |
| `broadcastTo` | 0 处 | （未发现直接调用） |

---

## 5. 迁移建议

### 5.1 高优先级迁移项

1. **Plugin Module 的 broadcastPlugin 调用（5 处）**
   - 建议：在 TuffTransport 中添加 `broadcastPlugin` 方法
   - 风险：插件兼容性
   - 缓解：保持内部实现为 TouchChannel，API 层使用 TuffTransport

2. **touchApp.channel 获取引用（13 处）**
   - 建议：改为通过 RuntimeAccessor 获取 TuffTransport 实例
   - 风险：低
   - 缓解：逐步替换，保持向后兼容

### 5.2 需保留的底层实现

| 文件 | 原因 |
|------|------|
| `channel/channel-core.ts` | TuffTransport 的底层桥接层，需保留 |
| `channel/common.ts` | genTouchChannel 创建函数，TuffTransport 内部使用 |

### 5.3 新增 TuffTransport 能力

| 能力 | 用途 | 优先级 |
|------|------|--------|
| `broadcastPlugin` | 插件专用广播 | P0 |
| `broadcastTo` | 定向窗口广播 | P1 |
| `sendTo` | 定向窗口发送 | P1 |

---

## 6. 附录

### 6.1 审计方法

- 使用 `grep` 搜索 `touchApp.channel`、`channel.broadcast`、`touchChannel.send` 等模式
- 人工审查搜索结果，排除误报
- 按模块和优先级分类

### 6.2 相关文件

- `apps/core-app/src/main/core/channel-core.ts` - TouchChannel 实现
- `apps/core-app/src/renderer/src/modules/channel/channel-core.ts` - 渲染进程 channel
- `packages/utils/transport/sdk/` - TuffTransport 实现