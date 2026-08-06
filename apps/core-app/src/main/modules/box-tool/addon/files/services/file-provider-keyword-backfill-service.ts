import { SEARCH_KEYWORD_SCHEMA_VERSION } from '@talex-touch/utils/search'

/**
 * One-time keyword rewrite for file rows indexed before the current charset
 * rules existed.
 *
 * Folding the schema version into the per-item keyword hash makes every stored
 * hash mismatch, which is enough for rows the pipeline touches again — but the
 * steady-state reconcile only re-emits files whose mtime changed. An untouched
 * file would keep its old keywords forever, so this pass walks the already
 * indexed rows once and re-emits them through the normal write path.
 *
 * It reads nothing from disk: the rows are already in the database, and the
 * keywords are derived from the row, not from the file's contents. Re-emitting
 * a row whose keywords are already current is free — the writer compares the
 * hash first and skips the keyword delta — which is what makes a retry after a
 * partial run cheap.
 */
export const FILE_KEYWORD_BACKFILL_VERSION = SEARCH_KEYWORD_SCHEMA_VERSION

export interface FileKeywordBackfillRow {
  id: number
}

export interface FileProviderKeywordBackfillResult {
  status: 'skipped' | 'completed'
  reason?: 'already-applied' | 'unavailable'
  /** Rows read from the index. */
  scanned: number
  /** Rows handed to the write path. */
  emitted: number
  /** Rows in pages that threw; a non-zero count leaves the version unrecorded. */
  failed: number
}

export interface FileProviderKeywordBackfillDeps<TRow extends FileKeywordBackfillRow> {
  /** Version already recorded as applied, or null when the pass never ran. */
  getAppliedVersion: () => Promise<number | null>
  setAppliedVersion: (version: number) => Promise<void>
  /** Whether the write path is usable at all; false skips without recording. */
  isReady: () => boolean
  /** One id-ordered page of indexed file rows. */
  loadRowsPage: (afterId: number, limit: number) => Promise<TRow[]>
  /** Re-emit a page through the existing indexed-source write path. */
  emitRows: (rows: TRow[]) => Promise<void>
  /** Back-pressure hook: the pass must not outrun the write queue. */
  waitForWriteCapacity: () => Promise<void>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

const PAGE_SIZE = 100

export class FileProviderKeywordBackfillService<
  TRow extends FileKeywordBackfillRow = FileKeywordBackfillRow
> {
  constructor(private readonly deps: FileProviderKeywordBackfillDeps<TRow>) {}

  async run(): Promise<FileProviderKeywordBackfillResult> {
    const applied = await this.deps.getAppliedVersion()
    if (applied !== null && applied >= FILE_KEYWORD_BACKFILL_VERSION) {
      return this.skipped('already-applied')
    }
    if (!this.deps.isReady()) {
      return this.skipped('unavailable')
    }

    let scanned = 0
    let emitted = 0
    let failed = 0
    let afterId = 0

    while (true) {
      const page = await this.deps.loadRowsPage(afterId, PAGE_SIZE)
      if (page.length === 0) break
      afterId = page[page.length - 1]!.id
      scanned += page.length

      await this.deps.waitForWriteCapacity()
      try {
        await this.deps.emitRows(page)
        emitted += page.length
      } catch (error) {
        // The cursor still advances: one unwritable page must not stall the
        // rest of the index. The version stays unrecorded, so the next boot
        // retries the whole walk, and the pages that did land are no-ops.
        failed += page.length
        this.deps.logWarn('Failed to re-emit a keyword backfill page', error, {
          afterId,
          rows: page.length
        })
      }
    }

    if (failed === 0) {
      await this.deps.setAppliedVersion(FILE_KEYWORD_BACKFILL_VERSION)
    }
    this.deps.logInfo('File keyword schema backfill completed', {
      version: FILE_KEYWORD_BACKFILL_VERSION,
      scanned,
      emitted,
      failed
    })
    return { status: 'completed', scanned, emitted, failed }
  }

  private skipped(
    reason: NonNullable<FileProviderKeywordBackfillResult['reason']>
  ): FileProviderKeywordBackfillResult {
    return { status: 'skipped', reason, scanned: 0, emitted: 0, failed: 0 }
  }
}
