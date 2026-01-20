# Download SDK

<div style="height: 160px; border-radius: 16px; background: linear-gradient(135deg, #f59e0b, #ef4444);"></div>

## Overview

The Download SDK provides a unified task manager for downloads such as updates, resource prefetching, and plugin installs.

## Introduction

Use this SDK when you need progress-aware downloads in the renderer without managing low-level IPC.

## How it works

- DownloadCenter in the main process owns task scheduling.
- TuffTransport events are used for requests and push updates.
- Supports queueing, priority, chunked downloads, and retries.

## Technical Notes

- The SDK only wraps event calls and subscriptions.
- The main process holds the task state and broadcasts updates.
- In production, you can hide tasks using `metadata.hidden`.

## Usage

```typescript
import { useDownloadSdk } from '@talex-touch/utils/renderer'

const download = useDownloadSdk()
const res = await download.addTask({
  url: 'https://example.com/file.zip',
  destination: '/path/to/save',
  filename: 'file.zip',
  priority: 50,
  module: 'resource_download',
  metadata: { hidden: true }
})

if (!res.success) {
  throw new Error(res.error || 'Download failed')
}
```

## Examples

1. Prefetch remote SVGs into temp files and load them via `tfile://`.
2. Download update packages and trigger update prompts.

## FAQ

**Q: How do I subscribe to progress updates?**  
A: Use `onTaskProgress` to listen to push events.

**Q: How do I hide download tasks?**  
A: Set `metadata.hidden: true`. Production will suppress UI and notifications.

## Best Practices

- Set meaningful `priority` and `module` values for scheduling and troubleshooting.
- Avoid flooding the queue; batch or debounce task creation.
- Provide clear error feedback and a retry strategy for failures.
