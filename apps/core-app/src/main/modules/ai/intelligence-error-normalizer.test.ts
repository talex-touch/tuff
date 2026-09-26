import { describe, expect, it } from 'vitest'
import {
  normalizeIntelligenceError,
  PROVIDER_DETAIL_MAX_CHARS,
  readProviderDetail,
  redactProviderDetail,
  toNormalizedIntelligenceError,
  toStreamFailure
} from './intelligence-error-normalizer'

describe('intelligence error normalization', () => {
  it('maps known stable failure modes to explicit codes and recovery text', () => {
    expect(
      normalizeIntelligenceError(new Error('NEXUS_AUTH_REQUIRED'), { capabilityId: 'text.chat' })
    ).toMatchObject({
      code: 'NEXUS_AUTH_REQUIRED',
      capabilityId: 'text.chat'
    })
    expect(
      normalizeIntelligenceError(new Error('[Intelligence] Quota exceeded: daily tokens'))
    ).toMatchObject({
      code: 'QUOTA_EXHAUSTED'
    })
    expect(
      normalizeIntelligenceError(new Error('[custom] Vision OCR capability is unsupported'), {
        capabilityId: 'vision.ocr'
      })
    ).toMatchObject({
      code: 'CAPABILITY_UNSUPPORTED',
      capabilityId: 'vision.ocr'
    })
    expect(
      normalizeIntelligenceError(
        Object.assign(new Error('NEXUS_STREAM_UNSUPPORTED'), {
          code: 'NEXUS_STREAM_UNSUPPORTED'
        }),
        {
          capabilityId: 'text.chat'
        }
      )
    ).toMatchObject({
      code: 'CAPABILITY_UNSUPPORTED',
      capabilityId: 'text.chat',
      recovery: 'Select a provider/model that advertises this capability.'
    })
    expect(normalizeIntelligenceError(new Error('fetch failed: network timeout'))).toMatchObject({
      code: 'NETWORK_FAILURE'
    })
    expect(normalizeIntelligenceError(new Error('No enabled providers available'))).toMatchObject({
      code: 'PROVIDER_UNAVAILABLE'
    })
    expect(
      normalizeIntelligenceError(
        Object.assign(new Error('MODEL_UNSUPPORTED'), { code: 'MODEL_UNSUPPORTED' })
      )
    ).toMatchObject({ code: 'MODEL_UNSUPPORTED' })
    expect(
      normalizeIntelligenceError(
        Object.assign(new Error('permission denied for text.chat'), {
          code: 'INTELLIGENCE_PERMISSION_DENIED'
        }),
        { capabilityId: 'text.chat' }
      )
    ).toMatchObject({
      code: 'PERMISSION_DENIED',
      capabilityId: 'text.chat',
      recovery: 'Grant the required permission or choose an allowed provider/capability.'
    })
  })

  it('preserves stable failure semantics for explicit quota-check unavailability', () => {
    expect(
      normalizeIntelligenceError(
        Object.assign(new Error('quota storage read failed'), {
          code: 'QUOTA_CHECK_UNAVAILABLE'
        }),
        { capabilityId: 'text.chat' }
      )
    ).toMatchObject({
      code: 'QUOTA_CHECK_UNAVAILABLE',
      reason: 'Quota verification is unavailable, so the request was blocked.',
      recovery: 'Retry after quota storage recovers or inspect Intelligence quota configuration.',
      capabilityId: 'text.chat'
    })
  })

  it('wraps errors with a stable prefix for safe API transport', () => {
    const error = toNormalizedIntelligenceError(new Error('model does not support images'), {
      capabilityId: 'vision.ocr'
    })

    expect(error.message).toContain('[MODEL_UNSUPPORTED:vision.ocr]')
    expect(error.code).toBe('MODEL_UNSUPPORTED')
    expect(error.recovery).toContain('Switch to a model')
  })
})

describe('what the provider said, on a failed stream', () => {
  // What the Codex CLI reported through a local proxy whose upstream rejected the key.
  const said = 'unexpected status 503 Service Unavailable: 所有供应商已熔断，无可用渠道'
  const cliError = Object.assign(
    new Error(`[CodexCliProvider] codex ended the run without an answer: ${said}`),
    { providerDetail: said }
  )

  it('reads it through the wrapping the SDK and the normalizer add', () => {
    const wrapped = toNormalizedIntelligenceError(cliError, { capabilityId: 'text.chat' })
    expect(readProviderDetail(wrapped)).toBe(said)
    expect(readProviderDetail(new Error('no detail here'))).toBeNull()
  })

  it('gives the app its words after the code, and a plugin the code alone', () => {
    const wrapped = toNormalizedIntelligenceError(cliError, { capabilityId: 'text.chat' })
    const host = toStreamFailure('UNKNOWN', wrapped, { host: true })
    expect(host.message).toBe(`[UNKNOWN] ${said}`)
    expect(host.code).toBe('UNKNOWN')
    const plugin = toStreamFailure('UNKNOWN', wrapped, { host: false })
    expect(plugin.message).toBe('UNKNOWN')
    expect(plugin.code).toBe('UNKNOWN')
    // No words of the provider's own: the code, as before.
    expect(toStreamFailure('UNKNOWN', new Error('internal'), { host: true }).message).toBe(
      'UNKNOWN'
    )
  })

  it('masks credential-shaped text and the home directory, and keeps to one short line', () => {
    const detail = redactProviderDetail(
      'auth failed\n  key sk-abcdef123456 Bearer abcdefghijklmnop api_key=hunter22 token: xyz123 ' +
        `blob ${'A'.repeat(40)} in /Users/me/.codex/config.toml`,
      '/Users/me'
    )
    expect(detail).toBe(
      'auth failed key sk-… Bearer … api_key=… token: … blob … in ~/.codex/config.toml'
    )
    const long = redactProviderDetail('错'.repeat(PROVIDER_DETAIL_MAX_CHARS + 50), '/Users/me')
    expect([...long]).toHaveLength(PROVIDER_DETAIL_MAX_CHARS)
    expect(long.endsWith('…')).toBe(true)
  })
})
