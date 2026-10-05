import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  normalizeIntelligenceError,
  PROVIDER_DETAIL_MAX_CHARS,
  readProviderDetail,
  redactProviderDetail,
  toNormalizedIntelligenceError,
  toStreamFailure
} from './intelligence-error-normalizer'
import { createUsageLimitError } from './usage-ledger/usage-limits'

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

describe('the global usage limit (USAGE_LIMIT_REACHED)', () => {
  const originalTimeZone = process.env.TZ
  beforeEach(() => {
    process.env.TZ = 'Asia/Shanghai'
  })
  afterEach(() => {
    if (originalTimeZone === undefined) delete process.env.TZ
    else process.env.TZ = originalTimeZone
  })

  /** Local midnight that starts 2026-10-04 in Shanghai. */
  const resetsAt = Date.parse('2026-10-03T16:00:00.000Z')
  const refusal = () =>
    createUsageLimitError('text.chat', { key: 'requestsPerDay', used: 3, max: 3, resetsAt })

  it('is recognised by its explicit code, ahead of the quota rules', () => {
    expect(normalizeIntelligenceError(refusal(), { capabilityId: 'text.chat' })).toEqual({
      code: 'USAGE_LIMIT_REACHED',
      message: 'Usage limit reached: requestsPerDay; resets at 2026-10-03T16:00:00.000Z',
      reason:
        'The usage limit you set is reached (requestsPerDay: 3 / 3); it resets at 2026-10-04 00:00 local time (2026-10-03T16:00:00.000Z).',
      recovery:
        'Wait until the limit resets, or raise or clear it in Settings › Intelligence › Audit.',
      capabilityId: 'text.chat'
    })
  })

  it('is recognised by its message token alone, still ahead of the quota rules', () => {
    // A message that also trips the quota substring rule: the usage-limit token decides.
    const normalized = normalizeIntelligenceError(
      new Error(
        '[USAGE_LIMIT_REACHED:text.chat] Usage limit reached: tokensPerMonth; resets at 2026-10-31T16:00:00.000Z (quota exceeded)'
      )
    )
    expect(normalized.code).toBe('USAGE_LIMIT_REACHED')
    expect(normalized.reason).toBe(
      'The usage limit you set is reached; it resets at 2026-11-01 00:00 local time (2026-10-31T16:00:00.000Z).'
    )
    // Without the token the same sentence is the quota rule's, as before.
    expect(normalizeIntelligenceError(new Error('Usage limit reached (quota exceeded)')).code).toBe(
      'QUOTA_EXHAUSTED'
    )
  })

  it('never puts quota, credit or throttle words in what it reports', () => {
    const normalized = normalizeIntelligenceError(refusal())
    for (const text of [normalized.message, normalized.reason, normalized.recovery]) {
      expect(text.toLowerCase()).not.toMatch(/quota|credit|rate limit|too many requests/)
    }
  })

  it('wraps once for transport and keeps the structured limit on the wrapper', () => {
    const wrapped = toNormalizedIntelligenceError(refusal(), { capabilityId: 'text.chat' })

    expect(wrapped.message).toBe(
      '[USAGE_LIMIT_REACHED:text.chat] Usage limit reached: requestsPerDay; resets at 2026-10-03T16:00:00.000Z'
    )
    expect(wrapped.code).toBe('USAGE_LIMIT_REACHED')
    expect(wrapped).toMatchObject({
      usageLimit: { key: 'requestsPerDay', used: 3, max: 3, resetsAt }
    })
  })

  it('tells the app which limit and when it resets on a failed stream; a plugin gets the code', () => {
    const wrapped = toNormalizedIntelligenceError(refusal(), { capabilityId: 'text.chat' })

    const host = toStreamFailure('USAGE_LIMIT_REACHED', wrapped, { host: true })
    expect(host.message).toBe(
      '[USAGE_LIMIT_REACHED] Usage limit reached: requestsPerDay; resets at 2026-10-03T16:00:00.000Z'
    )
    expect(host.code).toBe('USAGE_LIMIT_REACHED')
    const plugin = toStreamFailure('USAGE_LIMIT_REACHED', wrapped, { host: false })
    expect(plugin.message).toBe('USAGE_LIMIT_REACHED')
    expect(plugin.code).toBe('USAGE_LIMIT_REACHED')
  })
})
