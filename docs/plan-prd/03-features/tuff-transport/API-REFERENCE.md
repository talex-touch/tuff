# TuffTransport API Reference

## 快速开始

```typescript
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'

const transport = useTuffTransport()

// 发送请求
await transport.send(CoreBoxEvents.ui.hide)
await transport.send(CoreBoxEvents.search.query, { text: 'hello' })
```

---

## 1. Event Builder API

### 1.1 defineEvent

创建命名空间，开始构建事件。

```typescript
import { defineEvent } from '@talex-touch/utils/transport'

const event = defineEvent('namespace')
  .module('module')
  .event('action')
  .define<RequestType, ResponseType>(options?)
```

### 1.2 完整示例

```typescript
// 无参数事件
const hideEvent = defineEvent('core-box')
  .module('ui')
  .event('hide')
  .define<void, void>()

// 带参数事件
const queryEvent = defineEvent('core-box')
  .module('search')
  .event('query')
  .define<{ text: string }, SearchResult[]>()

// 带批量配置
const getStorageEvent = defineEvent('storage')
  .module('app')
  .event('get')
  .define<{ key: string }, unknown>({
    batch: {
      enabled: true,
      windowMs: 50,        // 批量窗口 50ms
      maxSize: 20,         // 最多 20 个请求合并
      mergeStrategy: 'queue'  // 队列模式
    }
  })

// 带流式配置
const streamEvent = defineEvent('core-box')
  .module('search')
  .event('stream')
  .define<{ text: string }, AsyncIterable<SearchResult>>({
    stream: {
      enabled: true,
      bufferSize: 100,
      backpressure: 'buffer'
    }
  })
```

### 1.3 TuffEvent 接口

```typescript
interface TuffEvent<TRequest, TResponse, TNamespace, TModule, TAction> {
  readonly __brand: 'TuffEvent'
  readonly namespace: TNamespace
  readonly module: TModule
  readonly action: TAction
  
  // 内部类型标记（不可访问）
  readonly _request: TRequest
  readonly _response: TResponse
  
  // 方法
  toString(): string      // 返回 "namespace:module:action"
  toEventName(): string   // 同 toString()
}
```

### 1.4 BatchConfig 选项

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `enabled` | `boolean` | `false` | 是否启用批量 |
| `windowMs` | `number` | `50` | 批量窗口时间 (ms) |
| `maxSize` | `number` | `50` | 最大批量大小 |
| `mergeStrategy` | `'queue' \| 'dedupe' \| 'latest'` | `'queue'` | 合并策略 |

**合并策略说明：**

- `queue` - 所有请求按顺序排队
- `dedupe` - 相同 payload 的请求去重，共享响应
- `latest` - 相同 key 的请求只保留最新

### 1.5 StreamConfig 选项

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `enabled` | `boolean` | `false` | 是否启用流式 |
| `bufferSize` | `number` | `100` | 缓冲区大小 |
| `backpressure` | `'drop' \| 'buffer' \| 'error'` | `'buffer'` | 背压策略 |

---

## 2. Renderer SDK API

### 2.1 useTuffTransport

获取 Transport 单例。

```typescript
import { useTuffTransport } from '@talex-touch/utils/transport'

const transport = useTuffTransport()
```

### 2.2 transport.send

发送请求。

```typescript
// 签名
send<TReq, TRes>(
  event: TuffEvent<TReq, TRes>,
  payload: TReq,
  options?: SendOptions
): Promise<TRes>

// 无参数版本
send<TRes>(event: TuffEvent<void, TRes>): Promise<TRes>
```

**SendOptions:**

| 属性 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `immediate` | `boolean` | `false` | 跳过批量，立即发送 |
| `timeout` | `number` | `10000` | 超时时间 (ms) |

**示例：**

```typescript
// 基础用法
await transport.send(CoreBoxEvents.ui.hide)
await transport.send(CoreBoxEvents.search.query, { text: 'hello' })

// 立即发送（跳过批量）
await transport.send(StorageEvents.app.get, { key: 'urgent' }, { immediate: true })

// 自定义超时
await transport.send(SlowEvent, data, { timeout: 30000 })
```

### 2.3 transport.stream

发起流式请求。

```typescript
// 签名
stream<TReq, TChunk>(
  event: TuffEvent<TReq, AsyncIterable<TChunk>>,
  payload: TReq,
  options: StreamOptions<TChunk>
): Promise<StreamController>
```

**StreamOptions:**

| 属性 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `onData` | `(chunk: TChunk) => void` | ✅ | 数据回调 |
| `onError` | `(error: Error) => void` | ❌ | 错误回调 |
| `onEnd` | `() => void` | ❌ | 结束回调 |

**StreamController:**

```typescript
interface StreamController {
  cancel(): void           // 取消流
  readonly cancelled: boolean  // 是否已取消
}
```

**示例：**

```typescript
const controller = await transport.stream(
  CoreBoxEvents.search.stream,
  { text: 'hello' },
  {
    onData: (result) => {
      results.value.push(result)
    },
    onEnd: () => {
      loading.value = false
    },
    onError: (err) => {
      error.value = err.message
    }
  }
)

// 用户取消
onUnmounted(() => {
  controller.cancel()
})
```

### 2.4 transport.on

注册事件处理器（接收主进程消息）。

```typescript
// 签名
on<TReq, TRes>(
  event: TuffEvent<TReq, TRes>,
  handler: (payload: TReq) => TRes | Promise<TRes>
): () => void  // 返回取消函数
```

**示例：**

```typescript
const unsubscribe = transport.on(SomeEvent, async (payload) => {
  // 处理来自主进程的请求
  return { success: true }
})

// 取消监听
onUnmounted(() => {
  unsubscribe()
})
```

### 2.5 transport.flush

强制 flush 所有待处理的批量请求。

```typescript
await transport.flush()
```

### 2.6 transport.destroy

销毁实例，清理资源。

```typescript
transport.destroy()
```

---

## 3. Main Process SDK API

### 3.1 getTuffTransportMain

获取主进程 Transport 单例。

```typescript
import { getTuffTransportMain } from '@talex-touch/utils/transport'

const transport = getTuffTransportMain()
```

### 3.2 transport.on

注册事件处理器。

```typescript
// 签名
on<TReq, TRes>(
  event: TuffEvent<TReq, TRes>,
  handler: (payload: TReq, context: HandlerContext) => TRes | Promise<TRes>
): () => void
```

**HandlerContext:**

```typescript
interface HandlerContext {
  sender: Electron.WebContents  // 发送者
  eventName: string             // 事件名
}
```

**示例：**

```typescript
transport.on(CoreBoxEvents.ui.hide, () => {
  coreBoxManager.trigger(false)
})

transport.on(CoreBoxEvents.search.query, async (query, ctx) => {
  console.log('Request from:', ctx.sender.id)
  return searchEngine.search(query)
})
```

### 3.3 transport.onStream

注册流式处理器。

```typescript
// 签名
onStream<TReq, TChunk>(
  event: TuffEvent<TReq, AsyncIterable<TChunk>>,
  handler: (payload: TReq, context: StreamContext<TChunk>) => void | Promise<void>
): () => void
```

**StreamContext:**

```typescript
interface StreamContext<TChunk> {
  emit(chunk: TChunk): void      // 发送数据
  error(err: Error): void        // 发送错误
  end(): void                    // 结束流
  isCancelled(): boolean         // 检查是否取消
}
```

**示例：**

```typescript
transport.onStream(CoreBoxEvents.search.stream, async (query, ctx) => {
  const generator = searchEngine.streamSearch(query)
  
  for await (const result of generator) {
    if (ctx.isCancelled()) {
      break
    }
    ctx.emit(result)
  }
  
  ctx.end()
})
```

---

## 4. Plugin SDK API

### 4.1 usePluginTransport

获取插件专用 Transport。

```typescript
import { usePluginTransport } from '@talex-touch/utils/transport'

const transport = usePluginTransport()
```

### 4.2 扩展属性

```typescript
interface PluginTuffTransport extends TuffTransport {
  readonly pluginName: string  // 当前插件名
}
```

---

## 5. 预定义事件

### 5.1 AppEvents

```typescript
import { AppEvents } from '@talex-touch/utils/transport/events'

AppEvents.window.close      // app:window:close
AppEvents.window.minimize   // app:window:minimize
AppEvents.window.hide       // app:window:hide
AppEvents.system.getOS      // app:system:get-os
AppEvents.system.getPackage // app:system:get-package
```

### 5.2 CoreBoxEvents

```typescript
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'

CoreBoxEvents.ui.show       // core-box:ui:show
CoreBoxEvents.ui.hide       // core-box:ui:hide
CoreBoxEvents.ui.expand     // core-box:ui:expand
CoreBoxEvents.search.query  // core-box:search:query (支持流式)
CoreBoxEvents.search.cancel // core-box:search:cancel
CoreBoxEvents.provider.deactivate   // core-box:provider:deactivate
CoreBoxEvents.provider.getDetails   // core-box:provider:get-details (支持批量)
```

### 5.3 StorageEvents

```typescript
import { StorageEvents } from '@talex-touch/utils/transport/events'

StorageEvents.app.get       // storage:app:get (支持批量)
StorageEvents.app.set       // storage:app:set (支持批量)
StorageEvents.app.delete    // storage:app:delete
StorageEvents.plugin.get    // storage:plugin:get (支持批量)
StorageEvents.plugin.set    // storage:plugin:set (支持批量)
```

### 5.4 PluginEvents

```typescript
import { PluginEvents } from '@talex-touch/utils/transport/events'

PluginEvents.lifecycle.load    // plugin:lifecycle:load
PluginEvents.lifecycle.unload  // plugin:lifecycle:unload
PluginEvents.lifecycle.reload  // plugin:lifecycle:reload
PluginEvents.feature.trigger   // plugin:feature:trigger
```

### 5.5 BoxItemEvents

```typescript
import { BoxItemEvents } from '@talex-touch/utils/transport/events'

BoxItemEvents.crud.create   // box-item:crud:create
BoxItemEvents.crud.update   // box-item:crud:update
BoxItemEvents.crud.upsert   // box-item:crud:upsert (支持批量)
BoxItemEvents.crud.delete   // box-item:crud:delete (支持批量)
BoxItemEvents.batch.upsert  // box-item:batch:upsert
BoxItemEvents.batch.delete  // box-item:batch:delete
BoxItemEvents.batch.clear   // box-item:batch:clear
BoxItemEvents.sync.request  // box-item:sync:request
BoxItemEvents.sync.response // box-item:sync:response (支持流式)
```

---

## 6. 类型导出

```typescript
// 从主入口导入
import type {
  TuffEvent,
  BatchConfig,
  StreamConfig,
  SendOptions,
  StreamOptions,
  StreamController,
  StreamContext,
  HandlerContext,
  TuffTransport,
  PluginTuffTransport,
} from '@talex-touch/utils/transport'
```

---

## 7. 错误处理

### 7.1 错误类型

```typescript
class TuffTransportError extends Error {
  code: string
  eventName?: string
}

// 错误码
'INVALID_EVENT'      // 无效事件（非 TuffEvent）
'UNKNOWN_EVENT'      // 未注册的事件
'TIMEOUT'            // 请求超时
'STREAM_CANCELLED'   // 流被取消
'BATCH_FAILED'       // 批量请求失败
'SERIALIZE_FAILED'   // 序列化失败
```

### 7.2 错误处理示例

```typescript
try {
  await transport.send(SomeEvent, data)
} catch (error) {
  if (error instanceof TuffTransportError) {
    switch (error.code) {
      case 'TIMEOUT':
        // 重试逻辑
        break
      case 'UNKNOWN_EVENT':
        // 事件未注册
        break
    }
  }
}
```

---

## 8. 调试

### 8.1 开启调试日志

```typescript
// 在 renderer
localStorage.setItem('TUFF_TRANSPORT_DEBUG', 'true')

// 在 main
process.env.TUFF_TRANSPORT_DEBUG = 'true'
```

### 8.2 日志输出

```
[TuffTransport] send core-box:search:query { text: 'hello' }
[TuffTransport] batch flush storage:app:get (3 requests)
[TuffTransport] stream start core-box:search:stream
[TuffTransport] stream data core-box:search:stream (chunk 1)
[TuffTransport] stream end core-box:search:stream
```

---

## 9. 最佳实践

### 9.1 事件定义

```typescript
// ✅ 好：使用 Event Builder
const event = defineEvent('my-plugin').module('data').event('fetch').define<Req, Res>()
await transport.send(event, data)

// ❌ 差：字符串硬编码（会报类型错误）
await transport.send('my-plugin:data:fetch', data)  // TypeScript Error!
```

### 9.2 批量请求

```typescript
// ✅ 好：让系统自动批量
const results = await Promise.all([
  transport.send(StorageEvents.app.get, { key: 'a' }),
  transport.send(StorageEvents.app.get, { key: 'b' }),
  transport.send(StorageEvents.app.get, { key: 'c' }),
])

// ❌ 差：手动串行
const a = await transport.send(StorageEvents.app.get, { key: 'a' })
const b = await transport.send(StorageEvents.app.get, { key: 'b' })
const c = await transport.send(StorageEvents.app.get, { key: 'c' })
```

### 9.3 流式处理

```typescript
// ✅ 好：正确处理取消
const controller = await transport.stream(event, data, {
  onData: (chunk) => {
    if (!controller.cancelled) {
      updateUI(chunk)
    }
  }
})

onUnmounted(() => controller.cancel())

// ❌ 差：忘记取消
await transport.stream(event, data, { onData: updateUI })
// 组件卸载后仍在更新 UI
```

### 9.4 错误处理

```typescript
// ✅ 好：统一错误处理
const result = await transport.send(event, data).catch(handleError)

// ✅ 好：try-catch
try {
  await transport.send(event, data)
} catch (e) {
  showErrorToast(e.message)
}
```
