import { describe, expect, it } from 'vitest'
import {
  buildSearchKeywordLookupTerms,
  collectSearchKeywordMatches,
  type SearchKeywordLookupResult,
} from '../../search/search-keyword-lookup'

function lookupResult(
  entries: Record<string, string[]>,
): SearchKeywordLookupResult {
  return new Map(
    Object.entries(entries).map(([keyword, itemIds]) => [
      keyword,
      itemIds.map(itemId => ({ itemId })),
    ]),
  )
}

describe('buildSearchKeywordLookupTerms', () => {
  it('adds the cleaned and folded form of every term', () => {
    expect(buildSearchKeywordLookupTerms(['résumé', '7-zip'])).toEqual([
      'résumé',
      'resume',
      '7-zip',
      '7 zip',
    ])
  })

  it('keeps the whole query as one lookup key', () => {
    expect(buildSearchKeywordLookupTerms(['vs', 'code', 'vs code'])).toEqual([
      'vs',
      'code',
      'vs code',
    ])
  })

  it('collapses to one key per term for plain ascii queries', () => {
    expect(buildSearchKeywordLookupTerms(['code', 'code'])).toEqual(['code'])
    expect(buildSearchKeywordLookupTerms([null, undefined, '', '  '])).toEqual([])
  })
})

describe('collectSearchKeywordMatches', () => {
  it('unions hits across the stored forms of a term', () => {
    const result = lookupResult({
      'café': ['file:a'],
      'cafe': ['file:b'],
    })

    expect(Array.from(collectSearchKeywordMatches(result, 'café'))).toEqual([
      'file:a',
      'file:b',
    ])
    expect(Array.from(collectSearchKeywordMatches(result, 'cafe'))).toEqual(['file:b'])
  })

  it('reaches a spaced keyword through the cleaned form', () => {
    const result = lookupResult({ 'vs code': ['app:vscode'] })

    expect(Array.from(collectSearchKeywordMatches(result, 'vs code'))).toEqual([
      'app:vscode',
    ])
    expect(Array.from(collectSearchKeywordMatches(result, 'vs/code'))).toEqual([
      'app:vscode',
    ])
  })

  it('deduplicates an item matched under several forms', () => {
    const result = lookupResult({
      'résumé': ['file:a'],
      'resume': ['file:a'],
    })

    expect(Array.from(collectSearchKeywordMatches(result, 'résumé'))).toEqual(['file:a'])
  })

  it('returns an empty set when nothing matches', () => {
    expect(collectSearchKeywordMatches(lookupResult({}), 'missing').size).toBe(0)
  })
})
