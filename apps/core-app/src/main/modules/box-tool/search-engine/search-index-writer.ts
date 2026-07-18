import type { CoreBoxSearchIndexCommitPayload } from '@talex-touch/utils/transport/events/types'
import type {
  SearchIndexItem,
  SearchIndexProviderReplacementSummary,
  SearchIndexReadinessGate
} from './search-index-service'
import type { WorkerStatusSnapshot } from '../addon/files/workers/worker-status'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import { createLogger } from '../../../utils/logger'
import { searchIndexCommitHub, type SearchIndexCommitHub } from './search-index-commit-hub'
import { SearchIndexService } from './search-index-service'
import {
  SearchIndexWorkerClient,
  type FilePersistenceEntry,
  type PersistEntriesSummary,
  type UpsertFileRecord
} from './workers/search-index-worker-client'
export type {
  FilePersistenceEntry,
  PersistEntriesSummary,
  UpsertFileRecord
} from './workers/search-index-worker-client'

const searchIndexWriterLog = createLogger('SearchIndex').child('Writer')
const VISIBILITY_RETRY_DELAYS_MS = [100, 500, 2_000] as const

export type SearchIndexWriterMode = 'runtime' | 'legacy'
export type SearchIndexMutationKind = 'index' | 'replace' | 'remove' | 'clear' | 'cleanup'
export type SearchIndexWriterReadiness =
  | { state: 'pending' }
  | { state: 'ready' }
  | { state: 'failed'; error: Error }
  | { state: 'closed' }

export interface SearchIndexVisibilityRequest {
  sourceId: string
  kind: SearchIndexMutationKind
  itemIds: readonly string[]
}

export interface SearchIndexVisibilityBarrier {
  waitUntilReadable(request: SearchIndexVisibilityRequest): Promise<void>
}

export interface SearchIndexWriterCommit {
  sourceId: string
  kind: SearchIndexMutationKind
  writer: SearchIndexWriterMode
  affectedItems: number
  committed: boolean
  revision: number
  generation: number
  committedAt: number | null
}

export type SearchIndexReplacementSummary = SearchIndexProviderReplacementSummary

export interface SearchIndexWriterStatus {
  readiness: SearchIndexWriterReadiness['state']
  admissionPaused: boolean
  activeAdmissions: number
  pending: number
}

export interface SearchIndexPhysicalWriter {
  readonly mode: SearchIndexWriterMode
  indexItems(
    sourceId: string,
    items: SearchIndexItem[],
    legacyItemIds?: readonly string[]
  ): Promise<number>
  beginSourceReplacement(sourceId: string, replacementId: string): Promise<void>
  stageSourceReplacement(
    sourceId: string,
    replacementId: string,
    items: SearchIndexItem[]
  ): Promise<number>
  commitSourceReplacement(
    sourceId: string,
    replacementId: string
  ): Promise<SearchIndexReplacementSummary>
  abortSourceReplacement(sourceId: string, replacementId: string): Promise<void>
  removeProviderItems(sourceId: string, itemIds: readonly string[]): Promise<number>
  clearSource(sourceId: string): Promise<number>
  cleanupSource(sourceId: string): Promise<number>
  countSource(sourceId: string): Promise<number>
  drain(timeoutMs?: number): Promise<void>
}

export interface SearchIndexMutationWriter {
  indexItems(
    sourceId: string,
    items: SearchIndexItem[],
    options?: { legacyItemIds?: readonly string[] }
  ): Promise<SearchIndexWriterCommit>
  beginSourceReplacement(sourceId: string, replacementId: string): Promise<void>
  stageSourceReplacement(
    sourceId: string,
    replacementId: string,
    items: SearchIndexItem[]
  ): Promise<number>
  commitSourceReplacement(
    sourceId: string,
    replacementId: string
  ): Promise<SearchIndexReplacementSummary>
  abortSourceReplacement(sourceId: string, replacementId: string): Promise<void>
  removeProviderItems(
    sourceId: string,
    itemIds: readonly string[]
  ): Promise<SearchIndexWriterCommit>
  clearSource(sourceId: string): Promise<SearchIndexWriterCommit>
  cleanupSource(sourceId: string): Promise<SearchIndexWriterCommit>
  countSource(sourceId: string): Promise<number>
}

export interface SearchIndexWriterOptions {
  client?: SearchIndexWorkerClient
}

export interface FilePersistencePort {
  waitUntilReady(): Promise<void>
  persistEntries(entries: FilePersistenceEntry[]): Promise<PersistEntriesSummary>
  upsertFiles(records: UpsertFileRecord[]): Promise<Array<Record<string, unknown>>>
  upsertScanProgress(paths: string[], lastScanned: string, sourceId?: string): Promise<number>
  removeFile(path: string): Promise<void>
  removeFileExtensions(fileId: number, keys: string[]): Promise<void>
  getStatus(): Promise<WorkerStatusSnapshot>
  hasPendingWork(): boolean
  drain(timeoutMs?: number): Promise<void>
}

export class SearchIndexWriter implements SearchIndexPhysicalWriter, SearchIndexReadinessGate {
  readonly mode = 'runtime' as const

  private readonly client: SearchIndexWorkerClient
  private readiness: SearchIndexWriterReadiness = { state: 'pending' }
  private initializationPromise: Promise<void> | null = null
  private closed = false
  private shutdownComplete = false
  private admissionGate: Promise<void> | null = null
  private resumeAdmission: (() => void) | null = null
  private pauseQueue: Promise<void> = Promise.resolve()
  private activeAdmissions = 0
  private readonly admissionIdleWaiters = new Set<() => void>()

  private readonly filePersistencePort: FilePersistencePort
  constructor(options: SearchIndexWriterOptions = {}) {
    this.client = options.client ?? new SearchIndexWorkerClient()
    this.filePersistencePort = {
      waitUntilReady: async () => await this.waitUntilReady(),
      persistEntries: async (entries) =>
        await this.withAdmission(async () => await this.client.persistEntries(entries)),
      upsertFiles: async (records) =>
        await this.withAdmission(async () => await this.client.upsertFiles(records)),
      upsertScanProgress: async (paths, lastScanned, sourceId) =>
        await this.withAdmission(
          async () => await this.client.upsertScanProgress(paths, lastScanned, sourceId)
        ),
      removeFile: async (path) =>
        await this.withAdmission(async () => await this.client.removeFile(path)),
      removeFileExtensions: async (fileId, keys) =>
        await this.withAdmission(async () => await this.client.removeFileExtensions(fileId, keys)),
      getStatus: async () => await this.client.getStatus(),
      hasPendingWork: () => this.client.hasPendingWork(),
      drain: async (timeoutMs) => await this.drain(timeoutMs)
    }
  }

  getFilePersistencePort(): FilePersistencePort {
    return this.filePersistencePort
  }

  initialize(dbPath: string): Promise<void> {
    if (this.closed) return Promise.reject(new Error('SEARCH_INDEX_WRITER_CLOSED'))
    if (this.initializationPromise) return this.initializationPromise

    this.readiness = { state: 'pending' }
    const initialization = this.client
      .init(dbPath)
      .then(() => {
        this.readiness = { state: 'ready' }
      })
      .catch((error) => {
        const normalized = error instanceof Error ? error : new Error(String(error))
        this.readiness = { state: 'failed', error: normalized }
        this.initializationPromise = null
        throw normalized
      })
    this.initializationPromise = initialization
    return initialization
  }

  async waitUntilReady(): Promise<void> {
    if (this.readiness.state === 'ready') return
    if (this.readiness.state === 'failed') throw this.readiness.error
    if (this.readiness.state === 'closed') throw new Error('SEARCH_INDEX_WRITER_CLOSED')
    if (!this.initializationPromise) throw new Error('SEARCH_INDEX_WRITER_NOT_INITIALIZED')
    await this.initializationPromise
  }

  getStatus(): SearchIndexWriterStatus {
    return {
      readiness: this.readiness.state,
      admissionPaused: this.admissionGate !== null,
      activeAdmissions: this.activeAdmissions,
      pending: this.client.getPendingCount()
    }
  }

  async indexItems(
    sourceId: string,
    items: SearchIndexItem[],
    legacyItemIds: readonly string[] = []
  ): Promise<number> {
    if (items.length === 0 && legacyItemIds.length === 0) return 0
    return await this.withAdmission(async () => {
      const summary = await this.client.applyProviderItems(sourceId, items, legacyItemIds)
      return summary.removedItems + summary.indexedItems
    })
  }

  async beginSourceReplacement(sourceId: string, replacementId: string): Promise<void> {
    await this.withAdmission(
      async () => await this.client.beginProviderReplacement(sourceId, replacementId)
    )
  }

  async stageSourceReplacement(
    sourceId: string,
    replacementId: string,
    items: SearchIndexItem[]
  ): Promise<number> {
    return await this.withAdmission(
      async () => await this.client.stageProviderReplacementItems(sourceId, replacementId, items)
    )
  }

  async commitSourceReplacement(
    sourceId: string,
    replacementId: string
  ): Promise<SearchIndexReplacementSummary> {
    return await this.withAdmission(
      async () => await this.client.commitProviderReplacement(sourceId, replacementId)
    )
  }

  async abortSourceReplacement(sourceId: string, replacementId: string): Promise<void> {
    await this.withAdmission(
      async () => await this.client.abortProviderReplacement(sourceId, replacementId)
    )
  }

  async removeProviderItems(sourceId: string, itemIds: readonly string[]): Promise<number> {
    if (itemIds.length === 0) return 0
    return await this.withAdmission(
      async () => await this.client.removeProviderItems(sourceId, [...itemIds])
    )
  }

  async clearSource(sourceId: string): Promise<number> {
    return await this.withAdmission(async () => await this.client.removeByProvider(sourceId))
  }

  async cleanupSource(sourceId: string): Promise<number> {
    return await this.withAdmission(async () => await this.client.cleanupOrphanKeywords(sourceId))
  }

  async countSource(sourceId: string): Promise<number> {
    return await this.withAdmission(async () => await this.client.countByProvider(sourceId))
  }

  async drain(timeoutMs = 5_000): Promise<void> {
    await this.waitForAdmissionsToIdle(timeoutMs)
    await this.client.drain(timeoutMs)
  }

  async withPausedAdmission<T>(
    _reason: string,
    operation: (status: SearchIndexWriterStatus) => Promise<T>,
    timeoutMs = 5_000
  ): Promise<T> {
    let releasePauseQueue!: () => void
    const previousPause = this.pauseQueue
    this.pauseQueue = new Promise<void>((resolve) => {
      releasePauseQueue = resolve
    })
    await previousPause

    this.admissionGate = new Promise<void>((resolve) => {
      this.resumeAdmission = resolve
    })
    try {
      await this.drain(timeoutMs)
      return await operation(this.getStatus())
    } finally {
      const resume = this.resumeAdmission
      this.admissionGate = null
      this.resumeAdmission = null
      resume?.()
      releasePauseQueue()
    }
  }

  async shutdown(timeoutMs = 5_000): Promise<void> {
    if (this.shutdownComplete) return
    this.closed = true
    await this.drain(timeoutMs)

    await this.client.shutdown()
    this.readiness = { state: 'closed' }
    const resume = this.resumeAdmission
    this.admissionGate = null
    this.resumeAdmission = null
    resume?.()
    this.shutdownComplete = true
  }

  private async withAdmission<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) throw new Error('SEARCH_INDEX_WRITER_CLOSED')
    if (this.admissionGate) await this.admissionGate
    if (this.closed) throw new Error('SEARCH_INDEX_WRITER_CLOSED')

    this.activeAdmissions += 1
    try {
      await this.waitUntilReady()
      return await operation()
    } finally {
      this.activeAdmissions -= 1
      if (this.activeAdmissions === 0) {
        for (const resolve of [...this.admissionIdleWaiters]) resolve()
      }
    }
  }

  private async waitForAdmissionsToIdle(timeoutMs: number): Promise<void> {
    if (this.activeAdmissions === 0) return

    await new Promise<void>((resolve, reject) => {
      const onIdle = (): void => {
        clearTimeout(timeout)
        this.admissionIdleWaiters.delete(onIdle)
        resolve()
      }
      const timeout: NodeJS.Timeout = setTimeout(() => {
        this.admissionIdleWaiters.delete(onIdle)
        reject(new Error('SEARCH_INDEX_WRITER_ADMISSION_DRAIN_TIMEOUT'))
      }, timeoutMs)
      this.admissionIdleWaiters.add(onIdle)
    })
  }
}

export class LegacySearchIndexWriter implements SearchIndexPhysicalWriter {
  readonly mode = 'legacy' as const

  constructor(private readonly service: SearchIndexService) {}

  async indexItems(
    sourceId: string,
    items: SearchIndexItem[],
    legacyItemIds: readonly string[] = []
  ): Promise<number> {
    const summary = await this.service.applyProviderItems(sourceId, items, legacyItemIds)
    return summary.removedItems + summary.indexedItems
  }

  async beginSourceReplacement(sourceId: string, replacementId: string): Promise<void> {
    await this.service.beginProviderReplacement(sourceId, replacementId)
  }

  async stageSourceReplacement(
    sourceId: string,
    replacementId: string,
    items: SearchIndexItem[]
  ): Promise<number> {
    return await this.service.stageProviderReplacementItems(sourceId, replacementId, items)
  }

  async commitSourceReplacement(
    sourceId: string,
    replacementId: string
  ): Promise<SearchIndexReplacementSummary> {
    return await this.service.commitProviderReplacement(sourceId, replacementId)
  }

  async abortSourceReplacement(sourceId: string, replacementId: string): Promise<void> {
    await this.service.abortProviderReplacement(sourceId, replacementId)
  }

  async removeProviderItems(sourceId: string, itemIds: readonly string[]): Promise<number> {
    return await this.service.removeProviderItems(sourceId, [...itemIds])
  }

  async clearSource(sourceId: string): Promise<number> {
    return await this.service.removeByProvider(sourceId)
  }

  async cleanupSource(_sourceId: string): Promise<number> {
    return 0
  }

  async countSource(sourceId: string): Promise<number> {
    return await this.service.countByProvider(sourceId)
  }

  async drain(): Promise<void> {
    await dbWriteScheduler.drain()
  }
}

export interface SourceScopedIndexWriterRouterOptions {
  runtime: SearchIndexPhysicalWriter
  legacy: SearchIndexPhysicalWriter
  visibilityBarrier: SearchIndexVisibilityBarrier
  commitHub?: SearchIndexCommitHub
  defaultMode?: SearchIndexWriterMode
}

export class SourceScopedIndexWriterRouter implements SearchIndexMutationWriter {
  private readonly modes = new Map<string, SearchIndexWriterMode>()
  private readonly commitHub: SearchIndexCommitHub
  private readonly visibilityRetries = new Map<string, Promise<void>>()

  constructor(private readonly options: SourceScopedIndexWriterRouterOptions) {
    this.commitHub = options.commitHub ?? searchIndexCommitHub
  }

  getMode(sourceId: string): SearchIndexWriterMode {
    return this.modes.get(sourceId) ?? this.options.defaultMode ?? 'runtime'
  }

  setMode(sourceId: string, mode: SearchIndexWriterMode): void {
    this.modes.set(sourceId, mode)
  }

  async indexItems(
    sourceId: string,
    items: SearchIndexItem[],
    options: { legacyItemIds?: readonly string[] } = {}
  ): Promise<SearchIndexWriterCommit> {
    const writer = this.resolveWriter(sourceId)
    const affectedItems = await writer.indexItems(sourceId, items, options.legacyItemIds)
    return await this.publishCommit(sourceId, 'index', writer.mode, affectedItems, [
      ...items.map((item) => item.itemId),
      ...(options.legacyItemIds ?? [])
    ])
  }

  async beginSourceReplacement(sourceId: string, replacementId: string): Promise<void> {
    await this.resolveWriter(sourceId).beginSourceReplacement(sourceId, replacementId)
  }

  async stageSourceReplacement(
    sourceId: string,
    replacementId: string,
    items: SearchIndexItem[]
  ): Promise<number> {
    return await this.resolveWriter(sourceId).stageSourceReplacement(sourceId, replacementId, items)
  }

  async commitSourceReplacement(
    sourceId: string,
    replacementId: string
  ): Promise<SearchIndexReplacementSummary> {
    const writer = this.resolveWriter(sourceId)
    const summary = await writer.commitSourceReplacement(sourceId, replacementId)
    await this.publishCommit(
      sourceId,
      'replace',
      writer.mode,
      summary.removedItems + summary.indexedItems,
      []
    )
    return summary
  }

  async abortSourceReplacement(sourceId: string, replacementId: string): Promise<void> {
    await this.resolveWriter(sourceId).abortSourceReplacement(sourceId, replacementId)
  }

  async removeProviderItems(
    sourceId: string,
    itemIds: readonly string[]
  ): Promise<SearchIndexWriterCommit> {
    const writer = this.resolveWriter(sourceId)
    const affectedItems = await writer.removeProviderItems(sourceId, itemIds)
    return await this.publishCommit(sourceId, 'remove', writer.mode, affectedItems, itemIds)
  }

  async clearSource(sourceId: string): Promise<SearchIndexWriterCommit> {
    const writer = this.resolveWriter(sourceId)
    const affectedItems = await writer.clearSource(sourceId)
    return await this.publishCommit(sourceId, 'clear', writer.mode, affectedItems, [])
  }

  async cleanupSource(sourceId: string): Promise<SearchIndexWriterCommit> {
    const writer = this.resolveWriter(sourceId)
    const affectedItems = await writer.cleanupSource(sourceId)
    return await this.publishCommit(sourceId, 'cleanup', writer.mode, affectedItems, [])
  }

  async countSource(sourceId: string): Promise<number> {
    return await this.resolveWriter(sourceId).countSource(sourceId)
  }

  async drainSelected(sourceId: string, timeoutMs = 5_000): Promise<void> {
    await this.resolveWriter(sourceId).drain(timeoutMs)
  }

  private resolveWriter(sourceId: string): SearchIndexPhysicalWriter {
    return this.getMode(sourceId) === 'runtime' ? this.options.runtime : this.options.legacy
  }

  private async publishCommit(
    sourceId: string,
    kind: SearchIndexMutationKind,
    writer: SearchIndexWriterMode,
    affectedItems: number,
    itemIds: readonly string[]
  ): Promise<SearchIndexWriterCommit> {
    if (affectedItems <= 0) {
      return this.buildCommit(sourceId, kind, writer, affectedItems, null)
    }

    const request = { sourceId, kind, itemIds }
    try {
      await this.options.visibilityBarrier.waitUntilReadable(request)
      return this.buildCommit(
        sourceId,
        kind,
        writer,
        affectedItems,
        this.commitHub.markCommitted([sourceId])
      )
    } catch {
      const payload = this.commitHub.markCommitted([sourceId])
      searchIndexWriterLog.warn('Search index commit has degraded reader visibility', {
        meta: { sourceId, kind }
      })
      this.scheduleVisibilityRetry(request)
      return this.buildCommit(sourceId, kind, writer, affectedItems, payload)
    }
  }

  private scheduleVisibilityRetry(request: SearchIndexVisibilityRequest): void {
    if (this.visibilityRetries.has(request.sourceId)) return

    const retry = this.retryVisibility(request).finally(() => {
      this.visibilityRetries.delete(request.sourceId)
    })
    this.visibilityRetries.set(request.sourceId, retry)
  }

  private async retryVisibility(request: SearchIndexVisibilityRequest): Promise<void> {
    for (let attempt = 0; attempt < VISIBILITY_RETRY_DELAYS_MS.length; attempt += 1) {
      await this.waitForVisibilityRetry(VISIBILITY_RETRY_DELAYS_MS[attempt])
      try {
        await this.options.visibilityBarrier.waitUntilReadable(request)
        searchIndexWriterLog.info('Search index reader visibility recovered', {
          meta: { sourceId: request.sourceId, kind: request.kind, attempt: attempt + 1 }
        })
        return
      } catch {
        searchIndexWriterLog.warn('Search index reader visibility retry failed', {
          meta: { sourceId: request.sourceId, kind: request.kind, attempt: attempt + 1 }
        })
      }
    }
  }

  private async waitForVisibilityRetry(delayMs: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, delayMs)
      timer.unref?.()
    })
  }

  private buildCommit(
    sourceId: string,
    kind: SearchIndexMutationKind,
    writer: SearchIndexWriterMode,
    affectedItems: number,
    payload: CoreBoxSearchIndexCommitPayload | null
  ): SearchIndexWriterCommit {
    return {
      sourceId,
      kind,
      writer,
      affectedItems,
      committed: payload !== null,
      revision: payload?.revision ?? this.commitHub.getRevision(),
      generation:
        payload?.sourceGenerations[sourceId] ?? this.commitHub.getSourceGeneration(sourceId),
      committedAt: payload?.committedAt ?? null
    }
  }
}

export const searchIndexWriter = new SearchIndexWriter()
