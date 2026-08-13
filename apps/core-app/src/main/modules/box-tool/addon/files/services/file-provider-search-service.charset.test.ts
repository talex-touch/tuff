import { describe, expect, it } from 'vitest'
import { buildFtsQuery, buildSearchIndexItem } from './file-provider-search-service'

describe('file-provider-search-service charset', () => {
  it('keeps non-latin queries instead of deleting them', () => {
    expect(buildFtsQuery(['ひらがな'])).toBe('ひらがな')
    expect(buildFtsQuery(['한글'])).toBe('한글')
    expect(buildFtsQuery(['Привет'])).toBe('привет')
    expect(buildFtsQuery(['ملف'])).toBe('ملف')
    expect(buildFtsQuery(['微信'])).toBe('微信')
  })

  it('keeps accented latin queries intact', () => {
    expect(buildFtsQuery(['résumé'])).toBe('résumé')
    expect(buildFtsQuery(['Übersicht'])).toBe('übersicht')
  })

  it('splits separators into tokens rather than dropping the term', () => {
    expect(buildFtsQuery(['7-zip'])).toBe('7 zip')
    expect(buildFtsQuery(['.txt'])).toBe('txt')
    expect(buildFtsQuery(['annual report.pdf'])).toBe('annual report pdf')
  })

  it('drops terms that carry no letters or digits', () => {
    expect(buildFtsQuery(['---'])).toBe('')
    expect(buildFtsQuery(['📝'])).toBe('')
    expect(buildFtsQuery([])).toBe('')
  })

  it('builds index keywords for an accented file name', () => {
    const item = buildSearchIndexItem(
      {
        path: '/tmp/demo/résumé.pdf',
        name: 'résumé.pdf',
        displayName: null,
        extension: '.pdf',
        content: null
      } as Parameters<typeof buildSearchIndexItem>[0],
      'file',
      'files'
    )

    expect((item.keywords ?? []).map((keyword) => keyword.value)).toContain('résumé')
  })
})
