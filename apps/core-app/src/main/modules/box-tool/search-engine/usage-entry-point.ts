/**
 * Where a usage event came from.
 *
 * Counts were previously indistinguishable: launching an app from CoreBox went through
 * `recordExecute`, while the applications settings page called `openApp` directly and recorded
 * nothing at all. The same application therefore had two launch paths and one of them was
 * invisible, so any "times launched" figure understated reality by however much the user
 * preferred the settings page.
 *
 * This rides in `usage_logs.context` rather than in `item_usage_stats`, which is keyed by
 * `(source_id, item_id)`: adding a dimension there would either break that primary key or fork
 * the counts away from `usage_trend_daily` and `item_time_stats`, which share the same key. The
 * aggregates stay entry-agnostic and describe the item; the log keeps the provenance.
 */
export const USAGE_ENTRY_POINTS = [
  /** Executed from the CoreBox search results list. */
  'core-box',
  /** Launched from the applications settings page (list detail "Launch"). */
  'settings-app-detail',
  /** Triggered by a user-bound global shortcut. */
  'shortcut',
  /** Executed from a recommendation surface rather than a typed query. */
  'recommendation'
] as const

export type UsageEntryPoint = (typeof USAGE_ENTRY_POINTS)[number]

const USAGE_ENTRY_POINT_SET = new Set<string>(USAGE_ENTRY_POINTS)

/**
 * Narrows an untrusted value to a known entry point.
 *
 * Unknown strings degrade to `null` rather than being stored verbatim: the field is an enum for
 * grouping, and letting an arbitrary caller mint new values turns every later `GROUP BY ent`
 * into a long tail of typos.
 */
export function toUsageEntryPoint(value: unknown): UsageEntryPoint | null {
  return typeof value === 'string' && USAGE_ENTRY_POINT_SET.has(value)
    ? (value as UsageEntryPoint)
    : null
}
