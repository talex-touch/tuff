# DivisionBox API 文档

## 概述

DivisionBox 是一个基于 Electron WebContentsView 的交互式容器系统,为插件 UI、系统工具和调试界面提供统一的浮动工作区平台。本文档详细介绍了 DivisionBox 的核心 API。

## 目录

- [DivisionBoxManager API](#divisionboxmanager-api)
- [DivisionBoxSession API](#divisionboxsession-api)
- [Plugin SDK API](#plugin-sdk-api)
- [IPC 通信接口](#ipc-通信接口)
- [类型定义](#类型定义)

---

## DivisionBoxManager API（管理器）

`DivisionBoxManager` 是主进程中管理所有 DivisionBox 会话的单例类。

### 获取实例

```typescript
import { DivisionBoxManager } from '@/main/modules/division-box'

const manager = DivisionBoxManager.getInstance()
```

### 方法

#### `createSession(config: DivisionBoxConfig): Promise<DivisionBoxSession>`

创建新的 DivisionBox 会话。

**参数:**
- `config`: DivisionBox 配置对象

**返回:** Promise<DivisionBoxSession> - 创建的会话实例

**示例:**
```typescript
const session = await manager.createSession({
  url: 'https://example.com/tool',
  title: '智能总结',
  icon: 'ri:magic-line',
  size: 'medium',
  keepAlive: true
})

console.log('Session created:', session.sessionId)
```

**错误处理:**
- 抛出 `DivisionBoxError` 如果配置无效
- 抛出 `DivisionBoxError` 如果资源创建失败

---

#### `getSession(sessionId: string): DivisionBoxSession | undefined`

根据 sessionId 获取会话实例。

**参数:**
- `sessionId`: 会话唯一标识符

**返回:** DivisionBoxSession | undefined - 会话实例,如果不存在则返回 undefined

**示例:**
```typescript
const session = manager.getSession('session-123')
if (session) {
  console.log('Session state:', session.getState())
}
```

---

#### `destroySession(sessionId: string): Promise<void>`

销毁指定的 DivisionBox 会话并清理所有资源。

**参数:**
- `sessionId`: 要销毁的会话 ID

**返回:** Promise<void>

**示例:**
```typescript
await manager.destroySession('session-123')
console.log('Session destroyed')
```

---

#### `getActiveSessions(): DivisionBoxSession[]`

获取所有活跃的会话列表。

**返回:** DivisionBoxSession[] - 活跃会话数组

**示例:**
```typescript
const sessions = manager.getActiveSessions()
console.log(`Active sessions: ${sessions.length}`)
sessions.forEach(s => {
  console.log(`- ${s.sessionId}: ${s.getState()}`)
})
```

---

#### `handleMemoryPressure(): void`

处理系统内存压力,触发 LRU 缓存回收。

**示例:**
```typescript
// 通常由系统自动调用
manager.handleMemoryPressure()
```

---

## DivisionBoxSession API（会话）

`DivisionBoxSession` 管理单个 DivisionBox 实例的生命周期、状态和资源。

### 属性

#### `readonly sessionId: string`

会话的唯一标识符。

#### `readonly meta: SessionMeta`

会话元数据,包含插件 ID、标题、图标等信息。

### 方法

#### `setState(newState: DivisionBoxState): Promise<void>`

设置会话状态。状态转换必须遵循状态机规则。

**参数:**
- `newState`: 新状态

**状态转换规则:**
```
PREPARE → ATTACH → ACTIVE
         ↓         ↓
      DESTROY ← INACTIVE → DETACH → DESTROY
                  ↓
               ACTIVE (恢复)
```

**示例:**
```typescript
await session.setState(DivisionBoxState.ACTIVE)
console.log('Session is now active')
```

**错误处理:**
- 抛出错误如果状态转换非法

---

#### `getState(): DivisionBoxState`

获取当前会话状态。

**返回:** DivisionBoxState - 当前状态

**示例:**
```typescript
const state = session.getState()
console.log('Current state:', state)
```

---

#### `setSessionState(key: string, value: any): void`

设置会话级别的状态数据。

**参数:**
- `key`: 状态键
- `value`: 状态值(可序列化的任意类型)

**示例:**
```typescript
session.setSessionState('scrollPosition', { x: 0, y: 100 })
session.setSessionState('draftContent', 'Hello world')
```

---

#### `getSessionState(key: string): any`

获取会话状态数据。

**参数:**
- `key`: 状态键

**返回:** any - 状态值,如果不存在则返回 undefined

**示例:**
```typescript
const scrollPos = session.getSessionState('scrollPosition')
console.log('Scroll position:', scrollPos)
```

---

#### `clearSessionState(): void`

清除所有会话状态数据。

**示例:**
```typescript
session.clearSessionState()
```

---

#### `onStateChange(listener: (state: DivisionBoxState) => void): void`

注册状态变更监听器。

**参数:**
- `listener`: 状态变更回调函数

**示例:**
```typescript
session.onStateChange((state) => {
  console.log('State changed to:', state)
})
```

---

#### `removeStateChangeListener(listener: (state: DivisionBoxState) => void): void`

移除状态变更监听器。

**参数:**
- `listener`: 要移除的监听器函数

**示例:**
```typescript
const listener = (state) => console.log(state)
session.onStateChange(listener)
// 稍后移除
session.removeStateChangeListener(listener)
```

---

#### `destroy(): Promise<void>`

销毁会话并清理所有资源。

**示例:**
```typescript
await session.destroy()
```

---

## Plugin SDK API（插件 SDK）

插件通过 SDK 接口与 DivisionBox 系统交互。

### 访问 SDK

```typescript
// 在插件代码中
const divisionBox = plugin.divisionBox
```

### 方法

#### `open(config: DivisionBoxOpenConfig): Promise<{ sessionId: string }>`

打开新的 DivisionBox 实例。

**参数:**
```typescript
interface DivisionBoxOpenConfig {
  url: string                    // WebContentsView 加载的 URL
  title?: string                 // 标题
  icon?: string                  // 图标 (iconify 格式)
  size?: 'compact' | 'medium' | 'expanded'  // 尺寸预设
  keepAlive?: boolean            // 是否启用缓存模式
  header?: {
    show?: boolean               // 是否显示 Header
    title?: string               // 自定义标题
    icon?: string                // 自定义图标
    actions?: HeaderAction[]     // 自定义操作按钮
  }
}
```

**返回:** Promise<{ sessionId: string }> - 包含会话 ID 的对象

**示例:**
```typescript
const { sessionId } = await plugin.divisionBox.open({
  url: 'https://example.com/tool',
  title: '智能总结',
  icon: 'ri:magic-line',
  size: 'medium',
  keepAlive: true,
  header: {
    show: true,
    actions: [
      {
        label: '刷新',
        icon: 'ri:refresh-line',
        onClick: () => console.log('Refresh clicked')
      }
    ]
  }
})

console.log('DivisionBox opened:', sessionId)
```

---

#### `close(sessionId: string, options?: CloseOptions): Promise<void>`

关闭指定的 DivisionBox 实例。

**参数:**
```typescript
interface CloseOptions {
  delay?: number        // 延迟关闭时间 (ms)
  animation?: boolean   // 是否播放关闭动画
  force?: boolean       // 强制关闭 (忽略 keepAlive)
}
```

**示例:**
```typescript
// 立即关闭
await plugin.divisionBox.close(sessionId)

// 延迟关闭并播放动画
await plugin.divisionBox.close(sessionId, {
  delay: 1000,
  animation: true
})

// 强制关闭 (忽略 keepAlive)
await plugin.divisionBox.close(sessionId, {
  force: true
})
```

---

#### `onStateChange(handler: (data: StateChangeData) => void): void`

监听 DivisionBox 状态变化。

**参数:**
```typescript
interface StateChangeData {
  sessionId: string
  oldState: DivisionBoxState
  newState: DivisionBoxState
}
```

**示例:**
```typescript
plugin.divisionBox.onStateChange((data) => {
  console.log(`Session ${data.sessionId} changed from ${data.oldState} to ${data.newState}`)
})
```

---

#### `updateState(sessionId: string, key: string, value: any): Promise<void>`

更新 DivisionBox 的 sessionState。

**参数:**
- `sessionId`: 会话 ID
- `key`: 状态键
- `value`: 状态值

**示例:**
```typescript
await plugin.divisionBox.updateState(sessionId, 'scrollPosition', { x: 0, y: 200 })
```

---

#### `getState(sessionId: string, key: string): Promise<any>`

获取 DivisionBox 的 sessionState。

**参数:**
- `sessionId`: 会话 ID
- `key`: 状态键

**返回:** Promise<any> - 状态值

**示例:**
```typescript
const scrollPos = await plugin.divisionBox.getState(sessionId, 'scrollPosition')
console.log('Scroll position:', scrollPos)
```

---

## IPC 通信接口

DivisionBox 通过 **TuffTransport** 在主进程和渲染/插件进程之间通信。

### 请求/响应（Handler）

#### `DivisionBoxEvents.open`

创建新的 DivisionBox。

**请求:**
```typescript
{
  url: string
  title?: string
  icon?: string
  size?: 'compact' | 'medium' | 'expanded'
  keepAlive?: boolean
  header?: { ... }
}
```

**响应:**
```typescript
{
  sessionId: string
  state: DivisionBoxState
  meta: SessionMeta
}
```

---

#### `DivisionBoxEvents.close`

关闭 DivisionBox。

**请求:**
```typescript
{
  sessionId: string
  options?: CloseOptions
}
```

**响应:**
```typescript
{
  success: boolean
}
```

---

#### `DivisionBoxEvents.getState`

获取会话状态。

**请求:**
```typescript
{
  sessionId: string
}
```

**响应:**
```typescript
DivisionBoxState | null
```

---

#### `DivisionBoxEvents.updateState`

更新 sessionState。

**请求:**
```typescript
{
  sessionId: string
  key: string
  value: any
}
```

**响应:**
```typescript
{
  success: boolean
}
```

---

#### `DivisionBoxEvents.getActiveSessions`

获取所有活跃会话。

**请求:** 无

**响应:**
```typescript
Array<{
  sessionId: string
  state: DivisionBoxState
  meta: SessionMeta
}>
```

---

### 推送事件（Broadcast）

#### `DivisionBoxEvents.stateChanged`

状态变更通知。

**数据:**
```typescript
{
  sessionId: string
  oldState: DivisionBoxState
  newState: DivisionBoxState
}
```

---

#### `DivisionBoxEvents.sessionDestroyed`

会话销毁通知。

**数据:**
```typescript
{
  sessionId: string
}
```

---

## 类型定义

### DivisionBoxState

```typescript
enum DivisionBoxState {
  PREPARE = 'prepare',      // 准备创建
  ATTACH = 'attach',        // 已挂载
  ACTIVE = 'active',        // 活跃可见
  INACTIVE = 'inactive',    // 不可见但缓存
  DETACH = 'detach',        // 已卸载
  DESTROY = 'destroy'       // 已销毁
}
```

---

### DivisionBoxConfig

```typescript
interface DivisionBoxConfig {
  url: string                    // WebContentsView 加载的 URL
  pluginId?: string              // 关联的插件 ID
  title: string                  // 标题
  icon?: string                  // 图标
  size?: 'compact' | 'medium' | 'expanded'  // 尺寸预设
  keepAlive?: boolean            // 是否启用缓存模式
  header?: {
    show: boolean                // 是否显示 Header
    title?: string               // 自定义标题
    icon?: string                // 自定义图标
    actions?: HeaderAction[]     // 自定义操作按钮
  }
  webPreferences?: Electron.WebPreferences  // WebContentsView 配置
}
```

---

### SessionMeta

```typescript
interface SessionMeta {
  pluginId?: string              // 插件 ID
  title: string                  // 标题
  icon?: string                  // 图标
  size: 'compact' | 'medium' | 'expanded'  // 尺寸
  keepAlive: boolean             // 是否启用缓存
  createdAt: number              // 创建时间戳
  lastAccessedAt: number         // 最后访问时间戳
}
```

---

### SessionInfo

```typescript
interface SessionInfo {
  sessionId: string              // 会话 ID
  state: DivisionBoxState        // 当前状态
  meta: SessionMeta              // 元数据
  bounds?: {                     // 窗口位置和尺寸
    x: number
    y: number
    width: number
    height: number
  }
}
```

---

### CloseOptions

```typescript
interface CloseOptions {
  delay?: number        // 延迟关闭时间 (ms)
  animation?: boolean   // 是否播放关闭动画
  force?: boolean       // 强制关闭 (忽略 keepAlive)
}
```

---

### HeaderAction

```typescript
interface HeaderAction {
  label: string         // 按钮标签
  icon?: string         // 按钮图标
  onClick: () => void   // 点击回调
}
```

---

### DivisionBoxError

```typescript
class DivisionBoxError extends Error {
  code: 'RESOURCE_ERROR' | 'STATE_ERROR' | 'IPC_ERROR' | 'PERMISSION_DENIED' | 'CONFIG_ERROR'
  sessionId?: string
  timestamp: number
}
```

---

## 性能指标

| 指标 | 目标值 |
|------|--------|
| 首帧渲染时间 | ≤ 250ms |
| 缓存恢复时间 | ≤ 120ms |
| 状态同步延迟 | ≤ 100ms |
| 内存使用(单实例) | < 50MB |
| 内存使用(10 实例) | < 300MB |

---

## 资源限制

- 单个 Session 最多注册 3 个 WebContentsView 实例
- 全局最多 20 个活跃实例
- LRU 缓存限制为 10 个实例
- 单个插件最多创建 5 个 DivisionBox

---

## 错误处理

所有异步方法都可能抛出 `DivisionBoxError`。建议使用 try-catch 处理:

```typescript
try {
  const session = await manager.createSession(config)
} catch (error) {
  if (error instanceof DivisionBoxError) {
    console.error(`DivisionBox error [${error.code}]:`, error.message)
  }
}
```

---

## 最佳实践

1. **使用 keepAlive 模式**: 对于频繁访问的工具,启用 keepAlive 以提升用户体验
2. **及时清理资源**: 不再使用的 DivisionBox 应该及时关闭
3. **监听状态变化**: 使用 onStateChange 监听器跟踪会话状态
4. **保存用户状态**: 使用 sessionState 保存用户的工作状态(滚动位置、草稿等)
5. **错误处理**: 始终处理可能的错误情况

---

## 相关文档

- [Manifest 配置文档](./DIVISION_BOX_MANIFEST.md)
- [开发者指南](./DIVISION_BOX_GUIDE.md)
- [使用示例](../examples/division-box/)
