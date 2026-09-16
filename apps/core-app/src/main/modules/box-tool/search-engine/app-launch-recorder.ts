import type { DbUtils } from '../../../db/utils'
import type { UsageEntryPoint } from './usage-entry-point'
import { getLogger } from '@talex-touch/utils/common/logger'
import { activeAppService } from '../../system/active-app'

const log = getLogger('search-engine')

/**
 * The provider id every application row is keyed by. `item_usage_stats`, `item_time_stats` and
 * `usage_trend_daily` all use `(source_id, item_id)`, and the app provider declares this id
 * (`app-provider.ts:459`), so a launch recorded under anything else would land in its own bucket
 * and never join back to the catalog.
 */
export const APP_PROVIDER_SOURCE_ID = 'app-provider'
const APP_PROVIDER_SOURCE_TYPE = 'application'

export interface AppLaunchRecord {
  /** Resolved through `resolveAppItemId`, so it matches the indexed catalog row. */
  itemId: string
  entryPoint: UsageEntryPoint
  /** Present for search-originated launches; absent when the user clicked a list row. */
  sessionId?: string | null
  /** Overrides the captured foreground app. Used when the caller already knows it. */
  previousApp?: string | null
}

/**
 * The shape stored in `usage_logs.context` for an application launch.
 *
 * `prevApp` was described in the schema comment from the beginning (`schema.ts:210`) but nothing
 * ever wrote it, so the column held `{"scoring": …}` and the transition graph had no source. It
 * is captured here, at the one moment where "what the user was in before this launch" is still
 * true — a later read would see the app that was just launched.
 */
export interface AppLaunchContext {
  ent: UsageEntryPoint
  prevApp?: string
  prevAppName?: string
}

/**
 * Captures the foreground application as the "previous app" for an execute about to happen.
 *
 * Shared by both recording paths so a CoreBox launch and a settings-page launch describe the
 * transition identically. Returns an empty object when the foreground app is unavailable: that
 * costs this event its edge in the transition graph and nothing else.
 */
export async function resolvePreviousAppContext(): Promise<{
  prevApp?: string
  prevAppName?: string
}> {
  try {
    // Without the icon: this runs on the launch path and the bitmap is both the expensive part
    // and useless here.
    const active = await activeAppService.getActiveApp({ includeIcon: false })
    const identity = active?.bundleId || active?.identifier
    if (!identity) return {}
    return active.displayName
      ? { prevApp: identity, prevAppName: active.displayName }
      : { prevApp: identity }
  } catch (error) {
    log.debug('Failed to capture foreground app for launch context', { error })
    return {}
  }
}
/**
 * Records one application launch, whatever surface asked for it.
 *
 * Every launch path funnels through here so the counts mean one thing. Previously CoreBox
 * executes were recorded by `SearchUsageService.recordExecute` while the settings page called
 * `appSdk.openApp` and recorded nothing, which made per-app launch totals depend on which UI the
 * user happened to prefer.
 *
 * Failures are logged and swallowed: a launch the user asked for must not fail because a
 * statistics row could not be written.
 */
export class AppLaunchRecorder {
  constructor(private readonly deps: { getDbUtils: () => DbUtils | null }) {}

  async record(record: AppLaunchRecord): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils || !record.itemId) return

    const now = new Date()
    try {
      const context = await this.buildContext(record)
      await dbUtils.addUsageLog({
        sessionId: record.sessionId ?? null,
        itemId: record.itemId,
        source: APP_PROVIDER_SOURCE_ID,
        action: 'execute',
        keyword: '',
        timestamp: now,
        context: JSON.stringify(context)
      })
      await dbUtils.incrementUsageSummary(record.itemId)
      await dbUtils.incrementUsageStats(
        APP_PROVIDER_SOURCE_ID,
        record.itemId,
        APP_PROVIDER_SOURCE_TYPE,
        'execute'
      )
      await dbUtils.incrementUsageTrendDaily(APP_PROVIDER_SOURCE_ID, record.itemId, now)
    } catch (error) {
      log.error(`Failed to record app launch for ${record.itemId}`, { error })
    }
  }

  private async buildContext(record: AppLaunchRecord): Promise<AppLaunchContext> {
    if (record.previousApp) {
      return { ent: record.entryPoint, prevApp: record.previousApp }
    }
    return { ent: record.entryPoint, ...(await resolvePreviousAppContext()) }
  }
}
