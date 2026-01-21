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
 * Clipboard transport handlers
 */
export interface ClipboardTransportHandlers {
  onNewItem?: (item: IClipboardItem) => void
}

export type ClipboardChannelHandlers = ClipboardTransportHandlers

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
