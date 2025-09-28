import type { PluginClipboardHistoryResponse, PluginClipboardItem } from './types'

const ensurePluginChannel = () => {
  const channel = (window as any)?.$channel
  if (!channel) {
    throw new Error('[Plugin SDK] Clipboard channel requires plugin renderer context with $channel available.')
  }
  return channel
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

export function useClipboardHistory() {
  const channel = ensurePluginChannel()

  return {
    async getLatest(): Promise<PluginClipboardItem | null> {
      return channel.send('clipboard:get-latest')
    },

    async getHistory(options: ClipboardHistoryOptions = {}): Promise<PluginClipboardHistoryResponse> {
      const { page = 1 } = options
      return channel.send('clipboard:get-history', { page })
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
        callback(item)
      })
    }
  }
}
