import type { ITouchClientChannel } from '@talex-touch/utils'
import type { IClipboardItem } from '../hooks/types'

export const CLIPBOARD_EVENTS = {
  NEW_ITEM: 'clipboard:new-item',
  GET_LATEST: 'clipboard:get-latest',
  META_UPDATED: 'clipboard:meta-updated',
  APPLY_TO_ACTIVE_APP: 'clipboard:apply-to-active-app',
} as const

export interface ClipboardMetaUpdate {
  clipboardId: number
  patch: Record<string, unknown>
}

export interface ClipboardTransportHandlers {
  onNewItem?: (item: IClipboardItem) => void
  onMetaUpdated?: (update: ClipboardMetaUpdate) => void
}

export interface ClipboardTransport {
  getLatest: () => IClipboardItem | null
  getLatestAsync: () => Promise<IClipboardItem | null>
  applyToActiveApp: (item: IClipboardItem) => Promise<boolean>
  subscribe: (handlers: ClipboardTransportHandlers) => () => void
}

export function createClipboardTransport(channel: ITouchClientChannel): ClipboardTransport {
  return {
    getLatest() {
      try {
        return channel.sendSync(CLIPBOARD_EVENTS.GET_LATEST, {}) as IClipboardItem | null
      } catch {
        return null
      }
    },

    async getLatestAsync() {
      try {
        const result = await channel.send(CLIPBOARD_EVENTS.GET_LATEST, {})
        return (result as any)?.data ?? null
      } catch {
        return null
      }
    },

    async applyToActiveApp(item: IClipboardItem) {
      try {
        const result = await channel.send(CLIPBOARD_EVENTS.APPLY_TO_ACTIVE_APP, { item })
        return (result as any)?.data?.success ?? false
      } catch {
        return false
      }
    },

    subscribe(handlers: ClipboardTransportHandlers) {
      const unregisterFns: Array<() => void> = []

      if (handlers.onNewItem) {
        unregisterFns.push(
          channel.regChannel(CLIPBOARD_EVENTS.NEW_ITEM, ({ data }: any) => {
            if (data?.type) handlers.onNewItem!(data as IClipboardItem)
          })
        )
      }

      if (handlers.onMetaUpdated) {
        unregisterFns.push(
          channel.regChannel(CLIPBOARD_EVENTS.META_UPDATED, ({ data }: any) => {
            if (data?.clipboardId && data?.patch) {
              handlers.onMetaUpdated!({ clipboardId: data.clipboardId, patch: data.patch })
            }
          })
        )
      }

      return () => unregisterFns.forEach((fn) => fn())
    }
  }
}