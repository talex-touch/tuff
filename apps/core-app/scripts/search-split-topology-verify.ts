#!/usr/bin/env tsx
/**
 * Measures the search-index split topology in a CoreApp profile, and judges it (#1748).
 *
 * The gate this serves is about **silent divergence**: a provider writing `database.db` while
 * readers consume `search-index.db`. Nothing errors when that happens — the file simply never
 * appears in search — so the only way to close it is to count rows in both files and say which
 * ones are in the wrong place.
 *
 * This does the measuring and the judging. It does **not** launch CoreApp: doing that correctly
 * needs a packaged bundle and CDP, and `coreapp-packaged-indexing-diagnostics-probe.ts` already
 * owns that shape. Run the app yourself against a disposable profile, then point this at it.
 *
 *   # criterion 2 — default-on split, after a first-launch index
 *   pnpm search-split:topology:verify -- --profile /tmp/tuff-split-on --expect-split \
 *     --log ~/Library/Logs/TalexTouch/main.log --out /tmp/split-on.json
 *
 *   # criterion 3 — relaunch the same profile with TUFF_DB_SEARCH_SPLIT_ENABLED=0, then
 *   pnpm search-split:topology:verify -- --profile /tmp/tuff-split-on --expect-shared \
 *     --baseline /tmp/split-on.json
 *
 * Exit code is 0 only when every check passes, so it can gate a release review directly.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

/**
 * Tables the worker owns *wholesale*. `file_extensions` is deliberately absent: like `files` it is
 * split by owner, not by table -- the app catalog's extensions live on the primary alongside their
 * rows. A live profile showed 2,300 of them there with the split healthy, so counting the table
 * whole reports a failure on every correct install.
 */
const SEARCH_OWNED = [
  'file_index_progress',
  'scan_progress',
  'search_index',
  'keyword_mappings'
] as const

/**
 * `files` is split by `type`, not wholesale: `type='app'` is the app catalog and stays on the
 * primary on purpose (`app-provider.ts` keeps it there because it includes user-authored managed
 * entries), while every other type is file-provider data owned by the worker.
 */
const APP_ROW_TYPE = 'app'

export interface TableCounts {
  /** null means the table is absent from that file, which is different from present-but-empty. */
  [table: string]: number | null
}

export interface Topology {
  profile: string
  primary: TableCounts
  search: TableCounts
  /** `files` rows split by `type`, per file. */
  primaryFilesByType: Record<string, number>
  searchFilesByType: Record<string, number>
  /** `file_extensions` on the primary whose owning row is NOT `type='app'`. Must be zero. */
  primaryNonAppExtensions: number | null
}

export interface Check {
  name: string
  ok: boolean
  detail: string
}

function total(byType: Record<string, number>, exclude?: string): number {
  return Object.entries(byType)
    .filter(([type]) => type !== exclude)
    .reduce((sum, [, count]) => sum + count, 0)
}

/**
 * Judge a measured topology.
 *
 * `expect` is the flag the app was actually run with, not a guess — passing the wrong one turns a
 * real divergence into a green run, so the CLI requires it explicitly rather than defaulting.
 */
export function judgeTopology(topology: Topology, expect: 'split' | 'shared'): Check[] {
  const checks: Check[] = []
  const fileRowsPrimary = total(topology.primaryFilesByType, APP_ROW_TYPE)
  const fileRowsSearch = total(topology.searchFilesByType, APP_ROW_TYPE)
  const appRowsPrimary = topology.primaryFilesByType[APP_ROW_TYPE] ?? 0
  const appRowsSearch = topology.searchFilesByType[APP_ROW_TYPE] ?? 0

  if (expect === 'shared') {
    checks.push({
      name: 'search-index.db is not the live store',
      ok: fileRowsSearch === 0,
      detail: `search-index.db holds ${fileRowsSearch} non-app file rows; with the split off it should hold none`
    })
    checks.push({
      name: 'the shared file carries the index',
      ok: fileRowsPrimary > 0,
      detail: `database.db holds ${fileRowsPrimary} non-app file rows`
    })
    return checks
  }

  // The divergence the gate exists to catch, stated as the thing that must be zero.
  checks.push({
    name: 'no file rows stranded on the primary',
    ok: fileRowsPrimary === 0,
    detail:
      fileRowsPrimary === 0
        ? 'database.db holds no non-app file rows'
        : `database.db holds ${fileRowsPrimary} non-app file rows — a writer is still on the primary`
  })
  checks.push({
    name: 'the search file is actually populated',
    ok: fileRowsSearch > 0,
    detail: `search-index.db holds ${fileRowsSearch} non-app file rows`
  })

  // The app catalog is the mirror-image mistake: it must NOT have moved.
  if (topology.primaryNonAppExtensions !== null) {
    checks.push({
      name: 'no file extensions stranded on the primary',
      ok: topology.primaryNonAppExtensions === 0,
      detail:
        `database.db holds ${topology.primaryNonAppExtensions} file_extensions row(s) owned by ` +
        'non-app files (app-owned extensions belong there and are excluded)'
    })
  }

  checks.push({
    name: 'the app catalog stayed on the primary',
    ok: appRowsPrimary > 0 && appRowsSearch === 0,
    detail: `database.db app rows=${appRowsPrimary}, search-index.db app rows=${appRowsSearch} (expected >0 and 0)`
  })

  for (const table of SEARCH_OWNED) {
    const onPrimary = topology.primary[table]
    if (onPrimary === null || onPrimary === undefined) continue
    checks.push({
      name: `${table} is not written on the primary`,
      ok: onPrimary === 0,
      detail: `database.db ${table}=${onPrimary}, search-index.db ${table}=${topology.search[table] ?? 'absent'}`
    })
  }

  return checks
}

/**
 * Criterion 3: after the `=0` rollback and a restart, results must match the split-on run.
 *
 * Compared against the *file index*, deliberately: raw per-file counts differ between topologies
 * because the rows live somewhere else, so the invariant is the union, not the location.
 */
export function compareParity(before: Topology, after: Topology): Check[] {
  const indexed = (t: Topology): number =>
    total(t.primaryFilesByType, APP_ROW_TYPE) + total(t.searchFilesByType, APP_ROW_TYPE)
  const apps = (t: Topology): number =>
    (t.primaryFilesByType[APP_ROW_TYPE] ?? 0) + (t.searchFilesByType[APP_ROW_TYPE] ?? 0)

  return [
    {
      name: 'file count parity across the rollback',
      ok: indexed(before) === indexed(after),
      detail: `before=${indexed(before)} after=${indexed(after)}`
    },
    {
      name: 'app count parity across the rollback',
      ok: apps(before) === apps(after),
      detail: `before=${apps(before)} after=${apps(after)}`
    }
  ]
}

/** WAL/contention evidence. The gate asks for the absence of these, so absence has to be measured. */
export function judgeLog(logText: string): Check[] {
  const busy = (logText.match(/SQLITE_BUSY/g) ?? []).length
  // SQLite defines SQLITE_LOCKED as a separate lock result code, with its own message ("database
  // table is locked") that the text pattern below does not match. Substring matching also covers
  // the extended forms (SQLITE_LOCKED_SHAREDCACHE, …), as it does for SQLITE_BUSY's.
  const lockedCode = (logText.match(/SQLITE_LOCKED/g) ?? []).length
  const locked = (logText.match(/database is locked/gi) ?? []).length
  return [
    { name: 'no SQLITE_BUSY', ok: busy === 0, detail: `${busy} occurrence(s)` },
    { name: 'no SQLITE_LOCKED', ok: lockedCode === 0, detail: `${lockedCode} occurrence(s)` },
    { name: 'no "database is locked"', ok: locked === 0, detail: `${locked} occurrence(s)` }
  ]
}

/**
 * Only a confirmed missing table may read as "absent". Every other failure — lock, I/O,
 * permission, corruption — must propagate: mapping those onto `null` would turn a damaged or
 * contended profile into the silent pass this tool exists to remove. `@libsql/client` wraps the
 * driver error but preserves the SQLite message, so "no such table" is the stable discriminator.
 */
export function isMissingTableError(error: unknown): boolean {
  return error instanceof Error && /no such table/i.test(error.message)
}

/**
 * The app root inside a profile is named for how it was launched: `resolveRuntimeRootPath` uses
 * `APP_FOLDER_NAME` when packaged and `${APP_FOLDER_NAME}-dev` otherwise. A verifier that knew only
 * one of them would open two nonexistent files against the other, and `readCounts` would report
 * every table as absent -- which `judgeTopology` then reads as "the search file was never
 * populated". That is a partial pass on a profile it never opened, i.e. exactly the silence this
 * tool exists to remove, so `resolveProfileLayout` fails loudly instead of guessing.
 */
export const PROFILE_ROOT_NAMES = ['tuff', 'tuff-dev'] as const

export function candidateDatabaseDirs(profile: string): string[] {
  return PROFILE_ROOT_NAMES.map((root) => path.join(profile, root, 'modules', 'database'))
}

export function databasePathsForDir(dir: string): { primary: string; search: string } {
  return { primary: path.join(dir, 'database.db'), search: path.join(dir, 'search-index.db') }
}

/** Picks the layout whose primary database exists. `exists` is injected so this stays testable. */
export function resolveProfileLayout(
  profile: string,
  exists: (candidate: string) => boolean
): { primary: string; search: string } {
  for (const dir of candidateDatabaseDirs(profile)) {
    const paths = databasePathsForDir(dir)
    if (exists(paths.primary)) return paths
  }
  throw new Error(
    `no database.db under ${profile} -- looked in ${PROFILE_ROOT_NAMES.map((r) => `${r}/modules/database`).join(' and ')}. ` +
      'Point --profile at the userData directory itself, not at the app root inside it.'
  )
}

async function readCounts(
  dbPath: string,
  tables: readonly string[]
): Promise<{
  counts: TableCounts
  filesByType: Record<string, number>
  nonAppExtensions: number | null
}> {
  const { createClient } = await import('@libsql/client')
  const client = createClient({ url: `file:${dbPath}` })
  const counts: TableCounts = {}
  const filesByType: Record<string, number> = {}
  let nonAppExtensions: number | null = null
  try {
    for (const table of tables) {
      try {
        // `table` comes from the SEARCH_OWNED const list; identifiers cannot be bound parameters,
        // and nothing user-controlled reaches this string.
        const result = await client.execute(`SELECT count(*) AS c FROM ${table}`)
        counts[table] = Number(result.rows[0]?.c ?? 0)
      } catch (error) {
        if (!isMissingTableError(error)) throw error
        // Absent table, not an empty one. Kept distinct so a missing migration cannot read as 0.
        counts[table] = null
      }
    }
    try {
      const rows = await client.execute('SELECT type, count(*) AS c FROM files GROUP BY type')
      for (const row of rows.rows) filesByType[String(row.type)] = Number(row.c ?? 0)
    } catch (error) {
      // `files` absent: leave the map empty.
      if (!isMissingTableError(error)) throw error
    }
    try {
      const rows = await client.execute(
        "SELECT count(*) AS c FROM file_extensions WHERE file_id IN (SELECT id FROM files WHERE type != 'app')"
      )
      nonAppExtensions = Number(rows.rows[0]?.c ?? 0)
    } catch (error) {
      if (!isMissingTableError(error)) throw error
      nonAppExtensions = null
    }
  } finally {
    client.close()
  }
  return { counts, filesByType, nonAppExtensions }
}

export async function readTopology(profile: string): Promise<Topology> {
  const { primary, search } = resolveProfileLayout(profile, (candidate) => existsSync(candidate))
  const [a, b] = await Promise.all([
    readCounts(primary, SEARCH_OWNED),
    readCounts(search, SEARCH_OWNED)
  ])
  return {
    profile,
    primary: a.counts,
    search: b.counts,
    primaryFilesByType: a.filesByType,
    searchFilesByType: b.filesByType,
    primaryNonAppExtensions: a.nonAppExtensions
  }
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main(): Promise<void> {
  const profile = arg('profile')
  if (!profile) {
    console.error(
      'usage: search-split-topology-verify --profile <dir> (--expect-split|--expect-shared)'
    )
    console.error('       [--baseline <json>] [--log <file>] [--out <json>]')
    process.exit(2)
  }
  const expectSplit = has('expect-split')
  const expectShared = has('expect-shared')
  if (expectSplit && expectShared) {
    // Contradictory input must not be silently interpreted: whichever one this picked, the run
    // would judge against an expectation nobody stated.
    console.error('contradictory: pass exactly one of --expect-split or --expect-shared, not both')
    process.exit(2)
  }
  const expect = expectSplit ? 'split' : expectShared ? 'shared' : null
  if (!expect) {
    console.error(
      'refusing to guess: pass --expect-split or --expect-shared to say which flag the app ran with'
    )
    process.exit(2)
  }

  const topology = await readTopology(profile)
  const checks = judgeTopology(topology, expect)

  const logPath = arg('log')
  // A log that cannot be read is a failed run, not a clean one — swallowing the error here would
  // judge absence of evidence as evidence of absence. The read error propagates to main's catch,
  // which reports it and exits nonzero.
  if (logPath) checks.push(...judgeLog(await readFile(logPath, 'utf8')))

  const baselinePath = arg('baseline')
  if (baselinePath) {
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as Topology
    checks.push(...compareParity(baseline, topology))
  }

  const outPath = arg('out')
  if (outPath) {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(outPath, `${JSON.stringify(topology, null, 2)}\n`)
  }

  for (const check of checks) {
    console.log(`  ${check.ok ? '[32m✓[0m' : '[31m✗[0m'} ${check.name}: ${check.detail}`)
  }
  const failed = checks.filter((check) => !check.ok).length
  console.log(
    failed === 0
      ? `\n[search-split-topology] ${checks.length} checks passed for ${profile}\n`
      : `\n[search-split-topology] ${failed} of ${checks.length} checks FAILED for ${profile}\n`
  )
  process.exit(failed === 0 ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
