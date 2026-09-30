export interface WordUnit {
  /** The visible word, with the punctuation that clings to it. */
  text: string
  /** Whitespace after it, rendered outside the animated element. */
  ws: string
}

const SPACE = /^\s+$/u
/** Opening brackets and quotes lead the word after them. */
const OPENING = /^[\p{Ps}\p{Pi}]+$/u
/** Everything else punctuation-like trails the word before it. */
const PUNCTUATION = /^\p{P}+$/u
const FALLBACK = /\s+|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu

let cached: { locale: string, segmenter: Intl.Segmenter } | null = null

function segmenterFor(locale: string): Intl.Segmenter | null {
  if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function')
    return null
  if (cached?.locale !== locale)
    cached = { locale, segmenter: new Intl.Segmenter(locale, { granularity: 'word' }) }
  return cached.segmenter
}

function rawSegments(text: string, locale: string): string[] {
  const segmenter = segmenterFor(locale)
  if (segmenter)
    return Array.from(segmenter.segment(text), part => part.segment)
  // Without Intl.Segmenter: whitespace runs, one CJK character at a time, and
  // runs of anything else — close enough for a reveal, which only needs units.
  return text.match(FALLBACK) ?? []
}

/**
 * Splits text into the units a stream reveals one at a time. Words come from
 * `Intl.Segmenter` (so Chinese splits into words, not characters); whitespace
 * rides on the word before it so layout never waits on a bare space; closing
 * punctuation (`，` `.` `”` `)`) stays with the word it follows and opening
 * punctuation (`“` `(` `《`) with the word it precedes, so a line never starts
 * or ends on a lone mark; anything else that is not a word, such as an emoji,
 * is a unit of its own.
 */
export function segmentWords(text: string, locale = 'zh'): WordUnit[] {
  const units: WordUnit[] = []
  let prefix = ''

  for (const part of rawSegments(text, locale)) {
    const last = units[units.length - 1]
    if (SPACE.test(part)) {
      if (last && !prefix)
        last.ws += part
      else
        prefix += part
      continue
    }
    if (OPENING.test(part)) {
      prefix += part
      continue
    }
    if (PUNCTUATION.test(part) && last && !last.ws && !prefix) {
      last.text += part
      continue
    }
    units.push({ text: prefix + part, ws: '' })
    prefix = ''
  }

  if (prefix)
    units.push({ text: prefix, ws: '' })
  return units
}
