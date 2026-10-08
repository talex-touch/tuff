import type { RecommendationEvidence, RecommendationSource } from '@talex-touch/utils'
import {
  FREQUENT_MIN_ACTIVE_DAYS_30,
  FREQUENT_MIN_EXECUTES_30,
  resolveLastUsedAt
} from '@talex-touch/utils'
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
  // An accepted execution or a foreground stay (an app reached by ⌘Tab or the Dock counts),
  // whichever is later; the main-process scorer dates "last used" with the same function.
  const lastUsedAt = resolveLastUsedAt(evidence.lastExecutedAt, evidence.lastActiveAt, now)
  if (lastUsedAt === null) return null

  const age = now - lastUsedAt
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

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0

const isHour = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23

/**
 * Same gate as the strict frequent cohort: five uses in one afternoon are a session, not a habit.
 * Below it the honest claim is only "used", never "often".
 */
const meetsHabitGate = (executeCount: number, activeDays: unknown): boolean =>
  executeCount >= FREQUENT_MIN_EXECUTES_30 &&
  isCount(activeDays) &&
  activeDays <= executeCount &&
  activeDays >= FREQUENT_MIN_ACTIVE_DAYS_30

type SourceAppFact =
  | { kind: 'time'; app: string; start: string; end: string }
  | { kind: 'habit'; app: string }
  | { kind: 'used'; app: string; count: number }

/**
 * What the source-app evidence can honestly claim. The combined app + hours claim needs the nested
 * `timeWindow`, which counts executions that were both from this app and in those hours; pairing
 * the app count with the item's own `peakHourRange` would join two marginals that may never have
 * happened together, so that field is deliberately not read here.
 */
function resolveSourceAppFact(evidence: RecommendationEvidence): SourceAppFact | null {
  const sourceApp = evidence.sourceApp
  if (!sourceApp || !isCount(sourceApp.executeCount)) return null
  const app = sourceApp.name?.trim() || sourceApp.bundleId?.trim()
  if (!app) return null

  const joint = sourceApp.timeWindow
  if (
    joint &&
    isHour(joint.startHour) &&
    isHour(joint.endHour) &&
    isCount(joint.executeCount) &&
    joint.executeCount <= sourceApp.executeCount &&
    meetsHabitGate(joint.executeCount, joint.activeDays)
  ) {
    return { kind: 'time', app, start: padHour(joint.startHour), end: padHour(joint.endHour) }
  }
  if (meetsHabitGate(sourceApp.executeCount, sourceApp.activeDays)) return { kind: 'habit', app }
  return { kind: 'used', app, count: sourceApp.executeCount }
}

/**
 * Local clock time of the yesterday execution, or null unless it really is yesterday: on the
 * previous local calendar date and within one hour (inclusive) of this moment's clock time a
 * calendar day ago. `setDate` keeps the local clock across a DST change, which a fixed 24h does not.
 */
function resolveYesterdayTime(evidence: RecommendationEvidence, now: number): string | null {
  const yesterday = evidence.yesterday
  if (!yesterday || !isCount(yesterday.executeCount)) return null
  const { lastExecutedAt } = yesterday
  if (!Number.isFinite(lastExecutedAt) || !Number.isFinite(now) || lastExecutedAt >= now) {
    return null
  }

  const anchor = new Date(now)
  anchor.setDate(anchor.getDate() - 1)
  const executed = new Date(lastExecutedAt)
  const sameDate =
    executed.getFullYear() === anchor.getFullYear() &&
    executed.getMonth() === anchor.getMonth() &&
    executed.getDate() === anchor.getDate()
  if (!sameDate || Math.abs(lastExecutedAt - anchor.getTime()) > HOUR_MS) return null

  return `${padHour(executed.getHours())}:${String(executed.getMinutes()).padStart(2, '0')}`
}

function formatSourceApp(evidence: RecommendationEvidence, t: ComposerTranslation): string | null {
  const fact = resolveSourceAppFact(evidence)
  if (!fact) return null
  if (fact.kind === 'time') return t('corebox.evidence.sourceAppTime', fact)
  if (fact.kind === 'habit') return t('corebox.evidence.sourceAppHabit', fact)
  return t('corebox.evidence.sourceAppUsed', fact)
}

function formatYesterday(
  evidence: RecommendationEvidence,
  t: ComposerTranslation,
  now: number
): string | null {
  const time = resolveYesterdayTime(evidence, now)
  return time ? t('corebox.evidence.yesterday', { time }) : null
}

function labelSourceApp(evidence: RecommendationEvidence, t: ComposerTranslation): string | null {
  const fact = resolveSourceAppFact(evidence)
  if (!fact) return null
  if (fact.kind === 'time') return t('corebox.evidence.label.sourceAppTime', fact)
  if (fact.kind === 'habit') return t('corebox.evidence.label.sourceAppHabit', fact)
  return t('corebox.evidence.label.sourceAppUsed', fact)
}

function labelYesterday(
  evidence: RecommendationEvidence,
  t: ComposerTranslation,
  now: number
): string | null {
  const time = resolveYesterdayTime(evidence, now)
  return time ? t('corebox.evidence.label.yesterday', { time }) : null
}

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
  trending: [formatExecuteCount],
  'app-context': [formatSourceApp],
  yesterday: [formatYesterday]
}

/**
 * Generic facts are available only for sources without a dedicated evidence kind. The contextual
 * facts lead: "often from Xcode" says more about this moment than a lifetime count.
 */
const FALLBACK_ORDER: EvidenceFormatter[] = [
  formatSourceApp,
  formatYesterday,
  formatExecuteCount,
  formatPeakHours,
  formatLastUsed,
  formatInstalled
]

/**
 * Tile-sized versions of the contextual facts. Only these replace a tile's generic badge text: the
 * dedicated sources (frequent, recent, …) already name their fact in the badge, while "app context"
 * or "suggested" says nothing a user can check.
 */
const LABEL_BY_SOURCE: Partial<Record<RecommendationSource, EvidenceFormatter[]>> = {
  'app-context': [labelSourceApp],
  yesterday: [labelYesterday]
}

const LABEL_FALLBACK_ORDER: EvidenceFormatter[] = [labelSourceApp, labelYesterday]

function firstEvidence(
  formatters: EvidenceFormatter[],
  evidence: RecommendationEvidence,
  t: ComposerTranslation,
  now: number
): string {
  for (const format of formatters) {
    const text = format(evidence, t, now)
    if (text) return text
  }
  return ''
}

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
  return firstEvidence(formatters ?? FALLBACK_ORDER, evidence, t, now)
}

/**
 * A compact badge label for a grid tile, from the contextual evidence (source app, yesterday) the
 * item's source may use. Empty when there is none: the tile then keeps its generic badge text. A
 * pin is the user's decision, so its badge always says so instead.
 */
export function formatRecommendationEvidenceLabel(
  source: RecommendationSource | undefined,
  evidence: RecommendationEvidence | undefined,
  t: ComposerTranslation,
  now: number = Date.now()
): string {
  if (!evidence || source === 'pinned') return ''

  if (source && PREFERRED_BY_SOURCE[source]) {
    const formatters = LABEL_BY_SOURCE[source]
    return formatters ? firstEvidence(formatters, evidence, t, now) : ''
  }
  return firstEvidence(LABEL_FALLBACK_ORDER, evidence, t, now)
}
