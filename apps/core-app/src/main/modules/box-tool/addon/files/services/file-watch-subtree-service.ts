import path from 'node:path'

export const FILE_WATCH_SUBTREE_RECONCILE_REASON = 'file-watch-subtree'

export interface WatchSubtreeRecord {
  id: number
  path: string
}

export interface FileWatchSubtreeDeps<TScanned extends { path: string }> {
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
  ) => Promise<WatchSubtreeRecord[]>
  deleteRecords: (records: WatchSubtreeRecord[], signal?: AbortSignal) => Promise<void>
}

export interface FileWatchSubtreeOptions {
  signal?: AbortSignal
  batchSize?: number
}

export interface FileWatchSubtreeResult {
  added: number
  changed: number
  deleted: number
  skipped: number
  errors: 0
}

export class FileWatchSubtreeService<TScanned extends { path: string }> {
  constructor(private readonly deps: FileWatchSubtreeDeps<TScanned>) {}

  async execute(
    scope: string,
    { signal, batchSize = 256 }: FileWatchSubtreeOptions = {}
  ): Promise<FileWatchSubtreeResult> {
    signal?.throwIfAborted()
    if (
      typeof scope !== 'string' ||
      scope.length === 0 ||
      scope.includes('\0') ||
      !path.isAbsolute(scope)
    ) {
      throw new Error('Invalid file watch subtree scope')
    }
    if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
      throw new Error('Invalid file watch subtree batch size')
    }
    const normalizedScope = this.deps.normalizePath(scope)
    if (
      normalizedScope.length === 0 ||
      normalizedScope.includes('\0') ||
      !path.isAbsolute(normalizedScope)
    ) {
      throw new Error('Invalid normalized file watch subtree scope')
    }
    const result: FileWatchSubtreeResult = {
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 0,
      errors: 0
    }
    if (!this.deps.isAdmitted(normalizedScope)) {
      result.skipped = 1
      return result
    }
    const throughId = await this.deps.getHighWaterMark(normalizedScope, signal)
    if (!Number.isSafeInteger(throughId) || throughId < 0) {
      throw new Error('Invalid file watch subtree high-water mark')
    }
    signal?.throwIfAborted()
    const scopeExists = await this.deps.pathExists(normalizedScope, signal)
    signal?.throwIfAborted()
    if (scopeExists) {
      let batch: TScanned[] = []
      const flush = async (): Promise<void> => {
        signal?.throwIfAborted()
        if (batch.length === 0) return
        const updated = await this.deps.upsert(normalizedScope, batch, signal)
        signal?.throwIfAborted()
        result.added += updated.added
        result.changed += updated.changed
        result.skipped += Math.max(0, batch.length - updated.added - updated.changed)
        batch = []
      }
      for await (const records of this.deps.scan(normalizedScope, signal)) {
        signal?.throwIfAborted()
        for (const record of records) {
          signal?.throwIfAborted()
          if (this.isInScope(normalizedScope, record.path)) {
            batch.push(record)
            if (batch.length === batchSize) await flush()
          } else {
            result.skipped += 1
          }
        }
        await flush()
      }
    }
    signal?.throwIfAborted()
    let afterId = 0
    while (afterId < throughId) {
      signal?.throwIfAborted()
      const records = await this.deps.readPage(
        normalizedScope,
        afterId,
        throughId,
        batchSize,
        signal
      )
      signal?.throwIfAborted()
      if (records.length === 0) break
      if (records.length > batchSize) {
        throw new Error('Invalid file watch subtree page size')
      }
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
      const missing: WatchSubtreeRecord[] = []
      for (let offset = 0; offset < records.length; offset += 4) {
        signal?.throwIfAborted()
        const checked = await Promise.allSettled(
          records.slice(offset, offset + 4).map(async (record) => {
            signal?.throwIfAborted()
            if (!this.isInScope(normalizedScope, record.path)) {
              result.skipped += 1
              return undefined
            }
            return (await this.deps.pathExists(record.path, signal)) ? undefined : record
          })
        )
        signal?.throwIfAborted()
        for (const outcome of checked) {
          if (outcome.status === 'rejected') throw outcome.reason
          if (outcome.value) missing.push(outcome.value)
        }
      }
      if (missing.length > 0) {
        signal?.throwIfAborted()
        await this.deps.deleteRecords(missing, signal)
        signal?.throwIfAborted()
        result.deleted += missing.length
      }
      afterId = records[records.length - 1].id
    }
    signal?.throwIfAborted()
    return result
  }

  private isInScope(scope: string, candidate: string): boolean {
    if (candidate.length === 0 || candidate.includes('\0') || !path.isAbsolute(candidate)) {
      return false
    }
    const normalized = this.deps.normalizePath(candidate)
    if (normalized.length === 0 || normalized.includes('\0') || !path.isAbsolute(normalized)) {
      return false
    }
    const relative = path.relative(scope, normalized)
    return (
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative) &&
      this.deps.isAdmitted(normalized)
    )
  }
}
