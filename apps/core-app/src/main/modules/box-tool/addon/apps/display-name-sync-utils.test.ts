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

  it('allows display name quality upgrades', () => {
    expect(
      shouldUpdateDisplayName('chatappdevtools', '聊天应用开发者工具', {
        currentQuality: 'filename',
        incomingQuality: 'localized'
      })
    ).toBe(true)
  })

  it('does not downgrade a localized display name to a lower quality fallback', () => {
    expect(
      shouldUpdateDisplayName('聊天应用开发者工具', 'chatappdevtools', {
        currentQuality: 'localized',
        incomingQuality: 'manifest'
      })
    ).toBe(false)
  })

  it('detects replacement-character display names from broken decoding', () => {
    expect(isProbablyCorruptedDisplayName('\u03A2\uFFFD\uFFFD')).toBe(true)
    expect(isProbablyCorruptedDisplayName('\u25A1\u25A1\u25A1')).toBe(true)
    expect(isProbablyCorruptedDisplayName('ChatApp')).toBe(false)
  })

  it('repairs corrupted display names with a clean fallback name', () => {
    expect(resolveDisplayName('\u03A2\uFFFD\uFFFD', 'ChatApp')).toBe('ChatApp')
    expect(shouldUpdateDisplayName('\u03A2\uFFFD\uFFFD', 'ChatApp')).toBe(true)
    expect(shouldUpdateDisplayName('ChatApp', '\u03A2\uFFFD\uFFFD')).toBe(false)
  })
})
