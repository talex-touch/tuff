/**
 * Shared charset rules for search keywords.
 *
 * The index side and the query side must agree on what a keyword looks like:
 * a keyword written with one cleaning rule and looked up with another is simply
 * unreachable. Every producer/consumer imports from here instead of keeping a
 * local `[a-z0-9一-龥]` style regex.
 */

/** Anything that is not a letter, digit or combining mark separates keywords. */
const NON_SEARCH_CHAR_REGEX = /[^\p{L}\p{N}\p{M}]+/gu
const WHITESPACE_RUN_REGEX = /\s+/g
/**
 * Marks removed when folding. The kana sound marks (dakuten U+3099, handakuten
 * U+309A) are excluded: NFD decomposes `が` into `か` + dakuten, and dropping it
 * would fold a Japanese word onto a different one instead of onto a spelling
 * variant of itself.
 */
const FOLDABLE_MARK_REGEX = /(?![\u3099\u309A])\p{M}/gu
const FTS_QUOTE_REGEX = /"/g

/**
 * Regex source for a single Han ideograph, for callers that compose it into a
 * larger pattern. Supersedes the `一-龥` / `一-鿿` ranges that used to be
 * duplicated (inconsistently) across the search modules.
 */
export const HAN_CHAR_PATTERN = '\\p{Script=Han}'

/** Matches any Han ideograph. */
export const HAN_CHAR_REGEX = new RegExp(HAN_CHAR_PATTERN, 'u')

/**
 * Version of the keyword generation rules. It is folded into the per-item
 * keyword hash, so bumping it invalidates every stored hash: any item a source
 * re-emits then takes the normal delta path and gets its keyword mappings
 * rewritten, with no manual rebuild.
 *
 * How far a bump reaches depends on the source. The app source re-emits every
 * app on each scan, so a bump lands on the next scan. The file source only
 * re-emits files whose mtime moved, so already-indexed files keep the old
 * mappings until they are touched or the source is rebuilt (full scan of a new
 * root, reset, or snapshot replacement) — plan for that when the rule change
 * has to reach existing rows.
 *
 * Bump this whenever the rules in this module or the keyword emission in
 * `prepareDocument` change.
 */
export const SEARCH_KEYWORD_SCHEMA_VERSION = 2

/**
 * Canonical form of any searchable text: NFC, lowercase, separators collapsed
 * to single spaces. Characters outside the keyword charset are replaced by a
 * space rather than deleted, so `7-zip` becomes `7 zip` instead of `7zip` and
 * `übersicht` survives intact.
 */
export function normalizeSearchText(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(NON_SEARCH_CHAR_REGEX, ' ')
    .replace(WHITESPACE_RUN_REGEX, ' ')
    .trim()
}

/**
 * Diacritic-stripped twin of {@link normalizeSearchText}, used for
 * accent-insensitive exact/prefix matching: `café` folds to `cafe` so a keyword
 * stored in both forms is reachable however the user types it.
 */
export function foldSearchText(text: string | null | undefined): string {
  const normalized = normalizeSearchText(text)
  if (!normalized) return ''
  return normalized.normalize('NFD').replace(FOLDABLE_MARK_REGEX, '').normalize('NFC')
}

/** Whether the text contains at least one Han ideograph (pinyin generation trigger). */
export function hasHanCharacter(text: string | null | undefined): boolean {
  if (!text) return false
  return HAN_CHAR_REGEX.test(text)
}

/**
 * A keyword is valid when it still carries letters or digits after cleaning.
 * Internal spaces are allowed on purpose: multi-word aliases (`vs code`) and
 * full titles are legitimate exact-match keywords.
 */
export function isSearchKeywordValid(keyword: string | null | undefined): boolean {
  return normalizeSearchText(keyword).length > 0
}

/**
 * Quote a token for an FTS5 MATCH expression. FTS5 uses `""` as the escape for
 * a literal double quote inside a quoted string; quoting keeps user input out
 * of the syntax positions (operators, column filters, parentheses).
 */
export function quoteFtsToken(token: string): string {
  return `"${token.replace(FTS_QUOTE_REGEX, '""')}"`
}

/**
 * Keyword lookup forms for a query term, in precedence order: as typed (NFC,
 * lowercased), cleaned to the stored keyword form, and diacritic-folded.
 * Duplicates are removed, so ASCII terms still produce a single lookup key.
 */
export function expandSearchLookupVariants(term: string | null | undefined): string[] {
  if (!term) return []
  const variants: string[] = []
  const push = (value: string): void => {
    if (value && !variants.includes(value)) variants.push(value)
  }

  push(term.normalize('NFC').trim().toLowerCase())
  push(normalizeSearchText(term))
  push(foldSearchText(term))

  return variants
}
