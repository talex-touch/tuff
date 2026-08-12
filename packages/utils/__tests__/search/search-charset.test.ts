import { describe, expect, it } from 'vitest'
import {
  HAN_CHAR_REGEX,
  SEARCH_KEYWORD_SCHEMA_VERSION,
  expandSearchLookupVariants,
  foldSearchText,
  hasHanCharacter,
  isSearchKeywordValid,
  normalizeSearchText,
  quoteFtsToken,
} from '../../search/search-charset'

describe('normalizeSearchText', () => {
  it('keeps letters and digits from every script', () => {
    expect(normalizeSearchText('Café')).toBe('café')
    expect(normalizeSearchText('Übersicht')).toBe('übersicht')
    expect(normalizeSearchText('ひらがな')).toBe('ひらがな')
    expect(normalizeSearchText('한글')).toBe('한글')
    expect(normalizeSearchText('Привет')).toBe('привет')
    expect(normalizeSearchText('ملف')).toBe('ملف')
    expect(normalizeSearchText('微信')).toBe('微信')
  })

  it('replaces separators with a space instead of deleting them', () => {
    expect(normalizeSearchText('7-Zip')).toBe('7 zip')
    expect(normalizeSearchText('.txt')).toBe('txt')
    expect(normalizeSearchText('/Users/me/Documents/résumé.pdf')).toBe(
      'users me documents résumé pdf',
    )
    expect(normalizeSearchText('vs   code')).toBe('vs code')
  })

  it('strips emoji and punctuation-only input', () => {
    expect(normalizeSearchText('note 📝')).toBe('note')
    expect(normalizeSearchText('---')).toBe('')
    expect(normalizeSearchText('')).toBe('')
    expect(normalizeSearchText(null)).toBe('')
  })

  it('collapses NFD input onto the NFC form', () => {
    const nfd = 'café'
    expect(normalizeSearchText(nfd)).toBe('café')
    expect(normalizeSearchText(nfd)).toBe(normalizeSearchText('café'))
  })
})

describe('foldSearchText', () => {
  it('strips diacritics so accented and plain spellings converge', () => {
    expect(foldSearchText('Café')).toBe('cafe')
    expect(foldSearchText('résumé.pdf')).toBe('resume pdf')
    expect(foldSearchText('Übersicht')).toBe('ubersicht')
    expect(foldSearchText('cafe')).toBe('cafe')
  })

  it('leaves scripts without combining marks untouched', () => {
    expect(foldSearchText('한글')).toBe('한글')
    expect(foldSearchText('微信')).toBe('微信')
    expect(foldSearchText('Привет')).toBe('привет')
  })

  it('keeps kana sound marks, which distinguish words rather than spellings', () => {
    expect(foldSearchText('ひらがな')).toBe('ひらがな')
    expect(foldSearchText('パスワード')).toBe('パスワード')
    expect(foldSearchText('ばし')).not.toBe('はし')
  })
})

describe('isSearchKeywordValid', () => {
  it('accepts keywords the old [a-z0-9一-龥] veto dropped', () => {
    expect(isSearchKeywordValid('café')).toBe(true)
    expect(isSearchKeywordValid('ひらがな')).toBe(true)
    expect(isSearchKeywordValid('한글')).toBe(true)
    expect(isSearchKeywordValid('Привет')).toBe(true)
    expect(isSearchKeywordValid('vs code')).toBe(true)
    expect(isSearchKeywordValid('visual studio code')).toBe(true)
    expect(isSearchKeywordValid('.txt')).toBe(true)
    expect(isSearchKeywordValid('/users/me/documents')).toBe(true)
  })

  it('rejects keywords that carry no letters or digits', () => {
    expect(isSearchKeywordValid('')).toBe(false)
    expect(isSearchKeywordValid('   ')).toBe(false)
    expect(isSearchKeywordValid('---')).toBe(false)
    expect(isSearchKeywordValid('📝')).toBe(false)
  })
})

describe('hasHanCharacter', () => {
  it('detects Han beyond the basic 一-龥 range', () => {
    expect(hasHanCharacter('微信')).toBe(true)
    expect(hasHanCharacter('鿿')).toBe(true)
    expect(hasHanCharacter('㐀')).toBe(true)
    expect(HAN_CHAR_REGEX.test('文')).toBe(true)
  })

  it('does not treat kana or hangul as Han', () => {
    expect(hasHanCharacter('ひらがな')).toBe(false)
    expect(hasHanCharacter('한글')).toBe(false)
    expect(hasHanCharacter('resume')).toBe(false)
    expect(hasHanCharacter('')).toBe(false)
  })
})

describe('quoteFtsToken', () => {
  it('quotes tokens and doubles embedded quotes', () => {
    expect(quoteFtsToken('note')).toBe('"note"')
    expect(quoteFtsToken('a OR b')).toBe('"a OR b"')
    expect(quoteFtsToken('say "hi"')).toBe('"say ""hi"""')
    expect(quoteFtsToken('NEAR(')).toBe('"NEAR("')
  })
})

describe('expandSearchLookupVariants', () => {
  it('returns the typed, cleaned and folded lookup keys', () => {
    expect(expandSearchLookupVariants('Café')).toEqual(['café', 'cafe'])
    expect(expandSearchLookupVariants('7-Zip')).toEqual(['7-zip', '7 zip'])
    expect(expandSearchLookupVariants('résumé.pdf')).toEqual([
      'résumé.pdf',
      'résumé pdf',
      'resume pdf',
    ])
  })

  it('collapses to a single key for plain ascii terms', () => {
    expect(expandSearchLookupVariants('code')).toEqual(['code'])
    expect(expandSearchLookupVariants('')).toEqual([])
  })
})

describe('SEARCH_KEYWORD_SCHEMA_VERSION', () => {
  it('is a positive integer callers can fold into a hash', () => {
    expect(Number.isInteger(SEARCH_KEYWORD_SCHEMA_VERSION)).toBe(true)
    expect(SEARCH_KEYWORD_SCHEMA_VERSION).toBeGreaterThan(0)
  })
})
