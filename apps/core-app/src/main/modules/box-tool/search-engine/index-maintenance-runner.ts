import { performance } from 'node:perf_hooks'
import { getStartupDegradeWindowRemainingMs } from '../../../db/runtime-flags'
import type { SourceScopedIndexWriterRouter } from './search-index-writer'
import { isIndexMaintenanceIdle } from './search-activity'

export interface IndexMaintenanceRunnerOptions {
  sourceId: string
  getWriter: () => SourceScopedIndexWriterRouter | null
  isAllowed: () => boolean
  onFailure: (error: unknown) => void
}

/** One idle-only producer, with no writer/source ownership between bounded requests. */
export class IndexMaintenanceRunner {
  private controller: AbortController | null = null
  private timer: NodeJS.Timeout | undefined

  constructor(private readonly options: IndexMaintenanceRunnerOptions) {}

  start(): void {
    if (this.controller && !this.controller.signal.aborted) return
    this.controller = new AbortController()
    this.schedule(Math.max(1_000, getStartupDegradeWindowRemainingMs()))
  }

  stop(): void {
    this.controller?.abort()
    this.controller = null
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private schedule(delayMs: number): void {
    const controller = this.controller
    if (!controller || controller.signal.aborted) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.run(controller)
    }, delayMs)
    this.timer.unref?.()
  }

  private async run(controller: AbortController): Promise<void> {
    let complete = false
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
        if (acknowledged < result.notifications.length) break
        complete = result.done
        if (complete || !isIndexMaintenanceIdle()) break
        if (result.processed === 0 && result.notifications.length === 0) break
      }
    } catch (error) {
      if (!controller.signal.aborted) this.options.onFailure(error)
    } finally {
      if (this.controller === controller && !controller.signal.aborted)
        this.schedule(complete ? 60_000 : 250)
    }
  }
}
