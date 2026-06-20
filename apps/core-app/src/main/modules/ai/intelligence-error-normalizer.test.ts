import { describe, expect, it } from 'vitest'
import {
  normalizeIntelligenceError,
  toNormalizedIntelligenceError
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

  it('wraps errors with a stable prefix for safe API transport', () => {
    const error = toNormalizedIntelligenceError(new Error('model does not support images'), {
      capabilityId: 'vision.ocr'
    })

    expect(error.message).toContain('[MODEL_UNSUPPORTED:vision.ocr]')
    expect(error.code).toBe('MODEL_UNSUPPORTED')
    expect(error.recovery).toContain('Switch to a model')
  })
})
