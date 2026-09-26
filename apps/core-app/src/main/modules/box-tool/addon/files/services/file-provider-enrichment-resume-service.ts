import type { IndexedWorkerScheduleResult } from '@talex-touch/utils/search'
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import type { DbUtils } from '../../../../../db/utils'
import { fileIndexProgress, files as filesSchema } from '../../../../../db/schema'
import type { FileProviderIndexSchedulerFile } from './file-provider-index-scheduler-service'

const RESUME_BATCH_SIZE = 200
/**
 * A round that admits nothing while the scheduler reports deferred work means
 * capacity is held elsewhere. Stop this pass (rows stay durably pending; the
 * follow-up round after the cooldown retries) instead of spinning.
 */
const MAX_CONSECUTIVE_NO_ADMIT_ROUNDS = 5
/**
 * Quiet time between the end of one recovery round and the start of the next.
 * Every round publishes what it enriches and each publication is an index
 * commit, so rounds must not run back to back: requests made while a round runs
 * or during this window share one follow-up round.
 */
export const ENRICHMENT_RESUME_ROUND_COOLDOWN_MS = 45_000
/** Message of the AggregateError `IndexedWorkerSchedulerService.drain` rejects with. */
const SCHEDULER_DISPATCH_FAILED = 'INDEXED_WORKER_SCHEDULER_DISPATCH_FAILED'

/**
 * How a round ended. `wrapped` reached the end of the table after starting
 * mid-table, so the rows before its starting cursor still need a pass.
 */
type ResumeRoundOutcome = 'completed' | 'wrapped' | 'paused' | 'stopped'

export interface FileProviderEnrichmentResumeServiceDeps {
  getDbUtils: () => DbUtils | null
  isSearchIndexAvailable: () => boolean
  isShuttingDown: () => boolean
  withMutationLease: <T>(operation: (leaseId: string) => Promise<T>) => Promise<T>
  scheduleIndexing: (
    files: FileProviderIndexSchedulerFile[],
    reason: string,
    mutationLeaseId: string
  ) => Promise<IndexedWorkerScheduleResult>
  waitForSearchIndexDrain: (reason: string, mutationLeaseId: string) => Promise<void>
  yieldToEventLoop: () => Promise<void>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

/**
 * Resumes post-scan content/embedding work from durable file_index_progress
 * records. It deliberately does not alter scan_progress: that table proves
 * filesystem coverage, while this service repairs only unfinished enrichment.
 *
 * The resume cursor advances only over a page the scheduler admitted entirely
 * (`deferred === 0`). A page suffix the scheduler could not admit is NOT skipped:
 * it stays durably pending and the same range is re-queried after the admitted
 * work drains.
 *
 * The cursor is kept across rounds and wraps to 0 only when a round reaches the
 * end of the table, so a new round continues where the last one stopped instead
 * of re-reading the head of the table. Rounds are spaced by
 * ENRICHMENT_RESUME_ROUND_COOLDOWN_MS: a single unref'd timer starts the one
 * follow-up round that requests during a round or its cooldown, a paused round,
 * or a mid-table wrap call for.
 */
export class FileProviderEnrichmentResumeService {
  private resumePromise: Promise<void> | null = null
  private rerunRequested = false
  /** Keyset cursor (files.id) shared by every round; see the class comment. */
  private cursor = 0
  private lastRoundEndedAt: number | null = null
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly deps: FileProviderEnrichmentResumeServiceDeps) {}

  resume(reason: string): void {
    if (this.deps.isShuttingDown()) return
    if (this.resumePromise) {
      // A pass is already running. Rows it marks pending (or a change event's
      // deferred overflow) must not wait for an unrelated future drain, so
      // remember the request and run one more pass after the cooldown.
      this.rerunRequested = true
      return
    }
    // The pending follow-up already covers every request made during the cooldown.
    if (this.cooldownTimer) return
    // Capped at one cooldown: `lastRoundEndedAt` is wall-clock time, and a clock set back after
    // the round ended would otherwise hold recovery for as long as the clock moved.
    const cooldownRemainingMs =
      this.lastRoundEndedAt === null
        ? 0
        : Math.min(
            ENRICHMENT_RESUME_ROUND_COOLDOWN_MS,
            this.lastRoundEndedAt + ENRICHMENT_RESUME_ROUND_COOLDOWN_MS - Date.now()
          )
    if (cooldownRemainingMs > 0) {
      this.scheduleFollowUp(cooldownRemainingMs, reason)
      return
    }
    this.startRound(reason)
  }

  private startRound(reason: string): void {
    const run: Promise<void> = this.run(reason)
      .catch((error): ResumeRoundOutcome => {
        this.deps.logWarn('Deferred file enrichment recovery paused', error, { reason })
        return 'paused'
      })
      .then((outcome) => {
        if (this.resumePromise === run) this.resumePromise = null
        this.lastRoundEndedAt = Date.now()
        // The round's own publications do not call resume
        // (FileProvider.drainIndexedSourceMutations), so a paused or partial
        // pass would otherwise wait for some unrelated mutation.
        const followUp = this.rerunRequested || outcome === 'paused' || outcome === 'wrapped'
        this.rerunRequested = false
        if (followUp && !this.deps.isShuttingDown()) {
          this.scheduleFollowUp(ENRICHMENT_RESUME_ROUND_COOLDOWN_MS, 'follow-up')
        }
      })
    this.resumePromise = run
  }

  /** Arms the single cooldown timer; while it is pending, further requests add nothing. */
  private scheduleFollowUp(delayMs: number, reason: string): void {
    if (this.cooldownTimer) return
    const timer = setTimeout(() => {
      this.cooldownTimer = null
      if (this.deps.isShuttingDown()) return
      if (this.resumePromise) {
        this.rerunRequested = true
        return
      }
      this.startRound(reason)
    }, delayMs)
    // Background recovery must never keep the process alive.
    timer.unref?.()
    this.cooldownTimer = timer
  }

  private async run(reason: string): Promise<ResumeRoundOutcome> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils || !this.deps.isSearchIndexAvailable()) return 'stopped'

    const label = `enrichment-resume.${reason}`
    const startedAt = this.cursor
    let outcome: ResumeRoundOutcome = 'stopped'
    let scheduled = 0
    let noAdmitRounds = 0
    let failedPages = 0
    // Ids of a partially admitted page whose dispatch failed; see the loop below.
    let failedPageIds: number[] | null = null
    while (!this.deps.isShuttingDown()) {
      const rows = await dbUtils
        .getFileIndexReadDb()
        .select({
          id: filesSchema.id,
          path: filesSchema.path,
          name: filesSchema.name,
          displayName: filesSchema.displayName,
          extension: filesSchema.extension,
          size: filesSchema.size,
          mtime: filesSchema.mtime,
          ctime: filesSchema.ctime
        })
        .from(filesSchema)
        .leftJoin(fileIndexProgress, eq(fileIndexProgress.fileId, filesSchema.id))
        .where(
          and(
            eq(filesSchema.type, 'file'),
            gt(filesSchema.id, this.cursor),
            or(
              isNull(fileIndexProgress.fileId),
              inArray(fileIndexProgress.status, ['pending', 'processing'])
            )
          )
        )
        .orderBy(filesSchema.id)
        .limit(RESUME_BATCH_SIZE)

      if (rows.length === 0) {
        // End of the table. The next round starts from the beginning; a round
        // that began mid-table has not visited the rows before its start yet.
        this.cursor = 0
        outcome = startedAt > 0 ? 'wrapped' : 'completed'
        break
      }

      if (failedPageIds && isSamePage(rows, failedPageIds)) {
        // The failed dispatch left every row of this page pending: a worker that
        // died, not per-file failures (those are terminal). Offering the page
        // again would fail again, so step past it; its rows stay pending and the
        // pass after the wrap retries them.
        this.cursor = rows[rows.length - 1]!.id
        failedPageIds = null
        await this.deps.yieldToEventLoop()
        continue
      }
      failedPageIds = null

      const { result, dispatchFailed } = await this.deps.withMutationLease(async (leaseId) => {
        // A successor scan/reset must not hold the gate while waiting for this
        // page's publication to acquire it. Own one lease for the entire page.
        const result = await this.deps.scheduleIndexing(rows, label, leaseId)
        const dispatchFailed = await this.drainPage(label, leaseId)
        return { result, dispatchFailed }
      })
      if (dispatchFailed) failedPages += 1

      if (result.accepted + result.deferred === 0) {
        // Nothing schedulable (provider closed or index unavailable): stop.
        break
      }

      if (result.deferred > 0) {
        scheduled += result.accepted
        noAdmitRounds = result.accepted === 0 ? noAdmitRounds + 1 : 0
        if (noAdmitRounds >= MAX_CONSECUTIVE_NO_ADMIT_ROUNDS) {
          this.deps.logWarn('Deferred file enrichment recovery paused', undefined, {
            reason,
            remaining: rows.length
          })
          outcome = 'paused'
          break
        }
        // Do not advance the cursor: the unadmitted suffix is still pending and is
        // re-queried once the admitted work above has drained.
        if (dispatchFailed) failedPageIds = rows.map((row) => row.id)
        await this.deps.yieldToEventLoop()
        continue
      }

      scheduled += result.accepted
      noAdmitRounds = 0
      // A fully admitted page is done even when a chunk failed (failed files are
      // terminal), so a failure moves the round on instead of ending it.
      this.cursor = rows[rows.length - 1]!.id
      await this.deps.yieldToEventLoop()
    }

    if (scheduled > 0) {
      this.deps.logInfo('Deferred file enrichment recovery completed', {
        reason,
        scheduled,
        ...(failedPages > 0 ? { failedPages } : {})
      })
    }
    return outcome
  }

  /**
   * Waits for the page's admitted work. A failed chunk surfaces as the
   * scheduler's dispatch-failed error as soon as the scheduler is idle; that is
   * a failed page, not a failed round, so settle the page's flush and move on.
   * Any other error (a drain timeout) still ends the round.
   */
  private async drainPage(label: string, mutationLeaseId: string): Promise<boolean> {
    try {
      await this.deps.waitForSearchIndexDrain(label, mutationLeaseId)
      return false
    } catch (error) {
      if (!isSchedulerDispatchFailure(error)) throw error
    }
    try {
      await this.deps.waitForSearchIndexDrain(label, mutationLeaseId)
    } catch (error) {
      if (!isSchedulerDispatchFailure(error)) throw error
    }
    return true
  }
}

function isSchedulerDispatchFailure(error: unknown): boolean {
  return error instanceof Error && error.message === SCHEDULER_DISPATCH_FAILED
}

function isSamePage(rows: ReadonlyArray<{ id: number }>, ids: readonly number[]): boolean {
  return rows.length === ids.length && rows.every((row, index) => row.id === ids[index])
}
