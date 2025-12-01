import type { IClipboardItem } from './types'
import { touchChannel } from '~/modules/channel/channel-core'

/**
 * Channel event names for clipboard-related communication
 * Centralized to avoid typos and ensure consistency
 */
export const CLIPBOARD_CHANNELS = {
  /** New clipboard item detected from system */
  NEW_ITEM: 'clipboard:new-item',
  /** Get latest clipboard item */
  GET_LATEST: 'clipboard:get-latest',
  /** Metadata updated (e.g., OCR results) */
  META_UPDATED: 'clipboard:meta-updated',
  /** Apply clipboard item to active app */
  APPLY_TO_ACTIVE_APP: 'clipboard:apply-to-active-app',
  /** Get clipboard history with pagination */
  GET_HISTORY: 'clipboard:get-history',
  /** Set or unset favorite status */
  SET_FAVORITE: 'clipboard:set-favorite',
  /** Delete clipboard item by ID */
  DELETE_ITEM: 'clipboard:delete-item',
  /** Clear all clipboard history */
  CLEAR_HISTORY: 'clipboard:clear-history',
  /** Write text to system clipboard */
  WRITE_TEXT: 'clipboard:write-text',
  /** Query clipboard items with filters */
  QUERY: 'clipboard:query',
} as const

/**
 * Clipboard metadata update payload
 */
export interface ClipboardMetaUpdate {
  clipboardId: number
  patch: Record<string, unknown>
}

/**
 * Clipboard channel event handlers
 */
export interface ClipboardChannelHandlers {
  /** Called when new clipboard item is detected */
  onNewItem?: (item: IClipboardItem) => void
  /** Called when clipboard metadata is updated (e.g., OCR completed) */
  onMetaUpdated?: (update: ClipboardMetaUpdate) => void
}

/**
 * Hook for managing clipboard-related Channel communication
 * 
 * Centralizes all clipboard channel event listeners to avoid:
 * - Event name typos
 * - Duplicate registrations
 * - Inconsistent event handling
 * 
 * @param handlers - Optional event handlers for clipboard events
 * @returns Cleanup function to unregister all listeners
 * 
 * @example
 * ```ts
 * const cleanup = useClipboardChannel({
 *   onNewItem: (item) => {
 *     console.log('New clipboard item:', item)
 *   },
 *   onMetaUpdated: ({ clipboardId, patch }) => {
 *     console.log('Metadata updated:', clipboardId, patch)
 *   }
 * })
 * 
 * // Later, cleanup when component unmounts
 * cleanup()
 * ```
 */
export function useClipboardChannel(handlers?: ClipboardChannelHandlers): () => void {
  const unregisterFns: Array<() => void> = []

  // Register new item listener
  if (handlers?.onNewItem) {
    const unregister = touchChannel.regChannel(
      CLIPBOARD_CHANNELS.NEW_ITEM,
      (channelData: any) => {
        const item = channelData.data
        if (item && typeof item === 'object') {
          handlers.onNewItem?.(item as IClipboardItem)
        }
      },
    )
    unregisterFns.push(unregister)
  }

  // Register metadata update listener
  if (handlers?.onMetaUpdated) {
    const unregister = touchChannel.regChannel(
      CLIPBOARD_CHANNELS.META_UPDATED,
      (channelData: any) => {
        const { clipboardId, patch } = channelData.data || {}
        if (clipboardId && patch) {
          handlers.onMetaUpdated?.({ clipboardId, patch })
        }
      },
    )
    unregisterFns.push(unregister)
  }

  // Return cleanup function
  return () => {
    for (const unregister of unregisterFns) {
      unregister()
    }
  }
}

/**
 * Send a request to get the latest clipboard item
 * @returns Promise resolving to the latest clipboard item or null
 */
export async function getLatestClipboard(): Promise<IClipboardItem | null> {
  try {
    const result = await touchChannel.send(CLIPBOARD_CHANNELS.GET_LATEST, {})
    return result?.data ?? null
  }
  catch (error) {
    console.error('[ClipboardChannel] Failed to get latest clipboard:', error)
    return null
  }
}

/**
 * Send a synchronous request to get the latest clipboard item
 * Used for immediate clipboard access in CoreBox
 * @returns The latest clipboard item or null
 */
export function getLatestClipboardSync(): IClipboardItem | null {
  try {
    return touchChannel.sendSync(CLIPBOARD_CHANNELS.GET_LATEST, {}) as IClipboardItem | null
  }
  catch (error) {
    console.error('[ClipboardChannel] Failed to get latest clipboard (sync):', error)
    return null
  }
}

/**
 * Apply clipboard item to the active application
 * @param item - Clipboard item to apply
 * @returns Promise resolving to success status
 */
export async function applyClipboardToActiveApp(item: IClipboardItem): Promise<boolean> {
  try {
    const result = await touchChannel.send(CLIPBOARD_CHANNELS.APPLY_TO_ACTIVE_APP, { item })
    return result?.data?.success ?? false
  }
  catch (error) {
    console.error('[ClipboardChannel] Failed to apply clipboard to active app:', error)
    return false
  }
}
