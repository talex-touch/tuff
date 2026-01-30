# Storage API

## Overview

The Plugin Storage SDK provides file-based persistent storage that survives application restarts.

## Introduction

**Quick Start**

```ts
import { usePluginStorage } from '@talex-touch/utils/plugin/sdk'

const storage = usePluginStorage()

// Save settings
await storage.setFile('settings.json', { theme: 'dark', fontSize: 14 })

// Read settings
const settings = await storage.getFile('settings.json')
console.log(settings) // { theme: 'dark', fontSize: 14 }
```

---

## Limits

- **10 MB quota per plugin**; writes past the limit are rejected
- Data stored in `<userData>/config/plugins/<pluginName>/`
- Automatic filename sanitization to prevent path traversal attacks

---

## API Reference

**Getting Storage Instance**

```ts
import { usePluginStorage } from '@talex-touch/utils/plugin/sdk'

const storage = usePluginStorage()
```

> **Note**: Must be called within plugin renderer context.

**File Operations**

**`getFile(fileName)`**

Read storage file content.

```ts
const config = await storage.getFile('config.json')
// Returns null if file doesn't exist
```

**`setFile(fileName, content)`**

Write to storage file.

```ts
await storage.setFile('settings.json', { 
  theme: 'dark',
  shortcuts: ['Cmd+K']
})
// Returns { success: true }
```

**`deleteFile(fileName)`**

Delete a storage file.

```ts
await storage.deleteFile('old-cache.json')
```

**`listFiles()`**

List all storage files for the plugin.

```ts
const files = await storage.listFiles()
// ['settings.json', 'data/cache.json']
```

**`clearAll()`**

Clear all storage data for the plugin.

```ts
await storage.clearAll()
// ⚠️ This operation is irreversible
```

---

**Advanced Features**

**`getStats()`**

Get storage statistics.

```ts
const stats = await storage.getStats()
// {
//   totalSize: 1024,
//   fileCount: 3,
//   limit: 10485760,
//   usagePercent: 0.01
// }
```

**`getTree()`**

Get directory tree structure.

```ts
const tree = await storage.getTree()
```

**`getFileDetails(fileName)`**

Get detailed file information.

```ts
const details = await storage.getFileDetails('settings.json')
```

**`openFolder()`**

Open plugin storage directory in system file manager.

```ts
await storage.openFolder()
```

---

**Listening to Changes**

```ts
const unsubscribe = storage.onDidChange('settings.json', (data) => {
  console.log('Config updated:', data)
})

// Stop listening
unsubscribe()
```

---

## Debug

- **View storage contents**: Use `openFolder()` to inspect files directly
- **DevTools**: `pnpm core:dev` prints storage change logs in Console
- **IPC command**: Use `plugin:storage:get-file` for direct queries

## Best Practices

- Namespace files clearly to avoid collisions in shared directories.
- Batch writes or debounce rapid updates to reduce IO pressure.
- Keep large blobs in separate files to avoid frequent JSON re-serialization.

## Technical Notes

- Storage uses an isolated directory per plugin with filename sanitization.
- Reads/writes are executed in the main process via IPC for safety and consistency.
