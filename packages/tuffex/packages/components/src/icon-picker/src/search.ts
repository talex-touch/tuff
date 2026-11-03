import type { IconPickerEntry } from './types'
import { shallowRef } from 'vue'

/**
 * The picker's search: forgiving enough to find an icon from a half-typed or
 * misspelled word, in English, Chinese or pinyin, and ranked so the exact hit
 * comes first.
 *
 * Each space-separated term must match somewhere — keywords, the class's own
 * words, or the category heading — and an entry's score is the sum of its
 * terms' best matches. Equal scores keep catalog order, so a run of ties
 * reads in the order the section browses in rather than shuffled.
 */

type Reading = readonly [full: string, initials: string]

const HAS_HAN = /\p{Script=Han}/u
const SPLITS_VALUE = /[-\d]/

/** Pinyin for the bundled catalog's Chinese keywords; loaded on the first latin query. */
const readings = shallowRef<ReadonlyMap<string, Reading> | null>(null)
let readingsLoad: Promise<void> | null = null

/** Loads the pinyin table. Until it lands, latin terms just do not match Chinese keywords. */
export function loadIconPickerPinyin(): Promise<void> {
  if (!readingsLoad) {
    readingsLoad = import('./generated/pinyin').then(({ default: table }) => {
      const map = new Map<string, Reading>()
      for (const row of table.split('|')) {
        const colon = row.indexOf(':')
        if (colon <= 0)
          continue
        const syllables = row.slice(colon + 1).split(' ')
        map.set(row.slice(0, colon), [syllables.join(''), syllables.map(syllable => syllable[0]).join('')])
      }
      readings.value = map
    })
  }
  return readingsLoad
}

interface Indexed {
  /** Latin keywords, plus the class's own words (`message`, `3`). */
  words: string[]
  /** Chinese keywords. */
  han: string[]
  /** The icon value as stored, for a pasted class or emoji. */
  value: string
  /** The class without its collection prefix, e.g. `message-3-line`. */
  name: string
}

const indexes = new WeakMap<IconPickerEntry, Indexed>()

function normalize(text: string): string {
  // NFKC folds the full-width letters a CJK input method types by default.
  return text.normalize('NFKC').toLowerCase()
}

/**
 * The words of a class name: `i-ri-message-3-line` is `message 3`. The style
 * suffix is dropped, since every row of a set carries the same one and
 * matching it matches everything.
 */
function className(value: string): string {
  const colon = value.indexOf(':')
  if (colon >= 0)
    return value.slice(colon + 1)
  return value.replace(/^i-(?:simple-icons|[a-z0-9]+)-/, '')
}

function indexOf(entry: IconPickerEntry): Indexed {
  let index = indexes.get(entry)
  if (index)
    return index

  const words: string[] = []
  const han: string[] = []
  for (const token of normalize(entry.keywords).split(/\s+/)) {
    if (!token)
      continue
    if (HAS_HAN.test(token))
      han.push(token)
    else
      words.push(token)
  }

  // An image address is no name: a digit or dash would match inside its characters.
  const value = entry.icon.type === 'url' || entry.icon.type === 'file' ? '' : normalize(entry.icon.value)
  const name = entry.icon.type === 'class' ? className(value) : ''
  for (const word of name.split('-')) {
    if (word && word !== 'line' && word !== 'fill')
      words.push(word)
  }

  index = { words, han, value, name }
  indexes.set(entry, index)
  return index
}

function isSubsequence(term: string, word: string): boolean {
  let matched = 0
  for (let i = 0; i < word.length && matched < term.length; i++) {
    if (word[i] === term[matched])
      matched++
  }
  return matched === term.length
}

/** One substitution, insertion, deletion, or swap of two neighbours. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1)
    return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i])
    i++
  if (a.length === b.length) {
    return a.slice(i + 1) === b.slice(i + 1)
      || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

/**
 * Exact, then prefix — what a user typing a word gets on every keystroke —
 * then the forgiving tiers. Those need three or four letters: below that,
 * "a mid-word match" or "a word within one typo" is most of the catalog.
 */
function scoreWord(term: string, word: string): number {
  if (word === term)
    return 100
  if (word.startsWith(term))
    return 80
  if (term.length < 3)
    return 0
  if (word.includes(term))
    return 60
  if (word[0] === term[0] && word.length <= term.length * 3 && isSubsequence(term, word))
    return 35
  // A typo in a word still being typed is a typo in its prefix: `rokc` is
  // one swap from `rock`, not from `rocket`.
  if (term.length >= 4) {
    for (let length = term.length - 1; length <= term.length + 1; length++) {
      if (withinOneEdit(term, word.slice(0, length)))
        return 20
    }
  }
  return 0
}

function scoreHan(term: string, word: string): number {
  if (word === term)
    return 100
  if (word.startsWith(term))
    return 85
  return word.includes(term) ? 65 : 0
}

/** Full readings and initials, `huojian` and `hj`, a notch below the same match in English. */
function scorePinyin(term: string, [full, initials]: Reading): number {
  if (term === full || term === initials)
    return 70
  return full.startsWith(term) || initials.startsWith(term) ? 56 : 0
}

function scoreTerm(term: string, index: Indexed, category: readonly string[]): number {
  let best = term === index.value ? 100 : 0

  if (HAS_HAN.test(term)) {
    for (const word of index.han)
      best = Math.max(best, scoreHan(term, word))
    if (best < 40 && category.some(word => word.includes(term)))
      best = 40
    return best
  }

  for (const word of index.words) {
    best = Math.max(best, scoreWord(term, word))
    if (best === 100)
      return best
  }

  // `message-3` is no single word; it is a run of the class name.
  if (best < 60 && SPLITS_VALUE.test(term) && (index.name.includes(term) || index.value.includes(term)))
    best = 60

  const table = readings.value
  if (table && best < 70) {
    for (const word of index.han) {
      const reading = table.get(word)
      if (reading)
        best = Math.max(best, scorePinyin(term, reading))
    }
  }

  if (best < 40 && category.some(word => word.startsWith(term)))
    best = 40
  return best
}

/**
 * The entries matching `query`, best first. `categoryLabel` resolves a
 * category to the heading the panel shows for it, so searching a heading the
 * host translated finds its rows.
 */
export function searchIconPickerEntries(
  entries: readonly IconPickerEntry[],
  query: string,
  categoryLabel: (category: string) => string,
): IconPickerEntry[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length)
    return [...entries]

  const categories = new Map<string, string[]>()
  const wordsOf = (category: string | undefined): readonly string[] => {
    if (!category)
      return []
    let words = categories.get(category)
    if (!words) {
      const label = normalize(categoryLabel(category))
      words = [...new Set([...normalize(category).split('-'), ...label.split(/[\s&/,]+/)])].filter(Boolean)
      categories.set(category, words)
    }
    return words
  }

  const scored: { entry: IconPickerEntry, score: number, order: number }[] = []
  entries.forEach((entry, order) => {
    const index = indexOf(entry)
    const category = wordsOf(entry.category)
    let score = 0
    for (const term of terms) {
      const termScore = scoreTerm(term, index, category)
      if (!termScore)
        return
      score += termScore
    }
    scored.push({ entry, score, order })
  })

  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(item => item.entry)
}
