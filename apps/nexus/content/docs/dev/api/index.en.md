# SDK API Overview

## Overview
The Tuff Plugin SDK provides a complete set of APIs for developing CoreBox plugins. All APIs follow a functional design pattern, accessed through `use*` hook functions.

## Introduction
The SDK exposes window control, clipboard, search, storage, and transport capabilities through a unified runtime context, so plugins can stay small and focused.

## Installation

```bash
pnpm add @talex-touch/utils
```

## API Reference

| Module | Import | Description |
|--------|--------|-------------|
| [Plugin Context](./plugin-context.en.md) | `globalThis` | index.js global context API |
| [Box SDK](./box.en.md) | `useBox()` | Control CoreBox window |
| [Clipboard SDK](./clipboard.en.md) | `useClipboard()` | Clipboard read/write and history |
| [TempFile SDK](./temp-file.en.md) | `useTempPluginFiles()` | Create and clean temp files |
| [Storage SDK](./storage.en.md) | `usePluginStorage()` | Plugin data persistence |
| [Download SDK](./download.en.md) | `useDownloadSdk()` | Download task management |
| [Platform Capabilities SDK](./platform-capabilities.en.md) | `usePlatformSdk()` | Platform capability catalog |
| [**Account SDK**](./account.en.md) | `accountSDK` | **User info, subscription, quota** |
| [**TuffTransport**](./transport.en.md) | `useTuffTransport()` | **Next-gen IPC (recommended)** |
| [Channel SDK](./channel.en.md) | `useChannel()` | IPC communication (legacy) |
| [Feature SDK](./feature.en.md) | `useFeature()` | Search result management |
| [DivisionBox SDK](./division-box.en.md) | `useDivisionBox()` | Independent window management |
| [Flow SDK](./flow-transfer.en.md) | `createFlowSDK()` | Inter-plugin data transfer |
| [Intelligence SDK](./intelligence.en.md) | `useIntelligence()` | AI capabilities |

::alert{type="info"}
**New:** [TuffTransport](./transport.en.md) is the recommended IPC API for new plugins. It provides type-safe events, automatic batching, and streaming support. See also [TuffTransport Internals](./transport-internals.en.md) for technical details.
::

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

## Best Practices

**1. Functional API**

All SDKs are accessed through `use*` functions, no context passing required:

```typescript
// ✅ Correct
const storage = usePluginStorage()
await storage.getFile('config.json')

// ❌ Wrong (deprecated API)
// const storage = ctx.storage
// await storage.getItem('key')
```

**2. Automatic Context Detection**

SDKs automatically detect plugin context, no manual configuration needed:

```typescript
const storage = usePluginStorage()
// Automatically gets current plugin name
```

**3. Returns Dispose Function**

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

**4. Promise-based Async**

All async operations return Promises:

```typescript
const config = await storage.getFile('config.json')
await clipboard.copyAndPaste({ text: 'Hello' })
```

---

## Technical Notes
- `use*` hooks resolve plugin context at runtime to avoid manual wiring.
- IPC and transport abstractions provide consistent cleanup via dispose functions.

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

- [Plugin Development Quick Start](../getting-started/quickstart.en.md)
- [Manifest Configuration](../reference/manifest.en.md)
- [Build Tool Unplugin](../extensions/unplugin-export-plugin.en.md)
