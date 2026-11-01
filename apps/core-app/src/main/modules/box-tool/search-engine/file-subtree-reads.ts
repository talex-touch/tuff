import type { SQL } from 'drizzle-orm'
import path from 'node:path'
import { sql } from 'drizzle-orm'

export type FileSubtreeReadAll = <T>(query: SQL, signal?: AbortSignal) => Promise<T[]>

/**
 * Up to this many path-index entries a scope is paged through the index; beyond it, by rowid.
 * Cold sweeps on a 6.4GB index (2026-10-30): 4.3k entries 0.15s against 5.4s by rowid, 15k 2.8s
 * against 5.6s, 22k 5.1s against 5.4s.
 */
export const FILE_SUBTREE_SMALL_SCOPE_LIMIT = 16_384

/**
 * Codes with which the read worker client rejects when the reader is down, cooling down after
 * repeated failures, queued past its depth, or has timed out; see `search-index-read-worker-client.ts`.
 * They say nothing about the query, so a later pass may repeat it.
 */
const TRANSIENT_READ_CODES: ReadonlySet<string> = new Set([
  'SEARCH_INDEX_READ_WORKER_UNAVAILABLE',
  'SEARCH_INDEX_READ_QUEUE_FULL',
  'SEARCH_INDEX_READ_TIMEOUT'
])

export function isTransientSubtreeReadError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' && TRANSIENT_READ_CODES.has(code)
}

export interface FileSubtreeBound {
  /** At least the id of every `files` row inside the scope when it was read; later inserts exceed it. */
  highWaterMark: number
  small: boolean
}

export interface FileSubtreePageRow {
  id: number
  path: string
  mtime: number | null
  ctime: number | null
  size: number | null
  lastIndexedAt: number | null
}

/**
 * `[exact, upper)` holds the scope, its descendants and, as extras, siblings whose names extend the
 * scope's with a character below `/`. `exact = scope OR path >= prefix` removes the extras.
 * Compared BINARY, not `LIKE`: a `LIKE` cannot use `files_path_unique`.
 */
function scopeRange(scope: string): { exact: string; prefix: string; upper: string } {
  const exact = path.normalize(scope)
  const prefix = exact.endsWith(path.sep) ? exact : `${exact}${path.sep}`
  const upper = `${prefix.slice(0, -1)}${String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1)}`
  return { exact, prefix, upper }
}

/**
 * Index-only: no `type` test, so no `files` row is fetched. The ids it yields may include rows the
 * pages later refuse, which only makes the bound looser.
 */
function probeQuery(scope: string): SQL {
  const { exact, upper } = scopeRange(scope)
  return sql`SELECT count(*) AS n, max(id) AS maxId FROM (
    SELECT id FROM files INDEXED BY files_path_unique
    WHERE path >= ${exact} AND path < ${upper}
    LIMIT ${FILE_SUBTREE_SMALL_SCOPE_LIMIT + 1})`
}

const MAX_ID_QUERY = sql`SELECT max(id) AS maxId FROM files`

/**
 * Bound for the missing-file sweep of one scope, in two index-only statements at most.
 *
 * It used to be the scope's largest file id read with `type = 'file' AND <scope> ORDER BY id DESC
 * LIMIT 1`: the planner fetched every `files` row in the scope to test `type` and sorted them,
 * 6.5s on a cold 6.4GB index for a scope that holds most of it. A small scope is bounded by its own
 * largest id. A large one is bounded by the table's: ids never repeat, so rows inserted after this
 * read still exceed it, and the pages filter the scope themselves.
 */
export async function readFileSubtreeBound(
  readAll: FileSubtreeReadAll,
  scope: string,
  signal?: AbortSignal
): Promise<FileSubtreeBound> {
  const [probe] = await readAll<{ n: number; maxId: number | null }>(probeQuery(scope), signal)
  if (Number(probe?.n ?? 0) <= FILE_SUBTREE_SMALL_SCOPE_LIMIT) {
    return { highWaterMark: Number(probe?.maxId ?? 0), small: true }
  }
  const [table] = await readAll<{ maxId: number | null }>(MAX_ID_QUERY, signal)
  return { highWaterMark: Number(table?.maxId ?? 0), small: false }
}

/**
 * One keyset page of file rows in the scope with `afterId < id <= throughId`, in id order.
 *
 * A small scope is read through `files_path_unique`: without table statistics the planner walks
 * the rowid range instead and tests every row in it, which for a scope of a few dozen files
 * between old and new ids is most of the table. A large scope is dense in the rowid range, where
 * the walk is the cheap plan and a path range would sort the whole scope for every page; both
 * plans are pinned, which also keeps `idx_files_type` out of the choice.
 */
export async function readFileSubtreePage(
  readAll: FileSubtreeReadAll,
  scope: string,
  small: boolean,
  afterId: number,
  throughId: number,
  limit: number,
  signal?: AbortSignal
): Promise<FileSubtreePageRow[]> {
  const { exact, prefix, upper } = scopeRange(scope)
  const source = small ? sql`files INDEXED BY files_path_unique` : sql`files NOT INDEXED`
  const rows = await readAll<FileSubtreePageRow>(
    sql`SELECT id, path, mtime, ctime, size, last_indexed_at AS lastIndexedAt
        FROM ${source}
        WHERE type = 'file' AND id > ${afterId} AND id <= ${throughId}
          AND path >= ${exact} AND path < ${upper}
          AND (path = ${exact} OR path >= ${prefix})
        ORDER BY id LIMIT ${limit}`,
    signal
  )
  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    mtime: row.mtime ?? null,
    ctime: row.ctime ?? null,
    size: row.size ?? null,
    lastIndexedAt: row.lastIndexedAt ?? null
  }))
}
