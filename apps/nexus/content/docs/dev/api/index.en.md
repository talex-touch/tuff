# SDK API Overview

The Tuff Plugin SDK provides a complete set of APIs for developing CoreBox plugins. All APIs follow a functional design pattern, accessed through `use*` hook functions.

## Installation

```bash
pnpm add @talex-touch/utils
```

## SDK Modules

| Module | Import | Description |
|--------|--------|-------------|
| [Box SDK](./box.en.md) | `useBox()` | Control CoreBox window |
| [Clipboard SDK](./clipboard.zh.md) | `useClipboard()` | Clipboard read/write and history |
| [Storage SDK](./storage.en.md) | `usePluginStorage()` | Plugin data persistence |
| [Channel SDK](./channel.en.md) | `useChannel()` | IPC communication |
| [Feature SDK](./feature.en.md) | `useFeature()` | Search result management |
| [DivisionBox SDK](./division-box.zh.md) | `useDivisionBox()` | Independent window management |
| [Flow SDK](./flow-transfer.zh.md) | `createFlowSDK()` | Inter-plugin data transfer |
| [Intelligence SDK](./intelligence.en.md) | `useIntelligence()` | AI capabilities |

---

## Quick Start

```typescript
import {
  useBox,
  useClipboard,
  usePluginStorage,
  useChannel,
  useFeature,
  useDivisionBox
} from '@talex-touch/utils/plugin/sdk'

// Initialize SDKs
const box = useBox()
const clipboard = useClipboard()
const storage = usePluginStorage()
const channel = useChannel()
const feature = useFeature()
const divisionBox = useDivisionBox()

// Usage example
async function init() {
  // Read config
  const config = await storage.getFile('config.json')
  
  // Listen to input changes
  feature.onInputChange(async (input) => {
    const results = await search(input)
    feature.pushItems(results)
  })
  
  // Listen to clipboard
  await box.allowClipboard(ClipboardType.TEXT)
  clipboard.history.onDidChange((item) => {
    console.log('Clipboard changed:', item)
  })
}
```

---

## Design Principles

### 1. Functional API

All SDKs are accessed through `use*` functions, no context passing required:

```typescript
// ✅ Correct
const storage = usePluginStorage()
await storage.getFile('config.json')

// ❌ Wrong (deprecated API)
// const storage = ctx.storage
// await storage.getItem('key')
```

### 2. Automatic Context Detection

SDKs automatically detect plugin context, no manual configuration needed:

```typescript
const storage = usePluginStorage()
// Automatically gets current plugin name
```

### 3. Returns Dispose Function

All listeners return an unsubscribe function:

```typescript
const unsubscribe = feature.onInputChange((input) => {
  // ...
})

// Unsubscribe when component unmounts
onUnmounted(() => {
  unsubscribe()
})
```

### 4. Promise-based Async

All async operations return Promises:

```typescript
const config = await storage.getFile('config.json')
await clipboard.copyAndPaste({ text: 'Hello' })
```

---

## Type Imports

```typescript
import type {
  TuffItem,
  TuffQuery,
  ClipboardType,
  DivisionBoxConfig,
  FlowPayload
} from '@talex-touch/utils/plugin/sdk'
```

---

## Related Documentation

- [Plugin Development Quick Start](../quickstart.en.md)
- [Manifest Configuration](../manifest.en.md)
- [Build Tool Unplugin](../extensions/unplugin-export-plugin.en.md)
