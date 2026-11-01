/** Query transforms and tiers: only exact names and 3+ character prefixes inside the unique token are `hard`, everything else is `soft`. */
import { pinyinOfHan } from './tokens'

export interface QuerySubject {
  kind: 'file' | 'app'
  /** File name with extension, or the app display name. */
  name: string
  /** Name without the final extension (apps: the display name). */
  stem: string
  token: string
  /** UTF-16 offset of the token inside `stem` (apps: 0). */
  tokenStart: number
  /** The token is a word of its own (bounded by delimiters or the name's edges). */
  delimited: boolean
  style: string
  pinyin: { full: string; initials: string } | null
}

export interface QueryPlan {
  query: string
  tier: 'hard' | 'soft'
  topK: number
}

export interface QueryEnv {
  /** False for bytes no decoder accepts or empty files: discovery is not promised, so checks stay soft. */
  guaranteed: boolean
  /** How many known names or words start with this lowercase prefix. */
  prefixHits: (prefix: string) => number
}

/** Styles whose exact name and token prefix go through the keyword index unchanged. */
const HARD_STYLES = new Set([
  'ascii-lower',
  'ascii-upper',
  'ascii-mixed',
  'digits',
  'spaces',
  'dots',
  'dashes',
  'underscores',
  'parens',
  'brackets',
  'han-simplified',
  'han-traditional',
  'japanese',
  'korean',
  'accented-latin',
  'nfc-accent',
  'screenshot-macos-24h',
  'screenshot-macos-12h',
  'pixpin',
  'screenshot-cn',
  'wechat',
  'iphone-img',
  'upper-ext',
  'mixed-ext',
  'double-ext'
])

export const MAX_HARD_PREFIX_HITS = 25
/** The only transforms that can ever be `hard`; every other id is soft. */
export const HARD_QUERY_IDS: ReadonlySet<string> = new Set([
  'exact-ext',
  'exact-stem',
  'prefix-3',
  'prefix-4',
  'prefix-5',
  'prefix-6',
  'prefix-7',
  'prefix-8',
  'unique-token'
])

export const isHardStyle = (style: string): boolean => HARD_STYLES.has(style)

const NEAR_EXACT_TOP_K = 20
const FUZZY_TOP_K = 40
const DELIMITERS = /[\s\-_.()[\]]+/
const DELIMITERS_ALL = /[\s\-_.()[\]]+/g

const nfc = (value: string): string => value.normalize('NFC')
const words = (value: string): string[] => value.split(DELIMITERS).filter((word) => word.length > 0)
const chars = (value: string): string[] => Array.from(value)
const isCjk = (char: string): boolean =>
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(char)
const stripMarks = (value: string): string =>
  value.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')
const asciiOnly = (value: string): boolean => /^[\x20-\x7e]+$/.test(value)

export function fullWidth(value: string): string {
  return Array.from(value, (char) => {
    const code = char.charCodeAt(0)
    return code >= 0x21 && code <= 0x7e ? String.fromCharCode(code + 0xfee0) : char
  }).join('')
}

function nextChar(char: string): string | null {
  if (/[a-y]/.test(char) || /[A-Y]/.test(char) || /[0-8]/.test(char))
    return String.fromCharCode(char.charCodeAt(0) + 1)
  if (char === 'z') return 'a'
  if (char === 'Z') return 'A'
  if (char === '9') return '0'
  return null
}

type Transform = (subject: QuerySubject) => string | null

function prefix(count: number): Transform {
  return (s) => {
    const whole = chars(nfc(s.name))
    let cut: string[]
    if (s.kind === 'file' && s.tokenStart > 0 && s.delimited) {
      const token = chars(s.token)
      if (count > token.length) return null
      cut = token.slice(0, count)
    } else {
      cut = whole.slice(0, count)
    }
    const text = cut.join('')
    if (
      cut.length < count ||
      (s.tokenStart === 0 && cut.length >= whole.length) ||
      /\s$/.test(text)
    )
      return null
    return text
  }
}

function tokenWord(s: QuerySubject, pieces: string[]): string | undefined {
  return s.kind === 'app'
    ? pieces[0]
    : pieces.find((piece) => piece.toLowerCase().includes(s.token.toLowerCase()))
}

const changed = (value: string, original: string): string | null =>
  value === original ? null : value

const TRANSFORMS: Record<string, Transform> = {
  'exact-ext': (s) => (s.kind === 'file' ? nfc(s.name) : null),
  'exact-stem': (s) => nfc(s.stem),
  'prefix-3': prefix(3),
  'prefix-4': prefix(4),
  'prefix-5': prefix(5),
  'prefix-6': prefix(6),
  'prefix-7': prefix(7),
  'prefix-8': prefix(8),
  'middle-substring': (s) => {
    const all = chars(nfc(s.stem))
    if (all.length < 10) return null
    const start = Math.floor((all.length - 6) / 2)
    const text = all.slice(start, start + 6).join('')
    return text.trim() === text ? text : null
  },
  lowercase: (s) => changed(nfc(s.name).toLowerCase(), nfc(s.name)),
  uppercase: (s) => changed(nfc(s.name).toUpperCase(), nfc(s.name)),
  'first-token': (s) => {
    const pieces = words(nfc(s.stem))
    if (pieces.length < 2) return null
    return s.kind === 'app' || pieces[0]?.toLowerCase().includes(s.token.toLowerCase())
      ? (pieces[0] as string)
      : null
  },
  'token-subset': (s) => {
    const pieces = words(nfc(s.stem))
    if (pieces.length < 3) return null
    const first = pieces[0] as string
    const last = pieces[pieces.length - 1] as string
    const holdsToken = [first, last].some((piece) =>
      piece.toLowerCase().includes(s.token.toLowerCase())
    )
    return s.kind === 'app' || holdsToken ? `${first} ${last}` : null
  },
  'unique-token': (s) => (s.kind === 'file' ? nfc(s.token) : null),
  'cjk-first-2': (s) => {
    const all = chars(nfc(s.stem))
    return all.length >= 3 && isCjk(all[0] as string) && isCjk(all[1] as string)
      ? all.slice(0, 2).join('')
      : null
  },
  'typo-1': (s) => {
    const word = tokenWord(s, words(nfc(s.stem)))
    if (!word || word.length < 4) return null
    const at =
      s.kind === 'app'
        ? Math.floor(word.length / 2)
        : word.toLowerCase().indexOf(s.token.toLowerCase()) + 2
    const replacement = nextChar(word.charAt(at))
    return replacement === null ? null : word.slice(0, at) + replacement + word.slice(at + 1)
  },
  'diacritics-stripped': (s) => changed(stripMarks(nfc(s.stem)), nfc(s.stem)),
  'extra-whitespace': (s) => `  ${nfc(s.name).replace(/ /g, '  ')} `,
  'nfd-typed': (s) => changed(s.name.normalize('NFD'), nfc(s.name)),
  'pinyin-full': (s) => s.pinyin?.full ?? null,
  'pinyin-initials': (s) => s.pinyin?.initials ?? null,
  compact: (s) => changed(nfc(s.stem).replace(DELIMITERS_ALL, ''), nfc(s.stem)),
  acronym: (s) => {
    const pieces = words(nfc(s.stem))
    return s.kind === 'app' && pieces.length >= 2
      ? pieces.map((piece) => chars(piece)[0]).join('')
      : null
  },
  'fullwidth-typed': (s) => {
    if (s.kind === 'file')
      return s.style !== 'fullwidth' && /^[a-z0-9]+$/.test(s.token) ? fullWidth(s.token) : null
    return asciiOnly(s.name) ? fullWidth(s.name) : null
  }
}

export const QUERY_IDS: readonly string[] = Object.keys(TRANSFORMS)

export function appSubject(name: string): QuerySubject {
  return {
    kind: 'app',
    name,
    stem: name,
    token: name,
    tokenStart: 0,
    delimited: true,
    style: 'app',
    pinyin: pinyinOfHan(name)
  }
}

export function queryApplies(id: string, subject: QuerySubject): boolean {
  const query = TRANSFORMS[id]?.(subject)
  return query !== null && query !== undefined && query.trim().length > 0
}

const NEAR_EXACT = new Set([
  'lowercase',
  'uppercase',
  'extra-whitespace',
  'compact',
  'first-token',
  'token-subset',
  'nfd-typed'
])

function insideToken(id: string, subject: QuerySubject, query: string): boolean {
  if (subject.kind !== 'file' || !(subject.tokenStart === 0 || subject.delimited)) return false
  if (id !== 'unique-token' && !id.startsWith('prefix-')) return false
  const length = chars(query).length
  return length >= 3 && length <= chars(subject.token).length
}

/** Returns null when the transform does not apply to this subject. */
export function planQuery(id: string, subject: QuerySubject, env: QueryEnv): QueryPlan | null {
  const query = TRANSFORMS[id]?.(subject)
  if (query === null || query === undefined || query.trim().length === 0) return null
  const soft: QueryPlan = {
    query,
    tier: 'soft',
    topK: NEAR_EXACT.has(id) ? NEAR_EXACT_TOP_K : FUZZY_TOP_K
  }
  if (!env.guaranteed) return soft
  if (subject.kind === 'app') return id === 'exact-stem' ? { query, tier: 'hard', topK: 5 } : soft
  if (!HARD_STYLES.has(subject.style)) return soft
  if (id === 'exact-ext' || id === 'exact-stem') return { query, tier: 'hard', topK: 5 }
  if (insideToken(id, subject, query)) {
    const hits = env.prefixHits(query.toLowerCase())
    if (hits <= MAX_HARD_PREFIX_HITS) return { query, tier: 'hard', topK: Math.max(10, hits + 5) }
  }
  return soft
}
