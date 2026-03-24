import { dbWriteScheduler } from './db-write-scheduler'
import { isInStartupDegradeWindow } from './runtime-flags'

const CORE_QUEUE_LOW_WATERMARK = 2

export function isStartupDegradeActive(): boolean {
  if (isInStartupDegradeWindow()) {
    return true
  }

  const stats = dbWriteScheduler.getDetailedStats()
  const coreQueued = stats.queuedByPriority.critical + stats.queuedByPriority.interactive
  if (coreQueued > CORE_QUEUE_LOW_WATERMARK) {
    return true
  }

  return stats.currentTaskPriority === 'critical' || stats.currentTaskPriority === 'interactive'
}
