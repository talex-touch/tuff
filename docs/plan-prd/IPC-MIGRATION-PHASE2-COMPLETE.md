# IPC 迁移 Phase 2 完成报告

> 完成日期：2026-06-14
> 状态：已完成

---

## 1. 执行摘要

Phase 2（广播机制统一）已完成。所有 `channel.broadcastPlugin()` 调用已替换为 `transport.broadcastPlugin()`，实现了从 legacy TouchChannel 到 TuffTransport 的迁移。

---

## 2. 变更清单

### 2.1 TuffTransport API 扩展

| 文件 | 变更 |
|------|------|
| `packages/utils/transport/sdk/main-transport.ts` | 添加 `broadcastPlugin` 方法，支持 TuffEvent 对象和字符串事件名 |

### 2.2 新增事件定义

| 文件 | 变更 |
|------|------|
| `packages/utils/transport/events/plugin-broadcast.ts` | 新建文件，定义 6 个插件广播事件 |
| `packages/utils/transport/events/index.ts` | 导出 `PluginBroadcastEvents` |

### 2.3 模块迁移

| 文件 | 行号 | 变更 |
|------|------|------|
| `box-tool/core-box/window.ts` | 1649-1651 | `broadcastPluginMessage` 方法改用 `transport.broadcastPlugin()` |
| `plugin/adapters/plugin-features-adapter.ts` | 151-156 | 改用 `transport.broadcastPlugin()` |
| `plugin/plugin-module.ts` | 940-944 | 改用 `transport.broadcastPlugin()` |
| `plugin/plugin-module.ts` | 983-987 | 改用 `transport.broadcastPlugin()` |
| `ocr/ocr-service.ts` | 1563-1574 | 改用 `transport.broadcastPlugin()` |

---

## 3. API 使用示例

### 3.1 之前（Legacy TouchChannel）

```typescript
const channel = touchApp.channel
channel.broadcastPlugin(pluginName, 'event-name', payload)
```

### 3.2 之后（TuffTransport）

```typescript
const transport = getTransport()
transport.broadcastPlugin(pluginName, PluginBroadcastEvents.stateChanged, {
  pluginName,
  state: 'active'
})
```

---

## 4. 验证结果

| 检查项 | 状态 |
|--------|------|
| Lint 检查 | ✅ 通过（0 errors） |
| TypeScript 类型检查 | ✅ 通过 |
| 现有测试 | ✅ 未破坏 |

---

## 5. 统计

| 指标 | 之前 | 之后 |
|------|------|------|
| `channel.broadcastPlugin` 调用 | 5 处 | 0 处 |
| `transport.broadcastPlugin` 调用 | 0 处 | 5 处 |
| 插件广播事件定义 | 0 个 | 6 个 |

---

## 6. 下一步

Phase 2 完成后，建议进入 Phase 3（模块级迁移），继续迁移其他 TouchChannel 直接调用点：

1. Storage Module 的广播更新
2. WindowManager 的窗口状态广播
3. 其他模块的 raw channel 调用

---

## 7. 附录

### 7.1 相关文件

- [IPC 迁移计划](./IPC-MIGRATION-PLAN.md)
- [TouchChannel 审计报告](./IPC-AUDIT-REPORT.md)
- [IPC 事件缺口分析](./IPC-EVENTS-GAP-ANALYSIS.md)

### 7.2 新增 API 文档

```typescript
// TuffMainTransport.broadcastPlugin
broadcastPlugin<TReq>(
  pluginName: string,
  event: TuffEvent<TReq, void> | string,
  payload: TReq,
): void

// PluginBroadcastEvents
PluginBroadcastEvents.inputChange      // 插件输入变化
PluginBroadcastEvents.clipboardChange  // OCR 剪贴板更新
PluginBroadcastEvents.stateChanged     // 插件状态变化
PluginBroadcastEvents.reload           // 插件重载
PluginBroadcastEvents.crashed          // 插件崩溃
PluginBroadcastEvents.uiResume         // CoreBox UI 恢复
```