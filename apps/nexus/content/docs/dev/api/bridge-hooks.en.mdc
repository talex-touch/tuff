# Bridge Hooks API

## Overview

Bridge Hooks provide event subscription between plugin renderer and CoreBox main process. The SDK automatically handles event caching and replay to ensure plugins don't miss early initialization events.

## Introduction
Use these hooks when you need CoreBox input, clipboard, or key events without managing raw channels.

## Core Hooks

**onCoreBoxInputChange**

Listen to CoreBox input changes.

```ts
import { onCoreBoxInputChange } from '@talex-touch/utils/plugin/sdk/hooks'

onCoreBoxInputChange(({ data, meta }) => {
  console.log('Input text:', data.query.text)
  console.log('Clipboard inputs:', data.query.inputs)
  console.log('From cache:', meta.fromCache)
  console.log('Timestamp:', meta.timestamp)
})
```

**Payload Type**:
```ts
interface BridgeEventPayload<CoreBoxInputData> {
  data: {
    query: {
      text: string
      inputs: Array<{ type: string; content: string }>
    }
  }
  meta: {
    timestamp: number
    fromCache: boolean
  }
}
```

**onCoreBoxClipboardChange**

Listen to clipboard content changes.

```ts
import { onCoreBoxClipboardChange } from '@talex-touch/utils/plugin/sdk/hooks'

onCoreBoxClipboardChange(({ data, meta }) => {
  console.log('Clipboard item:', data.item)
  console.log('From cache:', meta.fromCache)
})
```

**onCoreBoxKeyEvent**

Listen to keyboard events forwarded from CoreBox.

```ts
import { onCoreBoxKeyEvent } from '@talex-touch/utils/plugin/sdk/hooks'

onCoreBoxKeyEvent(({ data, meta }) => {
  if (data.key === 'Enter' && !data.metaKey) {
    // Handle enter
  }
})
```

**Payload Type**:
```ts
interface BridgeEventPayload<CoreBoxKeyEventData> {
  data: {
    key: string
    code: string
    metaKey: boolean
    ctrlKey: boolean
    altKey: boolean
    shiftKey: boolean
    repeat: boolean
  }
  meta: {
    timestamp: number
    fromCache: boolean
  }
}
```

## Auto Event Caching

**Problem**

When plugin UIView attaches to CoreBox, the main process sends initial query on `dom-ready`. However, plugin JS may not have executed the hook registration code yet, causing the event to be lost.

**Solution**

SDK automatically implements event caching:

1. **Auto cache** - Start listening and caching events on module load
2. **Auto replay** - When `onCoreBoxInputChange` etc. is called, replay cached events
3. **Auto cleanup** - Clear cache after replay

```
Timeline:
────────────────────────────────────────────────────────►

Main Process:
    [dom-ready] ──► send input-change event

Plugin Renderer:
    [module load] ──► auto cache event
                            │
    [JS execute] ──► onCoreBoxInputChange(handler)
                            │
                            └─► replay cached event to handler
```

**Control API**

**clearBridgeEventCache**

Manually clear event cache (usually not needed).

```ts
import { clearBridgeEventCache } from '@talex-touch/utils/plugin/sdk/hooks'

// Clear specific event type cache
clearBridgeEventCache('core-box:input-change')

// Clear all cache
clearBridgeEventCache()
```

**Use cases**:
- Plugin needs to ignore old initial query
- Plugin re-initialization requires clean state

## Technical Notes
- Hooks subscribe at module load and buffer events before handlers register.
- Cached events replay in order and include `meta.fromCache` for differentiation.

## Best Practices

1. **Register hooks early** - Although caching exists, register hooks at plugin entry
2. **Handle empty values** - Always check if `query.text` and `query.inputs` exist
3. **Avoid duplicate registration** - Hooks don't dedupe, multiple calls trigger multiple callbacks

```ts
// ✅ Recommended: Register at top level
onCoreBoxInputChange(({ data, meta }) => {
  const { query } = data
  if (!query.text && (!query.inputs || query.inputs.length === 0)) {
    return // Empty query
  }
  // Use meta.fromCache to detect if this is an initial cached event
  handleSearch(query)
})

// ❌ Avoid: Register in async callback
setTimeout(() => {
  onCoreBoxInputChange(handler) // May miss cache replay window
}, 1000)
```
