import { describe, expect, it } from 'vitest'
import {
  getFallbackChain,
  normalizeLocale,
  resolveLocalizedList,
  resolveLocalizedText,
  toAppLocale,
  toShortLocale,
} from '../i18n'

describe('i18n locale core', () => {
  it('normalizes app and short locale aliases', () => {
    expect(normalizeLocale('zh')).toBe('zh-CN')
    expect(normalizeLocale('zh_Hans')).toBe('zh-CN')
    expect(normalizeLocale('en-GB')).toBe('en-US')
    expect(normalizeLocale('fr-FR')).toBeNull()
  })

  it('converts between app and short locales', () => {
    expect(toShortLocale('zh-CN')).toBe('zh')
    expect(toShortLocale('en-US')).toBe('en')
    expect(toAppLocale('zh')).toBe('zh-CN')
    expect(toAppLocale('en-US')).toBe('en-US')
  })

  it('keeps fallback chain explicit and deterministic', () => {
    expect(getFallbackChain('zh-CN')).toEqual(['zh-CN', 'en-US'])
    expect(getFallbackChain('en-US')).toEqual(['en-US'])
  })
})

describe('localized value resolver', () => {
  it('resolves localized text with locale fallback and default fallback', () => {
    const text = {
      default: 'Unit Converter',
      locales: {
        'zh-CN': '单位换算',
      },
    }

    expect(resolveLocalizedText(text, 'zh-CN')).toBe('单位换算')
    expect(resolveLocalizedText(text, 'en-US')).toBe('Unit Converter')
    expect(resolveLocalizedText('Plain', 'zh-CN')).toBe('Plain')
  })

  it('resolves localized lists without mutating the manifest value', () => {
    const list = {
      default: ['unit', 'convert'],
      locales: {
        'zh-CN': ['单位', '换算'],
      },
    }

    const resolved = resolveLocalizedList(list, 'zh-CN')
    resolved.push('mutated')

    expect(resolved).toEqual(['单位', '换算', 'mutated'])
    expect(resolveLocalizedList(list, 'zh-CN')).toEqual(['单位', '换算'])
    expect(resolveLocalizedList(['plain'], 'en-US')).toEqual(['plain'])
  })
})
