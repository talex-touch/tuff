import { encodeVectorBlob, readStoredVector } from '../../../../../db/embedding-vector-codec'

/**
 * One-time conversion of `embeddings.embedding` from JSON text to a float32 BLOB.
 *
 * A 768-dimension vector is about 16 KB as JSON and 3 KB as a BLOB, so a profile with 105k vectors
 * drops from 1.8 GB to about 0.3 GB. Both formats stay readable (`readStoredVector`), so the pass
 * can run at any pace and be interrupted at any point: a row is either still JSON or already a
 * BLOB, never half of either.
 *
 * It is a paged pass, not a SQL migration, for two reasons. It rewrites every vector, which would
 * hold startup for minutes and grow the WAL by the size of the table. And libSQL's `vector32()`
 * throws on the first malformed row (`[1,null]` is valid JSON and still fails), which would abort a
 * bulk `UPDATE` half way. A row that cannot be decoded is left as it is: the reader skips it
 * today and keeps skipping it, and deleting it would leave its file marked `completed` with no
 * vector to recall it by.
 */
export const FILE_EMBEDDING_BLOB_MIGRATION_VERSION = 1

const PAGE_SIZE = 200

export interface FileEmbeddingBlobMigrationRow {
  id: number
  embedding: string
}

export interface FileEmbeddingBlobMigrationResult {
  status: 'skipped' | 'completed'
  reason?: 'already-applied' | 'unavailable'
  /** JSON rows read. */
  scanned: number
  /** Rows rewritten as BLOB. */
  converted: number
  /** Rows that could not be decoded and were left untouched. */
  undecodable: number
  /** Rows in pages whose write threw; a non-zero count leaves the version unrecorded. */
  failed: number
}

export interface FileEmbeddingBlobMigrationDeps {
  getAppliedVersion: () => Promise<number | null>
  setAppliedVersion: (version: number) => Promise<void>
  /** Whether the write path is usable at all; false skips without recording. */
  isReady: () => boolean
  /** One id-ordered page of rows whose `embedding` is still text. */
  loadPage: (afterId: number, limit: number) => Promise<FileEmbeddingBlobMigrationRow[]>
  /** Rewrites rows, each only while it is still text (a concurrent rewrite wins). */
  writePage: (updates: Array<{ id: number; blob: Uint8Array }>) => Promise<void>
  /** Back-pressure hook: the pass must not outrun the write queue. */
  waitForWriteCapacity: () => Promise<void>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

export class FileProviderEmbeddingBlobMigrationService {
  constructor(private readonly deps: FileEmbeddingBlobMigrationDeps) {}

  async run(): Promise<FileEmbeddingBlobMigrationResult> {
    const applied = await this.deps.getAppliedVersion()
    if (applied !== null && applied >= FILE_EMBEDDING_BLOB_MIGRATION_VERSION) {
      return { status: 'skipped', reason: 'already-applied', ...EMPTY_COUNTS }
    }
    if (!this.deps.isReady()) return { status: 'skipped', reason: 'unavailable', ...EMPTY_COUNTS }

    const counts = { ...EMPTY_COUNTS }
    let afterId = 0
    for (;;) {
      const page = await this.deps.loadPage(afterId, PAGE_SIZE)
      if (page.length === 0) break
      afterId = page[page.length - 1]!.id
      counts.scanned += page.length

      const updates: Array<{ id: number; blob: Uint8Array }> = []
      for (const row of page) {
        const vector = this.decode(row.embedding)
        if (vector) updates.push({ id: row.id, blob: encodeVectorBlob(vector) })
        else counts.undecodable += 1
      }
      if (updates.length === 0) continue

      await this.deps.waitForWriteCapacity()
      try {
        await this.deps.writePage(updates)
        counts.converted += updates.length
      } catch (error) {
        // The cursor still advances so one unwritable page cannot stall the rest; the version stays
        // unrecorded, so the next boot walks again and the pages that did land are skipped by type.
        counts.failed += updates.length
        this.deps.logWarn('Failed to convert an embedding page to BLOB', error, {
          afterId,
          rows: updates.length
        })
      }
    }

    if (counts.failed === 0)
      await this.deps.setAppliedVersion(FILE_EMBEDDING_BLOB_MIGRATION_VERSION)
    this.deps.logInfo('Embedding BLOB migration completed', {
      version: FILE_EMBEDDING_BLOB_MIGRATION_VERSION,
      ...counts
    })
    return { status: 'completed', ...counts }
  }

  /** Decodes JSON text of any dimension; `null` when it is not a finite numeric array. */
  private decode(text: string): ArrayLike<number> | null {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return null
    }
    return Array.isArray(parsed) && parsed.length > 0 ? readStoredVector(text, parsed.length) : null
  }
}

const EMPTY_COUNTS = { scanned: 0, converted: 0, undecodable: 0, failed: 0 }
