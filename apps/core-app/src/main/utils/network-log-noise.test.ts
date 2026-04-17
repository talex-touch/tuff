import { describe, expect, it } from 'vitest'
import { shouldDowngradeRemoteFailure, summarizeRemoteFailurePayload } from './network-log-noise'

describe('network-log-noise', () => {
  it('downgrades common remote backoff and challenge failures', () => {
    expect(shouldDowngradeRemoteFailure('NETWORK_HTTP_STATUS_403')).toBe(true)
    expect(shouldDowngradeRemoteFailure('NETWORK_HTTP_STATUS_429')).toBe(true)
    expect(
      shouldDowngradeRemoteFailure(
        'Telemetry upload failed',
        new Error('network guard cooldown'),
        'https://example.test/telemetry'
      )
    ).toBe(true)
    expect(
      shouldDowngradeRemoteFailure('Telemetry upload failed', 'Just a moment... Cloudflare')
    ).toBe(true)
    expect(shouldDowngradeRemoteFailure('NETWORK_HTTP_STATUS_500')).toBe(false)
  })

  it('summarizes cloudflare html payloads', () => {
    const html = '<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>'
    expect(summarizeRemoteFailurePayload(html)).toBe('cloudflare_challenge')
  })

  it('trims plain-text payloads to a safe preview', () => {
    const payload = 'x'.repeat(220)
    const summary = summarizeRemoteFailurePayload(payload, { maxLength: 32 })
    expect(summary).toBe(`${'x'.repeat(32)}...`)
  })

  it('marks generic html payloads without leaking the full body', () => {
    const html = '<html><body><h1>502 Bad Gateway</h1></body></html>'
    expect(summarizeRemoteFailurePayload(html)).toBe('html_response')
  })
})
