import { describe, expect, it } from 'vitest'
import { shouldUpdateDisplayName } from './display-name-sync-utils'

describe('display-name-sync-utils', () => {
  it('英文旧值 + 中文新值时应更新', () => {
    expect(shouldUpdateDisplayName('NeteaseMusic', '网易云音乐')).toBe(true)
  })

  it('新旧值相同（含空白）时不更新', () => {
    expect(shouldUpdateDisplayName('网易云音乐', '  网易云音乐  ')).toBe(false)
  })

  it('新值为空时不更新', () => {
    expect(shouldUpdateDisplayName('网易云音乐', '  ')).toBe(false)
    expect(shouldUpdateDisplayName('网易云音乐', undefined)).toBe(false)
  })
})
