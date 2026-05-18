import { describe, expect, it } from 'vitest'
import type { ComposerTranslation } from 'vue-i18n'
import { resolveIntelligenceErrorRecovery } from './ai-error-recovery'

const t = ((key: string, fallback?: string) => fallback || key) as ComposerTranslation

describe('ai-error-recovery', () => {
  it('turns common AI errors into recoverable user-facing hints', () => {
    expect(resolveIntelligenceErrorRecovery({ error: 'NEXUS_AUTH_REQUIRED' }, t)).toMatchObject({
      code: 'auth',
      title: 'Sign in required'
    })

    expect(
      resolveIntelligenceErrorRecovery({ error: 'PROVIDER_UNAVAILABLE: openai' }, t)
    ).toMatchObject({
      code: 'provider',
      title: 'AI provider unavailable'
    })

    expect(
      resolveIntelligenceErrorRecovery({ errorCode: 'quota_exceeded', error: 'quota exceeded' }, t)
    ).toMatchObject({
      code: 'quota',
      title: 'AI quota unavailable'
    })

    expect(
      resolveIntelligenceErrorRecovery({ error: 'Unsupported capability: vision.ocr' }, t)
    ).toMatchObject({
      code: 'model',
      title: 'Model does not support this request'
    })

    expect(resolveIntelligenceErrorRecovery({ error: 'AUTH_REF_MISSING' }, t)).toMatchObject({
      code: 'credentials',
      title: 'Provider credentials need attention'
    })

    expect(
      resolveIntelligenceErrorRecovery({ error: 'PERMISSION_REQUIRED: intelligence.basic' }, t)
    ).toMatchObject({
      code: 'permission',
      title: 'Permission required'
    })

    expect(resolveIntelligenceErrorRecovery({ error: 'fetch failed: ETIMEDOUT' }, t)).toMatchObject(
      {
        code: 'network',
        title: 'Network request failed'
      }
    )
  })

  it('keeps unknown AI errors visible', () => {
    expect(resolveIntelligenceErrorRecovery({ error: 'opaque failure' }, t)).toEqual({
      code: 'unknown',
      title: 'AI request failed',
      detail: 'opaque failure'
    })
  })
})
