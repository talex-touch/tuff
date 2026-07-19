import type {
  IndexedSource,
  IndexedSourceDelta,
  IndexedSourceRecordBatch,
  IndexedSourceDescriptor,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult,
  IndexedSourceResetRequest,
  IndexedSourceResetResult,
  IndexedSourceScanReason,
  IndexedSourceScanRequest,
  IndexedSourceTaskHistoryEntry,
  IndexedSourceTaskHistoryKind,
  IndexedSourceTaskKind,
  IndexedSourceRuntimeTaskState,
  IndexedSourceWatchEvent
} from '@talex-touch/utils/search'
import type {
  IndexingRuntimeDiagnostics,
  IndexingRuntimeSourceDiagnostics
} from './indexing-diagnostics-service'
import type {
  ReconcileEngineBatchResult,
  ReconcileEngineSkippedSource
} from './indexing-reconcile-engine'
import type { ReconcileScheduler, ReconcileSchedulerJob } from './indexing-reconcile-scheduler'
import type { IndexingRootPolicy } from './indexing-root-policy'
import type { IndexedSourceRuntimeTaskJob } from './indexing-runtime-task-job'
import type {
  ScanSchedulerBatchResult,
  ScanSchedulerResult,
  ScanSchedulerSkippedSource
} from './indexing-scan-scheduler'
import type {
  IndexStoreAdapter,
  IndexStoreBatchApplySummary,
  IndexStoreCleanupSourceSummary,
  IndexStoreDeltaApplySummary
} from './indexing-store-adapter'
import type { SearchIndexWriterMode } from './search-index-writer'
import type { IndexingTaskStateStore } from './indexing-task-state-store'
import type { WatchEventRouteResult } from './indexing-watch-router'
import { getLogger } from '@talex-touch/utils/common/logger'
import {
  DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT,
  buildIndexedSourceReconcileTaskState,
  buildIndexedSourceResetTaskState,
  buildIndexedSourceScanTaskState,
  buildIndexedSourceWatchTaskState,
  getIndexedSourceContractIssues,
  IndexedSourceResetReasons,
  IndexedSourceScanReasons,
  IndexedSourceTaskRunGate,
  resolveIndexedSourceTaskEligibility,
  resolveIndexedSourceTaskRetryDecision,
  updateIndexedSourceTaskState
} from '@talex-touch/utils/search'
import { SourceDiagnosticsService } from './indexing-diagnostics-service'
import { ReconcileEngine } from './indexing-reconcile-engine'
import { ReconcileScheduler as DefaultReconcileScheduler } from './indexing-reconcile-scheduler'
import { indexingRootPolicy } from './indexing-root-policy'
import { IndexedSourceRuntimeTaskJobFactory } from './indexing-runtime-task-job'
import { ScanScheduler } from './indexing-scan-scheduler'
import { NoopIndexStoreAdapter } from './indexing-store-adapter'
import { IndexingSourceMutationGate } from './indexing-source-mutation-gate'
import { MemoryIndexingTaskStateStore } from './indexing-task-state-store'
import { WatchEventRouter } from './indexing-watch-router'

const indexingRuntimeLog = getLogger('indexing-runtime')
export interface IndexingRuntimeOptions {
  store?: IndexStoreAdapter
  diagnosticsService?: SourceDiagnosticsService
  watchRouter?: WatchEventRouter
  scanScheduler?: ScanScheduler
  reconcileEngine?: ReconcileEngine
  reconcileScheduler?: ReconcileScheduler
  jobFactory?: IndexedSourceRuntimeTaskJobFactory
  runGate?: IndexedSourceTaskRunGate
  rootPolicy?: IndexingRootPolicy
  taskStateStore?: IndexingTaskStateStore
  sourceMutationGate?: IndexingSourceMutationGate
}

export type { IndexingRuntimeDiagnostics, IndexingRuntimeSourceDiagnostics }

interface RuntimeEligibleSources {
  sources: IndexedSource[]
  skipped: Array<{
    sourceId: string
    reason: string
  }>
}

type RuntimeTaskRetryKind = 'scan' | 'reconcile'

export interface IndexingRuntimeSourceWriterRouter {
  getMode(sourceId: string): SearchIndexWriterMode
  setMode(sourceId: string, mode: SearchIndexWriterMode): void
  drainSelected(sourceId: string, timeoutMs?: number): Promise<void>
}

export interface IndexingSourceWriterSwitchResult {
  sourceId: string
  previousMode: SearchIndexWriterMode
  mode: SearchIndexWriterMode
  epoch: number
  snapshot: ScanSchedulerResult
}

interface IndexingSourceSnapshotRebuildResult {
  clearedSearchIndexRows: number
  snapshot: ScanSchedulerResult
}
interface ActiveIndexedSourceScan {
  controller: AbortController
  completion: Promise<void>
  resolveCompletion: () => void
}

export class IndexingRuntime {
  private readonly sourceMutationGate: IndexingSourceMutationGate
  private sourceWriterRouter: IndexingRuntimeSourceWriterRouter | null = null
  private readonly sources = new Map<string, IndexedSource>()
  private readonly taskState = new Map<string, IndexedSourceRuntimeTaskState>()
  private store: IndexStoreAdapter
  private readonly diagnosticsService: SourceDiagnosticsService
  private watchRouter: WatchEventRouter
  private scanScheduler: ScanScheduler
  private reconcileEngine: ReconcileEngine
  private reconcileScheduler: ReconcileScheduler
  private readonly jobFactory: IndexedSourceRuntimeTaskJobFactory
  private readonly runGate: IndexedSourceTaskRunGate
  private readonly rootPolicy: IndexingRootPolicy
  private taskStateStore: IndexingTaskStateStore
  private readonly activeScans = new Map<string, Set<ActiveIndexedSourceScan>>()
  private taskAdmissionClosed = false
  private activeAdmittedTasks = 0
  private readonly admittedTaskIdleWaiters = new Set<() => void>()

  constructor(options: IndexingRuntimeOptions = {}) {
    this.jobFactory = options.jobFactory ?? new IndexedSourceRuntimeTaskJobFactory()
    this.runGate = options.runGate ?? new IndexedSourceTaskRunGate()
    this.store = options.store ?? new NoopIndexStoreAdapter()
    this.sourceMutationGate = options.sourceMutationGate ?? new IndexingSourceMutationGate()
    this.diagnosticsService = options.diagnosticsService ?? new SourceDiagnosticsService()
    this.watchRouter =
      options.watchRouter ?? new WatchEventRouter(this.store, this.sourceMutationGate)
    this.scanScheduler =
      options.scanScheduler ?? new ScanScheduler(this.store, this.runGate, this.sourceMutationGate)
    this.reconcileEngine =
      options.reconcileEngine ?? new ReconcileEngine(this.store, this.sourceMutationGate)
    this.reconcileScheduler =
      options.reconcileScheduler ??
      new DefaultReconcileScheduler(this.reconcileEngine, this.jobFactory, this.runGate)
    this.rootPolicy = options.rootPolicy ?? indexingRootPolicy
    this.taskStateStore = options.taskStateStore ?? new MemoryIndexingTaskStateStore()
  }

  beginShutdown(): void {
    this.taskAdmissionClosed = true
  }

  async drainAdmittedTasks(timeoutMs = 10_000): Promise<void> {
    if (this.activeAdmittedTasks === 0) return

    await new Promise<void>((resolve, reject) => {
      const waiter = (): void => {
        clearTimeout(timeout)
        this.admittedTaskIdleWaiters.delete(waiter)
        resolve()
      }
      const timeout = setTimeout(() => {
        this.admittedTaskIdleWaiters.delete(waiter)
        reject(new Error('INDEXING_RUNTIME_TASK_DRAIN_TIMEOUT'))
      }, timeoutMs)
      timeout.unref?.()
      this.admittedTaskIdleWaiters.add(waiter)
    })
  }

  private async runAdmittedTask<T>(operation: () => Promise<T>): Promise<T> {
    if (this.taskAdmissionClosed) throw new Error('INDEXING_RUNTIME_SHUTTING_DOWN')

    this.activeAdmittedTasks += 1
    try {
      return await operation()
    } finally {
      this.activeAdmittedTasks -= 1
      if (this.activeAdmittedTasks === 0) {
        for (const resolve of [...this.admittedTaskIdleWaiters]) resolve()
      }
    }
  }

  registerSource(source: IndexedSource): boolean {
    const sourceId = source.descriptor.id
    if (this.sources.has(sourceId)) {
      indexingRuntimeLog.warn(`Indexed source '${sourceId}' is already registered`)
      return false
    }

    const contractIssues = getIndexedSourceContractIssues(source)
    if (contractIssues.admission.length > 0) {
      indexingRuntimeLog.warn(`Indexed source '${sourceId}' has admission contract issues`, {
        meta: {
          issues: contractIssues.admission.join(', ')
        }
      })
    }

    if (contractIssues.lifecycle.length > 0) {
      indexingRuntimeLog.warn(`Indexed source '${sourceId}' has lifecycle contract issues`, {
        meta: {
          issues: contractIssues.lifecycle.join(', ')
        }
      })
    }

    this.sources.set(sourceId, source)
    indexingRuntimeLog.info(`Indexed source '${sourceId}' registered`, {
      meta: {
        kind: source.descriptor.kind,
        priority: source.descriptor.priority,
        storage: source.descriptor.storage
      }
    })
    return true
  }

  unregisterSource(sourceId: string): boolean {
    const deleted = this.sources.delete(sourceId)
    if (deleted) {
      this.taskState.delete(sourceId)
      void this.taskStateStore.delete(sourceId).catch((error) => {
        indexingRuntimeLog.warn(`Failed to delete indexed source task state '${sourceId}'`, {
          error
        })
      })
      this.rootPolicy.clearSource(sourceId)
      indexingRuntimeLog.info(`Indexed source '${sourceId}' unregistered`)
    }
    return deleted
  }

  getSource(sourceId: string): IndexedSource | undefined {
    return this.sources.get(sourceId)
  }

  listSources(): IndexedSource[] {
    return Array.from(this.sources.values())
  }

  listDescriptors(): IndexedSourceDescriptor[] {
    return this.listSources().map((source) => source.descriptor)
  }

  setStore(store: IndexStoreAdapter): void {
    this.store = store
    this.watchRouter = new WatchEventRouter(this.store, this.sourceMutationGate)
    this.scanScheduler = new ScanScheduler(this.store, this.runGate, this.sourceMutationGate)
    this.reconcileEngine = new ReconcileEngine(this.store, this.sourceMutationGate)
    this.reconcileScheduler = new DefaultReconcileScheduler(
      this.reconcileEngine,
      this.jobFactory,
      this.runGate
    )
  }

  setSourceWriterRouter(router: IndexingRuntimeSourceWriterRouter): void {
    this.sourceWriterRouter = router
  }

  async applySourceBatch(
    batch: IndexedSourceRecordBatch
  ): Promise<IndexStoreBatchApplySummary | void> {
    const source = this.requireSource(batch.sourceId)
    if (batch.mutationLeaseId) {
      return await this.sourceMutationGate.runWithinLease(
        batch.sourceId,
        batch.mutationLeaseId,
        async () => await this.store.applyBatch(batch)
      )
    }
    return await this.sourceMutationGate.run(batch.sourceId, async (lease) => {
      try {
        const summary = await this.store.applyBatch({ ...batch, mutationLeaseId: lease.id })
        if (source.drainMutations) {
          await source.drainMutations({ leaseId: lease.id, reason: 'mutation' })
        }
        return summary
      } catch (error) {
        await source
          .drainMutations?.({ leaseId: lease.id, reason: 'mutation' })
          .catch(() => undefined)
        throw error
      }
    })
  }

  async applySourceDelta(delta: IndexedSourceDelta): Promise<IndexStoreDeltaApplySummary | void> {
    const source = this.requireSource(delta.sourceId)
    if (delta.mutationLeaseId) {
      return await this.sourceMutationGate.runWithinLease(
        delta.sourceId,
        delta.mutationLeaseId,
        async () => await this.store.applyDelta(delta)
      )
    }
    return await this.sourceMutationGate.run(delta.sourceId, async (lease) => {
      try {
        const summary = await this.store.applyDelta({ ...delta, mutationLeaseId: lease.id })
        if (source.drainMutations) {
          await source.drainMutations({ leaseId: lease.id, reason: 'mutation' })
        }
        return summary
      } catch (error) {
        await source
          .drainMutations?.({ leaseId: lease.id, reason: 'mutation' })
          .catch(() => undefined)
        throw error
      }
    })
  }

  async cleanupSource(
    sourceId: string,
    mutationLeaseId?: string
  ): Promise<IndexStoreCleanupSourceSummary | void> {
    this.requireSource(sourceId)
    const operation = async (): Promise<IndexStoreCleanupSourceSummary | void> =>
      await this.store.cleanupSource(sourceId)
    return mutationLeaseId
      ? await this.sourceMutationGate.runWithinLease(sourceId, mutationLeaseId, operation)
      : await this.sourceMutationGate.run(sourceId, operation)
  }

  async countSource(sourceId: string, mutationLeaseId?: string): Promise<number> {
    this.requireSource(sourceId)
    const operation = async (): Promise<number> => await this.store.countSource(sourceId)
    return mutationLeaseId
      ? await this.sourceMutationGate.runWithinLease(sourceId, mutationLeaseId, operation)
      : await this.sourceMutationGate.run(sourceId, operation)
  }

  async drainSourceMutations(sourceId: string, timeoutMs = 10_000): Promise<void> {
    this.requireSource(sourceId)
    await this.sourceMutationGate.runExclusive(sourceId, async () => undefined, timeoutMs)
  }

  async abortAndDrainSourceScans(sourceId: string, timeoutMs = 10_000): Promise<void> {
    const active = [...(this.activeScans.get(sourceId) ?? [])]
    if (active.length === 0) return
    for (const scan of active) {
      scan.controller.abort(new Error(`INDEXED_SOURCE_SCAN_ABORTED:${sourceId}`))
    }

    const settlement = Promise.allSettled(active.map((scan) => scan.completion))
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`INDEXED_SOURCE_SCAN_DRAIN_TIMEOUT:${sourceId}`))
      }, timeoutMs)
      timeout.unref?.()
      void settlement.then(() => {
        clearTimeout(timeout)
        resolve()
      })
    })
  }

  async switchSourceWriter(
    sourceId: string,
    mode: SearchIndexWriterMode,
    timeoutMs = 10_000
  ): Promise<IndexingSourceWriterSwitchResult> {
    return await this.runAdmittedTask(
      async () => await this.switchSourceWriterInternal(sourceId, mode, timeoutMs)
    )
  }

  private async switchSourceWriterInternal(
    sourceId: string,
    mode: SearchIndexWriterMode,
    timeoutMs = 10_000
  ): Promise<IndexingSourceWriterSwitchResult> {
    const source = this.requireSource(sourceId)
    const router = this.sourceWriterRouter
    if (!router) {
      throw new Error('INDEXING_SOURCE_WRITER_ROUTER_UNAVAILABLE')
    }

    const startedAt = Date.now()
    const job = this.createScanJob(sourceId)
    return await this.sourceMutationGate.runExclusive(
      sourceId,
      async (lease) => {
        const previousMode = router.getMode(sourceId)
        try {
          await router.drainSelected(sourceId, timeoutMs)
          router.setMode(sourceId, mode)
          const rebuild = await this.rebuildSourceFromSnapshot(source)
          await router.drainSelected(sourceId, timeoutMs)
          await this.recordScanResult(
            rebuild.snapshot,
            job,
            IndexedSourceScanReasons.SchemaMigration
          )
          return {
            sourceId,
            previousMode,
            mode,
            epoch: lease.epoch,
            snapshot: rebuild.snapshot
          }
        } catch (error) {
          router.setMode(sourceId, previousMode)
          await this.recordScanFailure(
            sourceId,
            startedAt,
            Date.now(),
            error instanceof Error ? error.message : String(error),
            job,
            {
              trigger: IndexedSourceScanReasons.SchemaMigration,
              errorCode: 'source-writer-switch'
            }
          )
          throw error
        }
      },
      timeoutMs
    )
  }

  private async rebuildSourceFromSnapshot(
    source: IndexedSource,
    onClear?: (removedIndexedItems: number) => void
  ): Promise<IndexingSourceSnapshotRebuildResult> {
    const replacement = await this.scanScheduler.replaceSourceFromSnapshotWithinLease(
      source,
      IndexedSourceScanReasons.SchemaMigration
    )
    onClear?.(replacement.removedIndexedItems)
    return {
      clearedSearchIndexRows: replacement.removedIndexedItems,
      snapshot: replacement.snapshot
    }
  }

  setTaskStateStore(taskStateStore: IndexingTaskStateStore): void {
    this.taskStateStore = taskStateStore
    this.taskState.clear()
  }

  async getDiagnostics(): Promise<IndexingRuntimeDiagnostics> {
    const diagnostics = await this.diagnosticsService.getDiagnostics(this.listSources())
    await this.applyTaskState(diagnostics)
    this.applyTaskRunGateState(diagnostics)
    this.updateRootPolicy(diagnostics)
    return diagnostics
  }

  async refreshRootPolicy(): Promise<void> {
    const diagnostics = await this.getDiagnostics()
    this.updateRootPolicy(diagnostics)
  }

  async routeWatchEvent(event: IndexedSourceWatchEvent): Promise<IndexedSourceDelta[]> {
    const result = await this.routeWatchEventWithResult(event)
    return result.deltas
  }

  async routeWatchEventWithResult(event: IndexedSourceWatchEvent): Promise<WatchEventRouteResult> {
    return await this.runAdmittedTask(
      async () => await this.routeWatchEventWithResultInternal(event)
    )
  }

  private async routeWatchEventWithResultInternal(
    event: IndexedSourceWatchEvent
  ): Promise<WatchEventRouteResult> {
    const queuedAt = Date.now()
    const diagnostics = await this.getDiagnostics()
    const result = await this.watchRouter.routeWithResult(event, this.sources, diagnostics)
    await this.recordWatchResult(event, result, queuedAt)
    return result
  }

  async scanSource(
    sourceId: string,
    reason: IndexedSourceScanReason,
    request: Partial<IndexedSourceScanRequest> = {}
  ): Promise<ScanSchedulerResult> {
    return await this.runAdmittedTask(
      async () => await this.scanSourceInternal(sourceId, reason, request)
    )
  }

  private async scanSourceInternal(
    sourceId: string,
    reason: IndexedSourceScanReason,
    request: Partial<IndexedSourceScanRequest> = {}
  ): Promise<ScanSchedulerResult> {
    const source = this.requireSource(sourceId)
    const job = this.createScanJob(sourceId)
    const controller = new AbortController()
    const completion = Promise.withResolvers<void>()
    const activeScan: ActiveIndexedSourceScan = {
      controller,
      completion: completion.promise,
      resolveCompletion: completion.resolve
    }
    const activeForSource = this.activeScans.get(sourceId) ?? new Set<ActiveIndexedSourceScan>()
    activeForSource.add(activeScan)
    this.activeScans.set(sourceId, activeForSource)
    const externalSignal = request.signal
    const abortFromExternalSignal = (): void => {
      controller.abort(externalSignal?.reason)
    }
    let activeScanReleased = false
    const releaseActiveScan = (): void => {
      if (activeScanReleased) return
      activeScanReleased = true
      externalSignal?.removeEventListener('abort', abortFromExternalSignal)
      activeForSource.delete(activeScan)
      if (activeForSource.size === 0) this.activeScans.delete(sourceId)
      activeScan.resolveCompletion()
    }
    if (externalSignal?.aborted) {
      abortFromExternalSignal()
    } else {
      externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true })
    }
    const diagnostics = await this.getSourceDiagnostics(sourceId).catch((error) => {
      releaseActiveScan()
      throw error
    })
    const eligibility = resolveIndexedSourceTaskEligibility({
      descriptor: source.descriptor,
      health: diagnostics?.health,
      task: 'scan'
    })
    if (!eligibility.eligible) {
      try {
        const timestamp = Date.now()
        const reason = eligibility.reason ?? 'diagnostics:unavailable'
        await this.recordScanSkipped(sourceId, job.queuedAt, timestamp, reason, job, {
          trigger: request.reason ?? reason,
          errorCode: 'eligibility'
        })
        return {
          sourceId,
          batches: 0,
          records: 0,
          indexedRecords: 0,
          startedAt: job.queuedAt,
          completedAt: timestamp
        }
      } finally {
        releaseActiveScan()
      }
    }

    try {
      const result =
        reason === IndexedSourceScanReasons.ManualRebuild
          ? await this.sourceMutationGate.run(sourceId, async (lease) => {
              const replacement = await this.scanScheduler.replaceSourceFromSnapshotWithinLease(
                source,
                reason,
                { ...request, signal: controller.signal },
                lease
              )
              return replacement.snapshot
            })
          : await this.scanScheduler.scanSource(source, reason, {
              ...request,
              signal: controller.signal
            })
      await this.recordScanResult(result, job, reason, request.reason ?? reason)
      return result
    } catch (error) {
      await this.recordScanFailure(
        sourceId,
        job.queuedAt,
        Date.now(),
        error instanceof Error ? error.message : String(error),
        job,
        {
          reason,
          trigger: request.reason ?? reason,
          errorCode: 'runtime'
        }
      )
      throw error
    } finally {
      releaseActiveScan()
    }
  }

  async scanSources(reason: IndexedSourceScanReason): Promise<ScanSchedulerResult[]> {
    const result = await this.scanSourcesWithResult(reason)
    return result.results
  }

  async scanSourcesWithResult(reason: IndexedSourceScanReason): Promise<ScanSchedulerBatchResult> {
    return await this.runAdmittedTask(async () => await this.scanSourcesWithResultInternal(reason))
  }

  private async scanSourcesWithResultInternal(
    reason: IndexedSourceScanReason
  ): Promise<ScanSchedulerBatchResult> {
    const allSources = this.listSources()
    const diagnostics = await this.getDiagnostics()
    const eligible = this.filterAutomaticEligibleSources(
      this.getEligibleSources(allSources, diagnostics, 'scan'),
      diagnostics,
      'scan'
    )
    const jobs = new Map<string, IndexedSourceRuntimeTaskJob>()
    for (const source of eligible.sources) {
      jobs.set(source.descriptor.id, this.createScanJob(source.descriptor.id))
    }
    const result = await this.scanScheduler.scanSourcesWithResult(eligible.sources, reason)
    const enrichedResult = this.withScanSkippedSources(result, allSources.length, eligible.skipped)
    for (const sourceResult of result.results) {
      await this.recordScanResult(sourceResult, jobs.get(sourceResult.sourceId), reason, reason)
    }
    for (const failure of result.errors) {
      await this.recordScanFailure(
        failure.sourceId,
        result.startedAt,
        result.completedAt,
        failure.message,
        jobs.get(failure.sourceId),
        {
          reason,
          phase: failure.phase,
          batches: failure.batches,
          records: failure.records,
          indexedRecords: failure.indexedRecords,
          trigger: reason,
          errorCode: failure.phase
        }
      )
    }
    for (const skipped of eligible.skipped) {
      await this.recordScanSkipped(
        skipped.sourceId,
        result.startedAt,
        result.completedAt,
        skipped.reason,
        this.createScanJob(skipped.sourceId),
        {
          trigger: reason,
          errorCode: 'eligibility'
        }
      )
    }
    return enrichedResult
  }

  async reconcileSource(
    sourceId: string,
    request: Partial<IndexedSourceReconcileRequest> = {}
  ): Promise<IndexedSourceReconcileResult> {
    return await this.runAdmittedTask(
      async () => await this.reconcileSourceInternal(sourceId, request)
    )
  }

  private async reconcileSourceInternal(
    sourceId: string,
    request: Partial<IndexedSourceReconcileRequest> = {}
  ): Promise<IndexedSourceReconcileResult> {
    const source = this.requireSource(sourceId)
    const diagnostics = await this.getSourceDiagnostics(sourceId)
    const eligibility = resolveIndexedSourceTaskEligibility({
      descriptor: source.descriptor,
      health: diagnostics?.health,
      task: 'reconcile'
    })
    if (!eligibility.eligible) {
      const timestamp = Date.now()
      const reason = eligibility.reason ?? 'diagnostics:unavailable'
      await this.recordReconcileSkipped(sourceId, timestamp, timestamp, reason, {
        trigger: request.reason ?? reason,
        errorCode: 'eligibility'
      })
      return {
        sourceId,
        added: 0,
        changed: 0,
        deleted: 0,
        skipped: 1,
        errors: 0,
        startedAt: timestamp,
        completedAt: timestamp,
        reason
      }
    }

    const { job, result } = await this.reconcileScheduler.reconcileSource(source, request)
    await this.recordReconcileResult(result, request, job)
    return result
  }

  async reconcileSources(): Promise<IndexedSourceReconcileResult[]> {
    const result = await this.reconcileSourcesWithResult()
    return result.results
  }

  async reconcileSourcesWithResult(): Promise<ReconcileEngineBatchResult> {
    return await this.runAdmittedTask(async () => await this.reconcileSourcesWithResultInternal())
  }

  private async reconcileSourcesWithResultInternal(): Promise<ReconcileEngineBatchResult> {
    const allSources = this.listSources()
    const diagnostics = await this.getDiagnostics()
    const eligible = this.filterAutomaticEligibleSources(
      this.getEligibleSources(allSources, diagnostics, 'reconcile'),
      diagnostics,
      'reconcile'
    )
    const result = await this.reconcileScheduler.reconcileSourcesWithResult(eligible.sources)
    const enrichedResult = this.withReconcileSkippedSources(
      result,
      allSources.length,
      eligible.skipped
    )
    for (const sourceResult of result.results) {
      await this.recordReconcileResult(sourceResult)
    }
    for (const failure of result.failures) {
      await this.recordReconcileFailure(
        failure.sourceId,
        result.startedAt,
        result.completedAt,
        failure.message,
        {
          errorCode: 'runtime'
        }
      )
    }
    for (const skipped of eligible.skipped) {
      await this.recordReconcileSkipped(
        skipped.sourceId,
        result.startedAt,
        result.completedAt,
        skipped.reason,
        {
          errorCode: 'eligibility'
        }
      )
    }
    return enrichedResult
  }

  async resetSourceRuntimeState(
    sourceId: string,
    request: Partial<IndexedSourceResetRequest> = {}
  ): Promise<IndexedSourceResetResult> {
    return await this.runAdmittedTask(
      async () => await this.resetSourceRuntimeStateInternal(sourceId, request)
    )
  }

  private async resetSourceRuntimeStateInternal(
    sourceId: string,
    request: Partial<IndexedSourceResetRequest> = {}
  ): Promise<IndexedSourceResetResult> {
    const source = this.requireSource(sourceId)
    const startedAt = Date.now()
    const reason = request.reason ?? IndexedSourceResetReasons.HealthRepair
    const job = this.createTaskJob(sourceId, 'reset')
    await this.loadTaskState(sourceId)
    const decision = this.runGate.canStart(sourceId, 'reset')
    if (!decision.allowed) {
      const completedAt = Date.now()
      const result: IndexedSourceResetResult = {
        sourceId,
        reason,
        clearedSearchIndex: false,
        clearedScanProgress: false,
        startedAt,
        completedAt,
        error: `reset-${decision.reason}`
      }
      await this.recordResetResult(result, job, 'skipped', decision.reason)
      return result
    }

    const shouldClearSearchIndex = request.clearSearchIndex === true
    this.runGate.start(sourceId, 'reset', startedAt)

    try {
      const result = await this.sourceMutationGate.runExclusive(sourceId, async () => {
        if (!source.resetIndex && !shouldClearSearchIndex) {
          return {
            sourceId,
            reason,
            clearedSearchIndex: false,
            clearedScanProgress: false,
            startedAt,
            completedAt: Date.now(),
            error: 'reset-not-supported'
          }
        }
        const localResult = source.resetIndex
          ? await source.resetIndex({
              ...request,
              sourceId,
              reason,
              clearSearchIndex: false
            })
          : {
              sourceId,
              reason,
              clearedSearchIndex: false,
              clearedScanProgress: false,
              startedAt,
              completedAt: Date.now()
            }
        if (localResult.error || !shouldClearSearchIndex) {
          return localResult
        }

        let writerClearSucceeded = false
        let clearedSearchIndexRows = 0
        try {
          const rebuild = await this.rebuildSourceFromSnapshot(source, (rows) => {
            writerClearSucceeded = true
            clearedSearchIndexRows = rows
          })
          await this.recordScanResult(
            rebuild.snapshot,
            this.createScanJob(sourceId),
            IndexedSourceScanReasons.SchemaMigration
          )
          return {
            ...localResult,
            clearedSearchIndex: true,
            clearedSearchIndexRows:
              clearedSearchIndexRows + (localResult.clearedSearchIndexRows ?? 0),
            completedAt: Date.now()
          }
        } catch (error) {
          return {
            ...localResult,
            clearedSearchIndex: writerClearSucceeded || localResult.clearedSearchIndex,
            clearedSearchIndexRows:
              clearedSearchIndexRows + (localResult.clearedSearchIndexRows ?? 0),
            completedAt: Date.now(),
            error: error instanceof Error ? error.message : String(error)
          }
        }
      })
      await this.recordResetResult(
        result,
        job,
        result.error === 'reset-not-supported' ? 'skipped' : result.error ? 'failed' : undefined,
        result.error === 'reset-not-supported' ? 'not-supported' : undefined
      )
      return result
    } catch (error) {
      const result: IndexedSourceResetResult = {
        sourceId,
        reason,
        clearedSearchIndex: false,
        clearedScanProgress: false,
        startedAt,
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error)
      }
      await this.recordResetResult(result, job, 'failed')
      return result
    } finally {
      this.runGate.complete(sourceId, 'reset')
    }
  }

  private createScanJob(sourceId: string): IndexedSourceRuntimeTaskJob {
    return this.createTaskJob(sourceId, 'scan')
  }

  private createTaskJob(
    sourceId: string,
    kind: IndexedSourceRuntimeTaskJob['kind'],
    queuedAt?: number
  ): IndexedSourceRuntimeTaskJob {
    return this.jobFactory.create(sourceId, kind, queuedAt)
  }

  private requireSource(sourceId: string): IndexedSource {
    const source = this.sources.get(sourceId)
    if (!source) {
      throw new Error(`Indexed source '${sourceId}' is not registered`)
    }
    return source
  }

  private async getSourceDiagnostics(
    sourceId: string
  ): Promise<IndexingRuntimeSourceDiagnostics | undefined> {
    const diagnostics = await this.getDiagnostics()
    return diagnostics.sources.find((source) => source.descriptor.id === sourceId)
  }

  private getEligibleSources(
    sources: IndexedSource[],
    diagnostics: IndexingRuntimeDiagnostics,
    taskKind: IndexedSourceTaskKind
  ): RuntimeEligibleSources {
    const diagnosticsBySource = new Map(
      diagnostics.sources.map((source) => [source.descriptor.id, source])
    )
    const eligibleSources: IndexedSource[] = []
    const skipped: RuntimeEligibleSources['skipped'] = []

    for (const source of sources) {
      const skipReason = this.resolveTaskSkipReason(
        source,
        diagnosticsBySource.get(source.descriptor.id),
        taskKind
      )
      if (skipReason) {
        skipped.push({
          sourceId: source.descriptor.id,
          reason: skipReason
        })
        continue
      }

      eligibleSources.push(source)
    }

    return {
      sources: eligibleSources,
      skipped
    }
  }

  private resolveTaskSkipReason(
    source: IndexedSource,
    diagnostics: IndexingRuntimeSourceDiagnostics | undefined,
    taskKind: IndexedSourceTaskKind
  ): string | null {
    const eligibility = resolveIndexedSourceTaskEligibility({
      descriptor: source.descriptor,
      health: diagnostics?.health,
      task: taskKind
    })
    return eligibility.reason ?? null
  }

  private filterAutomaticEligibleSources(
    eligible: RuntimeEligibleSources,
    diagnostics: IndexingRuntimeDiagnostics,
    kind: RuntimeTaskRetryKind
  ): RuntimeEligibleSources {
    const diagnosticsBySource = new Map(
      diagnostics.sources.map((source) => [source.descriptor.id, source])
    )
    const sources: IndexedSource[] = []
    const skipped = [...eligible.skipped]

    for (const source of eligible.sources) {
      const sourceId = source.descriptor.id
      const retry = resolveIndexedSourceTaskRetryDecision(
        diagnosticsBySource.get(sourceId)?.recentTasks,
        kind
      )
      if (!retry.allowed) {
        skipped.push({
          sourceId,
          reason: `retry-window:${kind}:${retry.nextRetryAt ?? 'unknown'}`
        })
        continue
      }
      const runGate = this.runGate.canStart(sourceId, kind)
      if (!runGate.allowed) {
        skipped.push({
          sourceId,
          reason: `${kind}-${runGate.reason}`
        })
        continue
      }
      sources.push(source)
    }

    return {
      sources,
      skipped
    }
  }

  private withScanSkippedSources(
    result: ScanSchedulerBatchResult,
    totalSources: number,
    skipped: ScanSchedulerSkippedSource[]
  ): ScanSchedulerBatchResult {
    return {
      ...result,
      totalSources,
      skippedSources: skipped.length,
      skipped
    }
  }

  private withReconcileSkippedSources(
    result: ReconcileEngineBatchResult,
    totalSources: number,
    skippedDetails: ReconcileEngineSkippedSource[]
  ): ReconcileEngineBatchResult {
    return {
      ...result,
      totalSources,
      skippedSources: skippedDetails.length,
      skippedDetails
    }
  }

  clear(options: { clearTaskStateStore?: boolean } = {}): void {
    this.sources.clear()
    this.taskState.clear()
    this.runGate.clear()
    this.rootPolicy.clear()
    if (!options.clearTaskStateStore) return
    void this.taskStateStore.clear().catch((error) => {
      indexingRuntimeLog.warn('Failed to clear indexed source task state store', { error })
    })
  }

  private updateRootPolicy(diagnostics: IndexingRuntimeDiagnostics): void {
    for (const source of diagnostics.sources) {
      this.rootPolicy.setSourceRoots(source.descriptor.id, source.roots)
    }
  }

  private async applyTaskState(diagnostics: IndexingRuntimeDiagnostics): Promise<void> {
    for (const source of diagnostics.sources) {
      const state = await this.loadTaskState(source.descriptor.id)
      if (!state) continue
      const snapshot = cloneRuntimeTaskState(state)
      source.lastScan = snapshot.lastScan
      source.lastWatch = snapshot.lastWatch
      source.lastReconcile = snapshot.lastReconcile
      source.lastReset = snapshot.lastReset
      source.recentTasks = snapshot.recentTasks
    }
  }

  private applyTaskRunGateState(diagnostics: IndexingRuntimeDiagnostics): void {
    const snapshot = this.runGate.getSnapshot(diagnostics.generatedAt)
    diagnostics.taskRunGate = snapshot

    const entriesBySource = new Map<string, typeof snapshot.entries>()
    for (const entry of snapshot.entries) {
      const entries = entriesBySource.get(entry.sourceId) ?? []
      entries.push(entry)
      entriesBySource.set(entry.sourceId, entries)
    }

    for (const source of diagnostics.sources) {
      const entries = entriesBySource.get(source.descriptor.id)
      if (entries && entries.length > 0) {
        source.taskRunGate = entries
      }
    }
  }

  private ensureTaskState(sourceId: string): IndexedSourceRuntimeTaskState {
    const existing = this.taskState.get(sourceId)
    if (existing) return cloneRuntimeTaskState(existing)
    const next: IndexedSourceRuntimeTaskState = {}
    this.taskState.set(sourceId, next)
    return next
  }

  private async updateTaskState<
    TKey extends Exclude<keyof IndexedSourceRuntimeTaskState, 'recentTasks'>
  >(
    sourceId: string,
    key: TKey,
    value: NonNullable<IndexedSourceRuntimeTaskState[TKey]>,
    historyEntry: IndexedSourceTaskHistoryEntry
  ): Promise<void> {
    const next = updateIndexedSourceTaskState({
      state: this.ensureTaskState(sourceId),
      key,
      value,
      historyEntry,
      historyLimit: DEFAULT_INDEXED_SOURCE_TASK_HISTORY_LIMIT
    })
    this.taskState.set(sourceId, next)
    try {
      await this.taskStateStore.save(sourceId, next)
    } catch (error) {
      indexingRuntimeLog.warn(`Failed to persist indexed source task state '${sourceId}'`, {
        error
      })
    }
  }

  private async loadTaskState(
    sourceId: string
  ): Promise<IndexedSourceRuntimeTaskState | undefined> {
    const existing = this.taskState.get(sourceId)
    if (existing) return cloneRuntimeTaskState(existing)

    try {
      const persisted = await this.taskStateStore.load(sourceId)
      if (persisted) {
        const snapshot = cloneRuntimeTaskState(persisted)
        this.taskState.set(sourceId, snapshot)
        this.hydrateRunGateFromTaskState(sourceId, snapshot)
      }
      return persisted ? cloneRuntimeTaskState(persisted) : undefined
    } catch (error) {
      indexingRuntimeLog.warn(`Failed to load indexed source task state '${sourceId}'`, { error })
      return undefined
    }
  }

  private hydrateRunGateFromTaskState(
    sourceId: string,
    state: IndexedSourceRuntimeTaskState
  ): void {
    this.hydrateRunGateCompletion(sourceId, state, 'scan')
    this.hydrateRunGateCompletion(sourceId, state, 'reconcile')
  }

  private hydrateRunGateCompletion(
    sourceId: string,
    state: IndexedSourceRuntimeTaskState,
    kind: Extract<IndexedSourceTaskHistoryKind, 'scan' | 'reconcile'>
  ): void {
    const completedAt = getLatestTaskCompletionAt(state.recentTasks, kind)
    this.runGate.hydrateCompletion(sourceId, kind, completedAt)
  }

  private async recordScanResult(
    result: ScanSchedulerResult,
    job?: IndexedSourceRuntimeTaskJob,
    reason?: string,
    trigger?: string
  ): Promise<void> {
    const taskState = buildIndexedSourceScanTaskState({
      sourceId: result.sourceId,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      reason,
      trigger,
      batches: result.batches,
      records: result.records,
      indexedRecords: result.indexedRecords,
      job
    })
    await this.updateTaskState(
      taskState.sourceId,
      taskState.key,
      taskState.value,
      taskState.historyEntry
    )
  }

  private async recordScanFailure(
    sourceId: string,
    startedAt: number,
    completedAt: number,
    error: string,
    job?: IndexedSourceRuntimeTaskJob,
    summary?: {
      reason?: string
      phase?: string
      batches?: number
      records?: number
      indexedRecords?: number
      trigger?: string
      errorCode?: string
    }
  ): Promise<void> {
    const taskState = buildIndexedSourceScanTaskState({
      sourceId,
      startedAt,
      completedAt,
      status: 'failed',
      error,
      reason: summary?.reason,
      trigger: summary?.trigger,
      errorCode: summary?.errorCode,
      phase: summary?.phase,
      batches: summary?.batches,
      records: summary?.records,
      indexedRecords: summary?.indexedRecords,
      job
    })
    await this.updateTaskState(
      taskState.sourceId,
      taskState.key,
      taskState.value,
      taskState.historyEntry
    )
  }

  private async recordScanSkipped(
    sourceId: string,
    startedAt: number,
    completedAt: number,
    reason: string,
    job?: IndexedSourceRuntimeTaskJob,
    summary?: {
      trigger?: string
      errorCode?: string
    }
  ): Promise<void> {
    const taskState = buildIndexedSourceScanTaskState({
      sourceId,
      startedAt,
      completedAt,
      status: 'skipped',
      skipReason: reason,
      reason,
      trigger: summary?.trigger,
      errorCode: summary?.errorCode,
      job
    })
    await this.updateTaskState(
      taskState.sourceId,
      taskState.key,
      taskState.value,
      taskState.historyEntry
    )
  }

  private async recordWatchResult(
    event: IndexedSourceWatchEvent,
    result: WatchEventRouteResult,
    queuedAt: number
  ): Promise<void> {
    const completedAt = Date.now()
    const jobs = new Map<string, IndexedSourceRuntimeTaskJob>()
    const getWatchJob = (sourceId: string): IndexedSourceRuntimeTaskJob => {
      const existing = jobs.get(sourceId)
      if (existing) return existing
      const job = this.createTaskJob(sourceId, 'watch', queuedAt)
      jobs.set(sourceId, job)
      return job
    }

    for (const summary of result.deltaSummaries) {
      const job = getWatchJob(summary.sourceId)
      const status = summary.failedDeltas > 0 ? 'failed' : 'succeeded'
      const taskState = buildIndexedSourceWatchTaskState({
        sourceId: summary.sourceId,
        occurredAt: event.occurredAt,
        completedAt,
        action: event.action,
        path: event.path,
        deltas: summary.deltas,
        appliedDeltas: summary.appliedDeltas,
        failedDeltas: summary.failedDeltas,
        skippedDeltas: summary.skippedDeltas,
        status,
        job,
        errorCode: status === 'failed' ? 'watch' : undefined,
        summary: {
          durationMs: completedAt - event.occurredAt,
          trigger: event.action,
          action: event.action,
          deltas: summary.deltas,
          appliedDeltas: summary.appliedDeltas,
          failedDeltas: summary.failedDeltas,
          skippedDeltas: summary.skippedDeltas
        }
      })
      await this.updateTaskState(
        taskState.sourceId,
        taskState.key,
        taskState.value,
        taskState.historyEntry
      )
    }

    for (const error of result.errors) {
      if (!error.sourceId) continue
      const job = getWatchJob(error.sourceId)
      const failedDeltas = error.phase === 'store' ? 1 : 0
      const taskState = buildIndexedSourceWatchTaskState({
        sourceId: error.sourceId,
        occurredAt: event.occurredAt,
        completedAt,
        action: event.action,
        path: event.path,
        deltas: 0,
        appliedDeltas: 0,
        failedDeltas,
        skippedDeltas: 0,
        status: 'failed',
        error: error.message,
        job,
        errorCode: error.phase,
        summary: {
          durationMs: completedAt - event.occurredAt,
          trigger: event.action,
          phase: error.phase,
          action: event.action,
          failedDeltas,
          skippedDeltas: 0
        }
      })
      await this.updateTaskState(
        taskState.sourceId,
        taskState.key,
        taskState.value,
        taskState.historyEntry
      )
    }

    for (const skipped of result.skipped) {
      const job = getWatchJob(skipped.sourceId)
      const taskState = buildIndexedSourceWatchTaskState({
        sourceId: skipped.sourceId,
        occurredAt: event.occurredAt,
        completedAt,
        action: event.action,
        path: event.path,
        deltas: 0,
        appliedDeltas: 0,
        failedDeltas: 0,
        skippedDeltas: 0,
        status: 'skipped',
        skipReason: skipped.reason,
        job,
        errorCode: 'eligibility',
        summary: {
          durationMs: completedAt - event.occurredAt,
          trigger: event.action,
          action: event.action
        }
      })
      await this.updateTaskState(
        taskState.sourceId,
        taskState.key,
        taskState.value,
        taskState.historyEntry
      )
    }
  }

  private async recordReconcileResult(
    result: IndexedSourceReconcileResult,
    request: Partial<IndexedSourceReconcileRequest> = {},
    job?: ReconcileSchedulerJob
  ): Promise<void> {
    const error = result.deltaErrors?.join('; ')
    const status = Boolean(error) || result.errors > 0 ? 'failed' : 'succeeded'
    const taskState = buildIndexedSourceReconcileTaskState({
      sourceId: result.sourceId,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      added: result.added,
      changed: result.changed,
      deleted: result.deleted,
      skipped: result.skipped,
      errors: result.errors,
      reason: result.reason ?? request.reason,
      trigger: result.reason ?? request.reason,
      rootCount: request.roots?.length,
      job,
      deltas: result.deltas?.length,
      appliedDeltas: result.appliedDeltas,
      failedDeltas: result.failedDeltas,
      skippedDeltas: result.skippedDeltas,
      status,
      error,
      errorCode: status === 'failed' ? 'reconcile' : undefined,
      summary: {
        durationMs: result.completedAt - result.startedAt,
        added: result.added,
        changed: result.changed,
        deleted: result.deleted,
        skipped: result.skipped,
        errors: result.errors,
        reason: result.reason ?? request.reason,
        rootCount: request.roots?.length,
        deltas: result.deltas?.length,
        appliedDeltas: result.appliedDeltas,
        failedDeltas: result.failedDeltas,
        skippedDeltas: result.skippedDeltas
      }
    })
    await this.updateTaskState(
      taskState.sourceId,
      taskState.key,
      taskState.value,
      taskState.historyEntry
    )
  }

  private async recordReconcileFailure(
    sourceId: string,
    startedAt: number,
    completedAt: number,
    error: string,
    summary?: {
      trigger?: string
      errorCode?: string
    }
  ): Promise<void> {
    const taskState = buildIndexedSourceReconcileTaskState({
      sourceId,
      startedAt,
      completedAt,
      errors: 1,
      status: 'failed',
      trigger: summary?.trigger,
      errorCode: summary?.errorCode,
      error
    })
    await this.updateTaskState(
      taskState.sourceId,
      taskState.key,
      taskState.value,
      taskState.historyEntry
    )
  }

  private async recordReconcileSkipped(
    sourceId: string,
    startedAt: number,
    completedAt: number,
    reason: string,
    summary?: {
      trigger?: string
      errorCode?: string
    }
  ): Promise<void> {
    const taskState = buildIndexedSourceReconcileTaskState({
      sourceId,
      startedAt,
      completedAt,
      skipped: 1,
      status: 'skipped',
      trigger: summary?.trigger,
      errorCode: summary?.errorCode,
      skipReason: reason
    })
    await this.updateTaskState(
      taskState.sourceId,
      taskState.key,
      taskState.value,
      taskState.historyEntry
    )
  }

  private async recordResetResult(
    result: IndexedSourceResetResult,
    job?: IndexedSourceRuntimeTaskJob,
    status?: Extract<IndexedSourceTaskHistoryEntry['status'], 'succeeded' | 'failed' | 'skipped'>,
    skipReason?: string
  ): Promise<void> {
    const taskState = buildIndexedSourceResetTaskState({
      sourceId: result.sourceId,
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      reason: result.reason,
      clearedSearchIndex: result.clearedSearchIndex,
      clearedSearchIndexRows: result.clearedSearchIndexRows,
      clearedScanProgress: result.clearedScanProgress,
      scanProgressRows: result.scanProgressRows,
      status,
      error: result.error,
      skipReason,
      trigger: result.reason,
      errorCode: result.error ? 'reset' : undefined,
      job
    })
    await this.updateTaskState(
      taskState.sourceId,
      taskState.key,
      taskState.value,
      taskState.historyEntry
    )
  }
}

function cloneRuntimeTaskState(
  state: IndexedSourceRuntimeTaskState
): IndexedSourceRuntimeTaskState {
  const snapshot: IndexedSourceRuntimeTaskState = {}
  if (state.lastScan) {
    snapshot.lastScan = { ...state.lastScan }
  }
  if (state.lastWatch) {
    snapshot.lastWatch = { ...state.lastWatch }
  }
  if (state.lastReconcile) {
    snapshot.lastReconcile = { ...state.lastReconcile }
  }
  if (state.lastReset) {
    snapshot.lastReset = { ...state.lastReset }
  }
  if (state.recentTasks) {
    snapshot.recentTasks = state.recentTasks.map((task) => ({
      ...task,
      ...(task.summary ? { summary: { ...task.summary } } : {})
    }))
  }
  return snapshot
}

function getLatestTaskCompletionAt(
  recentTasks: IndexedSourceTaskHistoryEntry[] | undefined,
  kind: IndexedSourceTaskHistoryKind
): number | undefined {
  if (!recentTasks?.length) return undefined

  let latestCompletedAt: number | undefined
  for (const task of recentTasks) {
    if (task.kind !== kind) continue
    if (!Number.isFinite(task.completedAt)) continue
    latestCompletedAt =
      latestCompletedAt === undefined
        ? task.completedAt
        : Math.max(latestCompletedAt, task.completedAt)
  }
  return latestCompletedAt
}

export const indexingRuntime = new IndexingRuntime()
