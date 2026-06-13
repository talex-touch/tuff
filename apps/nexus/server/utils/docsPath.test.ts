import { describe, expect, it } from 'vitest'
import {
  isDocsPath,
  normalizeDocsPagePath,
  resolveDocsLocaleFromRoute,
  stripDocsLocalePrefix,
  toLocalizedDocsPath,
} from './docsPath'

describe('docsPath', () => {
  it('normalizes localized markdown component links to the canonical doc path', () => {
    expect(normalizeDocsPagePath('/docs/dev/components/button.zh.md')).toBe('/docs/dev/components/button')
    expect(normalizeDocsPagePath('/zh/docs/dev/components/button.zh.md')).toBe('/docs/dev/components/button')
    expect(normalizeDocsPagePath('/docs/dev/components/button.en.mdc')).toBe('/docs/dev/components/button')
    expect(normalizeDocsPagePath('/en/docs/dev/api/box.en.mdc')).toBe('/docs/dev/api/box')
    expect(normalizeDocsPagePath('dev/api/box.zh.mdc')).toBe('/docs/dev/api/box')
  })

  it('strips locale prefixes without changing regular paths', () => {
    expect(stripDocsLocalePrefix('/zh/docs/dev/components/button')).toBe('/docs/dev/components/button')
    expect(stripDocsLocalePrefix('/en/docs/dev/release/performance-persistence')).toBe('/docs/dev/release/performance-persistence')
    expect(stripDocsLocalePrefix('/docs/dev/release/performance-persistence')).toBe('/docs/dev/release/performance-persistence')
  })

  it('resolves docs locale from localized routes', () => {
    expect(resolveDocsLocaleFromRoute('/zh/docs/dev/components/button')).toBe('zh')
    expect(resolveDocsLocaleFromRoute('/en/docs/dev/components/button')).toBe('en')
    expect(resolveDocsLocaleFromRoute('/docs/dev/components/button')).toBe('en')
  })

  it('builds localized docs paths from canonical docs paths', () => {
    expect(toLocalizedDocsPath('/docs/dev/api/box', 'zh')).toBe('/zh/docs/dev/api/box')
    expect(toLocalizedDocsPath('/en/docs/dev/api/box.en.mdc', 'en')).toBe('/en/docs/dev/api/box')
    expect(toLocalizedDocsPath('/pricing', 'zh')).toBe('/pricing')
    expect(toLocalizedDocsPath('/en/pricing', 'zh')).toBe('/en/pricing')
  })

  it('does not classify docs-like non-doc paths as docs routes', () => {
    expect(isDocsPath('/docs')).toBe(true)
    expect(isDocsPath('/zh/docs/dev/api/box')).toBe(true)
    expect(isDocsPath('/docsfoo')).toBe(false)
    expect(isDocsPath('/en/docsfoo')).toBe(false)
  })
})
