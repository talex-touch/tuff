import { describe, expect, it } from 'vitest'
import { extractLocalizedDisplayName } from './darwin'
import {
  decodeLocalizedStringsBuffer,
  parseLocalizedStringsContent
} from './localized-strings-parser'

describe('localized-strings-parser', () => {
  it('simple-plist 成功解析时优先使用 CFBundleDisplayName', () => {
    const localizedName = extractLocalizedDisplayName({
      CFBundleDisplayName: '网易云音乐',
      CFBundleName: 'NeteaseMusic'
    })
    expect(localizedName).toBe('网易云音乐')
  })

  it('simple-plist 缺少显示名时回退到 CFBundleName', () => {
    const localizedName = extractLocalizedDisplayName({
      CFBundleName: '网易云音乐'
    })
    expect(localizedName).toBe('网易云音乐')
  })

  it('轻量解析器可解析 UTF-16 InfoPlist.strings', () => {
    const stringsContent =
      '/* Localized versions of Info.plist keys */\n' +
      '"CFBundleDisplayName" = "网易云音乐";\n' +
      '"CFBundleName" = "网易云音乐";\n'
    const buffer = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(stringsContent, 'utf16le')
    ])
    const parsed = parseLocalizedStringsContent(decodeLocalizedStringsBuffer(buffer))

    expect(parsed.CFBundleDisplayName).toBe('网易云音乐')
    expect(parsed.CFBundleName).toBe('网易云音乐')
  })

  it('异常内容不会抛错且返回空结果', () => {
    expect(() => parseLocalizedStringsContent('@@@not-a-valid-strings-format@@@')).not.toThrow()
    expect(parseLocalizedStringsContent('@@@not-a-valid-strings-format@@@')).toEqual({})
  })
})
