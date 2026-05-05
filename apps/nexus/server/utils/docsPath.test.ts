import { describe, expect, it } from 'vitest'
import { normalizeDocsPagePath, stripLocalePrefix } from './docsPath'

describe('docsPath', () => {
  it('normalizes localized markdown component links to the canonical doc path', () => {
    expect(normalizeDocsPagePath('/docs/dev/components/button.zh.md')).toBe('/docs/dev/components/button')
    expect(normalizeDocsPagePath('/zh/docs/dev/components/button.zh.md')).toBe('/docs/dev/components/button')
    expect(normalizeDocsPagePath('/docs/dev/components/button.en.mdc')).toBe('/docs/dev/components/button')
  })

  it('strips locale prefixes without changing regular paths', () => {
    expect(stripLocalePrefix('/zh/docs/dev/components/button')).toBe('/docs/dev/components/button')
    expect(stripLocalePrefix('/en/docs/dev/release/performance-persistence')).toBe('/docs/dev/release/performance-persistence')
    expect(stripLocalePrefix('/docs/dev/release/performance-persistence')).toBe('/docs/dev/release/performance-persistence')
  })
})
