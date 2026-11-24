import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import enUS from '~/modules/lang/en-US.json'
import zhCN from '~/modules/lang/zh-CN.json'
import { describeFailure, isTimeoutFailureMessage } from './failure-text'

function translator(locale: 'zh-CN' | 'en-US') {
  const i18n = createI18n({
    legacy: false,
    locale,
    messages: { 'zh-CN': zhCN, 'en-US': enUS }
  })
  return (key: string, params?: Record<string, unknown>) =>
    params ? i18n.global.t(key, params) : i18n.global.t(key)
}

describe('failure-text', () => {
  it('localizes NETWORK_TIMEOUT with and without durations in both zh-CN and en-US', () => {
    const tZh = translator('zh-CN')
    const tEn = translator('en-US')

    expect(describeFailure('NETWORK_TIMEOUT after 120000ms', tZh, 'fallback')).toBe(
      '请求在等待 120 秒后超时。'
    )
    expect(describeFailure('NETWORK_TIMEOUT after 120000ms', tEn, 'fallback')).toBe(
      'The request timed out after 120s.'
    )
    expect(describeFailure('NETWORK_TIMEOUT after 1500ms', tZh, 'fallback')).toBe(
      '请求在等待 1.5 秒后超时。'
    )
    expect(describeFailure('NETWORK_TIMEOUT after 500ms', tZh, 'fallback')).toBe(
      '请求超时，请重试。'
    )
    expect(describeFailure('NETWORK_TIMEOUT', tEn, 'fallback')).toBe(
      'The request timed out. Try again.'
    )
    expect(
      describeFailure(
        '[TuffTransport] Failed to send "ai:chat": Channel request "ai:chat" timed out after 30000ms',
        tZh,
        'fallback'
      )
    ).toBe('请求在等待 30 秒后超时。')
  })

  it('localizes network cooldown, status, abort, transport, empty stream, and oversized errors', () => {
    const tZh = translator('zh-CN')
    const tEn = translator('en-US')

    expect(describeFailure('NETWORK_COOLDOWN_ACTIVE:5', tZh, 'fallback')).toBe(
      '刚才的请求失败了，请 5 秒后再试。'
    )
    expect(describeFailure('NETWORK_COOLDOWN_ACTIVE:5', tEn, 'fallback')).toBe(
      'The last request failed moments ago. Try again in 5s.'
    )
    expect(describeFailure('NETWORK_COOLDOWN_ACTIVE', tZh, 'fallback')).toBe(
      '刚才的请求失败了，请过几秒再试。'
    )
    expect(describeFailure('NETWORK_HTTP_STATUS_502', tZh, 'fallback')).toBe(
      '服务器返回了错误（HTTP 502）。'
    )
    expect(describeFailure('NETWORK_ABORTED', tEn, 'fallback')).toBe(
      'The network request was aborted.'
    )
    expect(describeFailure('NETWORK_TRANSPORT_FAILED', tZh, 'fallback')).toBe(
      '网络连接中断或无法连接到服务器，请检查网络后重试。'
    )
    expect(describeFailure('NETWORK_EMPTY_STREAM_BODY', tZh, 'fallback')).toBe(
      '服务器返回了空的响应流，请重试。'
    )
    expect(describeFailure('NETWORK_RESPONSE_TOO_LARGE', tEn, 'fallback')).toBe(
      'The server response exceeded the size limit.'
    )
  })

  it('preserves provider prose verbatim and detects timeout markers accurately', () => {
    const tEn = translator('en-US')
    const providerError = 'The routed provider timed out before producing a response.'

    expect(describeFailure(providerError, tEn, 'fallback')).toBe(providerError)
    expect(isTimeoutFailureMessage('NETWORK_TIMEOUT after 120000ms')).toBe(true)
    expect(isTimeoutFailureMessage('net::ERR_CONNECTION_TIMED_OUT')).toBe(true)
    expect(isTimeoutFailureMessage('NETWORK_HTTP_STATUS_502')).toBe(false)
    expect(isTimeoutFailureMessage('')).toBe(false)
  })
})
