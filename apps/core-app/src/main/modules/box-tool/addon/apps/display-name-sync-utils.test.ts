import { describe, expect, it } from 'vitest'
import {
  isProbablyCorruptedDisplayName,
  resolveDisplayName,
  shouldUpdateDisplayName
} from './display-name-sync-utils'

describe('display-name-sync-utils', () => {
  it('updates when an English old value receives a better localized value', () => {
    expect(shouldUpdateDisplayName('NeteaseMusic', 'NetEase Cloud Music')).toBe(true)
  })

  it('does not update when values are equal after trimming', () => {
    expect(shouldUpdateDisplayName('NetEase Cloud Music', '  NetEase Cloud Music  ')).toBe(false)
  })

  it('does not update when the incoming value is empty', () => {
    expect(shouldUpdateDisplayName('NetEase Cloud Music', '  ')).toBe(false)
    expect(shouldUpdateDisplayName('NetEase Cloud Music', undefined)).toBe(false)
  })

  it('detects replacement-character display names from broken decoding', () => {
    expect(isProbablyCorruptedDisplayName('\u03A2\uFFFD\uFFFD')).toBe(true)
    expect(isProbablyCorruptedDisplayName('\u25A1\u25A1\u25A1')).toBe(true)
    expect(isProbablyCorruptedDisplayName('WeChat')).toBe(false)
  })

  it('repairs corrupted display names with a clean fallback name', () => {
    expect(resolveDisplayName('\u03A2\uFFFD\uFFFD', 'WeChat')).toBe('WeChat')
    expect(shouldUpdateDisplayName('\u03A2\uFFFD\uFFFD', 'WeChat')).toBe(true)
    expect(shouldUpdateDisplayName('WeChat', '\u03A2\uFFFD\uFFFD')).toBe(false)
  })
})
