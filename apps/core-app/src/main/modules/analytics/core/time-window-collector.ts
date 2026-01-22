import type {
  AnalyticsSnapshot,
  AnalyticsWindowType,
  CoreMetrics
} from '@talex-touch/utils/analytics'
import type { MemoryStore } from '../storage/memory-store'

const WINDOW_FANOUT: Record<AnalyticsWindowType, AnalyticsWindowType[]> = {
  '1m': ['1m', '5m', '15m', '1h', '24h'],
  '5m': ['5m', '15m', '1h', '24h'],
  '15m': ['15m', '1h', '24h'],
  '1h': ['1h', '24h'],
  '24h': ['24h']
}

/**
 * Simple time-window aggregator that fans out snapshots to higher windows.
 */
export class TimeWindowCollector {
  constructor(
    private store: MemoryStore,
    private now: () => number = () => Date.now()
  ) {}

  /**
   * Record metrics for a given base window and fan out to higher windows.
   */
  record(metrics: CoreMetrics, baseWindow: AnalyticsWindowType = '1m'): AnalyticsSnapshot[] {
    const timestamp = this.now()
    const windows = WINDOW_FANOUT[baseWindow] ?? [baseWindow]
    const snapshots: AnalyticsSnapshot[] = windows.map((windowType) => ({
      windowType,
      timestamp,
      metrics
    }))

    for (const snapshot of snapshots) {
      this.store.push(snapshot)
    }

    return snapshots
  }
}
