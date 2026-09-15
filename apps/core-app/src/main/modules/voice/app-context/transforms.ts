/**
 * Adaptive dictation formatting — the transforms.
 *
 * Every transform is a pure `string -> string` function, exported on its own so it can be reasoned
 * about (and tested) without a profile, and registered in `TRANSFORM_RUNNERS` so that a profile can
 * name it declaratively instead of getting bespoke code. None of them is allowed to be the only
 * thing standing between the user and an empty paste; `formatDictationText` owns that guard.
 *
 * The heuristics below are deliberately conservative in one direction: when a spoken word is a
 * homograph — `点` is a dot in a path and also "o'clock" in `三点`, `那个` is a filler after a pause
 * and also a demonstrative in `那个文件` — the transform keeps the text rather than guess. A missed
 * cleanup is a small annoyance; a mangled sentence is unusable.
 */
import type { AppFormatOptions, AppTransformId, IdentifierCase } from './types'

const SPACE_OR_TAB = '[ \\t]'

/** Chinese pause marks and their ASCII twins, used to spot a spoken pause. */
const PAUSE_PUNCTUATION: Readonly<Record<string, true>> = {
  '，': true,
  ',': true,
  '、': true,
  '。': true,
  '；': true,
  ';': true,
  '：': true,
  ':': true,
  '！': true,
  '!': true,
  '？': true,
  '?': true
}

interface FillerRule {
  /**
   * Demonstratives and `就是` carry meaning without a pause (`那个文件` = "that file",
   * `就是` = "is exactly"), so they are only removed when the speaker actually paused around them.
   * Bare interjections have no such reading and only need to be delimited.
   */
  readonly requirePauseMark: boolean
}

const FILLER_RULES: Readonly<Record<string, FillerRule>> = {
  呃: { requirePauseMark: false },
  嗯: { requirePauseMark: false },
  啊: { requirePauseMark: false },
  那个: { requirePauseMark: true },
  这个: { requirePauseMark: true },
  就是: { requirePauseMark: true }
}

/**
 * Longest alternative first so `那个` is not matched as `那` followed by a stray `个`.
 *
 * The optional clause separator on each side is consumed together with the filler: removing only
 * the word would leave `，，` behind, which is worse than the filler was.
 */
const FILLER_PATTERN = new RegExp(
  `([，,]?[ \\t]*)(${Object.keys(FILLER_RULES)
    .sort((a, b) => b.length - a.length)
    .join('|')})([ \\t]*[，,]?)`,
  'g'
)

/**
 * Removes spoken filler words, together with the pause they were wrapped in.
 *
 * A filler only survives deletion when it sits against a real boundary — start of the utterance, a
 * pause mark, or whitespace — on both sides. `打开那个文件` is therefore untouched, while
 * `呃，那个，帮我记一下` loses both fillers and keeps one comma between the surviving clauses.
 */
export function removeSpokenFillers(text: string): string {
  if (!text) return text

  return text.replace(
    FILLER_PATTERN,
    (match: string, leading: string, spoken: string, trailing: string, offset: number) => {
      const rule = FILLER_RULES[spoken]
      if (!rule) return match

      // The match may start at the clause separator that was consumed in front of the filler, so
      // the boundaries have to be measured around the spoken word itself. Measuring from the match
      // start would read `是` in `…，那个，…` as the neighbour and conclude the speaker never
      // paused.
      const fillerStart = offset + leading.length
      const fillerEnd = offset + match.length - trailing.length
      const before = fillerStart > 0 ? text[fillerStart - 1] : ''
      const after = fillerEnd < text.length ? text[fillerEnd] : ''
      const strongLeft = fillerStart === 0 || PAUSE_PUNCTUATION[before] === true
      const strongRight = fillerEnd >= text.length || PAUSE_PUNCTUATION[after] === true

      if (!(strongLeft || leading.length > 0) || !(strongRight || trailing.length > 0)) return match
      if (rule.requirePauseMark && !strongLeft && !strongRight) return match

      const hasLeadingSeparator = PAUSE_PUNCTUATION[leading.trim()] === true
      const hasTrailingSeparator = PAUSE_PUNCTUATION[trailing.trim()] === true
      // Both sides were punctuation: one clause separator has to survive, or the two clauses the
      // speaker separated run together.
      if (hasLeadingSeparator && hasTrailingSeparator && offset > 0) return '，'
      if (hasLeadingSeparator) return ''
      return fillerStart === 0 ? '' : ' '
    }
  )
}

interface SpokenSymbolRule {
  readonly literal: string
  /**
   * Which neighbouring spaces the substitution swallows.
   *
   * `join` takes both sides and is for punctuation, which is never inside a word. `weld` is for
   * path and identifier symbols and is decided per occurrence: dictated directly after an ASCII
   * word it continues that word (`Users 斜杠 tagzixian` -> `Users/tagzixian`), while after CJK it
   * only replaces itself and keeps the space in front (`路径 是 斜杠 Users` -> `路径 是 /Users`).
   * Welding unconditionally would eat the space in the second case; never welding would split a
   * dictated path into words. The speaker who genuinely wants a space dictates `空格`.
   */
  readonly spacing: 'join' | 'weld'
  /** Homographs such as `点` are only substituted when the speaker isolated them as a token. */
  readonly standaloneOnly: boolean
}

const SPOKEN_SYMBOL_RULES: Readonly<Record<string, SpokenSymbolRule>> = {
  新段落: { literal: '\n\n', spacing: 'join', standaloneOnly: false },
  换行: { literal: '\n', spacing: 'join', standaloneOnly: false },
  回车: { literal: '\n', spacing: 'join', standaloneOnly: false },
  新行: { literal: '\n', spacing: 'join', standaloneOnly: false },
  空格: { literal: ' ', spacing: 'join', standaloneOnly: false },
  反斜杠: { literal: '\\', spacing: 'weld', standaloneOnly: false },
  斜杠: { literal: '/', spacing: 'weld', standaloneOnly: false },
  下划线: { literal: '_', spacing: 'weld', standaloneOnly: false },
  星号: { literal: '*', spacing: 'weld', standaloneOnly: false },
  井号: { literal: '#', spacing: 'weld', standaloneOnly: false },
  等号: { literal: '=', spacing: 'join', standaloneOnly: false },
  逗号: { literal: '，', spacing: 'join', standaloneOnly: false },
  句号: { literal: '。', spacing: 'join', standaloneOnly: false },
  问号: { literal: '？', spacing: 'join', standaloneOnly: false },
  感叹号: { literal: '！', spacing: 'join', standaloneOnly: false },
  叹号: { literal: '！', spacing: 'join', standaloneOnly: false },
  冒号: { literal: '：', spacing: 'join', standaloneOnly: false },
  分号: { literal: '；', spacing: 'join', standaloneOnly: false },
  顿号: { literal: '、', spacing: 'join', standaloneOnly: false },
  点: { literal: '.', spacing: 'weld', standaloneOnly: true }
}

/** A word ending in one of these is a path or an identifier segment, not prose. */
const ASCII_WORD_TAIL = '[A-Za-z0-9._/-]'

/**
 * Applied in descending spoken length so `反斜杠` wins over `斜杠` and `感叹号` over `叹号`.
 *
 * Spoken names are escaped into the pattern rather than interpolated raw: the registry is meant to
 * grow, and a future `加号`/`+` entry would otherwise produce a regex that silently changes meaning.
 *
 * A `weld` rule carries two patterns tried in order, and they cannot both fire: the first consumes
 * the spoken word only where an ASCII word precedes it, so the second only ever sees the
 * occurrences that were standing on their own.
 *
 * The lookarounds on a `standaloneOnly` rule are evaluated against the real string, so the optional
 * leading `[ \t]*` may still be consumed before them — `配置 点 json` becomes `配置.json` in one
 * pass without a second spacing fixup.
 */
const SPOKEN_SYMBOL_SUBSTITUTIONS: ReadonlyArray<{ patterns: readonly RegExp[]; literal: string }> =
  Object.entries(SPOKEN_SYMBOL_RULES)
    .sort(([left], [right]) => right.length - left.length)
    .map(([spoken, rule]) => {
      const escaped = spoken.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&')
      const core = rule.standaloneOnly
        ? `(?<=^|${SPACE_OR_TAB})${escaped}(?=$|${SPACE_OR_TAB})`
        : escaped
      const trail = SPACE_OR_TAB + '*'
      /**
       * Only a standalone-only symbol may take the space in front of it, and only because that
       * space is part of the dictation: the lookaround above already proved the speaker isolated
       * the word, so `配置 点 json` is one path and reads `配置.json`. Everywhere else the leading
       * space is prose spacing that belongs to the sentence — `路径 是 斜杠 Users` must keep the
       * gap and read `路径 是 /Users`.
       */
      const weldFallback = new RegExp(
        `${rule.standaloneOnly ? SPACE_OR_TAB + '*' : ''}${core}${trail}`,
        'g'
      )
      const patterns =
        rule.spacing === 'weld'
          ? [
              new RegExp(`(?<=${ASCII_WORD_TAIL})${SPACE_OR_TAB}*${core}${trail}`, 'g'),
              weldFallback
            ]
          : [new RegExp(`${SPACE_OR_TAB}*${core}${trail}`, 'g')]
      return { patterns, literal: rule.literal }
    })

/**
 * Replaces dictated symbol names with the symbol itself.
 *
 * Words such as `斜杠`/`下划线` have no everyday prose reading when isolated, so they are replaced
 * wherever they appear. `点` does — `三点` is a time — so it only counts when it stands alone.
 *
 * The replacement is a function so that a symbol containing `$` could never be read as a capture
 * reference; today's literals are all punctuation, but this registry is meant to grow.
 */
export function substituteSpokenSymbols(text: string): string {
  if (!text) return text

  let result = text
  for (const { patterns, literal } of SPOKEN_SYMBOL_SUBSTITUTIONS) {
    for (const pattern of patterns) result = result.replace(pattern, () => literal)
  }
  return result
}

const PUNCTUATION_TO_ASCII: Readonly<Record<string, string>> = {
  '，': ',',
  '。': '.',
  '．': '.',
  '？': '?',
  '！': '!',
  '：': ':',
  '；': ';',
  '、': ',',
  '～': '~',
  '－': '-',
  '—': '-',
  '…': '...',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '（': '(',
  '）': ')',
  '【': '[',
  '】': ']',
  '《': '<',
  '》': '>',
  '　': ' '
}

const FULL_WIDTH_PUNCTUATION_PATTERN = new RegExp(
  `[${Object.keys(PUNCTUATION_TO_ASCII).join('')}]`,
  'g'
)

/** Rewrites full-width punctuation as its ASCII twin. Nothing is added or removed. */
export function normalizePunctuationToAscii(text: string): string {
  if (!text) return text
  return text.replace(FULL_WIDTH_PUNCTUATION_PATTERN, (char) => PUNCTUATION_TO_ASCII[char] ?? char)
}

/**
 * Sentence punctuation only, both widths, replaced by a single space.
 *
 * `.` is deliberately absent: it is a file extension or a decimal point in the contexts that use
 * this transform. Commas become a space rather than nothing so that stripping them cannot weld two
 * clauses into one word.
 */
const SENTENCE_PUNCTUATION_PATTERN = /[，。！？；、,;:!?]+/g

export function stripSentencePunctuation(text: string): string {
  if (!text) return text
  return text.replace(SENTENCE_PUNCTUATION_PATTERN, ' ')
}

/**
 * Drops punctuation that only exists because speech is written down.
 *
 * Runs at end of string on purpose: after `换行`, a spoken line break means the next character is
 * real content, and the full stop in front of it is not trailing anymore.
 */
const TRAILING_PUNCTUATION_PATTERN = /[ \t]*[。．.!！?？;；,，、…~～]+[ \t]*$/

export function dropTrailingSentencePunctuation(text: string): string {
  if (!text) return text
  return text.replace(TRAILING_PUNCTUATION_PATTERN, '')
}

const CN_DIGITS: Readonly<Record<string, number>> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
}

/** `十` is a composition operator as well as a digit, so it is spelled out separately. */
const CN_TEN = '十'
const CN_NUMERAL_CHARS = '零一二三四五六七八九十两'
/** Units that make a neighbouring number part of a larger one (`三百`, `万一`) — left alone. */
const CN_NUMERAL_UNITS = '百千万亿'

/** Expands a character list into the membership record the numeral guards test against. */
function charRecord(chars: string): Readonly<Record<string, true>> {
  const record: Record<string, true> = {}
  for (const char of chars) record[char] = true
  return record
}

/** Characters that fuse with the preceding numeral into a fixed word rather than a quantity. */
const NUMERAL_PREFIX_BLOCKERS = charRecord(`唯统单划同另${CN_NUMERAL_UNITS}`)
const ONES_WORD_SUFFIX_BLOCKERS = charRecord('下起样定般些直点切致旦并边时行向举体心意')
const TENS_WORD_SUFFIX_BLOCKERS = charRecord('分足全字')

/**
 * Parses a bare run of Chinese numerals: `三` -> 3, `二十三` -> 23, `一二三` -> 123.
 *
 * Only up to `十` is composed; anything touching `百`/`千`/`万` is rejected by the caller because
 * composing those correctly needs units this transform does not claim to understand.
 */
function parseChineseNumeralRun(run: string): number | null {
  const tensIndex = run.lastIndexOf(CN_TEN)

  if (tensIndex === -1) {
    let digits = ''
    for (const char of run) {
      const digit = CN_DIGITS[char]
      if (digit === undefined) return null
      digits += String(digit)
    }
    return digits === '' ? null : Number(digits)
  }

  const head = run.slice(0, tensIndex)
  const tail = run.slice(tensIndex + 1)
  if (head.length > 1 || tail.length > 1) return null

  const tens = head === '' ? 1 : CN_DIGITS[head]
  const ones = tail === '' ? 0 : CN_DIGITS[tail]
  if (tens === undefined || ones === undefined) return null
  return tens * 10 + ones
}

const CN_NUMERAL_RUN_PATTERN = new RegExp(`[${CN_NUMERAL_CHARS}]+`, 'g')

/**
 * Normalizes spoken Chinese numbers to digits: `三点` -> `3点`, `二十` -> `20`.
 *
 * The guards around the run matter more than the parsing: `一下`/`一样`/`唯一`/`统一` are words,
 * not counts, and `一百二十三` is left untouched rather than half-converted into `一23`. A run of
 * bare digits without `十` is read as a concatenation, which is what a dictated phone number or
 * date sounds like.
 */
export function normalizeChineseNumerals(text: string): string {
  if (!text) return text

  return text.replace(CN_NUMERAL_RUN_PATTERN, (run: string, offset: number) => {
    const parsed = parseChineseNumeralRun(run)
    if (parsed === null) return run

    const before = offset > 0 ? text[offset - 1] : ''
    if (NUMERAL_PREFIX_BLOCKERS[before] === true) return run

    const after = offset + run.length < text.length ? text[offset + run.length] : ''
    // `String.includes('')` is true, so end of input must be excluded explicitly or every numeral
    // that ends the utterance would look like it was followed by a unit (`十` would stay `十`).
    if (after !== '' && CN_NUMERAL_UNITS.includes(after)) return run
    if (run === '一' && ONES_WORD_SUFFIX_BLOCKERS[after] === true) return run
    if (run === CN_TEN && TENS_WORD_SUFFIX_BLOCKERS[after] === true) return run

    return String(parsed)
  })
}

/**
 * A spoken marker, with the particle speakers attach to it.
 *
 * `点` and `、` belong to the marker, not to the item: `第一点 检查配置` enumerates "检查配置",
 * and leaving the particle behind would render `1. 点 检查配置`. They are optional because the
 * same speaker may say `第一 检查配置` instead.
 */
const ORDINAL_MARKER_PATTERN = /(第[零一二三四五六七八九十两]+)[点、]?/g

/**
 * Trims a list segment down to content: separators at the edges, and the line breaks the list
 * structure now provides in a steadier form than the recording did.
 */
function trimListSegment(segment: string): string {
  return segment
    .replace(/^[\s，,、。；;：:]+/u, '')
    .replace(/[\s，,、。；;：:]+$/u, '')
    .replace(/[ \t]*\n[ \t]*/g, ' ')
}

/**
 * Turns a spoken enumeration into a Markdown numbered list: `第一 检查配置 第二 重启服务` becomes
 * `1. 检查配置` / `2. 重启服务`.
 *
 * The marker has to be an actual enumeration, not a mention: at least two markers, starting at
 * `第一` and stepping by one. `第二点` in a sentence that also says `第一点` is an enumeration by
 * that definition, which is the case the speaker intends. Anything else — a single `第一`, or
 * `第三` and `第五` used as references — keeps the original wording.
 */
export function buildOrdinalList(text: string): string {
  if (!text) return text

  const markers: Array<{ index: number; end: number; order: number }> = []
  for (const match of text.matchAll(ORDINAL_MARKER_PATTERN)) {
    if (match.index === undefined) continue
    const order = parseChineseNumeralRun(match[1].slice(1))
    if (order === null) continue
    markers.push({ index: match.index, end: match.index + match[0].length, order })
  }

  if (markers.length < 2 || markers[0].order !== 1) return text
  for (let index = 1; index < markers.length; index += 1) {
    if (markers[index].order !== markers[index - 1].order + 1) return text
  }

  const items: string[] = []
  for (let index = 0; index < markers.length; index += 1) {
    const end = index + 1 < markers.length ? markers[index + 1].index : text.length
    items.push(trimListSegment(text.slice(markers[index].end, end)))
  }
  if (items.every((item) => item === '')) return text

  const lead = trimListSegment(text.slice(0, markers[0].index))
  const list = items.map((item, index) => `${index + 1}. ${item}`).join('\n')
  return lead === '' ? list : `${lead}\n\n${list}`
}

const IDENTIFIER_TOKEN_PATTERN = /^[A-Za-z0-9._\-/]+$/
const IDENTIFIER_SEPARATOR_PATTERN = /[^A-Za-z0-9]+/
/**
 * A ceiling, not a target. Without it, any English sentence dictated into an editor would be welded
 * into one identifier; with it, that mistake stays confined to short utterances that plausibly were
 * meant as a name.
 */
const IDENTIFIER_MAX_TOKENS = 8

/**
 * Rewrites a dictated word sequence as one identifier: `get user name` -> `getUserName`.
 *
 * The whole utterance has to look like an identifier — every token ASCII, no CJK anywhere — because
 * a transform that rewrites only the English run inside a Chinese sentence would turn ordinary
 * prose into scrambled identifiers. Fewer than two words is not a compound name and is left alone.
 */
export function applyIdentifierCase(text: string, style: IdentifierCase): string {
  const tokens = text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0 || tokens.length > IDENTIFIER_MAX_TOKENS) return text

  const words: string[] = []
  for (const token of tokens) {
    if (!IDENTIFIER_TOKEN_PATTERN.test(token)) return text
    for (const part of token.split(IDENTIFIER_SEPARATOR_PATTERN)) {
      if (part) words.push(part.toLowerCase())
    }
  }
  if (words.length < 2) return text

  switch (style) {
    case 'camel':
      return words
        .map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)))
        .join('')
    case 'snake':
      return words.join('_')
    case 'pascal':
      return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('')
  }
}

/** Collapses runs of spaces, pulls spaces off line breaks, and trims the result. */
export function collapseWhitespace(text: string): string {
  return text
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * The registry a profile addresses by id.
 *
 * All transforms take the options object even when unused, so a profile's pipeline stays a flat
 * list of ids and the runner table stays the single place a transform is wired up.
 */
export const TRANSFORM_RUNNERS: Readonly<
  Record<AppTransformId, (text: string, options: AppFormatOptions) => string>
> = {
  'filler.remove': (text) => removeSpokenFillers(text),
  'symbols.spoken': (text) => substituteSpokenSymbols(text),
  'punctuation.ascii': (text) => normalizePunctuationToAscii(text),
  'punctuation.strip': (text) => stripSentencePunctuation(text),
  'punctuation.trailing': (text) => dropTrailingSentencePunctuation(text),
  'numerals.chinese': (text) => normalizeChineseNumerals(text),
  'list.ordinals': (text) => buildOrdinalList(text),
  'identifier.case': (text, options) =>
    options.identifierCase ? applyIdentifierCase(text, options.identifierCase) : text,
  'whitespace.collapse': (text) => collapseWhitespace(text)
}
