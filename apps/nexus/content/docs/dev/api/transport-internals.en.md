# TuffTransport Internals

This document provides a deep dive into TuffTransport's architecture, explaining the technical decisions and implementation details.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        TuffTransport Architecture                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Plugin Renderer                           Main Process                 │
│   ┌─────────────────────┐                  ┌─────────────────────┐      │
│   │  useTuffTransport() │                  │  TuffTransportMain  │      │
│   │  ┌───────────────┐  │                  │  ┌───────────────┐  │      │
│   │  │ Event Builder │  │                  │  │ Event Router  │  │      │
│   │  └───────┬───────┘  │                  │  └───────┬───────┘  │      │
│   │          │          │                  │          │          │      │
│   │  ┌───────▼───────┐  │   ipc.invoke    │  ┌───────▼───────┐  │      │
│   │  │ BatchManager  │──┼──────────────────┼──│ BatchHandler  │  │      │
│   │  └───────────────┘  │                  │  └───────────────┘  │      │
│   │                     │                  │                     │      │
│   │  ┌───────────────┐  │   MessagePort   │  ┌───────────────┐  │      │
│   │  │ StreamClient  │◄─┼──────────────────┼─►│ StreamServer  │  │      │
│   │  └───────────────┘  │                  │  └───────────────┘  │      │
│   └─────────────────────┘                  └─────────────────────┘      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 0. Port / Sub-port Model (New)

TuffTransport is modeled as “transport core + ports”. A port is a **logical channel** layered on top of the same transport, used to isolate domains (storage, corebox, plugin, worker, etc.).

```
TuffTransport
  ├─ port('storage')     // config/subscription
  ├─ port('corebox')     // search/render
  └─ port('plugin:xxx')  // plugin isolation
```

**Key points:**
- Ports only handle `onMessage/onStream` and routing rules, not the IPC implementation.
- Actual transport (Main/Renderer/Plugin/Worker) is handled by the impl layer; ports provide a unified protocol surface.
- Ports have independent lifecycles, making cleanup on module unload reliable.

---

## 1. Event System Design

### Why Not Strings?

The legacy Channel API used string-based event names:

```ts
// Problems with string-based events:
channel.send('core-box:serch:query', data)  // Typo: "serch" - no error!
channel.send('core-box:search:query', { txt: 'hi' })  // Wrong field - no error!
```

**Issues:**
1. **No autocomplete** - Must remember exact event names
2. **No type checking** - Payload types unknown at compile time
3. **Refactoring risk** - Renaming events requires manual find/replace
4. **Runtime errors** - Typos only discovered at runtime

### TuffEvent Solution

TuffEvent uses TypeScript's type system to enforce correctness:

```ts
// TuffEvent definition (simplified)
interface TuffEvent<TRequest, TResponse, TNamespace, TModule, TAction> {
  readonly __brand: 'TuffEvent'  // Brand for runtime checking
  readonly namespace: TNamespace
  readonly module: TModule
  readonly action: TAction
  readonly _request: TRequest    // Phantom type for request
  readonly _response: TResponse  // Phantom type for response
  toString(): string
}
```

**Key Design Decisions:**

1. **Branded Type** - `__brand: 'TuffEvent'` enables runtime type checking
2. **Phantom Types** - `_request` and `_response` exist only at type level
3. **Immutable** - Events are frozen with `Object.freeze()`
4. **String Conversion** - `toString()` returns event name for IPC

### Event Builder Pattern

The builder pattern ensures events are constructed correctly:

```ts
defineEvent('namespace')     // Returns TuffEventBuilder<'namespace'>
  .module('module')          // Returns TuffModuleBuilder<'namespace', 'module'>
  .event('action')           // Returns TuffActionBuilder<'namespace', 'module', 'action'>
  .define<Req, Res>(opts)    // Returns TuffEvent<Req, Res, 'namespace', 'module', 'action'>
```

**Why a Builder?**
- Enforces complete event definition
- Provides clear, readable API
- Enables IDE autocomplete at each step
- Validates at compile time

---

## 2. Batch System Design

### The Problem

Each IPC call has overhead (~1-5ms). Multiple sequential calls compound this:

```ts
// Without batching: 3 IPC calls = 3-15ms overhead
const a = await channel.send('storage:get', { key: 'a' })  // IPC #1
const b = await channel.send('storage:get', { key: 'b' })  // IPC #2
const c = await channel.send('storage:get', { key: 'c' })  // IPC #3
```

### Batch Flow

```
Request 1 ─┐
Request 2 ─┼─► BatchManager ─► [Window 50ms] ─► Single IPC
Request 3 ─┘       │                              │
                   │                              ▼
            windowMs timer              Main Process Handler
                   │                              │
                   ▼                              ▼
            Force flush if:              Process all requests
            - Timer expires                       │
            - Max size reached                    ▼
            - flush() called              Return all results
                                                  │
Response 1 ◄─┐                                    │
Response 2 ◄─┼─ Demultiplex ◄─────────────────────┘
Response 3 ◄─┘
```

### BatchManager Implementation

```ts
class BatchManager {
  private groups: Map<string, BatchGroup> = new Map()
  
  async add<TReq, TRes>(event: TuffEvent<TReq, TRes>, payload: TReq): Promise<TRes> {
    const config = event._batch
    
    // Skip batching if not enabled
    if (!config?.enabled) {
      return this.sendSingle(event, payload)
    }
    
    return new Promise((resolve, reject) => {
      const group = this.getOrCreateGroup(event)
      
      // Apply merge strategy
      this.applyStrategy(group, { payload, resolve, reject }, config)
      
      // Check flush conditions
      if (group.requests.length >= config.maxSize) {
        this.flush(event.toString())
      } else if (!group.timer) {
        group.timer = setTimeout(() => this.flush(event.toString()), config.windowMs)
      }
    })
  }
}
```

### Merge Strategies

**1. Queue (Default)**
All requests are kept and processed in order:
```
[{key:'a'}, {key:'b'}, {key:'a'}] → Process all 3
```

**2. Dedupe**
Identical payloads share one request:
```
[{key:'a'}, {key:'b'}, {key:'a'}] → Process 2, both 'a' get same result
```

**3. Latest**
Only the latest request per key is kept:
```
[{key:'a',v:1}, {key:'b'}, {key:'a',v:2}] → Process [{key:'a',v:2}, {key:'b'}]
```

---

## 3. Stream System Design

### Why MessagePort?

Regular IPC has limitations for streaming:
- Request-response pattern doesn't fit continuous data
- Large payloads block the IPC channel
- No backpressure handling

**MessagePort Benefits:**
- Dedicated channel per stream
- Non-blocking data transfer
- Native backpressure support
- Efficient for binary data

### Stream Flow

```
Renderer                              Main Process
   │                                       │
   │─── 1. Request stream ──────────────►  │
   │    (via ipc.invoke)                   │
   │                                       │
   │◄── 2. Return { streamId, port2 } ─────│
   │    (port2 transferred)                │
   │                                       │
   │◄══ 3. Data chunks ════════════════════│
   │    (via MessagePort)                  │
   │                                       │
   │◄══ 4. More chunks... ═════════════════│
   │                                       │
   │◄══ 5. End signal ═════════════════════│
   │                                       │
   │─── 6. Port closed ───────────────────►│
```

### StreamServer (Main Process)

```ts
class StreamServer {
  async handleStreamRequest(eventName: string, payload: any, webContents: WebContents) {
    const { port1, port2 } = new MessageChannelMain()
    const streamId = generateId()
    
    // Send port2 to renderer
    webContents.postMessage('@tuff:stream:port', { streamId }, [port2])
    
    // Create context for handler
    const context: StreamContext = {
      emit: (chunk) => port1.postMessage({ type: 'data', chunk }),
      error: (err) => port1.postMessage({ type: 'error', message: err.message }),
      end: () => port1.postMessage({ type: 'end' }),
      isCancelled: () => this.cancelled.has(streamId)
    }
    
    // Execute handler
    await this.handlers.get(eventName)?.(payload, context)
    
    return { streamId }
  }
}
```

### Backpressure Handling

When the consumer can't keep up:

```ts
const config: StreamConfig = {
  enabled: true,
  bufferSize: 100,
  backpressure: 'buffer' // 'drop' | 'buffer' | 'error'
}
```

- **drop** - New data discarded when buffer full
- **buffer** - Data buffered (memory risk)
- **error** - Error thrown when buffer full

---

## 4. Plugin Security

### The Key Mechanism

Plugins run in isolated WebContentsView. To prevent unauthorized access:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Plugin Security Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Plugin loads                                                 │
│     │                                                            │
│     ▼                                                            │
│  2. Main process generates unique key                            │
│     key = randomString() → stored in keyToNameMap                │
│     │                                                            │
│     ▼                                                            │
│  3. Key injected into plugin's preload                           │
│     window.$plugin.uniqueKey = key                               │
│     │                                                            │
│     ▼                                                            │
│  4. All plugin messages include key in header                    │
│     { header: { uniqueKey: key }, ... }                          │
│     │                                                            │
│     ▼                                                            │
│  5. Main process validates key                                   │
│     pluginName = keyToNameMap.get(key)                          │
│     if (!pluginName) reject()                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### PluginKeyManager

```ts
interface PluginKeyManager {
  requestKey(pluginName: string): string   // Generate new key
  revokeKey(key: string): boolean          // Invalidate key
  resolveKey(key: string): string | undefined  // Get plugin name
  isValidKey(key: string): boolean         // Validate key
}
```

### Security Context

Every handler receives security context:

```ts
transport.on(SomeEvent, (payload, context) => {
  if (context.plugin) {
    console.log(`Request from plugin: ${context.plugin.name}`)
    console.log(`Key verified: ${context.plugin.verified}`)
  }
})
```

---

## 5. Error Handling

### Error Flow

```
Renderer                              Main Process
   │                                       │
   │─── Request ──────────────────────────►│
   │                                       │
   │                              Handler throws error
   │                                       │
   │◄── TuffTransportError ────────────────│
   │    { code, message, eventName }       │
   │                                       │
   ▼
catch (err) {
  if (err instanceof TuffTransportError) {
    // Structured error handling
  }
}
```

### Error Serialization

Errors are serialized for IPC:

```ts
class TuffTransportError extends Error {
  toJSON() {
    return {
      name: 'TuffTransportError',
      code: this.code,
      message: this.message,
      eventName: this.eventName,
      timestamp: this.timestamp
    }
  }
  
  static fromJSON(obj) {
    return new TuffTransportError(obj.code, obj.message, {
      eventName: obj.eventName
    })
  }
}
```

---

## 6. Performance Considerations

### IPC Overhead

| Operation | Approximate Time |
|-----------|------------------|
| Single IPC call | 1-5ms |
| Serialization (small) | 0.1ms |
| Serialization (large) | 1-10ms |
| MessagePort setup | 2-5ms |
| MessagePort message | 0.1-0.5ms |

### Optimization Strategies

1. **Batch by default** - Enable batching for frequent events
2. **Stream for large data** - Use MessagePort for >100KB
3. **Dedupe when possible** - Share responses for identical requests
4. **Lazy evaluation** - Only serialize when flushing batch

### Memory Management

```ts
// Cleanup patterns
onUnmounted(() => {
  // Cancel pending requests
  controller.cancel()
  
  // Remove handlers
  cleanup()
  
  // Flush batches
  transport.flush()
})
```

---

## 7. Comparison with Legacy Channel

| Aspect | Legacy Channel | TuffTransport |
|--------|---------------|---------------|
| Event Definition | String | TuffEvent object |
| Type Safety | None | Full TypeScript |
| Autocomplete | None | Full IDE support |
| Batching | Manual | Automatic |
| Streaming | Not supported | MessagePort |
| Error Types | Generic Error | TuffTransportError |
| Plugin Security | uniqueKey header | PluginKeyManager |
| Backwards Compat | N/A | Full compatibility |

### Migration Path

```ts
// Legacy code continues to work
channel.send('event', data)

// New code uses TuffTransport
transport.send(TuffEvent, data)

// They share the same IPC infrastructure
```

---

## Summary

TuffTransport provides:

1. **Type Safety** - Compile-time event validation via TuffEvent
2. **Performance** - Automatic batching reduces IPC overhead
3. **Streaming** - MessagePort for large/continuous data
4. **Security** - Plugin isolation via key mechanism
5. **Ergonomics** - Clean API with full IDE support
6. **Compatibility** - Works alongside legacy Channel API
