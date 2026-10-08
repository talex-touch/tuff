import { describe, expect, it } from 'vitest'
import type { ComposerTranslation } from 'vue-i18n'
import { createI18n } from 'vue-i18n'
import { formatResetTime } from '~/components/intelligence/audit/audit-format'
import enUS from '../lang/en-US.json'
import zhCN from '../lang/zh-CN.json'
import {
  formatUsageLimitResetTime,
  readUsageLimitResetsAt,
  resolveIntelligenceErrorRecovery
} from './ai-error-recovery'

const t = ((key: string, fallback?: string) => fallback || key) as ComposerTranslation

describe('ai-error-recovery', () => {
  it('turns common AI errors into recoverable user-facing hints', () => {
    expect(
      resolveIntelligenceErrorRecovery({ error: 'NEXUS_AUTH_REQUIRED' }, t, 'en-US')
    ).toMatchObject({
      code: 'auth',
      title: 'Sign in required'
    })

    expect(
      resolveIntelligenceErrorRecovery({ error: 'PROVIDER_UNAVAILABLE: openai' }, t, 'en-US')
    ).toMatchObject({
      code: 'provider',
      title: 'AI provider unavailable'
    })

    expect(
      resolveIntelligenceErrorRecovery({ error: 'Unsupported capability: vision.ocr' }, t, 'en-US')
    ).toMatchObject({
      code: 'model',
      title: 'Model does not support this request'
    })

    expect(
      resolveIntelligenceErrorRecovery({ error: 'AUTH_REF_MISSING' }, t, 'en-US')
    ).toMatchObject({
      code: 'credentials',
      title: 'Provider credentials need attention'
    })

    expect(
      resolveIntelligenceErrorRecovery(
        { error: 'PERMISSION_REQUIRED: intelligence.basic' },
        t,
        'en-US'
      )
    ).toMatchObject({
      code: 'permission',
      title: 'Permission required'
    })

    expect(
      resolveIntelligenceErrorRecovery({ error: 'fetch failed: ETIMEDOUT' }, t, 'en-US')
    ).toMatchObject({
      code: 'network',
      title: 'Network request failed'
    })
  })

  it('distinguishes unavailable quota verification from exhausted quota', () => {
    const quotaVerificationRecovery = {
      code: 'quota-verification',
      title: 'Quota verification unavailable',
      detail:
        'Retry later. If this continues, inspect Intelligence quota storage and configuration.'
    }

    expect(
      resolveIntelligenceErrorRecovery({ errorCode: 'QUOTA_CHECK_UNAVAILABLE' }, t, 'en-US')
    ).toEqual(quotaVerificationRecovery)

    expect(
      resolveIntelligenceErrorRecovery({ error: 'quota verification is unavailable' }, t, 'en-US')
    ).toEqual(quotaVerificationRecovery)

    expect(
      resolveIntelligenceErrorRecovery(
        { errorCode: 'quota_exceeded', error: 'quota exceeded' },
        t,
        'en-US'
      )
    ).toEqual({
      code: 'quota',
      title: 'AI quota unavailable',
      detail: 'Check your Nexus credits or team quota before retrying.'
    })
    // The canonical code keeps the Nexus-credits copy too: only USAGE_LIMIT_REACHED is the user's
    // own limit.
    expect(resolveIntelligenceErrorRecovery({ errorCode: 'QUOTA_EXHAUSTED' }, t, 'en-US')).toEqual({
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
          tNamed,
          'en-US'
        )
      ).toEqual({
        code: 'usage-limit',
        title: 'AI usage limit reached',
        detail: `intelligence.errorRecovery.usageLimitDetail ${JSON.stringify({
          time: formatUsageLimitResetTime(resetsAt, 'en-US')
        })}`,
        action: audit
      })
    })

    it('keeps the local copy, without a time, when only the code arrives (plugins)', () => {
      expect(
        resolveIntelligenceErrorRecovery(
          { errorCode: 'USAGE_LIMIT_REACHED', error: '已达到你设置的 AI 用量上限' },
          t,
          'en-US'
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
          t,
          'en-US'
        ).code
      ).toBe('usage-limit')
    })

    it('writes the reset time in the interface language, the audit page format', () => {
      const originalTimeZone = process.env.TZ
      process.env.TZ = 'Asia/Shanghai'
      try {
        const refused =
          'The usage limit you set is reached (requestsPerDay: 2 / 2); it resets at 2026-10-04 00:00 local time (2026-10-03T16:00:00.000Z).'
        const render = (locale: 'zh-CN' | 'en-US') => {
          const i18n = createI18n({
            legacy: false,
            locale,
            messages: { 'zh-CN': zhCN, 'en-US': enUS }
          })
          return resolveIntelligenceErrorRecovery(
            { errorCode: 'USAGE_LIMIT_REACHED', error: refused },
            i18n.global.t as unknown as ComposerTranslation,
            locale
          ).detail
        }
        expect(render('zh-CN')).toBe('已达到你在「审计」里设置的 AI 用量上限，10月4日 00:00 重置。')
        expect(render('en-US')).toBe(
          "You've reached the AI usage limit you set in Audit. It resets Oct 4, 00:00."
        )
        // The one format the audit page uses too, and no numeric month/day in the Chinese copy.
        expect(formatUsageLimitResetTime(resetsAt, 'zh-CN')).toBe(
          formatResetTime(resetsAt, 'zh-CN')
        )
        expect(render('zh-CN')).not.toMatch(/\d+\/\d+/)
      } finally {
        if (originalTimeZone === undefined) delete process.env.TZ
        else process.env.TZ = originalTimeZone
      }
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
        i18n.global.t as unknown as ComposerTranslation,
        'zh-CN'
      )
      const time = formatUsageLimitResetTime(Date.parse('2026-10-31T16:00:00.000Z'), 'zh-CN')

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
      // A failed call's reason: the local time first, the instant in parentheses.
      expect(
        readUsageLimitResetsAt(
          'The usage limit you set is reached (requestsPerDay: 2 / 2); it resets at 2026-10-04 00:00 local time (2026-10-03T16:00:00.000Z).'
        )
      ).toBe(resetsAt)
      expect(readUsageLimitResetsAt('USAGE_LIMIT_REACHED')).toBeNull()
      expect(readUsageLimitResetsAt('resets at tomorrow')).toBeNull()
      expect(readUsageLimitResetsAt('resets at 2026-10-04 00:00 local time')).toBeNull()
    })
  })

  it('keeps unknown AI errors visible', () => {
    expect(resolveIntelligenceErrorRecovery({ error: 'opaque failure' }, t, 'en-US')).toEqual({
      code: 'unknown',
      title: 'AI request failed',
      detail: 'opaque failure'
    })
  })
})
