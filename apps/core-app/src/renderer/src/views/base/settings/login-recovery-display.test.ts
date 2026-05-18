import { describe, expect, it } from 'vitest'
import { resolveLoginManualHint } from './login-recovery-display'

const t = (key: string, params?: Record<string, unknown>) => {
  if (key === 'settingUser.loginDialogBrowserOpenFailedWithCode') {
    return `浏览器未打开，复制链接继续；短码：${params?.code}`
  }
  if (key === 'settingUser.loginDialogManualHintWithCode') {
    return `复制链接继续；短码：${params?.code}`
  }
  return key
}

describe('login recovery display', () => {
  it('keeps browser-open failure visible while manual recovery data exists', () => {
    expect(
      resolveLoginManualHint(
        {
          authorizeUrl: 'https://example.test/device',
          userCode: 'ABC123',
          browserOpenFailed: true
        },
        t
      )
    ).toBe('浏览器未打开，复制链接继续；短码：ABC123')
  })

  it('uses the normal manual hint when browser open was not reported as failed', () => {
    expect(
      resolveLoginManualHint(
        {
          authorizeUrl: 'https://example.test/device',
          userCode: 'ABC123'
        },
        t
      )
    ).toBe('复制链接继续；短码：ABC123')
  })

  it('does not show manual recovery copy before a login url exists', () => {
    expect(resolveLoginManualHint({ browserOpenFailed: true }, t)).toBe('')
  })
})
