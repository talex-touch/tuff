import type { PluginClipboardHistoryResponse, PluginClipboardItem, PluginClipboardSearchOptions, PluginClipboardSearchResponse } from './types'

function ensurePluginChannel() {
  const channel = (window as any)?.$channel
  if (!channel) {
    throw new Error('[Plugin SDK] Clipboard channel requires plugin renderer context with $channel available.')
  }
  return channel
}

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

export type ClipboardSearchOptions = PluginClipboardSearchOptions
export type ClipboardSearchResponse = PluginClipboardSearchResponse

export function useClipboardHistory() {
  const channel = ensurePluginChannel()

  return {
    async getLatest(): Promise<PluginClipboardItem | null> {
      const result = await channel.send('clipboard:get-latest')
      return normalizeItem(result)
    },

    async getHistory(options: ClipboardHistoryOptions = {}): Promise<PluginClipboardHistoryResponse> {
      const response = await channel.send('clipboard:get-history', options)
      const history = Array.isArray(response?.history)
        ? response.history.map((item: PluginClipboardItem) => normalizeItem(item) ?? item)
        : []
      return {
        ...response,
        history,
      }
    },

    async setFavorite(options: ClipboardFavoriteOptions): Promise<void> {
      await channel.send('clipboard:set-favorite', options)
    },

    async deleteItem(options: ClipboardDeleteOptions): Promise<void> {
      await channel.send('clipboard:delete-item', options)
    },

    async clearHistory(): Promise<void> {
      await channel.send('clipboard:clear-history')
    },

    /**
     * Search clipboard history with advanced filtering options.
     * Supports keyword search, time-based filtering, and combined filters.
     *
     * @param options - Search options
     * @returns Search results with pagination metadata
     *
     * @example
     * ```typescript
     * // Search by keyword
     * const result = await searchHistory({ keyword: 'hello' })
     *
     * // Search by time range (last 24 hours)
     * const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
     * const recent = await searchHistory({ startTime: oneDayAgo })
     *
     * // Combined search: text type, favorite items from a specific app
     * const filtered = await searchHistory({
     *   type: 'text',
     *   isFavorite: true,
     *   sourceApp: 'com.apple.Safari'
     * })
     * ```
     */
    async searchHistory(options: ClipboardSearchOptions = {}): Promise<ClipboardSearchResponse> {
      // Use the extended clipboard:get-history interface with search parameters
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

    onDidChange(callback: (item: PluginClipboardItem) => void): () => void {
      return channel.regChannel('core-box:clipboard-change', ({ data }) => {
        const item = (data && 'item' in data ? data.item : data) as PluginClipboardItem
        callback(normalizeItem(item) ?? item)
      })
    },

    /**
     * Writes the provided clipboard payload to the system clipboard and issues a paste command
     * to the foreground application.
     */
    async applyToActiveApp(options: ClipboardApplyOptions = {}): Promise<boolean> {
      const response = await channel.send('clipboard:apply-to-active-app', options)
      if (typeof response === 'object' && response) {
        return Boolean((response as any).success)
      }
      return true
    },
  }
}
