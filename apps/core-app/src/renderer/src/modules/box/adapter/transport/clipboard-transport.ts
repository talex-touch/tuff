/**
 * @fileoverview TuffTransport for clipboard operations
 * @module @talex-touch/renderer/modules/box/adapter/transport/clipboard-transport
 * @since v0.9.0
 */

import type { ClipboardItem, ClipboardQueryRequest } from '@talex-touch/utils/transport/events'
import { createTuffRendererTransport } from '@talex-touch/utils/transport'
import { ClipboardEvents } from '@talex-touch/utils/transport/events'

const transport = createTuffRendererTransport('clipboard')

/**
 * Get the latest clipboard item.
 * @returns The latest clipboard item, or null if none exists.
 */
export async function getLatest(): Promise<ClipboardItem | null> {
  return transport.send(ClipboardEvents.getLatest)
}

/**
 * Get clipboard history with pagination and filtering.
 * @param request - The query request options.
 * @returns A paginated response of clipboard history.
 */
export async function getHistory(request: ClipboardQueryRequest) {
  return transport.send(ClipboardEvents.getHistory, request)
}

/**
 * Apply a clipboard item.
 * This will write the item to the system clipboard and potentially auto-paste.
 * @param id - The ID of the item to apply.
 */
export async function apply(id: number) {
  return transport.send(ClipboardEvents.apply, { id })
}

/**
 * Delete a clipboard item from history.
 * @param id - The ID of the item to delete.
 */
export async function del(id: number) {
  return transport.send(ClipboardEvents.delete, { id })
}

/**
 * Set the favorite status of a clipboard item.
 * @param id - The ID of the item.
 * @param isFavorite - Whether to mark as favorite.
 */
export async function setFavorite(id: number, isFavorite: boolean) {
  return transport.send(ClipboardEvents.setFavorite, { id, isFavorite })
}

/**
 * Subscribe to clipboard changes.
 *
 * @param onData - Callback function to handle incoming clipboard change payloads.
 * @returns A controller to manage the stream subscription.
 */
export function onClipboardChange(onData: (data: any) => void) {
  return transport.stream(ClipboardEvents.change, undefined, { onData })
}

export const clipboardTransport = {
  getLatest,
  getHistory,
  apply,
  delete: del,
  setFavorite,
  onClipboardChange
}
