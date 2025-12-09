# Channel API (Legacy)

::alert{type="warning"}
**Deprecated:** The Channel API is deprecated in favor of [TuffTransport](./transport.en.md). While it continues to work, we recommend migrating to TuffTransport for new development. See the [Migration Guide](./transport.en.md#migration-from-legacy-channel).
::

The Channel SDK provides IPC communication between plugins and the main process.

## Quick Start

```ts
import { useChannel, usePluginRendererChannel } from '@talex-touch/utils/plugin/sdk'

// Method 1: Get raw channel object
const channel = useChannel()
const result = await channel.send('some-event', { data: 'value' })

// Method 2: Use wrapped Plugin Channel
const pluginChannel = usePluginRendererChannel()
await pluginChannel.send('my-plugin:action', { payload: 'data' })
```

---

## API Reference

### useChannel()

Get the underlying IPC channel instance.

```ts
import { useChannel } from '@talex-touch/utils/plugin/sdk'

const channel = useChannel()

// Send message
const response = await channel.send('event-name', { key: 'value' })

// Register listener
const unsubscribe = channel.regChannel('event-name', (data) => {
  console.log('Received:', data)
})

// Unsubscribe
unsubscribe()
```

### usePluginRendererChannel()

Get plugin-specific channel instance with a friendlier API.

```ts
import { usePluginRendererChannel } from '@talex-touch/utils/plugin/sdk'

const channel = usePluginRendererChannel()
```

#### `send(eventName, payload)`

Async send message and wait for response.

```ts
const result = await channel.send('clipboard:get-latest')
```

#### `on(eventName, handler)`

Register event listener.

```ts
const dispose = channel.on('core-box:input-change', (data) => {
  console.log('Input changed:', data.input)
})

// Stop listening
dispose()
```

#### `once(eventName, handler)`

Register one-time listener, automatically removed after trigger.

```ts
channel.once('plugin:ready', () => {
  console.log('Plugin ready')
})
```

---

## Built-in Events

### CoreBox Related

| Event | Description | Data |
|-------|-------------|------|
| `core-box:input-change` | Search input changed | `{ input: string }` |
| `core-box:key-event` | Keyboard event forwarded | `ForwardedKeyEvent` |
| `core-box:clipboard-change` | Clipboard changed | `{ item: ClipboardItem }` |

### Plugin Storage

| Event | Description | Data |
|-------|-------------|------|
| `plugin:storage:update` | Storage update broadcast | `{ name: string, fileName?: string }` |

---

## Best Practices

1. **Namespacing**: Use `pluginName:action` format to avoid conflicts
2. **Cleanup**: Call `dispose()` when component unmounts
3. **Error handling**: Always wrap send calls with try-catch
4. **Type safety**: Define TypeScript interfaces for requests and responses

---

## Type Definitions

```ts
interface IPluginRendererChannel {
  send(eventName: string, payload?: any): Promise<any>
  sendSync(eventName: string, payload?: any): any
  on(eventName: string, handler: PluginChannelHandler): () => void
  once(eventName: string, handler: PluginChannelHandler): () => void
  raw: ITouchClientChannel
}

type PluginChannelHandler = (event: any) => void
