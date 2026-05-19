import { createHash } from 'node:crypto'

export function md5(string: string): string {
  return createHash('md5').update(string).digest('hex')
}

export function formatOriginalSnippet(text: string, maxLen = 56): string {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }
  if (normalized.length <= maxLen) {
    return normalized
  }
  return `${normalized.slice(0, maxLen)}…`
}

export function detectLanguage(text: string): string {
  const chineseRegex = /[\u4E00-\u9FFF]/
  return chineseRegex.test(text) ? 'zh' : 'en'
}

export function getTranslationItemId(originalText: string, service: string): string {
  return `translation-${md5(String(originalText ?? ''))}-${service}`
}

export interface ParsedImageDataUrl {
  mime: string
  base64: string
}

export function parseImageDataUrl(dataUrl: string): ParsedImageDataUrl | null {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(String(dataUrl ?? '').trim())
  if (!match) {
    return null
  }

  const mime = match[1]?.toLowerCase()
  const base64 = match[2]?.replace(/\s+/g, '')
  if (!mime || !base64) {
    return null
  }

  return { mime, base64 }
}

export function toImageDataUrl(base64: string, mime = 'image/png'): string {
  const normalizedMime = /^image\/[a-z0-9.+-]+$/i.test(mime) ? mime : 'image/png'
  return `data:${normalizedMime};base64,${base64}`
}
