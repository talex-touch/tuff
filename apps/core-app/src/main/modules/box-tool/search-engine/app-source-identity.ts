/**
 * How application rows are keyed across the usage ledger and the recommendation engine.
 *
 * `item_usage_stats`, `item_time_stats`, `usage_trend_daily` and `usage_execute_events` all use
 * `(source_id, item_id)`, and the app provider declares this id (`app-provider.ts`), so a launch
 * recorded or a candidate nominated under anything else lands in its own bucket and never joins
 * back to the catalog. A leaf module on purpose: the recorder and the recommendation sources both
 * import it, and neither may depend on the other.
 */
export const APP_PROVIDER_SOURCE_ID = 'app-provider'

/** `item.source.type` the app provider writes for every application row. */
export const APP_PROVIDER_SOURCE_TYPE = 'application'
