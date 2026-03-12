import { describe, expect, it } from 'vitest'
import {
  isPilotLocalEmail,
  isPilotLocalUserId,
  normalizePilotLocalEmail,
  normalizePilotLocalNickname,
} from '../pilot-local-auth'

describe('pilot-local-auth helpers', () => {
  it('邮箱规范化与校验符合预期', () => {
    expect(normalizePilotLocalEmail('  Demo@Example.COM ')).toBe('demo@example.com')
    expect(isPilotLocalEmail('demo@example.com')).toBe(true)
    expect(isPilotLocalEmail('demo@localhost')).toBe(false)
    expect(isPilotLocalEmail('invalid-email')).toBe(false)
  })

  it('昵称默认回退到邮箱前缀', () => {
    expect(normalizePilotLocalNickname('', 'pilot_user@example.com')).toBe('pilot_user')
    expect(normalizePilotLocalNickname('  这是昵称  ', 'pilot_user@example.com')).toBe('这是昵称')
  })

  it('本地账号 userId 前缀识别', () => {
    expect(isPilotLocalUserId('pilot_local_abc123')).toBe(true)
    expect(isPilotLocalUserId('nexus_abc123')).toBe(false)
  })
})
