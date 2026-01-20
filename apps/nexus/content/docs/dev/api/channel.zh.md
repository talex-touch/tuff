# Channel API（传统）

::alert{type="warning"}
**已弃用：** Channel API 已弃用，建议使用 [TuffTransport](./transport.zh.md)。虽然它仍然可用，但我们建议新开发使用 TuffTransport。查看[迁移指南](./transport.zh.md#从传统-channel-迁移)。
::

## 概述

Channel SDK 提供插件与主程序之间的 IPC 通信能力，基于 Promise 异步返回。

## 介绍

**快速开始**

```ts
import { useChannel, usePluginRendererChannel } from '@talex-touch/utils/plugin/sdk'

// 方式 1: 获取原始 channel 对象
const channel = useChannel()
const result = await channel.send('some-event', { data: 'value' })

// 方式 2: 使用封装的 Plugin Channel
const pluginChannel = usePluginRendererChannel()
await pluginChannel.send('my-plugin:action', { payload: 'data' })
```

---

## API 参考

**useChannel()**

获取底层 IPC channel 实例。

```ts
import { useChannel } from '@talex-touch/utils/plugin/sdk'

const channel = useChannel()

// 发送消息
const response = await channel.send('event-name', { key: 'value' })

// 注册监听器
const unsubscribe = channel.regChannel('event-name', (data) => {
  console.log('收到消息:', data)
})

// 取消监听
unsubscribe()
```

**usePluginRendererChannel()**

获取插件专用的 channel 实例，提供更友好的 API。

```ts
import { usePluginRendererChannel } from '@talex-touch/utils/plugin/sdk'

const channel = usePluginRendererChannel()
```

**`send(eventName, payload)`**

异步发送消息并等待响应。

```ts
const result = await channel.send('clipboard:get-latest')
```

**`sendSync(eventName, payload)`**

同步发送消息（尽量避免使用）。

```ts
const result = channel.sendSync('get-config')
```

**`on(eventName, handler)`**

注册事件监听器。

```ts
const dispose = channel.on('core-box:input-change', (data) => {
  console.log('输入变化:', data.input)
})

// 停止监听
dispose()
```

**`once(eventName, handler)`**

注册一次性监听器，触发后自动移除。

```ts
channel.once('plugin:ready', () => {
  console.log('插件就绪')
})
```

**`raw`**

获取底层 channel 对象。

```ts
const rawChannel = channel.raw
```

---

## 内置事件

**CoreBox 相关**

| 事件 | 说明 | 数据 |
|------|------|------|
| `core-box:input-change` | 搜索输入变化 | `{ input: string }` |
| `core-box:key-event` | 键盘事件转发 | `ForwardedKeyEvent` |
| `core-box:clipboard-change` | 剪贴板变化 | `{ item: ClipboardItem }` |

**插件存储**

| 事件 | 说明 | 数据 |
|------|------|------|
| `plugin:storage:update` | 存储更新广播 | `{ name: string, fileName?: string }` |

**DivisionBox**

| 事件 | 说明 | 数据 |
|------|------|------|
| `division-box:state-changed` | 状态变化 | `{ sessionId: string, state: string }` |

---

## 自定义事件通信

**发送到主进程**

```ts
const channel = useChannel()

// 发送并等待响应
const result = await channel.send('my-plugin:do-something', {
  action: 'process',
  data: [1, 2, 3]
})

if (result.success) {
  console.log('处理结果:', result.data)
}
```

**监听主进程事件**

```ts
const dispose = channel.regChannel('my-plugin:notification', (data) => {
  console.log('收到通知:', data)
})

// 组件卸载时清理
onUnmounted(() => {
  dispose()
})
```

---

## 错误处理

```ts
try {
  const result = await channel.send('risky-operation', data)
} catch (error) {
  if (error.message.includes('timeout')) {
    console.error('操作超时')
  } else {
    console.error('操作失败:', error)
  }
}
```

---

## 技术原理

- Channel API 通过主进程 IPC 通道处理请求与响应，统一异常与超时管理。
- 事件名与 payload 结构需保持稳定，以保证插件侧调用兼容。

## 最佳实践

1. **命名空间**：使用 `pluginName:action` 格式，避免冲突
2. **及时清理**：组件卸载时调用 `dispose()` 移除监听器
3. **错误处理**：始终用 try-catch 包裹 send 调用
4. **类型安全**：定义请求和响应的 TypeScript 接口

```ts
interface MyRequest {
  action: string
  params: Record<string, any>
}

interface MyResponse {
  success: boolean
  data?: any
  error?: string
}

const result = await channel.send('my-plugin:action', {
  action: 'query',
  params: { id: 123 }
} as MyRequest) as MyResponse
```

---

## 类型定义

```ts
interface IPluginRendererChannel {
  send(eventName: string, payload?: any): Promise<any>
  sendSync(eventName: string, payload?: any): any
  on(eventName: string, handler: PluginChannelHandler): () => void
  once(eventName: string, handler: PluginChannelHandler): () => void
  raw: ITouchClientChannel
}

type PluginChannelHandler = (event: any) => void
```
