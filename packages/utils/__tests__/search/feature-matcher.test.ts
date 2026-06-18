import { describe, expect, it } from 'vitest'

import { buildAppSearchTokens } from '../../search/app-search-tokens'
import { type FeatureSearchToken, matchFeature } from '../../search/feature-matcher'
import { addSimpleTextSearchTokens, buildSearchTokens } from '../../search/search-token-builder'

function buildSimpleTokens(
  text: string,
  display = text,
  source: FeatureSearchToken['source'] = 'id'
): FeatureSearchToken[] {
  const tokens: FeatureSearchToken[] = []
  addSimpleTextSearchTokens(tokens, text, source, display)
  return tokens
}

function expectAliasFor(
  searchTokens: FeatureSearchToken[],
  query: string,
  title = '翻译'
): NonNullable<ReturnType<typeof matchFeature>['matchedAlias']> {
  const result = matchFeature({
    title,
    searchTokens,
    query,
    enableFuzzy: false
  })

  expect(result.matched).toBe(true)
  expect(result.matchRanges).toEqual([])
  expect(result.matchedAlias).toBeDefined()
  return result.matchedAlias!
}

describe('matchFeature', () => {
  it('maps Chinese initials token matches back to title ranges', () => {
    const result = matchFeature({
      title: '剪贴板历史记录',
      searchTokens: [
        'jtb',
        {
          value: 'jtblsjl',
          source: 'initials',
          display: '剪贴板历史记录',
          segments: [
            { tokenStart: 0, tokenEnd: 1, titleStart: 0, titleEnd: 1 },
            { tokenStart: 1, tokenEnd: 2, titleStart: 1, titleEnd: 2 },
            { tokenStart: 2, tokenEnd: 3, titleStart: 2, titleEnd: 3 },
            { tokenStart: 3, tokenEnd: 4, titleStart: 3, titleEnd: 4 },
            { tokenStart: 4, tokenEnd: 5, titleStart: 4, titleEnd: 5 },
            { tokenStart: 5, tokenEnd: 6, titleStart: 5, titleEnd: 6 },
            { tokenStart: 6, tokenEnd: 7, titleStart: 6, titleEnd: 7 }
          ]
        }
      ],
      query: 'jtb',
      enableFuzzy: false
    })

    expect(result.matched).toBe(true)
    expect(result.matchedToken).toBe('jtblsjl')
    expect(result.matchRanges).toEqual([{ start: 0, end: 3 }])
    expect(result.matchedAlias).toBeUndefined()
  })

  it('returns a visible alias highlight for non-title token matches', () => {
    const result = matchFeature({
      title: '剪贴板历史记录',
      searchTokens: ['clipboard'],
      query: 'clipboard',
      enableFuzzy: false
    })

    expect(result.matched).toBe(true)
    expect(result.matchRanges).toEqual([])
    expect(result.matchedAlias).toEqual({
      text: 'Clipboard',
      matchRanges: [{ start: 0, end: 'Clipboard'.length }]
    })
  })

  it('formats separator tokens as readable aliases', () => {
    const result = matchFeature({
      title: '剪贴板历史记录',
      searchTokens: ['clipboard-history'],
      query: 'history',
      enableFuzzy: false
    })

    expect(result.matched).toBe(true)
    expect(result.matchedAlias).toEqual({
      text: 'Clipboard History',
      matchRanges: [{ start: 10, end: 17 }]
    })
  })

  it('exposes token source metadata for app search tokens', () => {
    const searchTokens = buildAppSearchTokens({
      title: '微信开发者工具',
      name: 'wechatwebdevtools',
      path: '/Applications/wechatwebdevtools.app',
      fileName: 'wechatwebdevtools',
      bundleId: 'com.tencent.wechatwebdevtools'
    })

    const result = matchFeature({
      title: '微信开发者工具',
      searchTokens,
      query: 'wechatw',
      enableFuzzy: false
    })

    expect(result.matched).toBe(true)
    expect(result.matchedTokenSource).toBe('name')
    expect(result.matchedAlias).toEqual({
      text: 'Wechatwebdevtools',
      matchRanges: [{ start: 0, end: 'wechatw'.length }]
    })
  })

  it('drops reverse-DNS bundle id roots from app match aliases', () => {
    const searchTokens = buildAppSearchTokens({
      title: '网易云音乐',
      name: 'NeteaseMusic',
      path: '/Applications/NeteaseMusic.app',
      fileName: 'NeteaseMusic',
      bundleId: 'com.netease.163music'
    })

    const result = matchFeature({
      title: '网易云音乐',
      searchTokens,
      query: '163',
      enableFuzzy: false
    })

    expect(result.matched).toBe(true)
    expect(result.matchedTokenSource).toBe('bundleId')
    expect(result.matchedAlias).toEqual({
      text: 'Netease 163music',
      matchRanges: [{ start: 8, end: 11 }]
    })
  })

  it('does not surface generic bundle id roots as standalone app aliases', () => {
    const searchTokens = buildAppSearchTokens({
      title: '网易云音乐',
      name: 'NeteaseMusic',
      path: '/Applications/NeteaseMusic.app',
      fileName: 'NeteaseMusic',
      bundleId: 'com.netease.163music'
    })

    const result = matchFeature({
      title: '网易云音乐',
      searchTokens,
      query: 'com',
      enableFuzzy: false
    })

    expect(result.matched).toBe(false)
    expect(result.matchedAlias).toBeUndefined()
  })

  describe('external token alias highlighting', () => {
    it('highlights the matched word inside a hyphenated plugin id alias', () => {
      const tokens = buildSimpleTokens('touch-translate')
      const result = matchFeature({
        title: '翻译',
        searchTokens: tokens,
        query: 'tran',
        enableFuzzy: false
      })

      expect(result.matched).toBe(true)
      expect(result.matchedToken).toBe('translate')
      expect(result.matchRanges).toEqual([])
      expect(result.matchedAlias).toEqual({
        text: 'Touch Translate',
        matchRanges: [{ start: 6, end: 10 }]
      })
    })

    it.each([
      ['touch', [{ start: 0, end: 5 }]],
      ['tran', [{ start: 6, end: 10 }]],
      ['late', [{ start: 11, end: 15 }]],
      ['tt', [{ start: 0, end: 1 }, { start: 6, end: 7 }]]
    ])('maps %s to the readable touch-translate alias range', (query, matchRanges) => {
      const alias = expectAliasFor(buildSimpleTokens('touch-translate'), query)

      expect(alias).toEqual({
        text: 'Touch Translate',
        matchRanges
      })
    })

    it.each([
      ['multi', [{ start: 0, end: 5 }]],
      ['source', [{ start: 6, end: 12 }]],
      ['tran', [{ start: 13, end: 17 }]],
      ['panel', [{ start: 23, end: 28 }]],
      [
        'mstp',
        [
          { start: 0, end: 1 },
          { start: 6, end: 7 },
          { start: 13, end: 14 },
          { start: 23, end: 24 }
        ]
      ]
    ])('maps %s across mixed separators in a long alias', (query, matchRanges) => {
      const alias = expectAliasFor(buildSimpleTokens('multi.source_translate+panel'), query)

      expect(alias).toEqual({
        text: 'Multi Source Translate Panel',
        matchRanges
      })
    })

    it.each([
      ['touchTranslate', 'tran', 'Touch Translate', [{ start: 6, end: 10 }]],
      ['openURLPanel', 'panel', 'Open URLPanel', [{ start: 8, end: 13 }]],
      ['quickOCRTranslate', 'ocr', 'Quick OCRTranslate', [{ start: 6, end: 9 }]]
    ])('maps camelCase token %s query %s back to the readable alias', (text, query, aliasText, matchRanges) => {
      const alias = expectAliasFor(buildSimpleTokens(text), query)

      expect(alias).toEqual({
        text: aliasText,
        matchRanges
      })
    })

    it('keeps a spaced custom display while highlighting the matched source word', () => {
      const alias = expectAliasFor(buildSimpleTokens('touch-translate', 'Touch Translate'), 'tran')

      expect(alias).toEqual({
        text: 'Touch Translate',
        matchRanges: [{ start: 6, end: 10 }]
      })
    })

    it('maps token words into a custom display with different separators', () => {
      const alias = expectAliasFor(
        buildSimpleTokens('touch-translate-panel', 'Touch / Translate / Panel'),
        'panel'
      )

      expect(alias).toEqual({
        text: 'Touch Translate Panel',
        matchRanges: [{ start: 16, end: 21 }]
      })
    })

    it('does not fabricate a highlight when a custom display cannot be mapped', () => {
      const alias = expectAliasFor(buildSimpleTokens('touch-translate', 'Translation Plugin'), 'tran')

      expect(alias).toEqual({
        text: 'Translation Plugin',
        matchRanges: []
      })
    })

    it('falls back to locating a hand-authored token inside its display', () => {
      const alias = expectAliasFor(
        [{ value: 'translate', source: 'keyword', display: 'touch-translate' }],
        'tran'
      )

      expect(alias).toEqual({
        text: 'Touch Translate',
        matchRanges: [{ start: 6, end: 10 }]
      })
    })

    it('does not mis-highlight the beginning of unrelated custom displays', () => {
      const alias = expectAliasFor(
        [{ value: 'translate', source: 'keyword', display: 'open language panel' }],
        'tran'
      )

      expect(alias).toEqual({
        text: 'Open Language Panel',
        matchRanges: []
      })
    })

    it('uses title ranges instead of alias ranges when the title itself matches', () => {
      const result = matchFeature({
        title: 'Touch Translate',
        searchTokens: buildSimpleTokens('touch-translate'),
        query: 'tran',
        enableFuzzy: false
      })

      expect(result.matched).toBe(true)
      expect(result.matchRanges).toEqual([{ start: 6, end: 10 }])
      expect(result.matchedAlias).toBeUndefined()
    })

    it('maps camel-case title initials back to title ranges', () => {
      const result = matchFeature({
        title: 'MacCleaner Pro',
        searchTokens: buildSearchTokens({ title: 'MacCleaner Pro' }),
        query: 'cp',
        enableFuzzy: false
      })

      expect(result.matched).toBe(true)
      expect(result.matchRanges).toEqual([
        { start: 3, end: 4 },
        { start: 11, end: 12 }
      ])
      expect(result.matchedAlias).toBeUndefined()
    })

    it('preserves buildSearchTokens field displays for external matches', () => {
      const tokens = buildSearchTokens({
        title: '翻译',
        fields: [{ text: 'touch-translate', source: 'id', display: 'Touch Translate' }]
      })
      const alias = expectAliasFor(tokens, 'tran')

      expect(alias).toEqual({
        text: 'Touch Translate',
        matchRanges: [{ start: 6, end: 10 }]
      })
    })
  })
})
