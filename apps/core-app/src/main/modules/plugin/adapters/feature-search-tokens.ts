import { pinyin } from 'pinyin-pro'
import type { IPluginFeature } from '@talex-touch/utils/plugin'

const CHINESE_CHAR_REGEX = /[\u4e00-\u9fff]/u
const INVALID_CHAR_REGEX = /[^a-z0-9\u4e00-\u9fff]+/gi
const WORD_SEPARATORS = /[\s\-_]+/
const CAMEL_BOUNDARY = /([a-z])([A-Z])/g

function normalizeInput(text?: string): string {
  if (!text) return ''
  return text.trim()
}

function splitWords(text: string): string[] {
  if (!text) return []

  const lower = text.replace(CAMEL_BOUNDARY, '$1 $2').toLowerCase()
  const cleaned = lower.replace(INVALID_CHAR_REGEX, ' ')
  return cleaned
    .split(WORD_SEPARATORS)
    .map((part) => part.trim())
    .filter(Boolean)
}

function collectInitials(words: string[]): string | null {
  if (words.length < 2) return null

  const initials = words
    .map((word) => word[0])
    .join('')
    .trim()

  return initials.length > 0 ? initials : null
}

function addPinyinTokens(text: string, tokens: Set<string>): void {
  if (!CHINESE_CHAR_REGEX.test(text)) return

  try {
    const full = pinyin(text, { toneType: 'none' }).replace(/\s/g, '').toLowerCase()
    if (full) tokens.add(full)

    const first = pinyin(text, { pattern: 'first', toneType: 'none' })
      .replace(/\s/g, '')
      .toLowerCase()
    if (first) tokens.add(first)
  } catch (err) {
    // 保守处理，拼音模块异常时不影响主流程
    console.warn('[FeatureSearchTokens] Failed to generate pinyin tokens', err)
  }
}

function addTokensFromText(text: string, tokens: Set<string>): void {
  const normalized = normalizeInput(text)
  if (!normalized) return

  const lower = normalized.toLowerCase()
  tokens.add(lower)

  const compact = lower.replace(/\s+/g, '')
  if (compact) tokens.add(compact)

  const words = splitWords(normalized)
  words.forEach((word) => tokens.add(word))

  const initials = collectInitials(words)
  if (initials) tokens.add(initials)

  addPinyinTokens(normalized, tokens)
}

function collectCommandTokens(commands: IPluginFeature['commands']): string[] {
  const values: string[] = []
  for (const cmd of commands) {
    if (typeof cmd.value === 'string') {
      values.push(cmd.value)
    } else if (Array.isArray(cmd.value)) {
      values.push(...cmd.value.filter((v): v is string => typeof v === 'string'))
    }
  }
  return values
}

export function buildFeatureSearchTokens(feature: IPluginFeature): string[] {
  const tokens = new Set<string>()

  addTokensFromText(feature.name, tokens)
  addTokensFromText(feature.desc, tokens)

  if (feature.keywords?.length) {
    feature.keywords.forEach((keyword) => addTokensFromText(keyword, tokens))
  }

  collectCommandTokens(feature.commands).forEach((cmd) => addTokensFromText(cmd, tokens))

  return Array.from(tokens)
}
