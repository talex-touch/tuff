# DivisionBox API

DivisionBox 是一个轻量级的子窗口系统，基于 `WebContentsView` 实现，用于承载插件 UI、系统工具和调试界面。

## 核心概念

### 生命周期状态

DivisionBox 有六个生命周期状态：

```
prepare → attach → active → inactive → detach → destroy
```

| 状态 | 说明 |
|------|------|
| `prepare` | 准备阶段，资源加载中 |
| `attach` | 已附加到窗口 |
| `active` | 活跃状态，用户正在交互 |
| `inactive` | 非活跃状态，可能被缓存 |
| `detach` | 已从窗口分离 |
| `destroy` | 已销毁，资源已释放 |

### DivisionBox 配置

```typescript
interface DivisionBoxConfig {
  /** 加载的 URL */
  url: string
  
  /** 窗口标题 */
  title: string
  
  /** 图标（可选） */
  icon?: string
  
  /** 窗口大小 */
  size?: 'compact' | 'medium' | 'expanded'
  
  /** 是否保持活跃（后台缓存） */
  keepAlive?: boolean
  
  /** 关联的插件 ID */
  pluginId?: string
  
  /** 初始状态数据 */
  initialState?: Record<string, any>
}
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Command/Ctrl+D` | 将当前选中项分离到 DivisionBox |

快捷键可在系统设置中自定义。

## 使用方式

### 从渲染进程打开 DivisionBox

```typescript
import { touchChannel } from '~/modules/channel/channel-core'

async function openDivisionBox() {
  const response = await touchChannel.send('division-box:open', {
    url: 'plugin://my-plugin/panel.html',
    title: '我的面板',
    icon: 'ri:dashboard-line',
    size: 'medium',
    keepAlive: true,
    pluginId: 'my-plugin'
  })
  
  if (response?.success) {
    console.log('Session ID:', response.data.sessionId)
  }
}
```

### 关闭 DivisionBox

```typescript
async function closeDivisionBox(sessionId: string) {
  await touchChannel.send('division-box:close', {
    sessionId,
    options: {
      force: false,
      saveState: true
    }
  })
}
```

### 获取会话状态

```typescript
async function getSessionState(sessionId: string) {
  const response = await touchChannel.send('division-box:get-state', {
    sessionId
  })
  
  if (response?.success) {
    console.log('State:', response.data.state)
  }
}
```

### 更新会话状态

```typescript
async function updateSessionState(sessionId: string, key: string, value: any) {
  await touchChannel.send('division-box:update-state', {
    sessionId,
    key,
    value
  })
}
```

### 获取所有活跃会话

```typescript
async function getActiveSessions() {
  const response = await touchChannel.send('division-box:get-active-sessions', {})
  
  if (response?.success) {
    console.log('Active sessions:', response.data)
  }
}
```

## 插件 SDK

### 快速开始

```typescript
import { useDivisionBox } from '@talex-touch/utils/plugin/sdk'

const divisionBox = useDivisionBox()

// 打开 DivisionBox
const { sessionId } = await divisionBox.open({
  url: 'https://example.com/tool',
  title: '我的工具',
  size: 'medium',
  keepAlive: true
})

// 关闭 DivisionBox
await divisionBox.close(sessionId)
```

### 完整 API

#### `open(config)`

打开新的 DivisionBox 窗口。

```typescript
import { useDivisionBox } from '@talex-touch/utils/plugin/sdk'

const divisionBox = useDivisionBox()

const { sessionId } = await divisionBox.open({
  url: 'https://example.com',
  title: 'Web Tool',
  icon: 'ri:tools-line',
  size: 'medium',
  keepAlive: true,
  header: {
    show: true,
    title: 'Custom Title',
    actions: [
      { label: 'Refresh', icon: 'ri:refresh-line', onClick: () => {} }
    ]
  }
})
```

#### `close(sessionId, options?)`

关闭 DivisionBox 窗口。

```typescript
// 简单关闭
await divisionBox.close(sessionId)

// 带延迟和动画
await divisionBox.close(sessionId, {
  delay: 1000,
  animation: true
})

// 强制关闭（忽略 keepAlive）
await divisionBox.close(sessionId, { force: true })
```

#### `onStateChange(handler)`

监听状态变化。

```typescript
const unsubscribe = divisionBox.onStateChange((data) => {
  console.log(`Session ${data.sessionId} changed to ${data.state}`)
})

// 停止监听
unsubscribe()
```

#### `updateState(sessionId, key, value)`

更新会话状态数据。

```typescript
// 保存滚动位置
await divisionBox.updateState(sessionId, 'scrollY', 150)

// 保存草稿
await divisionBox.updateState(sessionId, 'draft', {
  text: 'Hello world',
  timestamp: Date.now()
})
```

#### `getState(sessionId, key)`

获取会话状态数据。

```typescript
const scrollY = await divisionBox.getState(sessionId, 'scrollY')
const draft = await divisionBox.getState(sessionId, 'draft')
```

## URL 协议

DivisionBox 支持多种 URL 协议：

| 协议 | 说明 | 示例 |
|------|------|------|
| `plugin://` | 插件资源 | `plugin://my-plugin/index.html` |
| `file://` | 本地文件 | `file:///path/to/file.html` |
| `http(s)://` | 网络资源 | `https://example.com` |
| `tuff://` | 系统内置页面 | `tuff://detached?itemId=xxx` |

## 与 Flow Transfer 集成

DivisionBox 可以作为 Flow Transfer 的目标：

```json
{
  "flowTargets": [
    {
      "id": "open-in-panel",
      "name": "在面板中打开",
      "supportedTypes": ["json", "text"],
      "featureId": "open-panel"
    }
  ]
}
```

当 Flow 触发时，可以在 Feature 中打开 DivisionBox：

```typescript
function onFeatureTriggered(featureId: string, query: TuffQuery) {
  if (isFlowTriggered(query)) {
    const flowData = extractFlowData(query)
    
    // 打开 DivisionBox 显示 Flow 数据
    divisionBox.open({
      url: `/viewer.html?sessionId=${flowData.sessionId}`,
      title: '查看数据',
      initialState: {
        flowPayload: flowData.payload
      }
    })
  }
}
```

## IPC 通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `division-box:open` | 渲染 → 主 | 打开新会话 |
| `division-box:close` | 渲染 → 主 | 关闭会话 |
| `division-box:get-state` | 渲染 → 主 | 获取会话状态 |
| `division-box:update-state` | 渲染 → 主 | 更新会话状态 |
| `division-box:get-active-sessions` | 渲染 → 主 | 获取所有活跃会话 |
| `division-box:state-changed` | 主 → 渲染 | 状态变化通知 |
| `division-box:session-destroyed` | 主 → 渲染 | 会话销毁通知 |

## 资源限制

- 最大同时活跃会话数：10
- 每个会话最大视图数：5
- keepAlive 会话缓存数：20
- keepAlive 超时时间：5 分钟

## 最佳实践

1. **使用 keepAlive**：对于频繁使用的面板，启用 `keepAlive` 提升响应速度
2. **合理设置大小**：根据内容选择合适的 `size`
3. **保存状态**：关闭时使用 `saveState: true` 保存用户数据
4. **监听状态变化**：及时响应 `inactive` 状态，释放不必要的资源
5. **处理销毁事件**：监听 `session-destroyed` 清理相关资源

## 相关文档

- [Flow Transfer API](./flow-transfer.zh.md) - 插件间数据流转
- [Plugin Manifest](../manifest.zh.md) - 插件配置
