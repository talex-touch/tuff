import { performance } from 'node:perf_hooks'
import { getStartupDegradeWindowRemainingMs } from '../../../db/runtime-flags'
import type { SourceScopedIndexWriterRouter } from './search-index-writer'
import { isIndexMaintenanceIdle } from './search-activity'

export const INDEX_MAINTENANCE_INITIAL_MIN_DELAY_MS = 1_000
export const INDEX_MAINTENANCE_ACTIVE_DELAY_MS = 250
export const INDEX_MAINTENANCE_COMPLETE_DELAY_MS = 60_000
export const INDEX_MAINTENANCE_FAILURE_BASE_DELAY_MS = 1_000
export const INDEX_MAINTENANCE_FAILURE_MAX_DELAY_MS = 60_000
const INDEX_MAINTENANCE_FAILURE_MAX_EXPONENT = 6

export function resolveIndexMaintenanceFailureDelayMs(consecutiveFailures: number): number {
  const exponent = Math.min(
    Math.max(0, consecutiveFailures - 1),
    INDEX_MAINTENANCE_FAILURE_MAX_EXPONENT
  )
  return Math.min(
    INDEX_MAINTENANCE_FAILURE_MAX_DELAY_MS,
    INDEX_MAINTENANCE_FAILURE_BASE_DELAY_MS * 2 ** exponent
  )
}

export interface IndexMaintenanceRunnerOptions {
  sourceId: string
  getWriter: () => SourceScopedIndexWriterRouter | null
  isAllowed: () => boolean
  onFailure: (error: unknown) => void
}

/**
 * One idle-only producer, with no writer/source ownership between bounded requests.
 *
 * Failure backoff policy:
 * - Consecutive non-aborted slice/publication/ack failures back off exponentially
 *   (`1s -> 2s -> 4s -> 8s -> 16s -> 32s -> 60s` cap) instead of retrying every 250ms.
 * - Pre-slice readiness/idle skips and `result.deferred` neither increment nor reset
 *   `consecutiveFailures`: the prior failure already paid its backoff wait, so the runner
 *   re-checks idle at the normal 250ms cadence while preserving the failure streak if the
 *   next real slice fails again.
 * - `consecutiveFailures` resets to `0` on fresh `start()` / `stop()` and as soon as a
 *   non-deferred slice executes cleanly (including publishing and acknowledging at least
 *   one pending notification when notifications are present).
 */
export class IndexMaintenanceRunner {
  private controller: AbortController | null = null
  private timer: NodeJS.Timeout | undefined
  private consecutiveFailures = 0

  constructor(private readonly options: IndexMaintenanceRunnerOptions) {}

  start(): void {
    if (this.controller && !this.controller.signal.aborted) return
    this.controller = new AbortController()
    this.consecutiveFailures = 0
    this.schedule(
      Math.max(INDEX_MAINTENANCE_INITIAL_MIN_DELAY_MS, getStartupDegradeWindowRemainingMs())
    )
  }

  stop(): void {
    this.controller?.abort()
    this.controller = null
    this.consecutiveFailures = 0
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private schedule(delayMs: number): void {
    const controller = this.controller
    if (!controller || controller.signal.aborted) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.run(controller)
    }, delayMs)
    this.timer.unref?.()
  }

  private async run(controller: AbortController): Promise<void> {
    let complete = false
    let failed = false
    try {
      const writer = this.options.getWriter()
      if (
        !writer ||
        !this.options.isAllowed() ||
        getStartupDegradeWindowRemainingMs() > 0 ||
        !isIndexMaintenanceIdle()
      )
        return
      const started = performance.now()
      for (let slice = 0; slice < 4 && performance.now() - started < 200; slice += 1) {
        controller.signal.throwIfAborted()
        if (!isIndexMaintenanceIdle()) break
        const result = await writer.runIndexMaintenanceSlice(
          this.options.sourceId,
          64,
          controller.signal
        )
        if (result.deferred) break
        let acknowledged = 0
        for (const notification of result.notifications) {
          controller.signal.throwIfAborted()
          if (acknowledged > 0 && (!isIndexMaintenanceIdle() || performance.now() - started >= 200))
            break
          const commit = await writer.publishExternalCommit(
            notification.sourceId,
            'cleanup',
            notification.affectedItems
          )
          if (!commit.committed) throw new Error('INDEX_MAINTENANCE_PUBLICATION_NOT_COMMITTED')
          await writer.acknowledgeIndexMaintenanceCommit(
            this.options.sourceId,
            notification,
            controller.signal
          )
          acknowledged += 1
        }
        if (this.controller === controller && !controller.signal.aborted) {
          this.consecutiveFailures = 0
        }
        if (acknowledged < result.notifications.length) break
        complete = result.done
        if (complete || !isIndexMaintenanceIdle()) break
        if (result.processed === 0 && result.notifications.length === 0) break
      }
    } catch (error) {
      if (this.controller === controller && !controller.signal.aborted) {
        failed = true
        this.consecutiveFailures += 1
        this.options.onFailure(error)
      }
    } finally {
      if (this.controller === controller && !controller.signal.aborted) {
        const delayMs = failed
          ? resolveIndexMaintenanceFailureDelayMs(this.consecutiveFailures)
          : complete
            ? INDEX_MAINTENANCE_COMPLETE_DELAY_MS
            : INDEX_MAINTENANCE_ACTIVE_DELAY_MS
        this.schedule(delayMs)
      }
    }
  }
}
