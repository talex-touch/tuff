import { opendir } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { DbIntegrity } from '../eval-types'
import { describeError } from './errors'

const DATABASE_SUFFIXES = ['.db', '.sqlite', '.sqlite3']
const MAX_DEPTH = 8
const MAX_ENTRIES = 200_000
const MAX_DETAIL_ROWS = 5

/** `*.db`, `*.sqlite` and `*.sqlite3` under the profile, relative and sorted; sidecar files and quarantined `*.corrupt` files are not databases. */
export async function findDatabases(profileDir: string): Promise<string[]> {
  const found: string[] = []
  let seen = 0
  const visit = async (dir: string, depth: number): Promise<void> => {
    let handle
    try {
      handle = await opendir(dir)
    } catch {
      return
    }
    for await (const entry of handle) {
      if (++seen > MAX_ENTRIES) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH) await visit(full, depth + 1)
      } else if (
        entry.isFile() &&
        DATABASE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))
      ) {
        found.push(path.relative(profileDir, full))
      }
    }
  }
  await visit(profileDir, 0)
  return found.sort()
}

/** What `PRAGMA quick_check` printed, opened read-only: a single `ok` row means the file is sound. */
export function quickCheck(file: string): string[] {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    return db
      .prepare('PRAGMA quick_check')
      .all()
      .map((row) => String(Object.values(row as Record<string, unknown>)[0]))
  } finally {
    db.close()
  }
}

export interface DbIntegrityDeps {
  findDatabases: (profileDir: string) => Promise<string[]>
  quickCheck: (file: string) => string[]
}

/**
 * Checks every database under the profile without writing to it. Call it only after the app quit:
 * a running app holds the files open. `checked` is false when no database was found, because a pass
 * on nothing would be a false green.
 */
export async function checkDatabases(
  profileDir: string,
  deps: DbIntegrityDeps = { findDatabases, quickCheck }
): Promise<DbIntegrity> {
  const results: DbIntegrity['results'] = []
  for (const relative of await deps.findDatabases(profileDir)) {
    try {
      const rows = deps.quickCheck(path.join(profileDir, relative))
      if (rows.length === 1 && rows[0] === 'ok') results.push({ file: relative, ok: true })
      else {
        const shown = rows.slice(0, MAX_DETAIL_ROWS).join('; ')
        results.push({
          file: relative,
          ok: false,
          detail: `quick_check: ${shown}${rows.length > MAX_DETAIL_ROWS ? ` (+${rows.length - MAX_DETAIL_ROWS} more)` : ''}`
        })
      }
    } catch (error) {
      results.push({
        file: relative,
        ok: false,
        detail: `quick_check could not run: ${describeError(error)}`
      })
    }
  }
  return { checked: results.length > 0, results }
}
