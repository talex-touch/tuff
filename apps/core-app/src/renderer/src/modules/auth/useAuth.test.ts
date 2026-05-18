import { describe, expect, it } from 'vitest'
import { classifyAuthError, resolveAuthErrorMessage } from './auth-error-message'

describe('useAuth error messages', () => {
  it('keeps browser login timeout distinct from generic network errors', () => {
    expect(resolveAuthErrorMessage(new Error('Browser login timeout'), 'AUTH_ERROR')).toBe(
      '登录超时，请重试'
    )
  })

  it('maps browser open failures to a recoverable login hint', () => {
    expect(resolveAuthErrorMessage(new Error('Failed to open browser'), 'AUTH_ERROR')).toBe(
      '无法打开浏览器，请手动打开登录页面或稍后重试'
    )
  })

  it('classifies common recoverable auth failures', () => {
    expect(classifyAuthError({ errorCode: 'DEVICE_NOT_AUTHORIZED' }, 'AUTH_ERROR')).toBe(
      'DEVICE_NOT_AUTHORIZED'
    )
    expect(classifyAuthError(new Error('Too many requests 429'), 'AUTH_ERROR')).toBe('RATE_LIMITED')
    expect(classifyAuthError(new Error('Forbidden 403'), 'AUTH_ERROR')).toBe('PERMISSION_DENIED')
    expect(classifyAuthError(new Error('Auth callback failed'), 'AUTH_ERROR')).toBe(
      'AUTH_CALLBACK_FAILED'
    )
    expect(classifyAuthError(new Error('Service unavailable 503'), 'AUTH_ERROR')).toBe(
      'SERVER_UNAVAILABLE'
    )
  })

  it('uses injected translations for settings login errors', () => {
    const t = (key: string, fallbackOrParams?: string | Record<string, unknown>) => {
      const messages: Record<string, string> = {
        'settingUser.authErrors.browserOpenFailed': 'Open the manual login link.',
        'settingUser.authErrors.sessionExpired': 'Sign in again.'
      }
      return messages[key] ?? (typeof fallbackOrParams === 'string' ? fallbackOrParams : key)
    }

    expect(resolveAuthErrorMessage(new Error('Failed to open browser'), 'AUTH_ERROR', t)).toBe(
      'Open the manual login link.'
    )
    expect(resolveAuthErrorMessage(new Error('401 unauthorized'), 'AUTH_ERROR', t)).toBe(
      'Sign in again.'
    )
  })
})
