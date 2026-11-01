/**
 * One-time removal of the content index of files that are too long to be content-indexed.
 *
 * The index worker now skips such a file entirely (`FILE_CONTENT_TOO_LONG_REASON`), but it only
 * looks at files it parses again. A file indexed under the old rule, which kept the first 200,000
 * characters, would keep its body in `files.content`, in the FTS `content` column, in its chunks and
 * in its vectors until someone edited it. This pass walks those rows once.
 *
 * A row is selected while it still holds an over-long body or is recorded as `truncated` (a cut
 * prefix of an even longer file). `processPage` must publish the empty search document before it
 * clears the row: a failure between the two leaves the row selected, so the next boot retries it,
 * whereas the reverse order would leave a stale FTS body that nothing selects any more.
 */
export const FILE_OVERLONG_CONTENT_CLEANUP_VERSION = 1

const PAGE_SIZE = 50

export interface FileOverlongContentCleanupRow {
  id: number
}

export interface FileOverlongContentCleanupResult {
  status: 'skipped' | 'completed'
  reason?: 'already-applied' | 'unavailable'
  /** Rows selected. */
  scanned: number
  /** Rows whose body, chunks, vectors and FTS content were removed. */
  cleaned: number
  /** Rows in pages that threw; a non-zero count leaves the version unrecorded. */
  failed: number
}

export interface FileOverlongContentCleanupDeps<TRow extends FileOverlongContentCleanupRow> {
  getAppliedVersion: () => Promise<number | null>
  setAppliedVersion: (version: number) => Promise<void>
  /** Whether the write path is usable at all; false skips without recording. */
  isReady: () => boolean
  /** One id-ordered page of rows that still hold an over-long body. */
  loadPage: (afterId: number, limit: number) => Promise<TRow[]>
  /** Publishes the empty search documents, then clears the rows, under one mutation lease. */
  processPage: (rows: TRow[]) => Promise<void>
  /** Back-pressure hook: the pass must not outrun the write queue. */
  waitForWriteCapacity: () => Promise<void>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

export class FileProviderOverlongContentCleanupService<
  TRow extends FileOverlongContentCleanupRow = FileOverlongContentCleanupRow
> {
  constructor(private readonly deps: FileOverlongContentCleanupDeps<TRow>) {}

  async run(): Promise<FileOverlongContentCleanupResult> {
    const applied = await this.deps.getAppliedVersion()
    if (applied !== null && applied >= FILE_OVERLONG_CONTENT_CLEANUP_VERSION) {
      return { status: 'skipped', reason: 'already-applied', scanned: 0, cleaned: 0, failed: 0 }
    }
    if (!this.deps.isReady()) {
      return { status: 'skipped', reason: 'unavailable', scanned: 0, cleaned: 0, failed: 0 }
    }

    const counts = { scanned: 0, cleaned: 0, failed: 0 }
    let afterId = 0
    // A page that fails stays selected, so the cursor must move past it or it would be retried
    // forever within this run; the unrecorded version retries it on the next boot.
    for (;;) {
      const page = await this.deps.loadPage(afterId, PAGE_SIZE)
      if (page.length === 0) break
      afterId = page[page.length - 1]!.id
      counts.scanned += page.length

      await this.deps.waitForWriteCapacity()
      try {
        await this.deps.processPage(page)
        counts.cleaned += page.length
      } catch (error) {
        counts.failed += page.length
        this.deps.logWarn('Failed to clear an over-long content page', error, {
          afterId,
          rows: page.length
        })
      }
    }

    if (counts.failed === 0) {
      await this.deps.setAppliedVersion(FILE_OVERLONG_CONTENT_CLEANUP_VERSION)
    }
    this.deps.logInfo('Over-long content cleanup completed', {
      version: FILE_OVERLONG_CONTENT_CLEANUP_VERSION,
      ...counts
    })
    return { status: 'completed', ...counts }
  }
}
