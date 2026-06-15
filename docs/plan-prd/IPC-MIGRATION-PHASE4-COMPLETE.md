# IPC 迁移 Phase 4 完成报告

> 完成日期：2026-06-14
> 状态：已完成

---

## 1. 执行摘要

Phase 4（清理与验证）已完成。所有 legacy TouchChannel 方法已标记为 `@deprecated`，开发者文档已更新。

---

## 2. 变更清单

### 2.1 标记废弃方法

| 文件 | 方法 | 状态 |
|------|------|------|
| `channel-core.ts:477` | `regChannel()` | ✅ @deprecated |
| `channel-core.ts:719` | `broadcast()` | ✅ @deprecated |
| `channel-core.ts:726` | `broadcastTo()` | ✅ @deprecated |
| `channel-core.ts:789` | `broadcastPlugin()` | ✅ @deprecated |

### 2.2 废弃说明

| 方法 | 替代方案 |
|------|----------|
| `regChannel(type, eventName, callback)` | `transport.on(event, handler)` |
| `broadcast(type, eventName, arg)` | `transport.broadcast(event, payload)` |
| `broadcastTo(win, type, eventName, arg)` | `transport.broadcastToWindow(windowId, event, payload)` |
| `broadcastPlugin(pluginName, eventName, arg)` | `transport.broadcastPlugin(pluginName, event, payload)` |

---

## 3. 验证结果

### 3.1 Lint 检查

```bash
pnpm lint
# 结果：0 errors, 1 warning (unrelated test file)
```

### 3.2 代码扫描

```bash
# 检查直接 channel 调用
grep -r "channel\.(broadcast|send|regChannel|broadcastPlugin)\(" --include="*.ts" apps/core-app/src/main
# 结果：0 处

# 检查废弃方法使用（排除定义本身）
grep -r "touchChannel\." --include="*.ts" apps/core-app/src/main | grep -v "test\."
# 结果：仅 plugin.ts 中的本地包装器（内部已用 transport）
```

---

## 4. 迁移总结

### 4.1 完成的迁移

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 基础设施准备：审计调用点、补充事件定义 | ✅ 完成 |
| Phase 2 | 广播机制统一：迁移 broadcastPlugin 调用 | ✅ 完成 |
| Phase 3 | 模块级迁移：迁移所有 TouchChannel 调用 | ✅ 完成 |
| Phase 4 | 清理与验证：标记废弃方法、更新文档 | ✅ 完成 |

### 4.2 最终统计

| 指标 | 迁移前 | 迁移后 |
|------|--------|--------|
| `channel.broadcastPlugin` 调用 | 5 处 | 0 处 |
| `touchChannel.send` 直接调用 | 1 处 | 0 处 |
| `touchApp.channel.*` 调用 | 13 处 | 0 处 |
| 废弃方法标记 | 0 个 | 4 个 |
| 新增 TuffTransport API | 0 个 | 1 个 |
| 新增事件定义 | 0 个 | 6 个 |

---

## 5. 新增 API 文档

### 5.1 TuffMainTransport.broadcastPlugin

```typescript
/**
 * Broadcasts a message to a specific plugin's renderer (fire-and-forget).
 *
 * @param pluginName - Name of the target plugin
 * @param event - Type-safe event definition or string event name
 * @param payload - Event payload
 *
 * @example
 * ```typescript
 * import { PluginBroadcastEvents } from '@talex-touch/utils/transport/events'
 *
 * // Using type-safe event definition
 * transport.broadcastPlugin('my-plugin', PluginBroadcastEvents.stateChanged, {
 *   pluginName: 'my-plugin',
 *   state: 'active'
 * })
 *
 * // Using string event name (for backward compatibility)
 * transport.broadcastPlugin('my-plugin', 'my-event-name', { data: 'value' })
 * ```
 */
broadcastPlugin<TReq>(
  pluginName: string,
  event: TuffEvent<TReq, void> | string,
  payload: TReq,
): void
```

### 5.2 PluginBroadcastEvents

```typescript
import { PluginBroadcastEvents } from '@talex-touch/utils/transport/events'

// 插件输入变化
PluginBroadcastEvents.inputChange

// OCR 剪贴板更新
PluginBroadcastEvents.clipboardChange

// 插件状态变化
PluginBroadcastEvents.stateChanged

// 插件重载
PluginBroadcastEvents.reload

// 插件崩溃
PluginBroadcastEvents.crashed

// CoreBox UI 恢复
PluginBroadcastEvents.uiResume
```

---

## 6. 迁移指南

### 6.1 从 TouchChannel 迁移到 TuffTransport

**之前（Legacy）**：
```typescript
import { genTouchChannel } from '../core/channel-core'

const channel = genTouchChannel(app)

// 注册处理器
channel.regChannel(ChannelType.MAIN, 'my:event', (data) => {
  return { result: 'ok' }
})

// 发送消息
channel.send('my:event', payload)

// 广播消息
channel.broadcast(ChannelType.MAIN, 'my:event', payload)
channel.broadcastPlugin(pluginName, 'my:event', payload)
```

**之后（TuffTransport）**：
```typescript
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { MyEvents } from '@talex-touch/utils/transport/events'

const transport = getTuffTransportMain(channel, keyManager)

// 注册处理器
transport.on(MyEvents.myEvent, (payload) => {
  return { result: 'ok' }
})

// 发送消息
await transport.send(MyEvents.myEvent, payload)

// 广播消息
transport.broadcast(MyEvents.myEvent, payload)
transport.broadcastPlugin(pluginName, MyEvents.myEvent, payload)
```

---

## 7. 下一步

IPC 迁移已全部完成。建议：

1. 监控生产环境日志，确保无回归
2. 在后续版本中移除废弃方法（建议 v3.0）
3. 持续优化 TuffTransport 性能

---

## 8. 附录

### 8.1 相关文件

- [IPC 迁移计划](./IPC-MIGRATION-PLAN.md)
- [TouchChannel 审计报告](./IPC-AUDIT-REPORT.md)
- [Phase 2 完成报告](./IPC-MIGRATION-PHASE2-COMPLETE.md)
- [Phase 3 完成报告](./IPC-MIGRATION-PHASE3-COMPLETE.md)

### 8.2 完整变更文件清单

```
packages/utils/transport/sdk/main-transport.ts
packages/utils/transport/events/plugin-broadcast.ts
packages/utils/transport/events/index.ts
apps/core-app/src/main/core/channel-core.ts
apps/core-app/src/main/modules/box-tool/core-box/window.ts
apps/core-app/src/main/modules/plugin/adapters/plugin-features-adapter.ts
apps/core-app/src/main/modules/plugin/plugin-module.ts
apps/core-app/src/main/modules/ocr/ocr-service.ts
```