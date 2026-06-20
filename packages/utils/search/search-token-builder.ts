import type { FeatureSearchToken, FeatureSearchTokenSource } from './feature-matcher'

const CHINESE_RUN_REGEX = /[\u4E00-\u9FFF]+/gu
const WORD_REGEX = /[a-z0-9\u4E00-\u9FFF]+/gi

export type SearchTokenList = FeatureSearchToken[]

export type SearchTokenPinyinSyllablesProvider = (
  text: string
) => readonly string[] | null | undefined

export interface SearchTokenPinyinOptions {
  getSyllables?: SearchTokenPinyinSyllablesProvider
  onError?: (error: unknown, text: string) => void
}

export interface SearchTextTokenInput {
  text?: string | null
  source: FeatureSearchTokenSource
  display?: string
}

interface WordTokenPart {
  value: string
  rawStart: number
  rawEnd: number
}

export interface BuildSearchTokensOptions extends SearchTokenPinyinOptions {
  title?: string | null
  fields?: SearchTextTokenInput[]
}

function normalizeInput(text?: string | null): string {
  if (!text) return ''
  return text.trim()
}

function isCamelBoundary(previous: string | undefined, current: string | undefined): boolean {
  return Boolean(previous && current && /[a-z]/.test(previous) && /[A-Z]/.test(current))
}

function collectWordTokenParts(text: string): WordTokenPart[] {
  const parts: WordTokenPart[] = []

  for (const match of text.matchAll(WORD_REGEX)) {
    const rawWord = match[0]
    const rawStart = match.index ?? 0
    let partStart = 0

    for (let offset = 1; offset < rawWord.length; offset += 1) {
      if (!isCamelBoundary(rawWord[offset - 1], rawWord[offset])) continue

      const value = rawWord.slice(partStart, offset)
      if (value) {
        parts.push({
          value: value.toLowerCase(),
          rawStart: rawStart + partStart,
          rawEnd: rawStart + offset
        })
      }
      partStart = offset
    }

    const value = rawWord.slice(partStart)
    if (value) {
      parts.push({
        value: value.toLowerCase(),
        rawStart: rawStart + partStart,
        rawEnd: rawStart + rawWord.length
      })
    }
  }

  return parts
}

function resolveDisplayWordParts(
  wordParts: WordTokenPart[],
  display: string
): Array<WordTokenPart | null> {
  const displayLower = display.toLowerCase()
  let displaySearchStart = 0

  return wordParts.map((part) => {
    const displayStart = displayLower.indexOf(part.value, displaySearchStart)
    if (displayStart === -1) return null

    displaySearchStart = displayStart + part.value.length
    return {
      value: part.value,
      rawStart: displayStart,
      rawEnd: displayStart + part.value.length
    }
  })
}

export function addSearchToken(tokens: SearchTokenList, token: FeatureSearchToken): void {
  const value = token.value.trim().toLowerCase()
  if (!value) return

  const normalizedToken: FeatureSearchToken = {
    ...token,
    value,
    display: token.display?.trim() || undefined
  }
  const key = JSON.stringify({
    value: normalizedToken.value,
    source: normalizedToken.source,
    display: normalizedToken.display,
    segments: normalizedToken.segments
  })

  if (
    tokens.some((item) => {
      const itemKey = JSON.stringify({
        value: item.value,
        source: item.source,
        display: item.display,
        segments: item.segments
      })
      return itemKey === key
    })
  ) {
    return
  }

  tokens.push(normalizedToken)
}

export function addSimpleTextSearchTokens(
  tokens: SearchTokenList,
  text: string | null | undefined,
  source: FeatureSearchTokenSource,
  display?: string
): void {
  const normalized = normalizeInput(text)
  if (!normalized) return

  const lower = normalized.toLowerCase()
  const tokenDisplay = display || normalized
  addSearchToken(tokens, { value: lower, source, display: tokenDisplay })

  const compact = lower.replace(/\s+/g, '')
  if (compact && compact !== lower) {
    addSearchToken(tokens, { value: compact, source, display: tokenDisplay })
  }

  const wordParts = collectWordTokenParts(normalized)
  const displayWordParts = resolveDisplayWordParts(wordParts, tokenDisplay)
  for (let index = 0; index < wordParts.length; index += 1) {
    const part = wordParts[index]
    if (!part) continue
    const displayPart = displayWordParts[index]
    addSearchToken(tokens, {
      value: part.value,
      source,
      display: tokenDisplay,
      segments: displayPart
        ? [
            {
              tokenStart: 0,
              tokenEnd: part.value.length,
              displayStart: displayPart.rawStart,
              displayEnd: displayPart.rawEnd
            }
          ]
        : undefined
    })
  }

  if (wordParts.length >= 2) {
    let initials = ''
    const segments: NonNullable<FeatureSearchToken['segments']> = []
    for (let index = 0; index < wordParts.length; index += 1) {
      const part = wordParts[index]
      if (!part) continue
      const displayPart = displayWordParts[index]
      const tokenStart = initials.length
      initials += part.value[0] || ''
      if (displayPart) {
        segments.push({
          tokenStart,
          tokenEnd: tokenStart + 1,
          displayStart: displayPart.rawStart,
          displayEnd: displayPart.rawStart + 1
        })
      }
    }
    addSearchToken(tokens, {
      value: initials,
      source,
      display: tokenDisplay,
      segments: segments.length > 0 ? segments : undefined
    })
  }
}

export function addTitleSearchTokens(tokens: SearchTokenList, title: string | null | undefined): void {
  const normalized = normalizeInput(title)
  if (!normalized) return

  const lower = normalized.toLowerCase()
  addSearchToken(tokens, {
    value: lower,
    source: 'title',
    display: normalized,
    segments: [{ tokenStart: 0, tokenEnd: lower.length, titleStart: 0, titleEnd: normalized.length }]
  })

  let compact = ''
  const compactSegments: NonNullable<FeatureSearchToken['segments']> = []
  for (let index = 0; index < lower.length; index += 1) {
    const char = lower[index]
    if (!char || /\s/.test(char)) continue
    const tokenStart = compact.length
    compact += char
    compactSegments.push({
      tokenStart,
      tokenEnd: tokenStart + 1,
      titleStart: index,
      titleEnd: index + 1
    })
  }
  if (compact && compact !== lower) {
    addSearchToken(tokens, {
      value: compact,
      source: 'title',
      display: normalized,
      segments: compactSegments
    })
  }

  const wordParts = collectWordTokenParts(normalized)
  for (const part of wordParts) {
    addSearchToken(tokens, {
      value: part.value,
      source: 'title',
      display: normalized.slice(part.rawStart, part.rawEnd),
      segments: [
        {
          tokenStart: 0,
          tokenEnd: part.value.length,
          titleStart: part.rawStart,
          titleEnd: part.rawEnd
        }
      ]
    })
  }

  if (wordParts.length >= 2) {
    let initials = ''
    const segments: NonNullable<FeatureSearchToken['segments']> = []
    for (const part of wordParts) {
      const tokenStart = initials.length
      initials += part.value[0] || ''
      segments.push({
        tokenStart,
        tokenEnd: tokenStart + 1,
        titleStart: part.rawStart,
        titleEnd: part.rawStart + 1
      })
    }
    addSearchToken(tokens, { value: initials, source: 'initials', display: normalized, segments })
  }
}

export function addPinyinSearchTokens(
  tokens: SearchTokenList,
  text: string | null | undefined,
  options: SearchTokenPinyinOptions & {
    fullSource?: FeatureSearchTokenSource
    initialsSource?: FeatureSearchTokenSource
    display?: string
    titleOffset?: number
  }
): void {
  const normalized = normalizeInput(text)
  const { getSyllables } = options
  if (!normalized || !getSyllables) return

  for (const match of normalized.matchAll(CHINESE_RUN_REGEX)) {
    const chineseText = match[0]
    const textStart = match.index ?? 0

    try {
      const syllables = Array.from(getSyllables(chineseText) ?? [])
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
      if (syllables.length !== chineseText.length) continue

      let full = ''
      let initials = ''
      const fullSegments: NonNullable<FeatureSearchToken['segments']> = []
      const initialSegments: NonNullable<FeatureSearchToken['segments']> = []
      const canMapToTitle = options.titleOffset !== undefined

      syllables.forEach((syllable, index) => {
        const titleStart = (options.titleOffset ?? 0) + textStart + index
        const fullStart = full.length
        full += syllable
        if (canMapToTitle) {
          fullSegments.push({
            tokenStart: fullStart,
            tokenEnd: fullStart + syllable.length,
            titleStart,
            titleEnd: titleStart + 1
          })
        }

        const initialStart = initials.length
        initials += syllable[0] || ''
        if (canMapToTitle) {
          initialSegments.push({
            tokenStart: initialStart,
            tokenEnd: initialStart + 1,
            titleStart,
            titleEnd: titleStart + 1
          })
        }
      })

      const display = options.display || chineseText
      addSearchToken(tokens, {
        value: full,
        source: options.fullSource ?? 'pinyin',
        display,
        segments: canMapToTitle ? fullSegments : undefined
      })
      addSearchToken(tokens, {
        value: initials,
        source: options.initialsSource ?? 'initials',
        display,
        segments: canMapToTitle ? initialSegments : undefined
      })
    } catch (error) {
      options.onError?.(error, chineseText)
    }
  }
}

export function addTitlePinyinSearchTokens(
  tokens: SearchTokenList,
  title: string | null | undefined,
  options: SearchTokenPinyinOptions
): void {
  addPinyinSearchTokens(tokens, title, {
    ...options,
    fullSource: 'pinyin',
    initialsSource: 'initials',
    display: normalizeInput(title),
    titleOffset: 0
  })
}

export function buildSearchTokens(options: BuildSearchTokensOptions): FeatureSearchToken[] {
  const tokens: SearchTokenList = []

  addTitleSearchTokens(tokens, options.title)
  addTitlePinyinSearchTokens(tokens, options.title, options)

  for (const field of options.fields ?? []) {
    addSimpleTextSearchTokens(tokens, field.text, field.source, field.display)
  }

  return tokens
}
