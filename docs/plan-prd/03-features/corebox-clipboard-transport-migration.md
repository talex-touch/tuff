# CoreBox Clipboard → TuffTransport Migration

> **Version**: 2.0.0 | **Since**: v0.9.0 | **Status**: Draft

## 1. Problem Analysis

### 1.1 Root Causes of UI Lag

| Issue | Location | Impact |
|-------|----------|--------|
| Sync IPC blocking | `clipboard.readImage().toDataURL()` | Main thread blocked |
| No batching | Channel `send/sendSync` | 8+ IPC calls per search |
| Sync broadcast | `windowManager.forwardInputChange()` | UI frame drops |

### 1.2 Affected Modules

```
clipboard.ts          → Polling + sync broadcast
core-box/ipc.ts       → Independent channel registrations  
input-transport.ts    → Sync input forwarding
window.ts             → Clipboard sync forwarding
search-core.ts        → No streaming results
```

---

## 2. Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer                           Main Process                │
│  ┌───────────────────┐             ┌───────────────────┐       │
│  │ useTuffTransport  │   Stream    │ TuffTransportMain │       │
│  │ ├─ search()      ─┼─◄══════════►┼─ SearchHandler    │       │
│  │ └─ clipboard()   ─┼─◄──Batch───►┼─ ClipboardHandler │       │
│  └───────────────────┘  (50ms)     └───────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### Performance Targets

| Metric | Before | After |
|--------|--------|-------|
| First result latency | ~150ms | <50ms |
| Clipboard sync | ~100ms | <30ms |
| IPC calls/search | ~8 | ~2 |
| UI FPS | ~45 | 60 |

---

## 3. Technical Implementation

### 3.1 Event Types

`packages/utils/transport/events/types/clipboard.ts`:

```typescript
/**
 * Clipboard item data structure.
 * @since v0.9.0
 */
export interface ClipboardItem {
  id: number
  type: 'text' | 'image' | 'files'
  content: string
  thumbnail?: string | null
  sourceApp?: string | null
  timestamp: Date
  meta?: Record<string, unknown> | null
}

/**
 * Clipboard change notification payload.
 * @since v0.9.0
 */
export interface ClipboardChangePayload {
  item: ClipboardItem
  source: 'monitor' | 'manual'
}

/**
 * Clipboard history query parameters.
 * @since v0.9.0
 */
export interface ClipboardQueryRequest {
  page?: number
  pageSize?: number
  keyword?: string
  type?: 'text' | 'image' | 'files'
  startTime?: number
  endTime?: number
}

/**
 * Clipboard history query response.
 * @since v0.9.0
 */
export interface ClipboardQueryResponse {
  history: ClipboardItem[]
  total: number
  page: number
  pageSize: number
}

/**
 * Clipboard apply request.
 * @since v0.9.0
 */
export interface ClipboardApplyRequest {
  item?: Partial<ClipboardItem>
  text?: string
  html?: string | null
  files?: string[]
  delayMs?: number
  hideCoreBox?: boolean
}
```

### 3.2 Event Definitions

`packages/utils/transport/events/index.ts`:

```typescript
import { defineEvent } from '../event/builder'
import type {
  ClipboardItem,
  ClipboardChangePayload,
  ClipboardQueryRequest,
  ClipboardQueryResponse,
  ClipboardApplyRequest,
} from './types/clipboard'

/**
 * Clipboard domain events.
 * @since v0.9.0
 */
export const ClipboardEvents = {
  /**
   * Subscribe to clipboard changes via MessagePort streaming.
   * @since v0.9.0
   */
  change: defineEvent('clipboard')
    .module('monitor')
    .event('change')
    .define<void, AsyncIterable<ClipboardChangePayload>>({
      stream: { enabled: true, bufferSize: 10 },
    }),

  /**
   * Query clipboard history with pagination.
   * @since v0.9.0
   */
  getHistory: defineEvent('clipboard')
    .module('history')
    .event('get')
    .define<ClipboardQueryRequest, ClipboardQueryResponse>({
      batch: { enabled: true, windowMs: 50, mergeStrategy: 'dedupe' },
    }),

  /**
   * Get the most recent clipboard item.
   * @since v0.9.0
   */
  getLatest: defineEvent('clipboard')
    .module('history')
    .event('latest')
    .define<void, ClipboardItem | null>(),

  /**
   * Apply clipboard item to active application.
   * @since v0.9.0
   */
  apply: defineEvent('clipboard')
    .module('action')
    .event('apply')
    .define<ClipboardApplyRequest, void>(),

  /**
   * Delete a clipboard history item.
   * @since v0.9.0
   */
  delete: defineEvent('clipboard')
    .module('history')
    .event('delete')
    .define<{ id: number }, void>(),

  /**
   * Toggle favorite status.
   * @since v0.9.0
   */
  setFavorite: defineEvent('clipboard')
    .module('history')
    .event('set-favorite')
    .define<{ id: number; isFavorite: boolean }, void>(),
} as const
```

### 3.3 Main Process Handler

`apps/core-app/src/main/modules/clipboard/transport-handler.ts`:

```typescript
import type { ITuffTransportMain, StreamContext } from '@talex-touch/utils/transport'
import type { ClipboardModule, IClipboardItem } from '../clipboard'
import { ClipboardEvents } from '@talex-touch/utils/transport'

/**
 * TuffTransport handler for clipboard operations.
 * @since v0.9.0
 */
export class ClipboardTransportHandler {
  constructor(
    private transport: ITuffTransportMain,
    private clipboard: ClipboardModule
  ) {}

  register(): void {
    this.registerStreamHandler()
    this.registerQueryHandlers()
    this.registerActionHandlers()
  }

  private registerStreamHandler(): void {
    this.transport.stream(ClipboardEvents.change, (ctx: StreamContext<any>) => {
      const unsubscribe = this.clipboard.subscribe((item: IClipboardItem) => {
        if (!ctx.isCancelled()) {
          ctx.emit({ item, source: 'monitor' })
        }
      })
      ctx.onCancel(unsubscribe)
    })
  }

  private registerQueryHandlers(): void {
    this.transport.on(ClipboardEvents.getHistory, (req) => this.clipboard.getHistory(req))
    this.transport.on(ClipboardEvents.getLatest, () => this.clipboard.getLatestItem() ?? null)
  }

  private registerActionHandlers(): void {
    this.transport.on(ClipboardEvents.apply, (req) => this.clipboard.applyToActiveApp(req))
    this.transport.on(ClipboardEvents.delete, ({ id }) => this.clipboard.deleteItem(id))
    this.transport.on(ClipboardEvents.setFavorite, (req) => this.clipboard.setFavorite(req.id, req.isFavorite))
  }
}
```

### 3.4 Clipboard Module Refactor

`apps/core-app/src/main/modules/clipboard.ts` (additions):

```typescript
type ClipboardSubscriber = (item: IClipboardItem) => void

export class ClipboardModule extends BaseModule {
  private subscribers = new Set<ClipboardSubscriber>()

  /**
   * Subscribe to clipboard changes.
   * @since v0.9.0
   * @returns Unsubscribe function
   */
  subscribe(callback: ClipboardSubscriber): () => void {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  /**
   * Async clipboard check with deferred image processing.
   * @since v0.9.0
   */
  private async checkClipboardAsync(): Promise<void> {
    if (this.isDestroyed || !this.clipboardHelper || !this.db) return

    const formats = clipboard.availableFormats()
    if (formats.length === 0) return

    setImmediate(() => this.processClipboardFormats(formats))
  }

  private notifySubscribers(item: IClipboardItem): void {
    for (const cb of this.subscribers) {
      try { cb(item) } catch { /* ignore */ }
    }
  }
}
```

### 3.5 Search Streaming Handler

`apps/core-app/src/main/modules/box-tool/core-box/transport/search-handler.ts`:

```typescript
import type { ITuffTransportMain, StreamContext } from '@talex-touch/utils/transport'
import type { TuffSearchResult } from '@talex-touch/utils'
import { CoreBoxEvents } from '@talex-touch/utils/transport'
import searchEngineCore from '../../search-engine/search-core'

/**
 * Search streaming handler for CoreBox.
 * @since v0.9.0
 */
export class SearchTransportHandler {
  constructor(private transport: ITuffTransportMain) {}

  register(): void {
    this.transport.stream(CoreBoxEvents.search.query, async (req, ctx: StreamContext<TuffSearchResult>) => {
      const { query } = req
      const searchId = `search-${Date.now()}`

      const controller = searchEngineCore.searchStream(query, {
        onChunk: (items) => !ctx.isCancelled() && ctx.emit({ searchId, items, done: false }),
        onComplete: (summary) => {
          ctx.emit({ searchId, items: [], done: true, summary })
          ctx.end()
        },
        onError: (err) => ctx.error(err),
      })

      ctx.onCancel(() => controller.abort())
    })
  }
}
```

### 3.6 Renderer Composables

`apps/core-app/src/renderer/modules/hooks/useTuffClipboard.ts`:

```typescript
import { ref, onUnmounted } from 'vue'
import type { ClipboardItem } from '@talex-touch/utils/transport'
import { ClipboardEvents } from '@talex-touch/utils/transport'
import { useTuffTransport } from './useTuffTransport'

/**
 * Clipboard composable with TuffTransport.
 * @since v0.9.0
 */
export function useTuffClipboard() {
  const transport = useTuffTransport()
  const latest = ref<ClipboardItem | null>(null)
  const history = ref<ClipboardItem[]>([])
  const isLoading = ref(false)

  let streamController: { cancel: () => void } | null = null

  async function subscribe() {
    streamController = await transport.stream(ClipboardEvents.change, {
      onData: ({ item }) => {
        latest.value = item
        history.value = [item, ...history.value.slice(0, 99)]
      },
    })
  }

  async function loadHistory(page = 1, pageSize = 20) {
    isLoading.value = true
    try {
      const res = await transport.send(ClipboardEvents.getHistory, { page, pageSize })
      history.value = res.history
      return res
    } finally {
      isLoading.value = false
    }
  }

  async function apply(item: ClipboardItem) {
    await transport.send(ClipboardEvents.apply, { item })
  }

  onUnmounted(() => streamController?.cancel())

  return { latest, history, isLoading, subscribe, loadHistory, apply }
}
```

`apps/core-app/src/renderer/modules/hooks/useTuffSearch.ts`:

```typescript
import { ref, onUnmounted } from 'vue'
import type { TuffItem, TuffQuery } from '@talex-touch/utils'
import { CoreBoxEvents } from '@talex-touch/utils/transport'
import { useTuffTransport } from './useTuffTransport'

/**
 * Search composable with streaming support.
 * @since v0.9.0
 */
export function useTuffSearch() {
  const transport = useTuffTransport()
  const results = ref<TuffItem[]>([])
  const isSearching = ref(false)

  let controller: { cancel: () => void } | null = null

  async function search(query: TuffQuery) {
    controller?.cancel()
    isSearching.value = true
    results.value = []

    controller = await transport.stream(CoreBoxEvents.search.query, { query }, {
      onData: (chunk) => {
        results.value = [...results.value, ...chunk.items]
      },
      onEnd: () => {
        isSearching.value = false
      },
      onError: () => {
        isSearching.value = false
      },
    })
  }

  function cancel() {
    controller?.cancel()
    isSearching.value = false
  }

  onUnmounted(cancel)

  return { results, isSearching, search, cancel }
}
```

---

## 4. API Changes

### 4.1 New APIs

| API | Type | Description | Since |
|-----|------|-------------|-------|
| `ClipboardEvents.change` | Stream | Subscribe to clipboard changes | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `ClipboardEvents.getHistory` | Batch | Query history with pagination | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `ClipboardEvents.getLatest` | Request | Get latest clipboard item | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `ClipboardEvents.apply` | Request | Apply item to active app | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `ClipboardEvents.delete` | Request | Delete history item | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `ClipboardEvents.setFavorite` | Request | Toggle favorite | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `ClipboardModule.subscribe()` | Method | Subscribe to changes | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `useTuffClipboard()` | Composable | Renderer clipboard hook | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `useTuffSearch()` | Composable | Renderer search hook | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |

### 4.2 Deprecated APIs

| API | Replacement | Deprecated | Remove |
|-----|-------------|------------|--------|
| `clipboard:get-latest` | `ClipboardEvents.getLatest` | ![v0.9.0](https://img.shields.io/badge/deprecated-v0.9.0-orange) | v1.0.0 |
| `clipboard:get-history` | `ClipboardEvents.getHistory` | ![v0.9.0](https://img.shields.io/badge/deprecated-v0.9.0-orange) | v1.0.0 |
| `clipboard:new-item` broadcast | `ClipboardEvents.change` stream | ![v0.9.0](https://img.shields.io/badge/deprecated-v0.9.0-orange) | v1.0.0 |
| `core-box:query` | `CoreBoxEvents.search.query` | ![v0.9.0](https://img.shields.io/badge/deprecated-v0.9.0-orange) | v1.0.0 |
| `core-box:clipboard-change` | `ClipboardEvents.change` | ![v0.9.0](https://img.shields.io/badge/deprecated-v0.9.0-orange) | v1.0.0 |

### 4.3 Breaking Changes (v1.0.0)

| Change | Migration |
|--------|-----------|
| Remove legacy channel handlers | Use TuffTransport events |
| Remove sync clipboard broadcast | Subscribe via `ClipboardEvents.change` |
| Search returns stream | Use `onData` callback instead of single response |

---

## 5. Migration Phases

| Phase | Task | Duration |
|-------|------|----------|
| 1 | Define `ClipboardEvents` types | 1 day |
| 2 | Implement `ClipboardTransportHandler` | 2 days |
| 3 | Search streaming handler | 2 days |
| 4 | Input batching optimization | 1 day |
| 5 | Compatibility layer + testing | 2 days |

---

## 6. Files Changed

### New Files

| Path | Description |
|------|-------------|
| `packages/utils/transport/events/types/clipboard.ts` | Clipboard event types |
| `apps/core-app/src/main/modules/clipboard/transport-handler.ts` | Main process handler |
| `apps/core-app/src/main/modules/box-tool/core-box/transport/search-handler.ts` | Search handler |
| `apps/core-app/src/renderer/modules/hooks/useTuffClipboard.ts` | Renderer composable |
| `apps/core-app/src/renderer/modules/hooks/useTuffSearch.ts` | Search composable |

### Modified Files

| Path | Changes |
|------|---------|
| `packages/utils/transport/events/index.ts` | Add `ClipboardEvents` |
| `apps/core-app/src/main/modules/clipboard.ts` | Add `subscribe()`, async processing |
| `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts` | Migrate to TuffTransport |
| `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts` | Add `searchStream()` |

---

## 7. Rollback Strategy

```typescript
const TUFF_TRANSPORT_FLAGS = {
  clipboard: process.env.USE_TUFF_CLIPBOARD !== 'false',
  search: process.env.USE_TUFF_SEARCH !== 'false',
}

if (TUFF_TRANSPORT_FLAGS.clipboard) {
  clipboardTransportHandler.register()
} else {
  legacyClipboardHandler.register()
}
```

---

## 8. Testing Checklist

- [ ] Clipboard change stream receives updates
- [ ] History pagination works correctly
- [ ] Search streaming returns incremental results
- [ ] Stream cancellation releases resources
- [ ] Batch requests merge within window
- [ ] Legacy API compatibility layer works
- [ ] Performance targets met
