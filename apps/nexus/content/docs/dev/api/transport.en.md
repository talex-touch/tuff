# TuffTransport API

## Overview

TuffTransport is the next-generation IPC communication system for Tuff plugins, providing type-safe, high-performance messaging with built-in support for batching and streaming.

::alert{type="info"}
TuffTransport replaces the legacy Channel API. While the old API remains functional, we recommend migrating to TuffTransport for new development.
::

## Why TuffTransport?

| Feature | Legacy Channel | TuffTransport |
|---------|---------------|---------------|
| Type Safety | ❌ String-based events | ✅ Compile-time type checking |
| Autocomplete | ❌ No IDE support | ✅ Full IntelliSense |
| Batching | ❌ Manual | ✅ Automatic request batching |
| Streaming | ❌ Not supported | ✅ MessagePort streaming |
| Error Handling | ❌ Generic errors | ✅ Structured error types |

---

## Introduction

**Quick Start**

```ts
import { useTuffTransport, CoreBoxEvents, StorageEvents } from '@talex-touch/utils/transport'

const transport = useTuffTransport()

// Send a typed request
await transport.send(CoreBoxEvents.ui.hide)

// Send with payload
const result = await transport.send(CoreBoxEvents.search.query, {
  query: { text: 'hello' }
})

// Batch requests (automatic)
const [theme, lang] = await Promise.all([
  transport.send(StorageEvents.app.get, { key: 'theme' }),
  transport.send(StorageEvents.app.get, { key: 'language' }),
])
```

---

## Core Concepts

**TuffEvent**

Every communication in TuffTransport uses a `TuffEvent` - a type-safe event definition that encodes request/response types at compile time.

```ts
// ❌ Legacy: String-based, no type safety
channel.send('core-box:search:query', { text: 'hello' })

// ✅ TuffTransport: Type-safe, autocomplete
transport.send(CoreBoxEvents.search.query, { query: { text: 'hello' } })
//                                          ↑ TypeScript enforces correct payload
```

**Event Builder**

Create custom events using the `defineEvent` builder:

```ts
import { defineEvent } from '@talex-touch/utils/transport'

// Define a typed event
const MyPluginEvents = {
  data: {
    fetch: defineEvent('my-plugin')
      .module('data')
      .event('fetch')
      .define<{ id: string }, { name: string; value: number }>()
  }
}

// Usage - fully typed!
const result = await transport.send(MyPluginEvents.data.fetch, { id: '123' })
console.log(result.name, result.value) // ✅ Type-safe access
```

---

## API Reference

**useTuffTransport()**

Get the transport instance in a plugin renderer.

```ts
import { useTuffTransport } from '@talex-touch/utils/transport'

const transport = useTuffTransport()
```

**transport.send(event, payload?, options?)**

Send a request and wait for response.

**Parameters:**
- `event` - A TuffEvent instance (required)
- `payload` - Request payload matching event's request type
- `options` - Send options

**Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `immediate` | `boolean` | `false` | Skip batching, send immediately |
| `timeout` | `number` | `10000` | Request timeout in ms |

**Examples:**

```ts
// Simple request
await transport.send(CoreBoxEvents.ui.hide)

// Request with payload
const result = await transport.send(StorageEvents.app.get, { key: 'theme' })

// Immediate (skip batching)
await transport.send(StorageEvents.app.set, 
  { key: 'urgent', value: true },
  { immediate: true }
)

// Custom timeout
await transport.send(SlowEvent, data, { timeout: 30000 })
```

**transport.stream(event, payload, options)**

Initiate a streaming request via MessagePort.

```ts
const controller = await transport.stream(
  CoreBoxEvents.search.query,
  { query: { text: 'hello' } },
  {
    onData: (result) => {
      console.log('Received:', result)
    },
    onEnd: () => {
      console.log('Stream complete')
    },
    onError: (err) => {
      console.error('Stream error:', err)
    }
  }
)

// Cancel stream if needed
controller.cancel()
```

**transport.on(event, handler)**

Register an event handler for incoming messages.

```ts
const cleanup = transport.on(SomeEvent, (payload) => {
  console.log('Received:', payload)
  return { success: true } // Return response
})

// Cleanup when done
onUnmounted(() => cleanup())
```

**transport.flush()**

Force flush all pending batch requests.

```ts
await transport.flush()
```

---

## Predefined Events

**CoreBoxEvents**

```ts
import { CoreBoxEvents } from '@talex-touch/utils/transport'

// UI Control
CoreBoxEvents.ui.show       // Show CoreBox
CoreBoxEvents.ui.hide       // Hide CoreBox
CoreBoxEvents.ui.expand     // Expand/collapse

// Search
CoreBoxEvents.search.query  // Execute search (streaming)
CoreBoxEvents.search.cancel // Cancel search

// Input
CoreBoxEvents.input.get     // Get input value
CoreBoxEvents.input.set     // Set input value
CoreBoxEvents.input.clear   // Clear input

// Provider
CoreBoxEvents.provider.deactivate    // Deactivate provider
CoreBoxEvents.provider.getDetails    // Get provider details (batching)
```

**StorageEvents**

```ts
import { StorageEvents } from '@talex-touch/utils/transport'

// App Storage (with batching)
StorageEvents.app.get       // Get value
StorageEvents.app.set       // Set value
StorageEvents.app.delete    // Delete value

// Plugin Storage (with batching)
StorageEvents.plugin.get    // Get plugin value
StorageEvents.plugin.set    // Set plugin value
```

**PluginEvents**

```ts
import { PluginEvents } from '@talex-touch/utils/transport'

// Lifecycle
PluginEvents.lifecycle.load     // Load plugin
PluginEvents.lifecycle.unload   // Unload plugin
PluginEvents.lifecycle.reload   // Reload plugin

// Features
PluginEvents.feature.trigger    // Trigger feature

// Logging (batched)
PluginEvents.log.write          // Write log entry
```

**BoxItemEvents**

```ts
import { BoxItemEvents } from '@talex-touch/utils/transport'

// CRUD (with batching)
BoxItemEvents.crud.create   // Create item
BoxItemEvents.crud.update   // Update item
BoxItemEvents.crud.upsert   // Create or update
BoxItemEvents.crud.delete   // Delete item

// Batch operations
BoxItemEvents.batch.upsert  // Batch upsert
BoxItemEvents.batch.delete  // Batch delete
BoxItemEvents.batch.clear   // Clear by source
```

**ClipboardEvents :badge[v0.9.0]{type="info"}**

```ts
import { ClipboardEvents } from '@talex-touch/utils/transport'

// Monitor (streaming)
ClipboardEvents.change      // Subscribe to clipboard changes

// History (with batching)
ClipboardEvents.getHistory  // Query history with pagination
ClipboardEvents.getLatest   // Get most recent item

// Actions
ClipboardEvents.apply       // Apply item to active app
ClipboardEvents.delete      // Delete history item
ClipboardEvents.setFavorite // Toggle favorite status
ClipboardEvents.write       // Write to system clipboard
```

**Example: Subscribe to clipboard changes**

```ts
const controller = await transport.stream(
  ClipboardEvents.change,
  undefined,
  {
    onData: ({ item, source }) => {
      console.log(`New ${item.type} from ${source}:`, item.content)
    }
  }
)

onUnmounted(() => controller.cancel())
```

**Example: Query clipboard history**

```ts
const { history, total } = await transport.send(ClipboardEvents.getHistory, {
  page: 1,
  pageSize: 20,
  type: 'text',
  keyword: 'search term'
})
```

---

## Batching

TuffTransport automatically batches requests for events that support it:

```ts
// These 3 requests are automatically combined into 1 IPC call
const [a, b, c] = await Promise.all([
  transport.send(StorageEvents.app.get, { key: 'a' }),
  transport.send(StorageEvents.app.get, { key: 'b' }),
  transport.send(StorageEvents.app.get, { key: 'c' }),
])
// Result: Single IPC with 3 requests, 500%+ faster
```

**Batch Configuration**

When defining custom events, configure batching:

```ts
const MyEvent = defineEvent('my-plugin')
  .module('data')
  .event('fetch')
  .define<Request, Response>({
    batch: {
      enabled: true,
      windowMs: 50,        // Collect for 50ms
      maxSize: 20,         // Max 20 requests per batch
      mergeStrategy: 'dedupe' // 'queue' | 'dedupe' | 'latest'
    }
  })
```

**Merge Strategies:**
- `queue` - All requests processed in order
- `dedupe` - Duplicate payloads share response
- `latest` - Only latest request for same key kept

---

## Streaming

For large or continuous data, use MessagePort streaming:

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

// Consume stream
const controller = await transport.stream(
  MyStreamEvent,
  { filter: 'active' },
  {
    onData: (item) => items.push(item),
    onEnd: () => console.log('Done'),
    onError: (err) => console.error(err)
  }
)

// Cancel if needed
onUnmounted(() => controller.cancel())
```

---

## Error Handling

TuffTransport provides structured errors:

```ts
import { TuffTransportError, TuffTransportErrorCode } from '@talex-touch/utils/transport'

try {
  await transport.send(SomeEvent, data)
} catch (err) {
  if (err instanceof TuffTransportError) {
    switch (err.code) {
      case TuffTransportErrorCode.TIMEOUT:
        console.log('Request timed out')
        break
      case TuffTransportErrorCode.INVALID_EVENT:
        console.log('Invalid event - use defineEvent()')
        break
      case TuffTransportErrorCode.UNKNOWN_EVENT:
        console.log('No handler registered')
        break
    }
  }
}
```

**Error Codes:**
| Code | Description |
|------|-------------|
| `INVALID_EVENT` | Not a valid TuffEvent |
| `UNKNOWN_EVENT` | No handler registered |
| `TIMEOUT` | Request timed out |
| `STREAM_CANCELLED` | Stream was cancelled |
| `BATCH_FAILED` | Batch request failed |
| `SERIALIZE_FAILED` | Payload serialization failed |

---

## Migration from Legacy Channel

**Before (Legacy)**

```ts
import { useChannel } from '@talex-touch/utils/plugin/sdk'

const channel = useChannel()
const result = await channel.send('core-box:search:query', { text: 'hello' })
```

**After (TuffTransport)**

```ts
import { useTuffTransport, CoreBoxEvents } from '@talex-touch/utils/transport'

const transport = useTuffTransport()
const result = await transport.send(CoreBoxEvents.search.query, { query: { text: 'hello' } })
```

**Gradual Migration**

Both APIs work simultaneously - migrate at your own pace:

```ts
// Legacy (still works)
await channel.send('storage:app:get', { key: 'theme' })

// New (recommended)
await transport.send(StorageEvents.app.get, { key: 'theme' })
```

---

## Technical Notes

- Events are defined via `defineEvent().module().event().define()` with compile-time request/response typing.
- Batching aggregates client requests and merges them by strategy before dispatch.
- Streaming uses MessagePort for continuous data delivery.

## Best Practices

1. **Always use TuffEvent** - Never pass strings to `transport.send()`
2. **Define custom events** - Use `defineEvent()` for plugin-specific communication
3. **Leverage batching** - Use `Promise.all()` for multiple requests
4. **Clean up handlers** - Call cleanup functions in `onUnmounted()`
5. **Handle errors** - Check `TuffTransportErrorCode` for specific handling
6. **Use streaming** - For large data or real-time updates

---

## Type Definitions

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
