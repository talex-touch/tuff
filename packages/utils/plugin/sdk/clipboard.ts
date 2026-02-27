import type {
  ClipboardActionResult,
  ClipboardChangePayload,
  ClipboardCopyAndPasteRequest,
  ClipboardItem,
  ClipboardQueryRequest,
  ClipboardQueryResponse,
  ClipboardReadImageResponse,
  ClipboardReadResponse,
} from '../../transport/events/types'
import type {
  PluginClipboardHistoryResponse,
  PluginClipboardItem,
  PluginClipboardSearchOptions,
  PluginClipboardSearchResponse,
} from './types'
import { createPluginTuffTransport } from '../../transport'
import { ClipboardEvents } from '../../transport/events'
import { TuffInputType } from '../../transport/events/types'
import { useChannel } from './channel'
import { tryGetPluginSdkApi } from './plugin-info'

function resolveSdkApi(): number | undefined {
  return tryGetPluginSdkApi()
}

function withSdkApiPayload<T extends object>(payload: T): T & { _sdkapi?: number } {
  const sdkapi = resolveSdkApi()
  if (typeof sdkapi !== 'number') {
    return payload as T & { _sdkapi?: number }
  }
  return {
    ...(payload as object),
    _sdkapi: sdkapi,
  } as T & { _sdkapi?: number }
}

function normalizeItem(item: PluginClipboardItem | null): PluginClipboardItem | null {
  if (!item) {
    return item
  }

  if (!item.meta && typeof item.metadata === 'string') {
    try {
      const parsed = JSON.parse(item.metadata)
      return { ...item, meta: parsed }
    }
    catch {
      return { ...item, meta: null }
    }
  }

  return item
}

function mapTransportItemType(type: TuffInputType): PluginClipboardItem['type'] {
  if (type === TuffInputType.Image) {
    return 'image'
  }
  if (type === TuffInputType.Files) {
    return 'files'
  }
  return 'text'
}

function parseFileList(content?: string): string[] {
  if (!content) {
    return []
  }

  try {
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
  }
  catch {
    return []
  }
}

function toPluginClipboardItem(item: ClipboardItem | null): PluginClipboardItem | null {
  if (!item) {
    return null
  }

  const meta: Record<string, unknown> = {}
  if (Array.isArray(item.tags) && item.tags.length > 0) {
    meta.tags = item.tags
  }

  return normalizeItem({
    id: item.id,
    type: mapTransportItemType(item.type),
    content: item.value ?? '',
    rawContent: typeof item.html === 'string' ? item.html : null,
    sourceApp: typeof item.source === 'string' ? item.source : null,
    timestamp: item.createdAt,
    isFavorite: item.isFavorite ?? null,
    metadata: null,
    meta: Object.keys(meta).length > 0 ? meta : null,
  })
}

function toClipboardHistoryResponse(
  response: ClipboardQueryResponse | null | undefined,
): PluginClipboardHistoryResponse {
  const history = Array.isArray(response?.items)
    ? response.items
        .map(item => toPluginClipboardItem(item))
        .filter((item): item is PluginClipboardItem => Boolean(item))
    : []

  const page = Number.isFinite(response?.page) ? Number(response?.page) : 1
  const pageSize = Number.isFinite(response?.pageSize)
    ? Number(response?.pageSize)
    : Number.isFinite(response?.limit)
      ? Number(response?.limit)
      : 20

  return {
    history,
    total: Number.isFinite(response?.total) ? Number(response?.total) : 0,
    page,
    pageSize,
  }
}

function toClipboardQueryRequest(options: ClipboardHistoryOptions = {}): ClipboardQueryRequest {
  const request: ClipboardQueryRequest = {
    page: options.page,
    pageSize: options.pageSize,
    limit: options.pageSize,
    keyword: options.keyword,
    startTime: options.startTime,
    endTime: options.endTime,
    type: options.type ?? 'all',
    isFavorite: options.isFavorite,
    sourceApp: options.sourceApp,
    sortOrder: options.sortOrder,
  }

  if (!options.type && options.isFavorite === true) {
    request.type = 'favorite'
  }

  return request
}

function toClipboardActionRequest(
  options: ClipboardApplyOptions | ClipboardCopyAndPasteOptions,
): ClipboardCopyAndPasteRequest {
  const request: ClipboardCopyAndPasteRequest = {}

  if (typeof options.text === 'string') {
    request.text = options.text
  }
  if (typeof options.html === 'string') {
    request.html = options.html
  }
  if (typeof options.image === 'string') {
    request.image = options.image
  }
  if (Array.isArray(options.files)) {
    const files = options.files.filter((file): file is string => typeof file === 'string' && file.length > 0)
    if (files.length > 0) {
      request.files = files
    }
  }

  if (Number.isFinite(options.delayMs)) {
    request.delayMs = Number(options.delayMs)
  }
  if (typeof options.hideCoreBox === 'boolean') {
    request.hideCoreBox = options.hideCoreBox
  }

  const legacyOptions = options as ClipboardApplyOptions
  const item = legacyOptions.item
  const itemType = legacyOptions.type ?? item?.type

  if (itemType === 'image' && !request.image && typeof item?.content === 'string') {
    request.image = item.content
  }

  if (itemType === 'text') {
    if (!request.text && typeof item?.content === 'string') {
      request.text = item.content
    }
    if (!request.html && typeof item?.rawContent === 'string') {
      request.html = item.rawContent
    }
  }

  if (itemType === 'files' && !request.files) {
    const files = parseFileList(item?.content)
    if (files.length > 0) {
      request.files = files
    }
  }

  return request
}

function toClipboardActionSuccess(result: ClipboardActionResult | null | undefined): boolean {
  if (!result || typeof result !== 'object') {
    return true
  }

  if (typeof result.success === 'boolean') {
    return result.success
  }

  return true
}

export type ClipboardHistoryOptions = PluginClipboardSearchOptions

export interface ClipboardFavoriteOptions {
  id: number
  isFavorite: boolean
}

export interface ClipboardDeleteOptions {
  id: number
}

export interface ClipboardApplyOptions {
  item?: PluginClipboardItem
  text?: string
  html?: string | null
  files?: string[]
  image?: string
  delayMs?: number
  hideCoreBox?: boolean
  type?: PluginClipboardItem['type']
}

export interface ClipboardWriteOptions {
  text?: string
  html?: string
  image?: string
  files?: string[]
}

export type ClipboardReadResult = ClipboardReadResponse
export type ClipboardImageResult = ClipboardReadImageResponse

export interface ClipboardCopyAndPasteOptions {
  text?: string
  html?: string
  image?: string
  files?: string[]
  delayMs?: number
  hideCoreBox?: boolean
}

export type ClipboardSearchOptions = PluginClipboardSearchOptions
export type ClipboardSearchResponse = PluginClipboardSearchResponse

/**
 * @deprecated Use `useClipboard()` instead. This function will be removed in a future version.
 */
export function useClipboardHistory() {
  return useClipboard().history
}

/**
 * Unified Clipboard SDK for plugin renderer context.
 *
 * Provides:
 * - Basic clipboard operations (read/write) via transport to main process
 * - Clipboard history management
 * - Copy and paste to active application
 *
 * @example
 * ```typescript
 * const clipboard = useClipboard()
 *
 * await clipboard.writeText('Hello World')
 * const content = await clipboard.read()
 * await clipboard.copyAndPaste({ text: 'Pasted content' })
 * ```
 */
export function useClipboard() {
  const channel = useChannel('[Plugin SDK] Clipboard channel requires plugin renderer context with $channel available.')
  const transport = createPluginTuffTransport(channel as any)

  const history = {
    /**
     * Gets the most recent clipboard item.
     */
    async getLatest(): Promise<PluginClipboardItem | null> {
      const result = await transport.send(ClipboardEvents.getLatest)
      return toPluginClipboardItem(result)
    },

    /**
     * Gets clipboard history with pagination and filters.
     */
    async getHistory(options: ClipboardHistoryOptions = {}): Promise<PluginClipboardHistoryResponse> {
      const response = await transport.send(
        ClipboardEvents.getHistory,
        withSdkApiPayload(toClipboardQueryRequest(options)),
      )
      return toClipboardHistoryResponse(response)
    },

    /**
     * Sets favorite status for a clipboard item.
     */
    async setFavorite(options: ClipboardFavoriteOptions): Promise<void> {
      await transport.send(ClipboardEvents.setFavorite, withSdkApiPayload(options))
    },

    /**
     * Deletes a clipboard item from history.
     */
    async deleteItem(options: ClipboardDeleteOptions): Promise<void> {
      await transport.send(ClipboardEvents.delete, withSdkApiPayload(options))
    },

    /**
     * Clears clipboard history.
     */
    async clearHistory(): Promise<void> {
      await transport.send(ClipboardEvents.clearHistory)
    },

    /**
     * Search clipboard history with advanced filtering.
     */
    async searchHistory(options: ClipboardSearchOptions = {}): Promise<ClipboardSearchResponse> {
      const response = await transport.send(
        ClipboardEvents.getHistory,
        withSdkApiPayload(toClipboardQueryRequest(options)),
      )
      const historyResponse = toClipboardHistoryResponse(response)
      return {
        items: historyResponse.history,
        total: historyResponse.total,
        page: historyResponse.page,
        pageSize: historyResponse.pageSize,
      }
    },

    /**
     * Listen to clipboard changes.
     *
     * **Important**: Plugin must call `box.allowClipboard(types)` first to enable monitoring.
     */
    onDidChange(callback: (item: PluginClipboardItem) => void): () => void {
      let streamController: { cancel: () => void } | null = null
      let cancelled = false

      void transport.stream(ClipboardEvents.change, undefined, {
        onData(payload: ClipboardChangePayload) {
          if (cancelled) {
            return
          }
          const latest = toPluginClipboardItem(payload?.latest ?? null)
          if (latest) {
            callback(latest)
          }
        },
        onError(error) {
          if (!cancelled) {
            console.warn('[Plugin SDK] Clipboard change stream error', error)
          }
        },
      })
        .then((controller) => {
          if (cancelled) {
            controller.cancel()
            return
          }
          streamController = controller
        })
        .catch((error) => {
          if (!cancelled) {
            console.warn('[Plugin SDK] Failed to subscribe clipboard changes', error)
          }
        })

      return () => {
        cancelled = true
        streamController?.cancel()
      }
    },

    /**
     * Apply a clipboard item to the active application (write + paste).
     * @deprecated Use `clipboard.copyAndPaste()` instead.
     */
    async applyToActiveApp(options: ClipboardApplyOptions = {}): Promise<boolean> {
      const hasInlinePayload = typeof options.text === 'string'
        || typeof options.html === 'string'
        || typeof options.image === 'string'
        || Array.isArray(options.files)
        || typeof options.type === 'string'

      if (!hasInlinePayload && Number.isFinite(options.item?.id)) {
        await transport.send(ClipboardEvents.apply, {
          id: Number(options.item?.id),
          autoPaste: true,
          _sdkapi: resolveSdkApi(),
        })
        return true
      }

      const response = await transport.send(
        ClipboardEvents.copyAndPaste,
        withSdkApiPayload(toClipboardActionRequest(options)),
      )
      return toClipboardActionSuccess(response)
    },
  }

  return {
    /**
     * Clipboard history operations.
     */
    history,

    /**
     * Writes text to the system clipboard.
     */
    async writeText(text: string): Promise<void> {
      await transport.send(ClipboardEvents.write, withSdkApiPayload({ text }))
    },

    /**
     * Writes content to the system clipboard.
     * Supports text, HTML, image (data URL), and files.
     */
    async write(options: ClipboardWriteOptions): Promise<void> {
      await transport.send(ClipboardEvents.write, withSdkApiPayload(options))
    },

    /**
     * Reads current clipboard content.
     */
    async read(): Promise<ClipboardReadResult> {
      return await transport.send(ClipboardEvents.read)
    },

    /**
     * Reads image from clipboard as data URL.
     */
    async readImage(options?: { preview?: boolean }): Promise<ClipboardImageResult | null> {
      return await transport.send(
        ClipboardEvents.readImage,
        withSdkApiPayload({ preview: options?.preview ?? true }),
      )
    },

    /**
     * Resolves the original image URL for a clipboard history item.
     */
    async getHistoryImageUrl(id: number): Promise<string | null> {
      const res = await transport.send(ClipboardEvents.getImageUrl, withSdkApiPayload({ id }))
      return typeof res?.url === 'string' ? res.url : null
    },

    /**
     * Reads file paths from clipboard.
     */
    async readFiles(): Promise<string[]> {
      return await transport.send(ClipboardEvents.readFiles)
    },

    /**
     * Clears the system clipboard.
     */
    async clear(): Promise<void> {
      await transport.send(ClipboardEvents.clear)
    },

    /**
     * Writes content to clipboard and simulates paste command to the active application.
     */
    async copyAndPaste(options: ClipboardCopyAndPasteOptions): Promise<boolean> {
      const response = await transport.send(
        ClipboardEvents.copyAndPaste,
        withSdkApiPayload(toClipboardActionRequest(options)),
      )
      return toClipboardActionSuccess(response)
    },
  }
}
