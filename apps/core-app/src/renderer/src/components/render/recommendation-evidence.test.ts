import type { ComposerTranslation } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import { formatRecommendationEvidence } from './recommendation-evidence'

/**
 * Renders `key(param=value, …)` so assertions read as "which fact was chosen,
 * with which numbers" without depending on the wording of either locale.
 */
const t = ((key: string, params?: Record<string, unknown>) => {
  if (!params || Object.keys(params).length === 0) return key
  const rendered = Object.entries(params)
    .map(([name, value]) => `${name}=${value}`)
    .join(',')
  return `${key}(${rendered})`
}) as unknown as ComposerTranslation

const NOW = Date.UTC(2026, 8, 4, 12, 0, 0)
const HOUR = 3_600_000
const DAY = 86_400_000

describe('formatRecommendationEvidence', () => {
  it('says nothing when there is no evidence at all', () => {
    expect(formatRecommendationEvidence('frequent', undefined, t, NOW)).toBe('')
    expect(formatRecommendationEvidence('frequent', {}, t, NOW)).toBe('')
  })

  it('justifies each source with the fact that explains it', () => {
    const evidence = {
      executeCount: 23,
      peakHourRange: { startHour: 9, endHour: 11 },
      lastExecutedAt: NOW - 3 * HOUR,
      installedAt: NOW - 2 * HOUR
    }

    expect(formatRecommendationEvidence('frequent', evidence, t, NOW)).toBe(
      'corebox.evidence.opened(count=23)'
    )
    expect(formatRecommendationEvidence('time-based', evidence, t, NOW)).toBe(
      'corebox.evidence.peakHours(start=09,end=11)'
    )
    expect(formatRecommendationEvidence('recent', evidence, t, NOW)).toBe(
      'corebox.evidence.lastUsed(age=corebox.evidence.age.hours(count=3))'
    )
    expect(formatRecommendationEvidence('newly-installed', evidence, t, NOW)).toBe(
      'corebox.evidence.installed(age=corebox.evidence.age.hours(count=2))'
    )
  })

  it('falls back to any available fact when the preferred one is missing', () => {
    // A 'time-based' item with no hour peak still has something true to say.
    expect(formatRecommendationEvidence('time-based', { executeCount: 5 }, t, NOW)).toBe(
      'corebox.evidence.opened(count=5)'
    )
  })

  it('uses the fallback order for sources with no preferred fact', () => {
    expect(formatRecommendationEvidence('cold-start', { installedAt: NOW - 5 * DAY }, t, NOW)).toBe(
      'corebox.evidence.installed(age=corebox.evidence.age.days(count=5))'
    )
  })

  it('treats a zero execute count as no evidence, not as "opened 0 times"', () => {
    expect(formatRecommendationEvidence('frequent', { executeCount: 0 }, t, NOW)).toBe('')
  })

  it('collapses very recent timestamps instead of reporting "0h ago"', () => {
    expect(formatRecommendationEvidence('recent', { lastExecutedAt: NOW - 60_000 }, t, NOW)).toBe(
      'corebox.evidence.justUsed'
    )
    expect(
      formatRecommendationEvidence('newly-installed', { installedAt: NOW - 60_000 }, t, NOW)
    ).toBe('corebox.evidence.justInstalled')
  })

  it('ignores timestamps in the future rather than printing a negative age', () => {
    expect(formatRecommendationEvidence('recent', { lastExecutedAt: NOW + DAY }, t, NOW)).toBe('')
  })

  it('scales the age unit with the gap', () => {
    const at = (ageMs: number) =>
      formatRecommendationEvidence('recent', { lastExecutedAt: NOW - ageMs }, t, NOW)

    expect(at(5 * HOUR)).toContain('age.hours(count=5)')
    expect(at(3 * DAY)).toContain('age.days(count=3)')
    expect(at(14 * DAY)).toContain('age.weeks(count=2)')
    expect(at(90 * DAY)).toContain('age.months(count=3)')
  })

  it('pads single-digit peak hours so the range stays aligned', () => {
    expect(
      formatRecommendationEvidence(
        'time-based',
        { peakHourRange: { startHour: 8, endHour: 10 } },
        t,
        NOW
      )
    ).toBe('corebox.evidence.peakHours(start=08,end=10)')
  })

  it('renders a peak range that wraps past midnight', () => {
    expect(
      formatRecommendationEvidence(
        'time-based',
        { peakHourRange: { startHour: 22, endHour: 0 } },
        t,
        NOW
      )
    ).toBe('corebox.evidence.peakHours(start=22,end=00)')
  })
})
