/**
 * Logging helpers plus a re-export of the shared time-weighting model.
 *
 * The weight functions live in `@talex-touch/utils/core-box` because plugins rank against the same
 * axis (see `RecommendSDK`); keeping a second copy here is how the two drift. `ParsedItemTimeStats`
 * is structurally the shared `ItemTimeDistribution` plus identity/`lastUpdated` fields, so it
 * satisfies the shared signatures without a cast.
 */
export {
  calculateHourAffinity,
  calculateTimeContextBoost,
  calculateTimeRelevanceScore,
  DAY_MS,
  TIME_CONTEXT_DAY_BOOST,
  TIME_CONTEXT_SLOT_BOOST,
  TIME_RELEVANCE_HOUR_WEIGHT,
  TIME_RELEVANCE_SCALE,
  TIME_RELEVANCE_SLOT_WEIGHT,
  toDayBucket
} from '@talex-touch/utils/core-box'

export type LogMeta = Record<string, string | number | boolean | null | undefined>
export function toPrimitive(value: unknown): string | number | boolean | null | undefined {
  if (value == null) return value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  return String(value)
}

export function toErrorMeta(error: unknown): LogMeta {
  if (error instanceof Error) {
    const node = error as Error & { code?: unknown; cause?: unknown }
    const cause =
      node.cause && typeof node.cause === 'object'
        ? (node.cause as { code?: unknown; rawCode?: unknown; message?: unknown })
        : null
    return {
      name: node.name,
      message: node.message,
      code: toPrimitive(node.code),
      causeCode: toPrimitive(cause?.code),
      causeRawCode: toPrimitive(cause?.rawCode),
      causeMessage: toPrimitive(cause?.message)
    }
  }
  return { message: String(error) }
}
