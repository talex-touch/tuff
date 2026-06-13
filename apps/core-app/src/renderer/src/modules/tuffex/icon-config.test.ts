import { describe, expect, it } from 'vitest'
import { resolveCoreAppIconUrl } from './icon-config'

describe('core app tuffex icon config', () => {
  it('keeps api paths untouched', () => {
    expect(resolveCoreAppIconUrl('/api/plugin/icon.svg', 'url')).toBe('/api/plugin/icon.svg')
    expect(resolveCoreAppIconUrl('i-/api/plugin/icon.svg', 'url')).toBe('/api/plugin/icon.svg')
  })

  it('resolves local file urls through tfile protocol', () => {
    expect(resolveCoreAppIconUrl('/Users/tuff/icon.svg', 'url')).toBe(
      'tfile:///Users/tuff/icon.svg'
    )
    expect(resolveCoreAppIconUrl('/Users/tuff/icon.svg', 'file')).toBe(
      'tfile:///Users/tuff/icon.svg'
    )
  })

  it('keeps remote urls addressable', () => {
    expect(resolveCoreAppIconUrl('https://example.test/icon.svg', 'url')).toBe(
      'https://example.test/icon.svg'
    )
  })
})
