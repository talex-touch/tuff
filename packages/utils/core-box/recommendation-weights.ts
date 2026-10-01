import type { TimePattern } from './recommendation'

/**
 * Time-of-use weighting, shared with plugins.
 *
 * These are the functions the host itself ranks with, exposed so a plugin's `RecommendProvider`
 * can order its candidates on the same axis rather than inventing one. They are deliberately the
 * time half of the model and nothing else: frecency reads `item_usage_stats` row shapes, and
 * publishing that would freeze an internal table as an API and hand callers another user's
 * behaviour data. Everything here is a pure function of arguments the caller already holds.
 */

/**
 * Behaviour facts for one item, derived only from real, dated executions.
 *
 * This is the single shape the host and the SDK score against. It carries no exposure, no cancel
 * count and no "last searched": those metrics used to inflate frequency and refresh decay, and
 * removing them is the point (R3). Every field is a fact the database holds; a caller that does
 * not have them must pass zeros, never a guess.
 */
export interface UsageBehaviorFacts {
  /** Lifetime valid executions. */
  executeCount: number
  /** Valid executions in the last 30 local days. */
  executeCount30: number
  /** Valid executions in the last 7 local days. */
  executeCount7: number
  /** Distinct local days with at least one valid execution in the last 30 days. */
  activeDays30: number
  /** Epoch ms of the last valid execution, or null. */
  lastExecutedAt: number | null
  /** Sum over the last 30 days of daily executes weighted by age (already decayed). */
  decayedExecuteScore30: number
  /** 24 buckets of dated executions in the last 30 days, index = hour of day. */
  hourDistribution30: number[]
  /** 7 buckets of dated executions in the last 30 days, index = day of week (0 = Sunday). */
  dayOfWeekDistribution30: number[]
  /** Slot buckets of dated executions in the last 30 days. */
  timeSlotDistribution30: {
    morning: number
    afternoon: number
    evening: number
    night: number
  }
}

/** Usage histogram for one item. Counts are occurrences; only their relative size matters. */
export interface ItemTimeDistribution {
  /** 24 buckets, index = hour of day. May be empty for items recorded before hour buckets existed. */
  hourDistribution: number[]
  /** 7 buckets, index = day of week (0 = Sunday). */
  dayOfWeekDistribution: number[]
  timeSlotDistribution: {
    morning: number
    afternoon: number
    evening: number
    night: number
  }
}

/**
 * The whole shared model in one object: the SDK-facing weight shape a plugin ranks with, plus the
 * individual constants and helpers this module publishes as exports.
 *
 * Declared so {@link createRecommendationWeightModel} has one named, checkable return shape.
 */
export interface RecommendationWeightModel {
  /**
   * Automatic behaviour score 0..{@link RecommendationWeightModel.BEHAVIOR_SCORE_MAX} from real
   * dated executions only. Saturated on purpose, so a long history cannot permanently outrank a
   * new habit and one burst of use cannot dominate.
   */
  behaviorScore(facts: UsageBehaviorFacts): number
  /**
   * Time preference points 0..`constants.timeContributionMax`, 0 below the evidence threshold
   * (>=10 executions over >=3 distinct local days in 30 days).
   */
  timeContribution(facts: UsageBehaviorFacts, currentTime: TimePattern, now?: number): number
  /** Whether the item meets the strict frequent cohort (>=5 executions over >=3 distinct days). */
  isFrequentEligible(facts: UsageBehaviorFacts): boolean
  /** What a provider's self-declared `priority` may add: at most 5 points. */
  pluginPriorityContribution(priority: number | undefined): number
  /** Model version; changes when a score's meaning changes, not when a constant is tuned. */
  readonly modelVersion: string
  /** Bounds a caller blending its own signal has to respect. */
  readonly constants: {
    /** The cap on `timeContribution`. */
    readonly timeContributionMax: number
  }
  /** Total budget for automatic ranking: behaviour base plus time contribution. */
  readonly BEHAVIOR_SCORE_MAX: number
  /** Ceiling of the behaviour base; the remainder of the budget is reserved for time. */
  readonly BEHAVIOR_BASE_MAX: number
  /** Executions required in the last 30 days before any time points may be added. */
  readonly TIME_MIN_EXECUTES_30: number
  /** Distinct local days required in the last 30 days before any time points may be added. */
  readonly TIME_MIN_ACTIVE_DAYS_30: number
  /** Executions in the last 30 days required for the strict frequent cohort. */
  readonly FREQUENT_MIN_EXECUTES_30: number
  /** Distinct local days required in the last 30 days for the strict frequent cohort. */
  readonly FREQUENT_MIN_ACTIVE_DAYS_30: number
  /** A plugin's self-declared priority may move its own candidates by at most this many points. */
  readonly PLUGIN_PRIORITY_MAX_CONTRIBUTION: number
  /** Length of one local day in ms; the unit of {@link RecommendationWeightModel.toDayBucket}. */
  readonly DAY_MS: number
  /** Local day index of a timestamp, in days since the epoch. */
  toDayBucket(timestampMs: number): number
  /** Project behaviour facts onto the time distribution the time functions consume. */
  toItemTimeDistribution(facts: UsageBehaviorFacts): ItemTimeDistribution
}

/**
 * Build the shared behaviour/time weight model.
 *
 * The whole model — constants, helpers and the scoring functions — is defined inside this single
 * function and reaches for nothing outside itself, so its source is self-contained:
 * `Function.prototype.toString()` on this factory can be re-evaluated in another realm and run
 * with no host lexical in scope. The plugin child realm boots the very same source that way, so
 * there is one set of formulas rather than two that drift. Every member is a `const` arrow, so
 * the returned functions are exactly the ones this module's exports bind to.
 *
 * The realm's own intrinsics are captured first because the child realm is shared with plugin
 * code; measuring with a captured `Math`/`Number` keeps a score stable even after a plugin
 * rewrites a global. The returned model is frozen for the same reason.
 */
export function createRecommendationWeightModel(): RecommendationWeightModel {
  const isFiniteNumber = Number.isFinite
  const mathExp = Math.exp
  const mathMin = Math.min
  const mathMax = Math.max
  const mathFloor = Math.floor
  const mathLn2 = Math.LN2
  const objectFreeze = Object.freeze
  const objectValues = Object.values
  const arrayIsArray = Array.isArray
  const dateNow = Date.now

  const DAY_MS = 86_400_000
  const RECOMMENDATION_MODEL_VERSION = 'reco-model-2'

  /** Multiplier when the item has history in the current time slot. */
  const TIME_CONTEXT_SLOT_BOOST = 1.35
  /** Multiplier when the item has history on the current weekday. */
  const TIME_CONTEXT_DAY_BOOST = 1.15
  /** Puts the slot ratio (0..1) on a 0..100 scale; the hour term reuses it so both halves are commensurate. */
  const TIME_RELEVANCE_SCALE = 100
  /** Split of the time-relevance score between the coarse slot/weekday signal and hour-of-day affinity. */
  const TIME_RELEVANCE_SLOT_WEIGHT = 0.5
  const TIME_RELEVANCE_HOUR_WEIGHT = 0.5

  const BEHAVIOR_SCORE_MAX = 100
  const BEHAVIOR_BASE_MAX = 80
  /** The three ceilings below sum to `BEHAVIOR_BASE_MAX`. */
  const BEHAVIOR_SUSTAINED_MAX = 40
  const BEHAVIOR_SUSTAINED_HALF_SATURATION = 10
  const BEHAVIOR_RECENT_MAX = 24
  const BEHAVIOR_RECENT_HALF_SATURATION = 5
  const BEHAVIOR_CONSISTENCY_MAX = 16
  const BEHAVIOR_CONSISTENCY_HALF_SATURATION = 12

  const TIME_CONTRIBUTION_MAX = 20
  const TIME_MIN_EXECUTES_30 = 10
  const TIME_MIN_ACTIVE_DAYS_30 = 3
  /** Executes in 30d at which the evidence factor reaches full strength. */
  const TIME_EVIDENCE_FULL_EXECUTES = 30
  /** Half-life, in days, of the age decay applied to the time contribution. */
  const TIME_AGE_HALF_LIFE_DAYS = 30

  const FREQUENT_MIN_EXECUTES_30 = 5
  const FREQUENT_MIN_ACTIVE_DAYS_30 = 3

  const PLUGIN_PRIORITY_MAX_CONTRIBUTION = 5
  /** The plugin `priority` value that earns the full `PLUGIN_PRIORITY_MAX_CONTRIBUTION`. */
  const PLUGIN_PRIORITY_FULL_SCALE = 100

  const toDayBucket = (timestampMs: number): number => mathFloor(timestampMs / DAY_MS)

  const toItemTimeDistribution = (facts: UsageBehaviorFacts): ItemTimeDistribution => ({
    hourDistribution: facts.hourDistribution30,
    dayOfWeekDistribution: facts.dayOfWeekDistribution30,
    timeSlotDistribution: facts.timeSlotDistribution30
  })

  const saturating = (value: number, max: number, halfSaturation: number): number => {
    if (!isFiniteNumber(value) || value <= 0) return 0
    return max * (1 - mathExp(-value / halfSaturation))
  }

  const calculateBehaviorScore = (facts: UsageBehaviorFacts): number => {
    const sustained = saturating(
      facts.decayedExecuteScore30,
      BEHAVIOR_SUSTAINED_MAX,
      BEHAVIOR_SUSTAINED_HALF_SATURATION
    )
    const recent = saturating(
      facts.executeCount7,
      BEHAVIOR_RECENT_MAX,
      BEHAVIOR_RECENT_HALF_SATURATION
    )
    const consistency = saturating(
      facts.activeDays30,
      BEHAVIOR_CONSISTENCY_MAX,
      BEHAVIOR_CONSISTENCY_HALF_SATURATION
    )
    return mathMin(BEHAVIOR_BASE_MAX, sustained + recent + consistency)
  }

  /** Private: one internal term of `calculateTimeContribution`, not a ranking score. */
  const calculateTimeContextBoost = (
    itemTimeStats: ItemTimeDistribution,
    currentTime: TimePattern
  ): number => {
    let boost = 1

    if ((itemTimeStats.timeSlotDistribution[currentTime.timeSlot] ?? 0) > 0) {
      boost *= TIME_CONTEXT_SLOT_BOOST
    }

    if ((itemTimeStats.dayOfWeekDistribution[currentTime.dayOfWeek] ?? 0) > 0) {
      boost *= TIME_CONTEXT_DAY_BOOST
    }

    return boost
  }

  /** Private: a raw factor, null when the item has no hour history at all. */
  const calculateHourAffinity = (
    hourDistribution: number[] | undefined,
    hourOfDay: number
  ): number | null => {
    if (!arrayIsArray(hourDistribution) || hourDistribution.length === 0) return null

    let peak = 0
    for (const count of hourDistribution) {
      if (typeof count === 'number' && count > peak) peak = count
    }
    if (peak <= 0) return null

    const currentHourUsage = hourDistribution[hourOfDay] ?? 0
    return mathMax(0, mathMin(1, currentHourUsage / peak))
  }

  /**
   * Smoothed rather than a bare ratio, so absence is always beaten by weak evidence (#650) and a
   * weekday without history is never a factor of exactly 0. Strictly increasing in `dayUsage`.
   */
  const calculateDayFactor = (dayUsage: number, avgDayUsage: number): number =>
    (dayUsage + 1) / (avgDayUsage + 1)

  /** Private: the un-gated, un-decayed magnitude term of `calculateTimeContribution`. */
  const calculateTimeRelevanceScore = (
    itemTimeStats: ItemTimeDistribution,
    currentTime: TimePattern
  ): number => {
    const slotUsage = itemTimeStats.timeSlotDistribution[currentTime.timeSlot] ?? 0
    const totalUsage = objectValues(itemTimeStats.timeSlotDistribution).reduce((a, b) => a + b, 0)

    if (totalUsage === 0) return 0

    const slotRatio = slotUsage / totalUsage
    const dayUsage = itemTimeStats.dayOfWeekDistribution[currentTime.dayOfWeek] ?? 0
    const avgDayUsage = itemTimeStats.dayOfWeekDistribution.reduce((a, b) => a + b, 0) / 7
    const dayFactor = calculateDayFactor(dayUsage, avgDayUsage)
    const boost = calculateTimeContextBoost(itemTimeStats, currentTime)
    const slotScore = slotRatio * TIME_RELEVANCE_SCALE * dayFactor

    const hourAffinity = calculateHourAffinity(
      itemTimeStats.hourDistribution,
      currentTime.hourOfDay
    )
    if (hourAffinity === null) {
      return slotScore * boost
    }

    const hourScore = hourAffinity * TIME_RELEVANCE_SCALE * dayFactor
    return (slotScore * TIME_RELEVANCE_SLOT_WEIGHT + hourScore * TIME_RELEVANCE_HOUR_WEIGHT) * boost
  }

  const calculateTimeContribution = (
    facts: UsageBehaviorFacts,
    currentTime: TimePattern,
    now: number = dateNow()
  ): number => {
    if (facts.executeCount30 < TIME_MIN_EXECUTES_30) return 0
    if (facts.activeDays30 < TIME_MIN_ACTIVE_DAYS_30) return 0

    const relevance = calculateTimeRelevanceScore(toItemTimeDistribution(facts), currentTime)
    const normalized = mathMin(1, relevance / TIME_RELEVANCE_SCALE)
    const evidence = mathMin(1, facts.executeCount30 / TIME_EVIDENCE_FULL_EXECUTES)
    const lastExecutedAt = facts.lastExecutedAt
    const ageFactor =
      typeof lastExecutedAt === 'number' && isFiniteNumber(lastExecutedAt) && lastExecutedAt > 0
        ? mathExp(
            (-mathLn2 * mathMax(0, now - lastExecutedAt)) / (TIME_AGE_HALF_LIFE_DAYS * DAY_MS)
          )
        : 0

    return TIME_CONTRIBUTION_MAX * normalized * evidence * ageFactor
  }

  const isFrequentEligible = (facts: UsageBehaviorFacts): boolean =>
    facts.executeCount30 >= FREQUENT_MIN_EXECUTES_30 &&
    facts.activeDays30 >= FREQUENT_MIN_ACTIVE_DAYS_30

  const calculatePluginPriorityContribution = (priority: number | undefined): number => {
    if (typeof priority !== 'number' || !isFiniteNumber(priority) || priority <= 0) return 0
    return mathMin(
      PLUGIN_PRIORITY_MAX_CONTRIBUTION,
      (priority / PLUGIN_PRIORITY_FULL_SCALE) * PLUGIN_PRIORITY_MAX_CONTRIBUTION
    )
  }

  return objectFreeze({
    behaviorScore: calculateBehaviorScore,
    timeContribution: calculateTimeContribution,
    isFrequentEligible,
    pluginPriorityContribution: calculatePluginPriorityContribution,
    modelVersion: RECOMMENDATION_MODEL_VERSION,
    constants: objectFreeze({ timeContributionMax: TIME_CONTRIBUTION_MAX }),
    BEHAVIOR_SCORE_MAX,
    BEHAVIOR_BASE_MAX,
    TIME_MIN_EXECUTES_30,
    TIME_MIN_ACTIVE_DAYS_30,
    FREQUENT_MIN_EXECUTES_30,
    FREQUENT_MIN_ACTIVE_DAYS_30,
    PLUGIN_PRIORITY_MAX_CONTRIBUTION,
    DAY_MS,
    toDayBucket,
    toItemTimeDistribution
  })
}

/** The one shared model; every export below is a binding of this object's own members. */
const model = createRecommendationWeightModel()

/** Day length in ms; the unit of {@link toDayBucket}. */
export const DAY_MS = model.DAY_MS

/**
 * Version of the shared behaviour/time model.
 *
 * The time functions are a published SDK surface, so a plugin can rank on the same axis as the
 * host. When the meaning of a score changes (not merely a constant), bump this and say so in the
 * release note: third-party ordering depends on it.
 */
export const RECOMMENDATION_MODEL_VERSION = model.modelVersion

/**
 * Total budget for automatic ranking: behaviour base plus time contribution. Never exceeded, so
 * "0..100" is the whole automatic scale rather than an aspiration.
 */
export const BEHAVIOR_SCORE_MAX = model.BEHAVIOR_SCORE_MAX

/** Ceiling of the behaviour base; the remainder of the budget is reserved for time. */
export const BEHAVIOR_BASE_MAX = model.BEHAVIOR_BASE_MAX

/**
 * Time-of-use contributes at most this many points, and only to an item that already has enough
 * evidence. Without the cap a single use concentrated in the current hour would dominate the
 * ranking; with it, time can only nudge something that is already used often.
 */
export const TIME_CONTRIBUTION_MAX = model.constants.timeContributionMax

/** Executions required in the last 30 days before any time points may be added. */
export const TIME_MIN_EXECUTES_30 = model.TIME_MIN_EXECUTES_30

/** Distinct local days required in the last 30 days before any time points may be added. */
export const TIME_MIN_ACTIVE_DAYS_30 = model.TIME_MIN_ACTIVE_DAYS_30

/** Executions in the last 30 days required for the strict frequent cohort. */
export const FREQUENT_MIN_EXECUTES_30 = model.FREQUENT_MIN_EXECUTES_30

/** Distinct local days required in the last 30 days for the strict frequent cohort. */
export const FREQUENT_MIN_ACTIVE_DAYS_30 = model.FREQUENT_MIN_ACTIVE_DAYS_30

/** A plugin's self-declared priority may move its own candidates by at most this many points. */
export const PLUGIN_PRIORITY_MAX_CONTRIBUTION = model.PLUGIN_PRIORITY_MAX_CONTRIBUTION

/** Local day index of a timestamp, in days since the epoch. */
export const toDayBucket = model.toDayBucket

/** Project behaviour facts onto the time distribution the time functions consume. */
export const toItemTimeDistribution = model.toItemTimeDistribution

/**
 * The automatic behaviour base, 0..{@link BEHAVIOR_BASE_MAX}, from real dated executions only.
 *
 * Three saturating terms: sustained use over 30 days (already decayed by age upstream), recent
 * use over 7 days, and consistency across distinct days. Because each saturates and the decay is
 * computed from event dates, adding one execution contributes only its own weight and never makes
 * the rest of the history young again.
 */
export const calculateBehaviorScore = model.behaviorScore

/**
 * Time-of-day preference points, 0..20, or 0 when the evidence is too thin to claim a habit.
 *
 * Requires {@link TIME_MIN_EXECUTES_30} executions over {@link TIME_MIN_ACTIVE_DAYS_30} distinct
 * days before anything is added; below that a concentration in the current hour is a coincidence,
 * not a pattern. Above the threshold the contribution still scales with evidence volume and
 * decays with the age of the last execution, so stale evidence fades instead of sitting at its
 * maximum forever.
 */
export const calculateTimeContribution = model.timeContribution

/**
 * The strict frequent cohort: enough sustained, spread-out use to call an item a habit.
 *
 * Distinct days are the admission signal — five uses in one afternoon is a session, not a habit —
 * but they do not cap the count itself, which keeps accumulating. This judges behaviour only; the
 * caller still has to confirm the item is executable.
 */
export const isFrequentEligible = model.isFrequentEligible

/**
 * What a plugin's self-declared `priority` may add: at most {@link
 * PLUGIN_PRIORITY_MAX_CONTRIBUTION} points, so it can order a plugin's own candidates but can
 * never manufacture a habit or take a grid slot by declaration.
 */
export const calculatePluginPriorityContribution = model.pluginPriorityContribution
