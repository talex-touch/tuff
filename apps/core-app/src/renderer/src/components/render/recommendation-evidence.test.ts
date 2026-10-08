import type { ComposerTranslation } from 'vue-i18n'
import type { RecommendationEvidence } from '@talex-touch/utils'
import { describe, expect, it } from 'vitest'
import {
  formatRecommendationEvidence,
  formatRecommendationEvidenceLabel
} from './recommendation-evidence'

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

  it('does not fake a reason: a source with no supporting fact says nothing', () => {
    // R9: the reason must be the fact that explains THIS source. A 'time-based' item with no hour
    // peak must not borrow the open-count, and 'recent' must not borrow a legacy count either.
    expect(formatRecommendationEvidence('time-based', { executeCount: 5 }, t, NOW)).toBe('')
    expect(formatRecommendationEvidence('recent', { executeCount: 5 }, t, NOW)).toBe('')
    expect(formatRecommendationEvidence('newly-installed', { executeCount: 5 }, t, NOW)).toBe('')
  })

  it('says nothing for a source whose own fact is absent, even when another is present', () => {
    // peakHourRange is present but irrelevant to 'frequent'; a count exists but is irrelevant to
    // 'time-based'. Neither may stand in for the missing preferred fact.
    expect(
      formatRecommendationEvidence(
        'frequent',
        { peakHourRange: { startHour: 9, endHour: 11 } },
        t,
        NOW
      )
    ).toBe('')
    expect(formatRecommendationEvidence('time-based', { lastExecutedAt: NOW - HOUR }, t, NOW)).toBe(
      ''
    )
  })

  it('still justifies a source with no dedicated fact from whatever is truly known', () => {
    // 'cold-start'/'trending' have no dedicated preference, so a real fact is still honest.
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

describe('contextual recommendation evidence', () => {
  const sourceApp = (
    executeCount: number,
    activeDays: number
  ): NonNullable<RecommendationEvidence['sourceApp']> => ({
    bundleId: 'com.example.editor',
    name: 'Editor',
    executeCount,
    activeDays,
    totalExecutions: 20,
    baselineExecuteCount: 10,
    baselineTotalExecutions: 100
  })

  it.each([
    { name: 'three uses over two days', count: 3, days: 2, fact: 'sourceAppUsed' },
    { name: 'five uses over two days', count: 5, days: 2, fact: 'sourceAppUsed' },
    { name: 'five uses over three days', count: 5, days: 3, fact: 'sourceAppHabit' }
  ])('distinguishes a contextual use from a habit: $name', ({ count, days, fact }) => {
    const evidence = { sourceApp: sourceApp(count, days) }
    const description = formatRecommendationEvidence('app-context', evidence, t, NOW)
    const label = formatRecommendationEvidenceLabel('app-context', evidence, t, NOW)

    expect(description).toContain(`corebox.evidence.${fact}(`)
    expect(description).toContain('app=Editor')
    expect(label).toContain(`corebox.evidence.label.${fact}(`)
    expect(label).toContain('app=Editor')
    if (fact === 'sourceAppUsed') expect(description).toContain(`count=${count}`)
  })

  it.each([NaN, Infinity, 2.5, 6])('does not call invalid active days %s a habit', (days) => {
    const evidence = { sourceApp: sourceApp(5, days) }

    expect(formatRecommendationEvidence('app-context', evidence, t, NOW)).toContain(
      'corebox.evidence.sourceAppUsed('
    )
    expect(formatRecommendationEvidenceLabel('app-context', evidence, t, NOW)).toContain(
      'corebox.evidence.label.sourceAppUsed('
    )
  })

  it.each([0, -1, NaN, Infinity, 1.5])(
    'says nothing for an invalid source execution count %s',
    (count) => {
      const evidence = { sourceApp: sourceApp(count, 3) }

      expect(formatRecommendationEvidence('app-context', evidence, t, NOW)).toBe('')
      expect(formatRecommendationEvidenceLabel('app-context', evidence, t, NOW)).toBe('')
    }
  )

  it('never joins a marginal peak range onto a source-app claim', () => {
    const evidence = {
      sourceApp: sourceApp(5, 3),
      peakHourRange: { startHour: 8, endHour: 10 }
    }

    expect(formatRecommendationEvidence('app-context', evidence, t, NOW)).toContain(
      'corebox.evidence.sourceAppHabit('
    )
    expect(formatRecommendationEvidenceLabel('app-context', evidence, t, NOW)).toContain(
      'corebox.evidence.label.sourceAppHabit('
    )
  })

  it.each([
    { name: 'a proved joint habit', count: 5, days: 3, start: 8, end: 10, fact: 'sourceAppTime' },
    {
      name: 'too few joint executions',
      count: 4,
      days: 3,
      start: 8,
      end: 10,
      fact: 'sourceAppHabit'
    },
    {
      name: 'joint uses on too few dates',
      count: 5,
      days: 2,
      start: 8,
      end: 10,
      fact: 'sourceAppHabit'
    },
    {
      name: 'more joint executions than source executions',
      count: 11,
      days: 3,
      start: 8,
      end: 10,
      fact: 'sourceAppHabit'
    },
    { name: 'invalid joint days', count: 5, days: NaN, start: 8, end: 10, fact: 'sourceAppHabit' },
    { name: 'invalid hour', count: 5, days: 3, start: -1, end: 10, fact: 'sourceAppHabit' },
    {
      name: 'midnight-wrapping joint window',
      count: 5,
      days: 3,
      start: 23,
      end: 1,
      fact: 'sourceAppTime'
    }
  ])('uses only real joint evidence: $name', ({ count, days, start, end, fact }) => {
    const evidence = {
      sourceApp: {
        ...sourceApp(10, 4),
        timeWindow: { startHour: start, endHour: end, executeCount: count, activeDays: days }
      }
    }
    const description = formatRecommendationEvidence('app-context', evidence, t, NOW)
    const label = formatRecommendationEvidenceLabel('app-context', evidence, t, NOW)

    expect(description).toContain(`corebox.evidence.${fact}(`)
    expect(label).toContain(`corebox.evidence.label.${fact}(`)
    if (fact === 'sourceAppTime') {
      expect(description).toContain(`start=${String(start).padStart(2, '0')}`)
      expect(description).toContain(`end=${String(end).padStart(2, '0')}`)
    }
  })

  it('keeps pins labelled as pins and never steals dedicated frequent/recent labels', () => {
    const evidence = { sourceApp: sourceApp(10, 4) }

    expect(formatRecommendationEvidenceLabel('pinned', evidence, t, NOW)).toBe('')
    expect(formatRecommendationEvidenceLabel('frequent', evidence, t, NOW)).toBe('')
    expect(formatRecommendationEvidenceLabel('recent', evidence, t, NOW)).toBe('')
    expect(formatRecommendationEvidenceLabel('cold-start', evidence, t, NOW)).toContain(
      'corebox.evidence.label.sourceAppHabit('
    )
  })

  it.each([
    { name: 'inclusive lower edge', offset: -HOUR, valid: true },
    { name: 'inclusive upper edge', offset: HOUR, valid: true },
    { name: 'one millisecond too early', offset: -HOUR - 1, valid: false },
    { name: 'one millisecond too late', offset: HOUR + 1, valid: false },
    { name: 'two days ago', offset: -DAY, valid: false },
    { name: 'today', offset: DAY, valid: false },
    { name: 'invalid timestamp', offset: NaN, valid: false }
  ])('prints yesterday only for its actual local window: $name', ({ offset, valid }) => {
    const now = new Date(2026, 9, 6, 9, 30).getTime()
    const anchor = new Date(now)
    anchor.setDate(anchor.getDate() - 1)
    const timestamp = anchor.getTime() + offset
    const evidence = { yesterday: { lastExecutedAt: timestamp, executeCount: 1 } }
    const description = formatRecommendationEvidence('yesterday', evidence, t, now)
    const label = formatRecommendationEvidenceLabel('yesterday', evidence, t, now)

    if (valid) {
      const executed = new Date(timestamp)
      const time = `${String(executed.getHours()).padStart(2, '0')}:${String(executed.getMinutes()).padStart(2, '0')}`
      expect(description).toBe(`corebox.evidence.yesterday(time=${time})`)
      expect(label).toBe(`corebox.evidence.label.yesterday(time=${time})`)
    } else {
      expect(description).toBe('')
      expect(label).toBe('')
    }
  })
})
