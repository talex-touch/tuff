import path from 'node:path'

export const FILE_WATCH_SUBTREE_RECONCILE_REASON = 'file-watch-subtree'

export interface WatchSubtreeRecord {
  id: number
  path: string
}

export interface FileWatchSubtreeDeps<
  TScanned extends { path: string },
  TRecord extends WatchSubtreeRecord
> {
  normalizePath: (path: string) => string
  isAdmitted: (path: string) => boolean
  pathExists: (path: string, signal?: AbortSignal) => Promise<boolean>
  scan: (scope: string, signal?: AbortSignal) => AsyncIterable<readonly TScanned[]>
  upsert: (
    scope: string,
    records: TScanned[],
    signal?: AbortSignal
  ) => Promise<{ added: number; changed: number }>
  getHighWaterMark: (scope: string, signal?: AbortSignal) => Promise<number>
  readPage: (
    scope: string,
    afterId: number,
    throughId: number,
    limit: number,
    signal?: AbortSignal
  ) => Promise<TRecord[]>
  deleteRecords: (
    records: TRecord[],
    signal?: AbortSignal
  ) => Promise<{ deletedCount: number; deferred: boolean }>
  beginMissingSweep: (scope: string, signal?: AbortSignal) => Promise<void>
  loadCursor: (scope: string, signal?: AbortSignal) => Promise<number>
  saveCursor: (scope: string, cursor: number) => Promise<void>
  finishMissingSweep: (scope: string) => Promise<void>
  canContinue: () => boolean
  now?: () => number
}

export interface FileWatchSubtreeOptions {
  signal?: AbortSignal
  batchSize?: number
  roundBudgetMs?: number
}

export interface FileWatchSubtreeResult {
  added: number
  changed: number
  deleted: number
  skipped: number
  errors: 0
  deferred: boolean
}

export class FileWatchSubtreeService<
  TScanned extends { path: string },
  TRecord extends WatchSubtreeRecord = WatchSubtreeRecord
> {
  constructor(private readonly deps: FileWatchSubtreeDeps<TScanned, TRecord>) {}

  async execute(
    scope: string,
    { signal, batchSize = 64, roundBudgetMs = 1_500 }: FileWatchSubtreeOptions = {}
  ): Promise<FileWatchSubtreeResult> {
    signal?.throwIfAborted()
    if (!scope || scope.includes('\0') || !path.isAbsolute(scope))
      throw new Error('Invalid file watch subtree scope')
    if (!Number.isSafeInteger(batchSize) || batchSize <= 0 || batchSize > 64) {
      throw new Error('Invalid file watch subtree batch size')
    }
    const normalizedScope = this.deps.normalizePath(scope)
    if (!normalizedScope || normalizedScope.includes('\0') || !path.isAbsolute(normalizedScope)) {
      throw new Error('Invalid normalized file watch subtree scope')
    }
    const now = this.deps.now ?? (() => performance.now())
    const startedAt = now()
    const result: FileWatchSubtreeResult = {
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 0,
      errors: 0,
      deferred: false
    }
    if (!this.deps.isAdmitted(normalizedScope)) return { ...result, skipped: 1 }
    const throughId = await this.deps.getHighWaterMark(normalizedScope, signal)
    if (!Number.isSafeInteger(throughId) || throughId < 0)
      throw new Error('Invalid file watch subtree high-water mark')
    const scopeExists = await this.deps.pathExists(normalizedScope, signal)
    signal?.throwIfAborted()
    if (scopeExists) {
      for await (const records of this.deps.scan(normalizedScope, signal)) {
        signal?.throwIfAborted()
        const admitted = records.filter((record) => this.isInScope(normalizedScope, record.path))
        result.skipped += records.length - admitted.length
        for (let offset = 0; offset < admitted.length; offset += batchSize) {
          const chunk = admitted.slice(offset, offset + batchSize)
          signal?.throwIfAborted()
          const updated = await this.deps.upsert(normalizedScope, chunk, signal)
          result.added += updated.added
          result.changed += updated.changed
          result.skipped += Math.max(0, chunk.length - updated.added - updated.changed)
          signal?.throwIfAborted()
        }
      }
    }
    // scan() must reject partial/unknown-quality runs. Its completion is the
    // prerequisite for this durable job, never a TEMP seen-path restart cursor.
    signal?.throwIfAborted()
    await this.deps.beginMissingSweep(normalizedScope, signal)
    let afterId = await this.deps.loadCursor(normalizedScope, signal)
    for (let page = 0; afterId < throughId && page < 16; page += 1) {
      signal?.throwIfAborted()
      if (!this.deps.canContinue() || now() - startedAt >= roundBudgetMs)
        return { ...result, deferred: true }
      const records = await this.deps.readPage(
        normalizedScope,
        afterId,
        throughId,
        batchSize,
        signal
      )
      if (records.length === 0) {
        afterId = throughId
        break
      }
      if (records.length > batchSize) throw new Error('Invalid file watch subtree page size')
      let previousId = afterId
      for (const record of records) {
        if (
          !Number.isSafeInteger(record.id) ||
          record.id <= previousId ||
          record.id > throughId ||
          typeof record.path !== 'string'
        ) {
          throw new Error('Invalid file watch subtree page cursor')
        }
        previousId = record.id
      }
      const missing: TRecord[] = []
      for (const record of records) {
        signal?.throwIfAborted()
        if (!this.isInScope(normalizedScope, record.path)) {
          result.skipped += 1
          continue
        }
        if (!(await this.deps.pathExists(record.path, signal))) missing.push(record)
      }
      if (!this.deps.canContinue() || now() - startedAt >= roundBudgetMs)
        return { ...result, deferred: true }
      if (missing.length > 0) {
        const removed = await this.deps.deleteRecords(missing, signal)
        result.deleted += removed.deletedCount
        if (removed.deferred) return { ...result, deferred: true }
      }
      const nextCursor = records[records.length - 1].id
      await this.deps.saveCursor(normalizedScope, nextCursor)
      afterId = nextCursor
    }
    if (afterId < throughId) return { ...result, deferred: true }
    await this.deps.finishMissingSweep(normalizedScope)
    return result
  }

  private isInScope(scope: string, candidate: string): boolean {
    if (!candidate || candidate.includes('\0') || !path.isAbsolute(candidate)) return false
    const normalized = this.deps.normalizePath(candidate)
    if (!normalized || normalized.includes('\0') || !path.isAbsolute(normalized)) return false
    const relative = path.relative(scope, normalized)
    return (
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative) &&
      this.deps.isAdmitted(normalized)
    )
  }
}
