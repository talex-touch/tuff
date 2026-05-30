import type {
  IndexedSource,
  IndexedSourceDelta,
  IndexedSourceDescriptor,
  IndexedSourceDiagnostics,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult,
  IndexedSourceResetRequest,
  IndexedSourceResetResult,
  IndexedSourceScanReason,
  IndexedSourceScanRequest,
  IndexedSourceTaskKind,
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
import type {
  ScanSchedulerBatchResult,
  ScanSchedulerResult,
  ScanSchedulerSkippedSource
} from './indexing-scan-scheduler'
import type { IndexStoreAdapter } from './indexing-store-adapter'
import type { WatchEventRouteResult } from './indexing-watch-router'
import { getLogger } from '@talex-touch/utils/common/logger'
import {
  IndexedSourceResetReasons,
  resolveIndexedSourceTaskEligibility
} from '@talex-touch/utils/search'
import { SourceDiagnosticsService } from './indexing-diagnostics-service'
import { ReconcileEngine } from './indexing-reconcile-engine'
import { ReconcileScheduler as DefaultReconcileScheduler } from './indexing-reconcile-scheduler'
import { indexingRootPolicy } from './indexing-root-policy'
import { ScanScheduler } from './indexing-scan-scheduler'
import { NoopIndexStoreAdapter } from './indexing-store-adapter'
import { WatchEventRouter } from './indexing-watch-router'

const indexingRuntimeLog = getLogger('indexing-runtime')

export interface IndexingRuntimeOptions {
  store?: IndexStoreAdapter
  diagnosticsService?: SourceDiagnosticsService
  watchRouter?: WatchEventRouter
  scanScheduler?: ScanScheduler
  reconcileEngine?: ReconcileEngine
  reconcileScheduler?: ReconcileScheduler
  rootPolicy?: IndexingRootPolicy
}

export type { IndexingRuntimeDiagnostics, IndexingRuntimeSourceDiagnostics }

type IndexedSourceRuntimeTaskState = Pick<
  IndexedSourceDiagnostics,
  'lastScan' | 'lastWatch' | 'lastReconcile' | 'lastReset'
>

interface RuntimeEligibleSources {
  sources: IndexedSource[]
  skipped: Array<{
    sourceId: string
    reason: string
  }>
}

export class IndexingRuntime {
  private readonly sources = new Map<string, IndexedSource>()
  private readonly taskState = new Map<string, IndexedSourceRuntimeTaskState>()
  private store: IndexStoreAdapter
  private readonly diagnosticsService: SourceDiagnosticsService
  private watchRouter: WatchEventRouter
  private scanScheduler: ScanScheduler
  private reconcileEngine: ReconcileEngine
  private reconcileScheduler: ReconcileScheduler
  private readonly rootPolicy: IndexingRootPolicy

  constructor(options: IndexingRuntimeOptions = {}) {
    this.store = options.store ?? new NoopIndexStoreAdapter()
    this.diagnosticsService = options.diagnosticsService ?? new SourceDiagnosticsService()
    this.watchRouter = options.watchRouter ?? new WatchEventRouter(this.store)
    this.scanScheduler = options.scanScheduler ?? new ScanScheduler(this.store)
    this.reconcileEngine = options.reconcileEngine ?? new ReconcileEngine(this.store)
    this.reconcileScheduler =
      options.reconcileScheduler ?? new DefaultReconcileScheduler(this.reconcileEngine)
    this.rootPolicy = options.rootPolicy ?? indexingRootPolicy
  }

  registerSource(source: IndexedSource): boolean {
    const sourceId = source.descriptor.id
    if (this.sources.has(sourceId)) {
      indexingRuntimeLog.warn(`Indexed source '${sourceId}' is already registered`)
      return false
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
    this.watchRouter = new WatchEventRouter(this.store)
    this.scanScheduler = new ScanScheduler(this.store)
    this.reconcileEngine = new ReconcileEngine(this.store)
    this.reconcileScheduler = new DefaultReconcileScheduler(this.reconcileEngine)
  }

  async getDiagnostics(): Promise<IndexingRuntimeDiagnostics> {
    const diagnostics = await this.diagnosticsService.getDiagnostics(this.listSources())
    this.applyTaskState(diagnostics)
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
    const diagnostics = await this.getDiagnostics()
    const result = await this.watchRouter.routeWithResult(event, this.sources, diagnostics)
    this.recordWatchResult(event, result)
    return result
  }

  async scanSource(
    sourceId: string,
    reason: IndexedSourceScanReason,
    request: Partial<IndexedSourceScanRequest> = {}
  ): Promise<ScanSchedulerResult> {
    const source = this.requireSource(sourceId)
    const result = await this.scanScheduler.scanSource(source, reason, request)
    this.recordScanResult(result)
    return result
  }

  async scanSources(reason: IndexedSourceScanReason): Promise<ScanSchedulerResult[]> {
    const result = await this.scanSourcesWithResult(reason)
    return result.results
  }

  async scanSourcesWithResult(reason: IndexedSourceScanReason): Promise<ScanSchedulerBatchResult> {
    const allSources = this.listSources()
    const diagnostics = await this.getDiagnostics()
    const eligible = this.getEligibleSources(allSources, diagnostics, 'scan')
    const result = await this.scanScheduler.scanSourcesWithResult(eligible.sources, reason)
    const enrichedResult = this.withScanSkippedSources(result, allSources.length, eligible.skipped)
    for (const sourceResult of result.results) {
      this.recordScanResult(sourceResult)
    }
    for (const failure of result.errors) {
      this.recordScanFailure(
        failure.sourceId,
        result.startedAt,
        result.completedAt,
        failure.message
      )
    }
    for (const skipped of eligible.skipped) {
      this.recordScanSkipped(skipped.sourceId, result.startedAt, result.completedAt, skipped.reason)
    }
    return enrichedResult
  }

  async reconcileSource(
    sourceId: string,
    request: Partial<IndexedSourceReconcileRequest> = {}
  ): Promise<IndexedSourceReconcileResult> {
    const source = this.requireSource(sourceId)
    const { job, result } = await this.reconcileScheduler.reconcileSource(source, request)
    this.recordReconcileResult(result, request, job)
    return result
  }

  async reconcileSources(): Promise<IndexedSourceReconcileResult[]> {
    const result = await this.reconcileSourcesWithResult()
    return result.results
  }

  async reconcileSourcesWithResult(): Promise<ReconcileEngineBatchResult> {
    const allSources = this.listSources()
    const diagnostics = await this.getDiagnostics()
    const eligible = this.getEligibleSources(allSources, diagnostics, 'reconcile')
    const result = await this.reconcileScheduler.reconcileSourcesWithResult(eligible.sources)
    const enrichedResult = this.withReconcileSkippedSources(
      result,
      allSources.length,
      eligible.skipped
    )
    for (const sourceResult of result.results) {
      this.recordReconcileResult(sourceResult)
    }
    for (const failure of result.failures) {
      this.recordReconcileFailure(
        failure.sourceId,
        result.startedAt,
        result.completedAt,
        failure.message
      )
    }
    for (const skipped of eligible.skipped) {
      this.recordReconcileSkipped(
        skipped.sourceId,
        result.startedAt,
        result.completedAt,
        skipped.reason
      )
    }
    return enrichedResult
  }

  async resetSourceRuntimeState(
    sourceId: string,
    request: Partial<IndexedSourceResetRequest> = {}
  ): Promise<IndexedSourceResetResult> {
    const source = this.requireSource(sourceId)
    const startedAt = Date.now()
    const reason = request.reason ?? IndexedSourceResetReasons.HealthRepair
    if (!source.resetIndex) {
      const result: IndexedSourceResetResult = {
        sourceId,
        reason,
        clearedSearchIndex: false,
        clearedScanProgress: false,
        startedAt,
        completedAt: Date.now(),
        error: 'reset-not-supported'
      }
      this.recordResetResult(result)
      return result
    }

    try {
      const result = await source.resetIndex({
        ...request,
        sourceId,
        reason
      })
      this.recordResetResult(result)
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
      this.recordResetResult(result)
      return result
    }
  }

  private requireSource(sourceId: string): IndexedSource {
    const source = this.sources.get(sourceId)
    if (!source) {
      throw new Error(`Indexed source '${sourceId}' is not registered`)
    }
    return source
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

  clear(): void {
    this.sources.clear()
    this.taskState.clear()
    this.rootPolicy.clear()
  }

  private updateRootPolicy(diagnostics: IndexingRuntimeDiagnostics): void {
    for (const source of diagnostics.sources) {
      this.rootPolicy.setSourceRoots(source.descriptor.id, source.roots)
    }
  }

  private applyTaskState(diagnostics: IndexingRuntimeDiagnostics): void {
    for (const source of diagnostics.sources) {
      const state = this.taskState.get(source.descriptor.id)
      if (!state) continue
      source.lastScan = state.lastScan
      source.lastWatch = state.lastWatch
      source.lastReconcile = state.lastReconcile
      source.lastReset = state.lastReset
    }
  }

  private ensureTaskState(sourceId: string): IndexedSourceRuntimeTaskState {
    const existing = this.taskState.get(sourceId)
    if (existing) return existing
    const next: IndexedSourceRuntimeTaskState = {}
    this.taskState.set(sourceId, next)
    return next
  }

  private recordScanResult(result: ScanSchedulerResult): void {
    this.ensureTaskState(result.sourceId).lastScan = {
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      batches: result.batches,
      records: result.records
    }
  }

  private recordScanFailure(
    sourceId: string,
    startedAt: number,
    completedAt: number,
    error: string
  ): void {
    this.ensureTaskState(sourceId).lastScan = {
      startedAt,
      completedAt,
      batches: 0,
      records: 0,
      error
    }
  }

  private recordScanSkipped(
    sourceId: string,
    startedAt: number,
    completedAt: number,
    reason: string
  ): void {
    this.ensureTaskState(sourceId).lastScan = {
      startedAt,
      completedAt,
      batches: 0,
      records: 0,
      error: `skipped:${reason}`
    }
  }

  private recordWatchResult(event: IndexedSourceWatchEvent, result: WatchEventRouteResult): void {
    const completedAt = Date.now()
    const deltasBySource = new Map<string, number>()
    for (const delta of result.deltas) {
      deltasBySource.set(delta.sourceId, (deltasBySource.get(delta.sourceId) ?? 0) + 1)
    }

    for (const [sourceId, deltas] of deltasBySource) {
      this.ensureTaskState(sourceId).lastWatch = {
        occurredAt: event.occurredAt,
        completedAt,
        action: event.action,
        path: event.path,
        deltas,
        appliedDeltas: result.failedDeltas > 0 ? 0 : deltas,
        failedDeltas: result.failedDeltas > 0 ? deltas : 0
      }
    }

    for (const error of result.errors) {
      if (!error.sourceId) continue
      this.ensureTaskState(error.sourceId).lastWatch = {
        occurredAt: event.occurredAt,
        completedAt,
        action: event.action,
        path: event.path,
        deltas: 0,
        appliedDeltas: 0,
        failedDeltas: error.phase === 'store' ? 1 : 0,
        error: error.message
      }
    }

    for (const skipped of result.skipped) {
      this.ensureTaskState(skipped.sourceId).lastWatch = {
        occurredAt: event.occurredAt,
        completedAt,
        action: event.action,
        path: event.path,
        deltas: 0,
        appliedDeltas: 0,
        failedDeltas: 0,
        error: `skipped:${skipped.reason}`
      }
    }
  }

  private recordReconcileResult(
    result: IndexedSourceReconcileResult,
    request: Partial<IndexedSourceReconcileRequest> = {},
    job?: ReconcileSchedulerJob
  ): void {
    this.ensureTaskState(result.sourceId).lastReconcile = {
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      added: result.added,
      changed: result.changed,
      deleted: result.deleted,
      skipped: result.skipped,
      errors: result.errors,
      reason: result.reason ?? request.reason,
      rootCount: request.roots?.length,
      jobId: job?.id,
      queuedAt: job?.queuedAt,
      deltas: result.deltas?.length,
      appliedDeltas: result.appliedDeltas,
      failedDeltas: result.failedDeltas,
      error: result.deltaErrors?.join('; ')
    }
  }

  private recordReconcileFailure(
    sourceId: string,
    startedAt: number,
    completedAt: number,
    error: string
  ): void {
    this.ensureTaskState(sourceId).lastReconcile = {
      startedAt,
      completedAt,
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 0,
      errors: 1,
      error
    }
  }

  private recordReconcileSkipped(
    sourceId: string,
    startedAt: number,
    completedAt: number,
    reason: string
  ): void {
    this.ensureTaskState(sourceId).lastReconcile = {
      startedAt,
      completedAt,
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 1,
      errors: 0,
      error: `skipped:${reason}`
    }
  }

  private recordResetResult(result: IndexedSourceResetResult): void {
    this.ensureTaskState(result.sourceId).lastReset = {
      startedAt: result.startedAt,
      completedAt: result.completedAt,
      reason: result.reason,
      clearedSearchIndex: result.clearedSearchIndex,
      clearedScanProgress: result.clearedScanProgress,
      scanProgressRows: result.scanProgressRows,
      error: result.error
    }
  }
}

export const indexingRuntime = new IndexingRuntime()
