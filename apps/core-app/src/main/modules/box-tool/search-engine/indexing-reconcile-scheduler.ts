import type {
  IndexedSource,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult
} from '@talex-touch/utils/search'
import type { ReconcileEngine, ReconcileEngineBatchResult } from './indexing-reconcile-engine'
import type {
  IndexedSourceRuntimeTaskJob,
  IndexedSourceRuntimeTaskJobFactory
} from './indexing-runtime-task-job'
import { IndexedSourceTaskRunGate } from '@talex-touch/utils/search'
import { IndexedSourceRuntimeTaskJobFactory as DefaultRuntimeTaskJobFactory } from './indexing-runtime-task-job'

export interface ReconcileSchedulerJob extends IndexedSourceRuntimeTaskJob {
  reason?: string
  rootCount: number
  startedAt?: number
  completedAt?: number
  status: 'queued' | 'running' | 'completed' | 'failed'
  error?: string
}

export interface ReconcileSchedulerResult {
  job: ReconcileSchedulerJob
  result: IndexedSourceReconcileResult
}

export class ReconcileScheduler {
  private readonly runGate: IndexedSourceTaskRunGate

  constructor(
    private readonly engine: ReconcileEngine,
    private readonly jobFactory: IndexedSourceRuntimeTaskJobFactory = new DefaultRuntimeTaskJobFactory(),
    runGate?: IndexedSourceTaskRunGate
  ) {
    this.runGate = runGate ?? new IndexedSourceTaskRunGate()
  }

  isRunning(sourceId: string): boolean {
    return this.runGate.isRunning(sourceId, 'reconcile')
  }

  async reconcileSource(
    source: IndexedSource,
    request: Partial<IndexedSourceReconcileRequest> = {}
  ): Promise<ReconcileSchedulerResult> {
    const sourceId = source.descriptor.id
    const decision = this.runGate.canStart(sourceId, 'reconcile')
    if (!decision.allowed) {
      throw new Error(`Indexed source '${sourceId}' reconcile is already running`)
    }

    const job: ReconcileSchedulerJob = {
      ...this.jobFactory.create(sourceId, 'reconcile'),
      reason: request.reason,
      rootCount: request.roots?.length ?? 0,
      status: 'queued'
    }

    job.status = 'running'
    job.startedAt = Date.now()
    this.runGate.start(sourceId, 'reconcile', job.startedAt)

    try {
      const result = await this.engine.reconcileSource(source, request)
      job.status = 'completed'
      job.completedAt = Date.now()
      return { job, result }
    } catch (error) {
      job.status = 'failed'
      job.completedAt = Date.now()
      job.error = this.stringifyError(error)
      throw error
    } finally {
      this.runGate.complete(sourceId, 'reconcile')
    }
  }

  async reconcileSourcesWithResult(sources: IndexedSource[]): Promise<ReconcileEngineBatchResult> {
    const startedAt = Date.now()
    const settled = await Promise.all(
      sources.map(async (source) => {
        try {
          return {
            status: 'fulfilled' as const,
            result: await this.reconcileSource(source)
          }
        } catch (error) {
          return {
            status: 'rejected' as const,
            sourceId: source.descriptor.id,
            error
          }
        }
      })
    )
    const results: IndexedSourceReconcileResult[] = []
    const errors: Array<{ sourceId: string; message: string }> = []

    for (const item of settled) {
      if (item.status === 'fulfilled') {
        results.push(item.result.result)
        continue
      }
      errors.push({
        sourceId: item.sourceId,
        message: this.stringifyError(item.error)
      })
    }

    return {
      results,
      totalSources: sources.length,
      reconciledSources: results.length,
      failedSources: errors.length,
      skippedSources: 0,
      added: results.reduce((sum, result) => sum + result.added, 0),
      changed: results.reduce((sum, result) => sum + result.changed, 0),
      deleted: results.reduce((sum, result) => sum + result.deleted, 0),
      skipped: results.reduce((sum, result) => sum + result.skipped, 0),
      errors: results.reduce((sum, result) => sum + result.errors, 0),
      failures: errors,
      skippedDetails: [],
      startedAt,
      completedAt: Date.now()
    }
  }

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
