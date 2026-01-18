# TempFile SDK

<div style="height: 160px; border-radius: 16px; background: linear-gradient(135deg, #0ea5e9, #22c55e);"></div>

## Introduction

The TempFile SDK creates short-lived files for caching downloads, exporting temporary content, or passing file handles across modules.

## How it works

- The main process `TempFileService` owns the temp directory and cleanup.
- IPC channels `temp-file:create` / `temp-file:delete` handle creation and deletion.
- Optional `retentionMs` controls cleanup schedules.

## Implementation notes

- Temp files live under `userData/temp/<namespace>`.
- The SDK only wraps parameters and validates responses; file lifecycle remains in the main process.

## Usage

### Plugin side

```typescript
import { useTempPluginFiles } from '@talex-touch/utils/plugin/sdk'

const temp = useTempPluginFiles()
const result = await temp.create({
  ext: 'svg',
  text: '<svg></svg>',
  retentionMs: 24 * 60 * 60 * 1000
})

console.log(result.url)
```

### Renderer side

```typescript
import { useTouchSDK } from '@talex-touch/utils/renderer'

const sdk = useTouchSDK()
const result = await sdk.createTempFile({
  namespace: 'icons/svg',
  ext: 'svg',
  text: '<svg></svg>',
  retentionMs: 7 * 24 * 60 * 60 * 1000
})
```

## Examples

1. Download remote SVGs into temp files and serve them via `tfile://`.
2. Export debug logs into a temp file and open it locally.

## FAQ

**Q: Are temp files cleaned automatically?**  
A: Yes. When `retentionMs` is provided, the main process periodically removes expired files.

**Q: Why does `tfile://` not load?**  
A: `tfile://` is Electron-only; browsers will block it.
