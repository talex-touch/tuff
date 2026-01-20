import type { ClipboardChangePayload, ClipboardItem } from '@talex-touch/utils/transport/events'
import type { IClipboardItem } from './types'
import { TuffInputType } from '@talex-touch/utils'
import {
  apply as applyClipboardItem,
  getLatest as getLatestClipboardItem,
  onClipboardChange
} from '../transport/clipboard-transport'

/**
 * Convert ClipboardItem (from TuffTransport) to IClipboardItem (renderer format)
 */
function convertClipboardItem(item: ClipboardItem | null): IClipboardItem | null {
  if (!item) return null

  const type =
    item.type === TuffInputType.Image
      ? 'image'
      : item.type === TuffInputType.Files
        ? 'files'
        : 'text'

  return {
    id: item.id,
    type,
    content: item.value,
    thumbnail: undefined, // Not available in ClipboardItem
    rawContent: item.html || item.rtf || undefined,
    sourceApp: item.source || undefined,
    timestamp: new Date(item.createdAt),
    isFavorite: item.isFavorite || false,
    metadata: undefined, // Metadata is stored separately
    meta: item.tags?.length ? { tags: item.tags } : undefined
  }
}

/**
 * Clipboard metadata update (for backward compatibility)
 * @deprecated Metadata updates are now handled via the change stream
 */
export interface ClipboardMetaUpdate {
  clipboardId: number
  entries: Record<string, unknown>
}

/**
 * Clipboard transport handlers
 */
export interface ClipboardTransportHandlers {
  onNewItem?: (item: IClipboardItem) => void
  onMetaUpdate?: (update: ClipboardMetaUpdate) => void
}

export type ClipboardChannelHandlers = ClipboardTransportHandlers

/**
 * Clipboard channel event names (for backward compatibility)
 * @deprecated Use TuffTransport ClipboardEvents instead
 */
export const CLIPBOARD_CHANNELS = {
  NEW_ITEM: 'clipboard:new-item',
  META_UPDATE: 'clipboard:meta-update'
} as const

/**
 * Subscribe to clipboard changes using TuffTransport
 */
export function useClipboardChannel(handlers?: ClipboardChannelHandlers): () => void {
  if (!handlers) return () => {}

  let streamControllerPromise: ReturnType<typeof onClipboardChange> | null = null

  if (handlers.onNewItem) {
    streamControllerPromise = onClipboardChange((payload: ClipboardChangePayload) => {
      // Convert and notify about the latest item
      if (payload.latest) {
        const converted = convertClipboardItem(payload.latest)
        if (converted) {
          handlers.onNewItem!(converted)
        }
      }
    })
  }

  // Return cleanup function
  return () => {
    if (streamControllerPromise) {
      streamControllerPromise.then((controller) => controller.cancel()).catch(() => {})
      streamControllerPromise = null
    }
  }
}

/**
 * Get the latest clipboard item asynchronously
 */
export async function getLatestClipboard(): Promise<IClipboardItem | null> {
  const item = await getLatestClipboardItem()
  return convertClipboardItem(item)
}

/**
 * Get the latest clipboard item synchronously
 * @deprecated This method is not supported with TuffTransport. Use getLatestClipboard() instead.
 */
export function getLatestClipboardSync(): IClipboardItem | null {
  // TuffTransport doesn't support synchronous operations
  // Return null and log a warning
  console.warn(
    '[useClipboardChannel] getLatestClipboardSync() is deprecated. Use getLatestClipboard() instead.'
  )
  return null
}

/**
 * Apply clipboard item to active application
 */
export async function applyClipboardToActiveApp(item: IClipboardItem): Promise<boolean> {
  if (!item.id) {
    console.error('[useClipboardChannel] Cannot apply clipboard item without ID')
    return false
  }

  try {
    await applyClipboardItem(item.id)
    return true
  } catch (error) {
    console.error('[useClipboardChannel] Failed to apply clipboard item:', error)
    return false
  }
}
