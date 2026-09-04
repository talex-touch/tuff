import type { RecommendationEvidence, RecommendationSource } from '@talex-touch/utils'
import type { ComposerTranslation } from 'vue-i18n'

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const WEEK_MS = DAY_MS * 7
const MONTH_MS = DAY_MS * 30

/** Anything more recent than this reads as "just now" rather than "0h ago". */
const JUST_NOW_MS = HOUR_MS

/**
 * Coarse age label ("3h", "2d"). Compact units are deliberate: they read the
 * same at any count, which keeps the strings free of plural forms — this
 * codebase uses `|` as a literal separator in messages, so vue-i18n
 * pluralization is not available.
 */
function formatAge(ageMs: number, t: ComposerTranslation): string {
  if (ageMs >= MONTH_MS) {
    return t('corebox.evidence.age.months', { count: Math.floor(ageMs / MONTH_MS) })
  }
  if (ageMs >= WEEK_MS) {
    return t('corebox.evidence.age.weeks', { count: Math.floor(ageMs / WEEK_MS) })
  }
  if (ageMs >= DAY_MS) {
    return t('corebox.evidence.age.days', { count: Math.floor(ageMs / DAY_MS) })
  }
  return t('corebox.evidence.age.hours', { count: Math.max(1, Math.floor(ageMs / HOUR_MS)) })
}

const padHour = (hour: number): string => String(hour).padStart(2, '0')

function formatExecuteCount(
  evidence: RecommendationEvidence,
  t: ComposerTranslation
): string | null {
  const { executeCount } = evidence
  if (typeof executeCount !== 'number' || executeCount <= 0) return null
  return t('corebox.evidence.opened', { count: executeCount })
}

function formatPeakHours(evidence: RecommendationEvidence, t: ComposerTranslation): string | null {
  const range = evidence.peakHourRange
  if (!range) return null
  return t('corebox.evidence.peakHours', {
    start: padHour(range.startHour),
    end: padHour(range.endHour)
  })
}

function formatLastUsed(
  evidence: RecommendationEvidence,
  t: ComposerTranslation,
  now: number
): string | null {
  const { lastExecutedAt } = evidence
  if (typeof lastExecutedAt !== 'number') return null

  const age = now - lastExecutedAt
  if (age < 0) return null
  if (age < JUST_NOW_MS) return t('corebox.evidence.justUsed')
  return t('corebox.evidence.lastUsed', { age: formatAge(age, t) })
}

function formatInstalled(
  evidence: RecommendationEvidence,
  t: ComposerTranslation,
  now: number
): string | null {
  const { installedAt } = evidence
  if (typeof installedAt !== 'number') return null

  const age = now - installedAt
  if (age < 0) return null
  if (age < JUST_NOW_MS) return t('corebox.evidence.justInstalled')
  return t('corebox.evidence.installed', { age: formatAge(age, t) })
}

type EvidenceFormatter = (
  evidence: RecommendationEvidence,
  t: ComposerTranslation,
  now: number
) => string | null

/**
 * Which fact best explains each source. An item in the "frequently used" group
 * should be justified by its count, one in "popular right now" by its hours —
 * showing the install date under "frequently used" would be true but beside the
 * point.
 */
const PREFERRED_BY_SOURCE: Partial<Record<RecommendationSource, EvidenceFormatter[]>> = {
  frequent: [formatExecuteCount],
  'time-based': [formatPeakHours],
  recent: [formatLastUsed],
  'newly-installed': [formatInstalled],
  trending: [formatExecuteCount]
}

/** Used when the source has no preferred fact, or its preferred fact is missing. */
const FALLBACK_ORDER: EvidenceFormatter[] = [
  formatExecuteCount,
  formatPeakHours,
  formatLastUsed,
  formatInstalled
]

/**
 * One short, checkable sentence for why an item is being recommended.
 *
 * Returns an empty string when the backing data does not exist. That is the
 * point of the whole feature: the empty state shows a reason only when there is
 * one, rather than padding every row with a plausible-sounding line.
 */
export function formatRecommendationEvidence(
  source: RecommendationSource | undefined,
  evidence: RecommendationEvidence | undefined,
  t: ComposerTranslation,
  now: number = Date.now()
): string {
  if (!evidence) return ''

  const formatters = source ? PREFERRED_BY_SOURCE[source] : undefined
  for (const format of [...(formatters ?? []), ...FALLBACK_ORDER]) {
    const text = format(evidence, t, now)
    if (text) return text
  }

  return ''
}
