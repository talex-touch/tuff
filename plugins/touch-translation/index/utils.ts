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
