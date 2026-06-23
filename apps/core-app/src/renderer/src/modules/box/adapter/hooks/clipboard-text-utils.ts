import type { IClipboardItem } from './types'

export const MIN_TEXT_ATTACHMENT_LENGTH = 80

function getClipboardTags(item: IClipboardItem): string[] {
  const raw = item.meta?.tags
  if (!Array.isArray(raw)) return []
  return raw
    .filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
    .map((tag) => tag.toLowerCase())
}

export function isLikelyUrlText(content: string): boolean {
  const normalized = content.trim()
  if (!normalized) return false
  if (/\s/.test(normalized)) return false
  if (/^(https?:\/\/|www\.)/i.test(normalized)) return true
  return /^[a-z0-9.-]+\.[a-z]{2,}(?:[\/:?#]|$)/i.test(normalized)
}

export function isUrlLikeClipboardText(item: IClipboardItem): boolean {
  if (item.type !== 'text' && item.type !== 'html') return false
  const tags = getClipboardTags(item)
  if (tags.includes('url')) return true
  return isLikelyUrlText(item.content ?? '')
}

function hashClipboardText(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function resolveTextClipboardAttachmentIdentity(
  item: IClipboardItem | null | undefined
): string | null {
  if (!item || (item.type !== 'text' && item.type !== 'html')) return null
  const content = item.content ?? ''
  if (!content) return null
  return `text-attachment:${item.type}:${content.length}:${hashClipboardText(content)}`
}
