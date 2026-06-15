# IPC 事件定义缺口分析

> 分析日期：2026-06-14
> 目标：识别 TuffTransport 相对于 TouchChannel 的能力缺口

---

## 1. 执行摘要

通过对比 TouchChannel 的完整 API 和 TuffTransport 的现有实现，识别出以下关键缺口：

| 缺口类型 | 数量 | 优先级 |
|----------|------|--------|
| 缺失的 broadcastPlugin 方法 | 1 处 | P0 |
| 缺失的插件广播事件定义 | 5 处 | P0 |
| 缺失的 broadcastTo 方法 | 1 处 | P1 |

---

## 2. 详细缺口分析

### 2.1 P0 缺口：broadcastPlugin 方法

**现状**：
- `TouchChannel` 提供 `broadcastPlugin(pluginName, eventName, arg?)` 方法
- `TuffMainTransport` 没有对应方法
- 24 处代码直接使用 `channel.broadcastPlugin()`

**影响**：
- 插件通信核心功能无法通过 TuffTransport 实现
- 迁移后仍需依赖 TouchChannel

**解决方案**：
在 `TuffMainTransport` 中添加 `broadcastPlugin` 方法

### 2.2 P0 缺口：插件广播事件定义

**现状**：
以下事件在代码中使用但未在 `packages/utils/transport/events/` 中定义：

| 事件名称 | 使用位置 | 说明 |
|----------|----------|------|
| `core-box:input-change` | plugin-features-adapter.ts:152 | 插件输入变化 |
| `core-box:clipboard-change` | ocr-service.ts:1570 | OCR 剪贴板更新 |
| `plugin:state-changed` | plugin-module.ts:940,983 | 插件状态变化 |
| `plugin:reload` | plugin-module.ts | 插件重载 |
| `plugin:crashed` | plugin-module.ts | 插件崩溃 |

**影响**：
- 缺乏类型安全的事件定义
- 编译时无法检查事件名称拼写
- 无法利用 TuffTransport 的批处理和流式能力

**解决方案**：
在 `packages/utils/transport/events/` 中补充缺失的事件定义

### 2.3 P1 缺口：broadcastTo 方法

**现状**：
- `TouchChannel` 提供 `broadcastTo(window, channelType, eventName, arg?)` 方法
- `TuffMainTransport` 只有 `broadcastToWindow(windowId, event, payload)` 方法
- 缺少对 `channelType` 参数的支持

**影响**：
- 无法向特定 channel 类型广播
- 可能影响插件通道的隔离性

**解决方案**：
评估是否需要扩展 `broadcastToWindow` 方法，或添加新的 `broadcastToChannel` 方法

---

## 3. 实施计划

### 3.1 Phase 1：添加 broadcastPlugin 方法

**文件**：`packages/utils/transport/sdk/main-transport.ts`

```typescript
/**
 * Broadcasts a message to a specific plugin's renderer (fire-and-forget).
 */
broadcastPlugin<TReq>(
  pluginName: string,
  event: TuffEvent<TReq, void>,
  payload: TReq,
): void {
  assertTuffEvent(event, 'TuffMainTransport.broadcastPlugin')
  
  const eventName = event.toEventName()
  this.channel.broadcastPlugin(pluginName, eventName, payload)
}
```

### 3.2 Phase 2：补充事件定义

**文件**：`packages/utils/transport/events/plugin.ts`（新建）

```typescript
import { defineEvent, defineRawEvent } from '../event/builder'

// ============================================================================
// Plugin Broadcast Events
// ============================================================================

export const PluginBroadcastEvents = {
  /**
   * Input change broadcast from plugin to CoreBox.
   */
  inputChange: defineRawEvent<{
    pluginName: string
    featureId: string
    input: unknown
  }, void>('plugin:input-change'),

  /**
   * Clipboard change broadcast from OCR to plugin.
   */
  clipboardChange: defineRawEvent<{
    pluginName: string
    item: unknown
  }, void>('plugin:clipboard-change'),

  /**
   * Plugin state changed notification.
   */
  stateChanged: defineRawEvent<{
    pluginName: string
    state: 'active' | 'inactive' | 'enabled' | 'disabled' | 'crashed'
  }, void>('plugin:state-changed'),

  /**
   * Plugin reload notification.
   */
  reload: defineRawEvent<{
    pluginName: string
  }, void>('plugin:reload-notify'),

  /**
   * Plugin crashed notification.
   */
  crashed: defineRawEvent<{
    pluginName: string
    error?: string
  }, void>('plugin:crashed-notify'),
} as const
```

### 3.3 Phase 3：更新类型定义

**文件**：`packages/utils/transport/channel-types.ts`

```typescript
// 在 BridgeChannelType 接口中添加
export interface BridgeChannelType {
  // ... 现有方法
  
  /**
   * Broadcasts a message to a specific plugin.
   */
  broadcastPlugin: (pluginName: string, eventName: string, arg?: any) => void
}
```

---

## 4. 实施状态

### 4.1 已完成

| 任务 | 状态 | 文件 |
|------|------|------|
| 添加 `broadcastPlugin` 类型到 `MainChannelBridge` | ✅ 完成 | `packages/utils/transport/sdk/main-transport.ts` |
| 实现 `broadcastPlugin` 方法 | ✅ 完成 | `packages/utils/transport/sdk/main-transport.ts` |
| 创建 `PluginBroadcastEvents` 事件定义 | ✅ 完成 | `packages/utils/transport/events/plugin-broadcast.ts` |
| 导出 `PluginBroadcastEvents` | ✅ 完成 | `packages/utils/transport/events/index.ts` |
| Lint 检查通过 | ✅ 通过 | - |

### 4.2 待完成

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 更新现有代码使用新的 TuffTransport API | P0 | 将 `channel.broadcastPlugin()` 替换为 `transport.broadcastPlugin()` |
| 添加单元测试 | P1 | 覆盖新方法和事件 |
| 更新开发者文档 | P2 | 记录新的 API 和迁移指南

---

## 5. 附录

### 5.1 相关文件

- `packages/utils/transport/sdk/main-transport.ts` - TuffMainTransport 实现
- `packages/utils/transport/channel-types.ts` - Channel 类型定义
- `packages/utils/transport/events/index.ts` - 事件定义入口
- `apps/core-app/src/main/core/channel-core.ts` - TouchChannel 实现

### 5.2 参考文档

- [IPC 迁移计划](./IPC-MIGRATION-PLAN.md)
- [TouchChannel 审计报告](./IPC-AUDIT-REPORT.md)