import type { TuffItem } from '@talex-touch/utils'

/**
 * Source id used by clipboard-history recommendation items.
 *
 * These items are built by the recommendation engine and have no execute
 * provider registered in the search core, so their execution must be routed
 * to the clipboard apply pipeline instead of the generic `item.execute` event.
 */
export const CLIPBOARD_HISTORY_SOURCE_ID = 'clipboard-history'

/**
 * Resolves the numeric clipboard-history record id from a TuffItem.
 *
 * Prefers `meta.raw.id` (the persisted record) and falls back to parsing the
 * `clipboard-<id>` item id. Returns null when the item is not a clipboard
 * history item or the id cannot be determined.
 */
export function resolveClipboardHistoryRecordId(
  item: Pick<TuffItem, 'id' | 'meta'> | null | undefined
): number | null {
  if (!item) return null

  const raw = (item.meta as { raw?: unknown } | undefined)?.raw
  const rawId = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : undefined
  if (typeof rawId === 'number' && Number.isFinite(rawId)) return rawId
  if (typeof rawId === 'string' && /^\d+$/.test(rawId)) return Number(rawId)

  const match = /^clipboard-(\d+)$/.exec(typeof item.id === 'string' ? item.id : '')
  return match ? Number(match[1]) : null
}
