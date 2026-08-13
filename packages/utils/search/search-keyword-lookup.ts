/**
 * Resolving query text against the stored keyword mappings.
 *
 * Keywords are stored in cleaned form, plus a diacritic-folded twin for
 * accented text (see search-charset). A term therefore has to be looked up
 * under every form it may have been stored as, and the app and file providers
 * must agree on that expansion — hence one shared implementation.
 */

import { expandSearchLookupVariants } from './search-charset'

/** The part of a `lookupByKeywords` hit this module needs. */
export interface SearchKeywordLookupEntry {
  itemId: string
}

/** keyword -> hits, as returned by the search index keyword lookup. */
export type SearchKeywordLookupResult = ReadonlyMap<
  string,
  readonly SearchKeywordLookupEntry[]
>

/**
 * Expand terms into the keyword list to query. Pass the split terms together
 * with the whole query: the full cleaned query is what reaches keywords that
 * contain spaces (multi-word aliases like `vs code`, full titles).
 * Duplicates are removed, so a plain ASCII query yields exactly one key per
 * term and the lookup cost is unchanged.
 */
export function buildSearchKeywordLookupTerms(
  terms: ReadonlyArray<string | null | undefined>
): string[] {
  const lookupTerms = new Set<string>()
  for (const term of terms) {
    for (const variant of expandSearchLookupVariants(term)) {
      lookupTerms.add(variant)
    }
  }
  return Array.from(lookupTerms)
}

/** Union the hits of every form `term` can be stored under. */
export function collectSearchKeywordMatches(
  lookupResult: SearchKeywordLookupResult,
  term: string
): Set<string> {
  const matched = new Set<string>()
  for (const variant of expandSearchLookupVariants(term)) {
    for (const entry of lookupResult.get(variant) ?? []) {
      matched.add(entry.itemId)
    }
  }
  return matched
}
