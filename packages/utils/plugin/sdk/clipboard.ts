import type { PluginClipboardHistoryResponse, PluginClipboardItem } from './types'

const ensurePluginChannel = () => {
  const channel = (window as any)?.$channel
  if (!channel) {
    throw new Error('[Plugin SDK] Clipboard channel requires plugin renderer context with $channel available.')
  }
  return channel
}

const normalizeItem = (item: PluginClipboardItem | null): PluginClipboardItem | null => {
  if (!item) return item
  if (!item.meta && typeof item.metadata === 'string') {
    try {
      const parsed = JSON.parse(item.metadata)
      return { ...item, meta: parsed }
    } catch {
      return { ...item, meta: null }
    }
  }
  return item
}

export interface ClipboardHistoryOptions {
  page?: number
}

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

export function useClipboardHistory() {
  const channel = ensurePluginChannel()

  return {
    async getLatest(): Promise<PluginClipboardItem | null> {
      const result = await channel.send('clipboard:get-latest')
      return normalizeItem(result)
    },

    async getHistory(options: ClipboardHistoryOptions = {}): Promise<PluginClipboardHistoryResponse> {
      const { page = 1 } = options
      const response = await channel.send('clipboard:get-history', { page })
      const history = Array.isArray(response?.history)
        ? response.history.map((item: PluginClipboardItem) => normalizeItem(item) ?? item)
        : []
      return {
        ...response,
        history
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
    }
  }
}
