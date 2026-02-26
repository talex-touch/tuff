import { describe, expect, it } from 'vitest'
import { isSupportedLocaleCode, normalizeLocaleCode } from '../locale'

describe('locale utils', () => {
  it('normalizes english locale variants', () => {
    expect(normalizeLocaleCode('en')).toBe('en')
    expect(normalizeLocaleCode('en-US')).toBe('en')
    expect(normalizeLocaleCode('en_GB')).toBe('en')
  })

  it('normalizes chinese locale variants', () => {
    expect(normalizeLocaleCode('zh')).toBe('zh')
    expect(normalizeLocaleCode('zh-CN')).toBe('zh')
    expect(normalizeLocaleCode('zh-Hans')).toBe('zh')
  })

  it('returns null for empty or unsupported locales', () => {
    expect(normalizeLocaleCode('')).toBeNull()
    expect(normalizeLocaleCode('  ')).toBeNull()
    expect(normalizeLocaleCode('fr')).toBeNull()
    expect(normalizeLocaleCode(undefined)).toBeNull()
    expect(normalizeLocaleCode(null)).toBeNull()
  })

  it('checks supported locale code', () => {
    expect(isSupportedLocaleCode('en')).toBe(true)
    expect(isSupportedLocaleCode('zh')).toBe(true)
    expect(isSupportedLocaleCode('en-US')).toBe(false)
    expect(isSupportedLocaleCode('fr')).toBe(false)
    expect(isSupportedLocaleCode(null)).toBe(false)
  })
})
