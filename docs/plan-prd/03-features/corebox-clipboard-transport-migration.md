# CoreBox 剪贴板 → TuffTransport 迁移

> **版本**: 2.0.0 | **起始版本**: v0.9.0 | **状态**: 草稿

## 1. 问题分析

### 1.1 UI 卡顿根因

| 问题 | 位置 | 影响 |
|-------|----------|--------|
| 同步 IPC 阻塞 | `clipboard.readImage().toDataURL()` | 主线程阻塞 |
| 无批处理 | Channel `send/sendSync` | 每次搜索 8+ 次 IPC |
| 同步广播 | `windowManager.forwardInputChange()` | UI 掉帧 |

### 1.2 受影响模块

```
clipboard.ts          → Polling + sync broadcast
core-box/ipc.ts       → Independent channel registrations  
input-transport.ts    → Sync input forwarding
window.ts             → Clipboard sync forwarding
search-core.ts        → No streaming results
```

---

## 2. 目标架构

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

### 性能目标

| 指标 | 优化前 | 优化后 |
|--------|--------|-------|
| 首个结果延迟 | ~150ms | <50ms |
| 剪贴板同步 | ~100ms | <30ms |
| 每次搜索 IPC 次数 | ~8 | ~2 |
| UI FPS | ~45 | 60 |

---

## 3. 技术实现

### 3.1 事件类型

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

### 3.2 事件定义

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

### 3.3 主进程 Handler

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

### 3.4 剪贴板模块重构

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

### 3.5 搜索流式处理

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

### 3.6 渲染进程 Composables

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

## 4. API 变更

### 4.1 新增 API

| API | 类型 | 说明 | 起始版本 |
|-----|------|-------------|-------|
| `ClipboardEvents.change` | Stream | 订阅剪贴板变更 | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `ClipboardEvents.getHistory` | Batch | 分页查询历史记录 | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `ClipboardEvents.getLatest` | Request | 获取最新剪贴板项 | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `ClipboardEvents.apply` | Request | 应用剪贴板项到活跃应用 | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `ClipboardEvents.delete` | Request | 删除历史项 | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `ClipboardEvents.setFavorite` | Request | 切换收藏状态 | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `ClipboardModule.subscribe()` | Method | 订阅变更 | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `useTuffClipboard()` | Composable | 渲染进程剪贴板 hook | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |
| `useTuffSearch()` | Composable | 渲染进程搜索 hook | ![v0.9.0](https://img.shields.io/badge/since-v0.9.0-blue) |

### 4.2 废弃 API

| API | 替代方案 | 废弃版本 | 移除版本 |
|-----|-------------|------------|--------|
| `clipboard:get-latest` | `ClipboardEvents.getLatest` | ![v0.9.0](https://img.shields.io/badge/deprecated-v0.9.0-orange) | v1.0.0 |
| `clipboard:get-history` | `ClipboardEvents.getHistory` | ![v0.9.0](https://img.shields.io/badge/deprecated-v0.9.0-orange) | v1.0.0 |
| `clipboard:new-item` broadcast | `ClipboardEvents.change` stream | ![v0.9.0](https://img.shields.io/badge/deprecated-v0.9.0-orange) | v1.0.0 |
| `core-box:query` | `CoreBoxEvents.search.query` | ![v0.9.0](https://img.shields.io/badge/deprecated-v0.9.0-orange) | v1.0.0 |
| `core-box:clipboard-change` | `ClipboardEvents.change` | ![v0.9.0](https://img.shields.io/badge/deprecated-v0.9.0-orange) | v1.0.0 |

### 4.3 破坏性变更（v1.0.0）

| 变更 | 迁移方式 |
|--------|-----------|
| 移除 legacy 通道处理 | 使用 TuffTransport events |
| 移除同步剪贴板广播 | 通过 `ClipboardEvents.change` 订阅 |
| 搜索返回流式结果 | 使用 `onData` 回调替代单次响应 |

---

## 5. 迁移阶段

| 阶段 | 任务 | 耗时 |
|-------|------|----------|
| 1 | 定义 `ClipboardEvents` 类型 | 1 天 |
| 2 | 实现 `ClipboardTransportHandler` | 2 天 |
| 3 | 搜索流式处理 | 2 天 |
| 4 | 输入批处理优化 | 1 天 |
| 5 | 兼容层 + 测试 | 2 天 |

---

## 6. 变更文件

### 新增文件

| Path | 说明 |
|------|-------------|
| `packages/utils/transport/events/types/clipboard.ts` | 剪贴板事件类型 |
| `apps/core-app/src/main/modules/clipboard/transport-handler.ts` | 主进程 handler |
| `apps/core-app/src/main/modules/box-tool/core-box/transport/search-handler.ts` | 搜索 handler |
| `apps/core-app/src/renderer/modules/hooks/useTuffClipboard.ts` | 渲染进程 composable |
| `apps/core-app/src/renderer/modules/hooks/useTuffSearch.ts` | 搜索 composable |

### 修改文件

| Path | 变更 |
|------|---------|
| `packages/utils/transport/events/index.ts` | 新增 `ClipboardEvents` |
| `apps/core-app/src/main/modules/clipboard.ts` | 新增 `subscribe()`，异步处理 |
| `apps/core-app/src/main/modules/box-tool/core-box/ipc.ts` | 迁移到 TuffTransport |
| `apps/core-app/src/main/modules/box-tool/search-engine/search-core.ts` | 新增 `searchStream()` |

---

## 7. 回滚策略

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

## 8. 测试清单

- [ ] 剪贴板变更流可收到更新
- [ ] 历史分页正确
- [ ] 搜索流式返回增量结果
- [ ] 流取消能释放资源
- [ ] 批处理请求在窗口期内合并
- [ ] 旧 API 兼容层可用
- [ ] 性能指标达标
