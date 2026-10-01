import type { TuffItem } from '@talex-touch/utils'
import type { AcceptedExecuteRecord } from './execute-recorder'
import { recordAcceptedExecute } from './execute-recorder'
import type { UsageEntryPoint } from './usage-entry-point'
import { getLogger } from '@talex-touch/utils/common/logger'
import { activeAppService } from '../../system/active-app'

const log = getLogger('search-engine')

/**
 * The provider id every application row is keyed by. `item_usage_stats`, `item_time_stats` and
 * `usage_trend_daily` all use `(source_id, item_id)`, and the app provider declares this id
 * (`app-provider.ts`), so a launch recorded under anything else would land in its own bucket and
 * never join back to the catalog.
 */
export const APP_PROVIDER_SOURCE_ID = 'app-provider'
const APP_PROVIDER_SOURCE_TYPE = 'application'

export interface AppLaunchRecord {
  /** The catalogue item id; the statistical key for this launch. */
  itemId: string
  /**
   * The executed item, when the caller has it (the CoreBox path does). The settings path holds
   * only the entry's identity, and a synthetic item carrying that identity is enough for the
   * recorder: the statistical key is `itemId`, and the source is this provider.
   */
  item?: TuffItem
  entryPoint: UsageEntryPoint
  /** Identifier of this user action, reused across retries of the same launch. */
  eventId: string
  /** Present for search-originated launches; absent when the user clicked a list row. */
  sessionId?: string | null
  /** Overrides the captured foreground app. Used when the caller already knows it. */
  previousApp?: string | null
}

/** The identity a settings-page launch carries: it holds the catalogue key, not a rendered item. */
function buildSyntheticAppItem(itemId: string): TuffItem {
  return {
    id: itemId,
    kind: 'app',
    source: { id: APP_PROVIDER_SOURCE_ID, type: APP_PROVIDER_SOURCE_TYPE, name: '' },
    render: { mode: 'default', basic: { title: '' } },
    actions: []
  } as TuffItem
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
 * It does not write statistics itself: it publishes the accepted action through the engine's
 * execute seam, so a settings-page launch and a CoreBox launch land in the same transaction,
 * dedupe on the same `eventId`, and invalidate the same caches. A launch the user asked for must
 * not fail because a statistics row could not be written, so a rejected write is logged, not
 * rethrown, here.
 */
export class AppLaunchRecorder {
  async record(record: AppLaunchRecord): Promise<void> {
    if (!record.itemId) return
    const accepted: AcceptedExecuteRecord = {
      item: record.item ?? buildSyntheticAppItem(record.itemId),
      entryPoint: record.entryPoint,
      eventId: record.eventId,
      sessionId: record.sessionId ?? null,
      previousApp: record.previousApp ?? null
    }
    try {
      await recordAcceptedExecute(accepted)
    } catch (error) {
      log.error(`Failed to record app launch for ${record.itemId}`, { error })
    }
  }
}
