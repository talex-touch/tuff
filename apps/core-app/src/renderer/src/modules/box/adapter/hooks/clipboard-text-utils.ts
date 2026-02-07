import type { IClipboardItem } from './types'

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
