# TuffTransport API

TuffTransport 是 Tuff 插件的下一代 IPC 通信系统，提供类型安全、高性能的消息传递，内置批量处理和流式传输支持。

::alert{type="info"}
TuffTransport 替代传统 Channel API。旧 API 仍可使用，但建议新开发使用 TuffTransport。
::

## 为什么选择 TuffTransport？

| 特性 | 传统 Channel | TuffTransport |
|------|-------------|---------------|
| 类型安全 | ❌ 字符串事件名 | ✅ 编译时类型检查 |
| 自动补全 | ❌ 无 IDE 支持 | ✅ 完整 IntelliSense |
| 批量处理 | ❌ 手动实现 | ✅ 自动请求合并 |
| 流式传输 | ❌ 不支持 | ✅ MessagePort 流 |
| 错误处理 | ❌ 通用错误 | ✅ 结构化错误类型 |

---

## 快速开始

```ts
import { useTuffTransport, CoreBoxEvents, StorageEvents } from '@talex-touch/utils/transport'

const transport = useTuffTransport()

// 发送类型安全的请求
await transport.send(CoreBoxEvents.ui.hide)

// 带参数的请求
const result = await transport.send(CoreBoxEvents.search.query, {
  query: { text: 'hello' }
})

// 批量请求（自动合并）
const [theme, lang] = await Promise.all([
  transport.send(StorageEvents.app.get, { key: 'theme' }),
  transport.send(StorageEvents.app.get, { key: 'language' }),
])
```

---

## 核心概念

### TuffEvent

TuffTransport 的每次通信都使用 `TuffEvent` —— 一个在编译时编码请求/响应类型的类型安全事件定义。

```ts
// ❌ 传统方式：字符串，无类型安全
channel.send('core-box:search:query', { text: 'hello' })

// ✅ TuffTransport：类型安全，自动补全
transport.send(CoreBoxEvents.search.query, { query: { text: 'hello' } })
//                                          ↑ TypeScript 强制正确的参数类型
```

### Event Builder

使用 `defineEvent` 构建器创建自定义事件：

```ts
import { defineEvent } from '@talex-touch/utils/transport'

// 定义类型安全的事件
const MyPluginEvents = {
  data: {
    fetch: defineEvent('my-plugin')
      .module('data')
      .event('fetch')
      .define<{ id: string }, { name: string; value: number }>()
  }
}

// 使用 - 完全类型安全！
const result = await transport.send(MyPluginEvents.data.fetch, { id: '123' })
console.log(result.name, result.value) // ✅ 类型安全访问
```

---

## API 参考

### useTuffTransport()

在插件渲染进程中获取 transport 实例。

```ts
import { useTuffTransport } from '@talex-touch/utils/transport'

const transport = useTuffTransport()
```

### transport.send(event, payload?, options?)

发送请求并等待响应。

**参数：**
- `event` - TuffEvent 实例（必填）
- `payload` - 匹配事件请求类型的参数
- `options` - 发送选项

**选项：**
| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `immediate` | `boolean` | `false` | 跳过批量，立即发送 |
| `timeout` | `number` | `10000` | 请求超时（毫秒） |

**示例：**

```ts
// 简单请求
await transport.send(CoreBoxEvents.ui.hide)

// 带参数的请求
const result = await transport.send(StorageEvents.app.get, { key: 'theme' })

// 立即发送（跳过批量）
await transport.send(StorageEvents.app.set, 
  { key: 'urgent', value: true },
  { immediate: true }
)

// 自定义超时
await transport.send(SlowEvent, data, { timeout: 30000 })
```

### transport.stream(event, payload, options)

通过 MessagePort 发起流式请求。

```ts
const controller = await transport.stream(
  CoreBoxEvents.search.query,
  { query: { text: 'hello' } },
  {
    onData: (result) => {
      console.log('收到数据:', result)
    },
    onEnd: () => {
      console.log('流完成')
    },
    onError: (err) => {
      console.error('流错误:', err)
    }
  }
)

// 需要时取消流
controller.cancel()
```

### transport.on(event, handler)

注册事件处理器接收消息。

```ts
const cleanup = transport.on(SomeEvent, (payload) => {
  console.log('收到:', payload)
  return { success: true } // 返回响应
})

// 完成时清理
onUnmounted(() => cleanup())
```

### transport.flush()

强制发送所有待处理的批量请求。

```ts
await transport.flush()
```

---

## 预定义事件

### CoreBoxEvents

```ts
import { CoreBoxEvents } from '@talex-touch/utils/transport'

// UI 控制
CoreBoxEvents.ui.show       // 显示 CoreBox
CoreBoxEvents.ui.hide       // 隐藏 CoreBox
CoreBoxEvents.ui.expand     // 展开/收起

// 搜索
CoreBoxEvents.search.query  // 执行搜索（流式）
CoreBoxEvents.search.cancel // 取消搜索

// 输入框
CoreBoxEvents.input.get     // 获取输入值
CoreBoxEvents.input.set     // 设置输入值
CoreBoxEvents.input.clear   // 清空输入

// 提供者
CoreBoxEvents.provider.deactivate    // 停用提供者
CoreBoxEvents.provider.getDetails    // 获取提供者详情（批量）
```

### StorageEvents

```ts
import { StorageEvents } from '@talex-touch/utils/transport'

// 应用存储（支持批量）
StorageEvents.app.get       // 获取值
StorageEvents.app.set       // 设置值
StorageEvents.app.delete    // 删除值

// 插件存储（支持批量）
StorageEvents.plugin.get    // 获取插件值
StorageEvents.plugin.set    // 设置插件值
```

### PluginEvents

```ts
import { PluginEvents } from '@talex-touch/utils/transport'

// 生命周期
PluginEvents.lifecycle.load     // 加载插件
PluginEvents.lifecycle.unload   // 卸载插件
PluginEvents.lifecycle.reload   // 重载插件

// 功能
PluginEvents.feature.trigger    // 触发功能

// 日志（批量）
PluginEvents.log.write          // 写入日志
```

### BoxItemEvents

```ts
import { BoxItemEvents } from '@talex-touch/utils/transport'

// CRUD（支持批量）
BoxItemEvents.crud.create   // 创建项
BoxItemEvents.crud.update   // 更新项
BoxItemEvents.crud.upsert   // 创建或更新
BoxItemEvents.crud.delete   // 删除项

// 批量操作
BoxItemEvents.batch.upsert  // 批量更新
BoxItemEvents.batch.delete  // 批量删除
BoxItemEvents.batch.clear   // 按来源清空
```

---

## 批量处理

TuffTransport 自动合并支持批量的事件请求：

```ts
// 这 3 个请求自动合并为 1 次 IPC 调用
const [a, b, c] = await Promise.all([
  transport.send(StorageEvents.app.get, { key: 'a' }),
  transport.send(StorageEvents.app.get, { key: 'b' }),
  transport.send(StorageEvents.app.get, { key: 'c' }),
])
// 结果：单次 IPC 包含 3 个请求，性能提升 500%+
```

### 批量配置

定义自定义事件时配置批量：

```ts
const MyEvent = defineEvent('my-plugin')
  .module('data')
  .event('fetch')
  .define<Request, Response>({
    batch: {
      enabled: true,
      windowMs: 50,        // 收集 50ms
      maxSize: 20,         // 每批最多 20 个请求
      mergeStrategy: 'dedupe' // 'queue' | 'dedupe' | 'latest'
    }
  })
```

**合并策略：**
- `queue` - 所有请求按顺序处理
- `dedupe` - 相同参数的请求共享响应
- `latest` - 相同 key 只保留最新请求

---

## 流式传输

对于大数据或持续数据，使用 MessagePort 流式传输：

```ts
const MyStreamEvent = defineEvent('my-plugin')
  .module('data')
  .event('stream')
  .define<{ filter: string }, AsyncIterable<DataItem>>({
    stream: {
      enabled: true,
      bufferSize: 100
    }
  })

// 消费流
const controller = await transport.stream(
  MyStreamEvent,
  { filter: 'active' },
  {
    onData: (item) => items.push(item),
    onEnd: () => console.log('完成'),
    onError: (err) => console.error(err)
  }
)

// 需要时取消
onUnmounted(() => controller.cancel())
```

---

## 错误处理

TuffTransport 提供结构化错误：

```ts
import { TuffTransportError, TuffTransportErrorCode } from '@talex-touch/utils/transport'

try {
  await transport.send(SomeEvent, data)
} catch (err) {
  if (err instanceof TuffTransportError) {
    switch (err.code) {
      case TuffTransportErrorCode.TIMEOUT:
        console.log('请求超时')
        break
      case TuffTransportErrorCode.INVALID_EVENT:
        console.log('无效事件 - 请使用 defineEvent()')
        break
      case TuffTransportErrorCode.UNKNOWN_EVENT:
        console.log('未注册处理器')
        break
    }
  }
}
```

**错误码：**
| 错误码 | 说明 |
|--------|------|
| `INVALID_EVENT` | 不是有效的 TuffEvent |
| `UNKNOWN_EVENT` | 未注册处理器 |
| `TIMEOUT` | 请求超时 |
| `STREAM_CANCELLED` | 流被取消 |
| `BATCH_FAILED` | 批量请求失败 |
| `SERIALIZE_FAILED` | 参数序列化失败 |

---

## 从传统 Channel 迁移

### 之前（传统方式）

```ts
import { useChannel } from '@talex-touch/utils/plugin/sdk'

const channel = useChannel()
const result = await channel.send('core-box:search:query', { text: 'hello' })
```

### 之后（TuffTransport）

```ts
import { useTuffTransport, CoreBoxEvents } from '@talex-touch/utils/transport'

const transport = useTuffTransport()
const result = await transport.send(CoreBoxEvents.search.query, { query: { text: 'hello' } })
```

### 渐进式迁移

两套 API 可以同时使用 —— 按自己的节奏迁移：

```ts
// 传统方式（仍然有效）
await channel.send('storage:app:get', { key: 'theme' })

// 新方式（推荐）
await transport.send(StorageEvents.app.get, { key: 'theme' })
```

---

## 最佳实践

1. **始终使用 TuffEvent** - 不要传字符串给 `transport.send()`
2. **定义自定义事件** - 使用 `defineEvent()` 创建插件特定的通信
3. **利用批量处理** - 使用 `Promise.all()` 发起多个请求
4. **清理处理器** - 在 `onUnmounted()` 中调用清理函数
5. **处理错误** - 检查 `TuffTransportErrorCode` 进行特定处理
6. **使用流式传输** - 用于大数据或实时更新

---

## 类型定义

```ts
interface ITuffTransport {
  send<TReq, TRes>(
    event: TuffEvent<TReq, TRes>,
    payload: TReq,
    options?: SendOptions
  ): Promise<TRes>

  stream<TReq, TChunk>(
    event: TuffEvent<TReq, AsyncIterable<TChunk>>,
    payload: TReq,
    options: StreamOptions<TChunk>
  ): Promise<StreamController>

  on<TReq, TRes>(
    event: TuffEvent<TReq, TRes>,
    handler: (payload: TReq) => TRes | Promise<TRes>
  ): () => void

  flush(): Promise<void>
  destroy(): void
}

interface SendOptions {
  immediate?: boolean
  timeout?: number
}

interface StreamOptions<T> {
  onData: (chunk: T) => void
  onError?: (error: Error) => void
  onEnd?: () => void
}

interface StreamController {
  cancel(): void
  readonly cancelled: boolean
  readonly streamId: string
}
```
