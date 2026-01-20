import type { PluginClipboardHistoryResponse, PluginClipboardItem, PluginClipboardSearchOptions, PluginClipboardSearchResponse } from './types'
import { useChannel } from './channel'

function normalizeItem(item: PluginClipboardItem | null): PluginClipboardItem | null {
  if (!item)
    return item
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

export interface ClipboardReadResult {
  text: string
  html: string
  hasImage: boolean
  hasFiles: boolean
  formats: string[]
}

export interface ClipboardImageResult {
  dataUrl: string
  width: number
  height: number
  /**
   * Original image as a local streamable URL (Electron only).
   * Returned when calling `readImage({ preview: false })`.
   */
  tfileUrl?: string
}

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
 * - Basic clipboard operations (read/write) via IPC to main process
 * - Clipboard history management
 * - Copy and paste to active application
 *
 * All operations go through IPC to avoid WebContents focus issues.
 *
 * @example
 * ```typescript
 * const clipboard = useClipboard()
 *
 * // === Basic Operations ===
 * await clipboard.writeText('Hello World')
 * const content = await clipboard.read()
 *
 * // === Copy and Paste ===
 * await clipboard.copyAndPaste({ text: 'Pasted content' })
 *
 * // === History Operations ===
 * const latest = await clipboard.history.getLatest()
 * const { history } = await clipboard.history.getHistory({ page: 1 })
 *
 * // === Listen to Changes ===
 * // Note: Plugin must call box.allowClipboard(types) first
 * const unsubscribe = clipboard.history.onDidChange((item) => {
 *   console.log('Clipboard changed:', item)
 * })
 * ```
 */
export function useClipboard() {
  const channel = useChannel('[Plugin SDK] Clipboard channel requires plugin renderer context with $channel available.')

  const history = {
    /**
     * Gets the most recent clipboard item
     */
    async getLatest(): Promise<PluginClipboardItem | null> {
      const result = await channel.send('clipboard:get-latest')
      return normalizeItem(result)
    },

    /**
     * Gets clipboard history with pagination
     */
    async getHistory(options: ClipboardHistoryOptions = {}): Promise<PluginClipboardHistoryResponse> {
      const response = await channel.send('clipboard:get-history', options)
      const items = Array.isArray(response?.history)
        ? response.history.map((item: PluginClipboardItem) => normalizeItem(item) ?? item)
        : []
      return {
        ...response,
        history: items,
      }
    },

    /**
     * Sets favorite status for a clipboard item
     */
    async setFavorite(options: ClipboardFavoriteOptions): Promise<void> {
      await channel.send('clipboard:set-favorite', options)
    },

    /**
     * Deletes a clipboard item from history
     */
    async deleteItem(options: ClipboardDeleteOptions): Promise<void> {
      await channel.send('clipboard:delete-item', options)
    },

    /**
     * Clears all clipboard history
     */
    async clearHistory(): Promise<void> {
      await channel.send('clipboard:clear-history')
    },

    /**
     * Search clipboard history with advanced filtering
     *
     * @example
     * ```typescript
     * // Search by keyword
     * const result = await clipboard.history.searchHistory({ keyword: 'hello' })
     *
     * // Filter by type and time
     * const recent = await clipboard.history.searchHistory({
     *   type: 'text',
     *   startTime: Date.now() - 24 * 60 * 60 * 1000
     * })
     * ```
     */
    async searchHistory(options: ClipboardSearchOptions = {}): Promise<ClipboardSearchResponse> {
      const response = await channel.send('clipboard:get-history', options)
      const items = Array.isArray(response?.history)
        ? response.history.map((item: PluginClipboardItem) => normalizeItem(item) ?? item)
        : []
      return {
        items,
        total: response?.total ?? 0,
        page: response?.page ?? 1,
        pageSize: response?.pageSize ?? 20,
      }
    },

    /**
     * Listen to clipboard changes.
     *
     * **Important**: Plugin must call `box.allowClipboard(types)` first to enable monitoring.
     * Only changes matching the allowed types will be received.
     *
     * @example
     * ```typescript
     * import { ClipboardType } from '@talex-touch/utils/plugin/sdk'
     *
     * // Enable monitoring for text and images
     * await box.allowClipboard(ClipboardType.TEXT | ClipboardType.IMAGE)
     *
     * // Listen to changes
     * const unsubscribe = clipboard.history.onDidChange((item) => {
     *   console.log('New clipboard item:', item.type, item.content)
     * })
     *
     * // Later: stop listening
     * unsubscribe()
     * ```
     */
    onDidChange(callback: (item: PluginClipboardItem) => void): () => void {
      return channel.regChannel('core-box:clipboard-change', (event) => {
        const data = event?.data
        const item = (data && typeof data === 'object' && 'item' in data ? (data as { item: PluginClipboardItem }).item : data) as PluginClipboardItem
        callback(normalizeItem(item) ?? item)
      })
    },

    /**
     * Apply a clipboard item to the active application (write + paste)
     * @deprecated Use `clipboard.copyAndPaste()` instead
     */
    async applyToActiveApp(options: ClipboardApplyOptions = {}): Promise<boolean> {
      const response = await channel.send('clipboard:apply-to-active-app', options)
      if (typeof response === 'object' && response) {
        return Boolean((response as { success?: boolean }).success)
      }
      return true
    },
  }

  return {
    /**
     * Clipboard history operations
     */
    history,

    /**
     * Writes text to the system clipboard
     */
    async writeText(text: string): Promise<void> {
      await channel.send('clipboard:write-text', { text })
    },

    /**
     * Writes content to the system clipboard.
     * Supports text, HTML, image (data URL), and files.
     */
    async write(options: ClipboardWriteOptions): Promise<void> {
      await channel.send('clipboard:write', options)
    },

    /**
     * Reads current clipboard content
     */
    async read(): Promise<ClipboardReadResult> {
      return await channel.send('clipboard:read')
    },

    /**
     * Reads image from clipboard as data URL
     */
    async readImage(options?: { preview?: boolean }): Promise<ClipboardImageResult | null> {
      return await channel.send('clipboard:read-image', { preview: options?.preview ?? true })
    },

    /**
     * Resolves the original image URL for a clipboard history item (streamable via tfile://).
     *
     * @remarks
     * - This avoids transferring large base64 payloads over IPC.
     * - Returns null if the item is not an image or original asset is not available.
     */
    async getHistoryImageUrl(id: number): Promise<string | null> {
      const res = await channel.send('clipboard:get-image-url', { id })
      if (res && typeof res === 'object' && 'url' in res && typeof (res as any).url === 'string') {
        return (res as any).url as string
      }
      return null
    },

    /**
     * Reads file paths from clipboard
     */
    async readFiles(): Promise<string[]> {
      return await channel.send('clipboard:read-files')
    },

    /**
     * Clears the system clipboard
     */
    async clear(): Promise<void> {
      await channel.send('clipboard:clear')
    },

    /**
     * Writes content to clipboard and simulates paste command to the active application.
     * This is the recommended way to "paste" content from a plugin.
     *
     * @example
     * ```typescript
     * // Paste text
     * await clipboard.copyAndPaste({ text: 'Hello' })
     *
     * // Paste with HTML formatting
     * await clipboard.copyAndPaste({ text: 'Hello', html: '<b>Hello</b>' })
     *
     * // Paste image
     * await clipboard.copyAndPaste({ image: 'data:image/png;base64,...' })
     *
     * // Paste files
     * await clipboard.copyAndPaste({ files: ['/path/to/file.txt'] })
     * ```
     */
    async copyAndPaste(options: ClipboardCopyAndPasteOptions): Promise<boolean> {
      const response = await channel.send('clipboard:copy-and-paste', options)
      if (typeof response === 'object' && response) {
        return Boolean((response as { success?: boolean }).success)
      }
      return true
    },
  }
}
