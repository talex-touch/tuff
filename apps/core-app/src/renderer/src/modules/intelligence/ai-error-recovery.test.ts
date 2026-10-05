import { describe, expect, it } from 'vitest'
import type { ComposerTranslation } from 'vue-i18n'
import { createI18n } from 'vue-i18n'
import zhCN from '../lang/zh-CN.json'
import {
  formatUsageLimitResetTime,
  readUsageLimitResetsAt,
  resolveIntelligenceErrorRecovery
} from './ai-error-recovery'

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

  it('distinguishes unavailable quota verification from exhausted quota', () => {
    const quotaVerificationRecovery = {
      code: 'quota-verification',
      title: 'Quota verification unavailable',
      detail:
        'Retry later. If this continues, inspect Intelligence quota storage and configuration.'
    }

    expect(resolveIntelligenceErrorRecovery({ errorCode: 'QUOTA_CHECK_UNAVAILABLE' }, t)).toEqual(
      quotaVerificationRecovery
    )

    expect(
      resolveIntelligenceErrorRecovery({ error: 'quota verification is unavailable' }, t)
    ).toEqual(quotaVerificationRecovery)

    expect(
      resolveIntelligenceErrorRecovery({ errorCode: 'quota_exceeded', error: 'quota exceeded' }, t)
    ).toEqual({
      code: 'quota',
      title: 'AI quota unavailable',
      detail: 'Check your Nexus credits or team quota before retrying.'
    })
    // The canonical code keeps the Nexus-credits copy too: only USAGE_LIMIT_REACHED is the user's
    // own limit.
    expect(resolveIntelligenceErrorRecovery({ errorCode: 'QUOTA_EXHAUSTED' }, t)).toEqual({
      code: 'quota',
      title: 'AI quota unavailable',
      detail: 'Check your Nexus credits or team quota before retrying.'
    })
  })

  describe('the global usage limit the user set in Audit', () => {
    /** Echoes interpolation so the reset time is visible in the assertion. */
    const tNamed = ((key: string, second?: unknown) =>
      typeof second === 'string'
        ? second
        : second && typeof second === 'object'
          ? `${key} ${JSON.stringify(second)}`
          : key) as ComposerTranslation
    const resetsAt = Date.parse('2026-10-03T16:00:00.000Z')
    const audit = { path: '/setting/intelligence/audit', label: 'Open Audit' }

    it('names the reset time from main and offers the Audit page', () => {
      expect(
        resolveIntelligenceErrorRecovery(
          {
            error:
              '[USAGE_LIMIT_REACHED:text.chat] Usage limit reached: requestsPerDay; resets at 2026-10-03T16:00:00.000Z'
          },
          tNamed
        )
      ).toEqual({
        code: 'usage-limit',
        title: 'AI usage limit reached',
        detail: `intelligence.errorRecovery.usageLimitDetail ${JSON.stringify({
          time: formatUsageLimitResetTime(resetsAt)
        })}`,
        action: audit
      })
    })

    it('keeps the local copy, without a time, when only the code arrives (plugins)', () => {
      expect(
        resolveIntelligenceErrorRecovery(
          { errorCode: 'USAGE_LIMIT_REACHED', error: '已达到你设置的 AI 用量上限' },
          t
        )
      ).toEqual({
        code: 'usage-limit',
        title: 'AI usage limit reached',
        detail: "You've reached the AI usage limit you set in Audit, where you can change it.",
        action: audit
      })
    })

    it('wins over the quota branches even when the text mentions a quota', () => {
      expect(
        resolveIntelligenceErrorRecovery(
          { errorCode: 'USAGE_LIMIT_REACHED', error: 'quota exceeded; credit low' },
          t
        ).code
      ).toBe('usage-limit')
    })

    it('renders through the real locale messages', () => {
      const i18n = createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': zhCN }
      })
      const recovery = resolveIntelligenceErrorRecovery(
        {
          errorCode: 'USAGE_LIMIT_REACHED',
          error: 'Usage limit reached: costUsdPerMonth; resets at 2026-10-31T16:00:00.000Z'
        },
        // The typed translator is keyed to these messages; the classifier takes any translator.
        i18n.global.t as unknown as ComposerTranslation
      )
      const time = formatUsageLimitResetTime(Date.parse('2026-10-31T16:00:00.000Z'))

      expect(recovery).toEqual({
        code: 'usage-limit',
        title: '已达到 AI 用量上限',
        detail: `已达到你在「审计」里设置的 AI 用量上限，${time} 重置。`,
        action: { path: '/setting/intelligence/audit', label: '打开审计' }
      })
      expect(recovery.detail.toUpperCase()).not.toMatch(/QUOTA|CREDIT|NEXUS/)
    })

    it('reads the reset time only from a well-formed ISO instant', () => {
      expect(readUsageLimitResetsAt('… resets at 2026-10-03T16:00:00.000Z')).toBe(resetsAt)
      expect(readUsageLimitResetsAt('USAGE_LIMIT_REACHED')).toBeNull()
      expect(readUsageLimitResetsAt('resets at tomorrow')).toBeNull()
    })
  })

  it('keeps unknown AI errors visible', () => {
    expect(resolveIntelligenceErrorRecovery({ error: 'opaque failure' }, t)).toEqual({
      code: 'unknown',
      title: 'AI request failed',
      detail: 'opaque failure'
    })
  })
})
