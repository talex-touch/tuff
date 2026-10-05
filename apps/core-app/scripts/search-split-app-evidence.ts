#!/usr/bin/env tsx
/**
 * Application evidence for the search-index split, collected from an **isolated** CoreApp profile.
 *
 *   docs/engineering/reports/search-index-split-write-acceptance.md
 *
 * The release gate (`prd.md` R3) asks for a CoreApp run that proves, in one place: worker-owned
 * `search-index.db`, provider readiness ordering, app/file count and query parity, no
 * primary-database worker writes, and the `TUFF_DB_SEARCH_SPLIT_ENABLED=0` rollback.
 * `search-split-topology-verify.ts` measures a profile an operator launched by hand and judges it:
 * it never launches anything, cannot detect a write that was later deleted, and its "shared" branch
 * is wrong for a rolled-back profile (see below). This script is the launcher, the detector and the
 * judge for that gate.
 *
 * ## Safety contract (hard, not advisory)
 *
 * The profile is created under a temp root and is the only CoreApp profile this process ever points
 * the app at. `assertIsolatedProfileDir` refuses a path that is not under `os.tmpdir()`, `/tmp` or
 * `/private/tmp`, and separately refuses a path inside the repository or under the home directory.
 * Because either check can be defeated by a symlinked ancestor, the resolved path (the nearest
 * existing ancestor's realpath, with the not-yet-created tail re-joined) is checked against the same
 * temp root, home and repository. `prepareIsolatedProfile` re-runs the guard on direct import, and
 * the fixture root must be a real subtree of the profile (`assertIsolatedFixtureRoot`); only a
 * directory this harness owns may be reset. The launcher sets `HOME` to the fixture root, so the
 * app's own caches and file-provider roots stay inside the temp profile. `TUFF_STARTUP_BENCHMARK_DIAG_PATH` makes precore report the
 * `userData` it actually applied, and the run fails unless that equals `--profile`: "we isolated
 * it" is measured, not asserted by us.
 *
 * ## Assertion matrix
 *
 * | id | phase | assertion | evidence |
 * |----|-------|-----------|----------|
 * | isolation-effective | all | the app ran against the temp profile | precore diagnostic `userDataAfter` == `--profile` |
 * | app-booted | all | CoreApp reached a running state | CDP endpoint answers `/json/list` |
 * | indexing-settled | all | indexing finished inside the budget | non-app `files` rows stable for `--stableMs` |
 * | the worker owns its own database file | bootstrap, split | the worker opened the split file, not the primary | log `Search index database initialized` with a `path` under the profile |
 * | no silent fallback to the primary database | bootstrap, split | search init did not degrade to the shared topology | absence of both `falling back to primary DB` warns |
 * | provider writes waited for writer readiness | all | no split write ran before writer admission | absence of `File persistence port operation skipped: {port,readiness} unavailable` and of the writer failure codes |
 * | no contention warnings | all | no busy storm | log scan of `SQLITE_BUSY` / `SQLITE_LOCKED` / `database is locked` + health-threshold warns |
 * | judgeTopology(…, 'split') | bootstrap, split | index on the search home, no moved rows on the primary, app catalog not split | row counts in both files |
 * | the write detector is armed | bootstrap, split | every core guard was installed and survived the run | `sqlite_master` triggers on `database.db` |
 * | first-launch-reindex | bootstrap | an absent search file is rebuilt from scratch | `search-index.db` absent before the run, non-app `files` rows after |
 * | no worker-owned write reached the primary | bootstrap, split | nothing wrote worker-owned data to `database.db`, including rows deleted again later | `tuff_split_write_sentinel` rows (AFTER INSERT/UPDATE/DELETE triggers on the primary) |
 * | the retired search file is not written while the split is off | rollback | `=0` stops writing the split home | search-home non-app `files` count must not grow past the split value |
 * | the shared file carries the index again | rollback | the primary becomes the live store | non-app `files` rows on the primary |
 * | the app catalog is still on the primary | rollback | the catalog did not move into the retired file | `files` rows by type in both files |
 * | no app rows in the retired search file | rollback | the catalog never ends up on the search home | search-home app rows == 0 |
 * | rollback writes reach the primary (positive control) | rollback | the detector is live and `=0` really routes to the primary | sentinel rows > 0 |
 * | profile-topology-measured | all | a run that left no `database.db` is a failure, not a skip | file existence |
 * | count-parity / query-parity | parity | each **live home** answers the same counts and the same rows before and after the rollback (never the union of both files) | `compareParity(…, 'shared')` + per-query digests |

 * ## What the harness refuses to guess
 *
 * A check is either `passed`, `failed`, or `not-exercised`. `failed` blocks. `not-exercised` means
 * the evidence could not exist in this profile (an unarmed trigger, an app catalog with no rows,
 * a log whose timestamps could not be parsed) and is listed separately in the report — an
 * unmeasurable claim is never reported as a measured one.
 *
 * ## Why the rollback phase is not `judgeTopology(…, 'shared')`
 *
 * That branch asserts "search-index.db holds no non-app file rows", which is right for a profile
 * that never ran with the split and wrong for a genuine rollback: the retired `search-index.db`
 * still holds what the worker wrote before `=0`. The live-store question there is whether the
 * *primary* carries the index and whether the search home stopped changing, which is what
 * `judgeRollbackTopology` measures. That residue is also why `design.md` calls rollback a
 * data-preserving transition rather than a flag flip.
 *
 * ## Boundaries (what a green report does NOT prove)
 *
 * - No renderer-level search: rows are read from the databases the app wrote, not from the UI.
 * - No embedding-routing assertion: the split-aware `EmbeddingService` unit evidence owns that
 *   contract; `embeddings` is not sentinel-guarded here.
 * - Not every table accepts a trigger (`search_index` is an FTS5 virtual table). Each attempted
 *   guard is reported as installed or skipped, and an unarmed detector fails rather than passing.
 * - The app catalog is asserted only when the profile has catalog rows; an isolated profile may
 *   have none, and `--seedAppCatalog` exists to give the check something to bite on.
 *
 * ## Usage
 *
 *   # the whole gate: three launches, nothing outside the temp profile is touched
 *   pnpm -C apps/core-app run search-split:app-evidence -- --profile /tmp/tuff-split-evidence
 *
 *   # one phase at a time (state is kept inside the profile directory)
 *   pnpm -C apps/core-app run search-split:app-evidence -- --profile /tmp/tuff-split-evidence --phase bootstrap
 *
 *   # judgement only: no launch, no write
 *   pnpm -C apps/core-app run search-split:app-evidence -- --self-check
 *
 *   # re-judge an already collected state (same parity definition, no app run)
 *   pnpm -C apps/core-app run search-split:app-evidence -- \
 *     --profile /tmp/tuff-split-evidence --fromState /tmp/tuff-split-evidence/.search-split-evidence/state.json
 *
 * Exit code 0 only when no check failed. Offline cross-check of the same profile:
 * `pnpm -C apps/core-app run search-split:topology:verify -- --profile <dir> --expect-split`.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { lstat, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createClient, type Client } from '@libsql/client'
import {
  PROFILE_ROOT_NAMES,
  compareParity,
  judgeLog,
  judgeTopology,
  resolveProfileLayout,
  type Check,
  type TableCounts,
  type Topology
} from './search-split-topology-verify'

export const SEARCH_SPLIT_APP_EVIDENCE_SCHEMA = 'search-split-app-evidence/v1'

/** The flag under test. Unset for the split phases, so the run proves the **default**; `0` for the rollback. */
export const SPLIT_FLAG_ENV = 'TUFF_DB_SEARCH_SPLIT_ENABLED'
/** Isolated `userData`, consumed by `precore.applyStartupBenchmarkUserDataOverride`. */
export const USER_DATA_ENV = 'TUFF_STARTUP_BENCHMARK_USER_DATA_DIR'
/** Lets the single-instance guard accept a relaunch of the same profile. */
export const ISOLATED_MARKER_ENV = 'TUFF_PACKAGED_ACCEPTANCE_ISOLATED'
/** Precore writes the userData path it actually applied here; that is how isolation is verified. */
export const PRECORE_DIAG_ENV = 'TUFF_STARTUP_BENCHMARK_DIAG_PATH'
/** Forces the file provider's base watch roots into the fixture root. */
export const WATCH_ROOTS_ENV = 'TUFF_FILE_PROVIDER_BASE_WATCH_PATHS'

/** Table in `database.db` that records any write the split forbids. */
export const SENTINEL_TABLE = 'tuff_split_write_sentinel'
export const APP_ROW_TYPE = 'app'

/** Worker-owned tables, mirroring `SEARCH_OWNED` in the topology verifier plus the owner-split `files` mask. */
export const WORKER_OWNED_TABLES = [
  'files',
  'file_extensions',
  'file_index_progress',
  'scan_progress',
  'keyword_mappings',
  'search_index'
] as const

export const SPLIT_LOG_MARKERS = {
  searchDbInitialized: 'Search index database initialized',
  searchDbFallback: 'Search index database initialization failed; falling back to primary DB',
  searchDbRebuildFallback: 'Search index database rebuild failed; falling back to primary DB',
  portUnavailable: 'File persistence port operation skipped: port unavailable',
  readinessUnavailable: 'File persistence port operation skipped: readiness unavailable',
  contentionExceeded: 'Database health snapshot exceeded contention threshold'
} as const

/** Thrown or logged by the app when a split write runs without an admitted writer (`file-provider.ts`). */
export const WRITER_FAILURE_CODES = [
  'SEARCH_INDEX_WRITER_NOT_INITIALIZED',
  'SEARCH_INDEX_WRITER_CLOSED',
  'FILE_PERSISTENCE_PORT_UNAVAILABLE',
  'SEARCH_INDEX_SCHEMA_NOT_READY'
] as const

/** The split judge's app-catalog check, by name, so coverage can be reported without re-deriving it. */
export const APP_CATALOG_CHECK_NAME = 'the app catalog stayed on the primary'

/** Single FTS token, so the harness' own query does not depend on tokenizer punctuation rules. */
export const FIXTURE_SEARCH_TOKEN = 'tuffsplitevidence'

export const PHASES = ['bootstrap', 'split', 'rollback'] as const
export type PhaseName = (typeof PHASES)[number]

export interface SearchSplitAppEvidenceOptions {
  profile: string
  fixtureRoot: string
  launch: 'dev' | 'packaged'
  appBundle: string
  coreAppDir: string
  phase: PhaseName | 'all'
  cdpPort: number
  maxIndexMs: number
  quiescenceStableMs: number
  launchTimeoutMs: number
  seedAppCatalog: boolean
  explicitSplitFlag: boolean
  cleanupProfile: boolean
  printJson: boolean
  /** Re-judge a collected `state.json` instead of launching CoreApp. */
  fromState?: string
  out?: string
  repoSummary?: string
}

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

/**
 * A check that could not be measured is not a passing check.
 *
 * `failed` is the only state that blocks the run; `not-exercised` is surfaced in
 * `coverage.notExercised` and in the console summary, so a green exit never implies more coverage
 * than the run actually had.
 */
export interface EvidenceCheck extends Check {
  status: 'passed' | 'failed' | 'not-exercised'
}

function checked(name: string, ok: boolean, detail: string): EvidenceCheck {
  return { name, ok, detail, status: ok ? 'passed' : 'failed' }
}

export function notExercised(name: string, detail: string): EvidenceCheck {
  return { name, ok: true, detail, status: 'not-exercised' }
}

/** `judgeTopology` and friends return plain checks; this records them as measured outcomes. */
export function asEvidence(checks: Check[]): EvidenceCheck[] {
  return checks.map((check) => ({
    ...check,
    status: check.ok ? 'passed' : 'failed'
  }))
}

export function failedChecks(checks: EvidenceCheck[]): EvidenceCheck[] {
  return checks.filter((check) => check.status === 'failed')
}

// ---------------------------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------------------------

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/** Ownership marker written by `prepareIsolatedProfile`; only a marked (or empty) directory is reset. */
export const PROFILE_OWNERSHIP_MARKER = '.tuff-split-evidence-profile.json'
export const PROFILE_OWNERSHIP_SCHEMA = 'tuff.search-split-evidence.profile/v1'

function realpathOrSelf(target: string): string {
  try {
    return realpathSync.native(target)
  } catch {
    return path.resolve(target)
  }
}

/** The nearest existing ancestor's canonical path; the not-yet-created tail is re-joined. */
function canonicalizeNearestExisting(target: string): string {
  let current = target
  const missing: string[] = []
  while (!existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) break
    missing.unshift(path.basename(current))
    current = parent
  }
  let canonicalBase: string
  try {
    canonicalBase = realpathSync.native(current)
  } catch {
    throw new Error(`refusing to use ${target}: ${current} cannot be resolved on this filesystem`)
  }
  return missing.length > 0 ? path.join(canonicalBase, ...missing) : canonicalBase
}

/**
 * Refuse any profile that is not plainly disposable.
 *
 * Three independent gates, because each alone has a hole: a temp directory that happens to sit
 * inside the repository passes "under a temp root"; a directory named `tmp` inside the home
 * directory passes "not in the repo"; and a path under `/tmp` that is really a symlink into the real
 * home passes both. The app writes here for minutes with the split flag flipped, so a wrong answer
 * mutates a real profile instead of failing an assertion. The resolved-path gate looks through the
 * nearest existing ancestor, so `--profile /tmp/link-to-home/...` is rejected **before** anything is
 * created, and it still accepts a not-yet-created leaf under a genuine temp root.
 */
export function assertIsolatedProfileDir(profile: string, tmpRoot = os.tmpdir()): string {
  const target = path.resolve(profile)
  const allowedRoots = [tmpRoot, '/tmp', '/private/tmp'].map((entry) => path.resolve(entry))
  const canonicalRoots = allowedRoots.map((entry) => realpathOrSelf(entry))
  if (!allowedRoots.some((root) => isInside(target, root))) {
    throw new Error(
      `refusing to use ${target}: an evidence profile must live under ${allowedRoots.join(' | ')} ` +
        '(this run flips the search split and writes to the profile)'
    )
  }
  for (const root of [os.homedir(), process.cwd()]) {
    if (isInside(target, path.resolve(root))) {
      throw new Error(`refusing to use ${target}: it is inside ${path.resolve(root)}`)
    }
  }

  const resolved = canonicalizeNearestExisting(target)
  if (!canonicalRoots.some((root) => isInside(resolved, root))) {
    throw new Error(
      `refusing to use ${target}: it resolves to ${resolved}, outside ${canonicalRoots.join(' | ')} ` +
        '(a symlinked ancestor points the profile out of the temp root)'
    )
  }
  for (const root of [os.homedir(), process.cwd()]) {
    const canonicalRoot = realpathOrSelf(root)
    if (resolved === canonicalRoot || isInside(resolved, canonicalRoot)) {
      throw new Error(
        `refusing to use ${target}: it resolves to ${resolved}, inside ${canonicalRoot}`
      )
    }
  }
  return target
}

/**
 * The fixture root (the app's fake `HOME` and file-provider watch root) must be a real subtree of the
 * isolated profile: lexically inside it **and** still inside it once the nearest existing ancestor is
 * resolved. A fixture root that is a symlink elsewhere would make the app index and write outside the
 * disposable profile, so the resolved path is what is checked.
 */
export function assertIsolatedFixtureRoot(profile: string, fixtureRoot: string): string {
  const target = assertIsolatedProfileDir(profile)
  const fixture = path.resolve(fixtureRoot)
  if (!isInside(fixture, target)) {
    throw new Error(
      `refusing fixture root ${fixture}: it must be a subdirectory of the isolated profile ${target}`
    )
  }
  const resolvedProfile = canonicalizeNearestExisting(target)
  const resolvedFixture = canonicalizeNearestExisting(fixture)
  if (!isInside(resolvedFixture, resolvedProfile)) {
    throw new Error(
      `refusing fixture root ${fixture}: it resolves to ${resolvedFixture}, outside ${resolvedProfile} ` +
        '(a symlink points the fixture root out of the isolated profile)'
    )
  }
  return fixture
}

/** True only when the directory carries this harness' own ownership marker. */
export async function hasProfileOwnershipMarker(profile: string): Promise<boolean> {
  try {
    const marker = JSON.parse(
      await readFile(path.join(path.resolve(profile), PROFILE_OWNERSHIP_MARKER), 'utf8')
    ) as Record<string, unknown>
    return marker?.schema === PROFILE_OWNERSHIP_SCHEMA
  } catch {
    return false
  }
}

export interface ProfileHome {
  root: string
  databaseDir: string
  logsDir: string
  primary: string
  search: string
}

/** Layout of one app root inside a profile: `tuff` when packaged, `tuff-dev` otherwise. */
export function describeProfileHome(profile: string, rootName: string): ProfileHome {
  const root = path.join(profile, rootName)
  const databaseDir = path.join(root, 'modules', 'database')
  return {
    root,
    databaseDir,
    logsDir: path.join(root, 'logs'),
    primary: path.join(databaseDir, 'database.db'),
    search: path.join(databaseDir, 'search-index.db')
  }
}

/**
 * The layout whose primary database exists, or `null` when the app has not run yet.
 *
 * Deliberately not `readTopology`: `@libsql/client` creates a `file:` database on open, so probing
 * a not-yet-created `search-index.db` would fabricate the very artifact the `first-launch-reindex`
 * check needs to observe as absent.
 */
export function tryResolveProfileLayout(
  profile: string
): { primary: string; search: string } | null {
  try {
    return resolveProfileLayout(profile, (candidate) => existsSync(candidate))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------------------------
// Log signals
// ---------------------------------------------------------------------------------------------

export interface SplitLogSignals {
  searchDbInitialized: boolean
  /** `path` from the initialization line: which file the worker actually opened. */
  searchDbPath: string | null
  fallbackWarnings: string[]
  readinessFailures: string[]
  writerFailureCodes: string[]
  contentionWarnings: number
  linesSeen: number
}

const LOG_TIME = /^\[(\d{4}-\d{2}-\d{2}T[\d:.]+)\]/

/** log4js' default basic layout: `[2026-09-29T10:00:03.200] [INFO] database - message {…}`. */
function logLineTimeMs(line: string): number | null {
  const match = LOG_TIME.exec(line)
  if (!match) return null
  const parsed = Date.parse(match[1])
  return Number.isNaN(parsed) ? null : parsed
}

export interface PhaseLogWindow {
  startedAtMs: number
  endedAtMs: number
  /** False when the file carried no parseable timestamps, so the window could not be applied. */
  bounded: boolean
}

/**
 * The clock a log line is written with can precede the harness' own start by a few milliseconds
 * (process spawn, appender init). Without a little slack the first line of a phase is attributed to
 * the previous one, which on the split phases is where the initialization marker lives.
 */
export const PHASE_LOG_SLACK_MS = 1000

/** Lines written inside a phase window. Undated lines are dropped only when the file is datable. */
export function sliceLogForPhase(logText: string, window: PhaseLogWindow): string {
  const lines = logText.split('\n')
  const datable = lines.some((line) => logLineTimeMs(line) !== null)
  window.bounded = datable
  if (!datable) return logText
  return lines
    .filter((line) => {
      const at = logLineTimeMs(line)
      if (at === null) return false
      return (
        at >= window.startedAtMs - PHASE_LOG_SLACK_MS && at <= window.endedAtMs + PHASE_LOG_SLACK_MS
      )
    })
    .join('\n')
}

export function parseSplitLogSignals(logText: string): SplitLogSignals {
  const lines = logText.split('\n')
  const signals: SplitLogSignals = {
    searchDbInitialized: false,
    searchDbPath: null,
    fallbackWarnings: [],
    readinessFailures: [],
    writerFailureCodes: [],
    contentionWarnings: 0,
    linesSeen: lines.length
  }

  for (const line of lines) {
    if (line.includes(SPLIT_LOG_MARKERS.searchDbInitialized)) {
      signals.searchDbInitialized = true
      // The meta payload is JSON-ish inside a free-text line; the last `"path":` on that line is
      // the one `dbLog.info('Search index database initialized', { meta: { path } })` emitted.
      const paths = [...line.matchAll(/"path"\s*:\s*"([^"]+)"/g)]
      if (paths.length > 0) signals.searchDbPath = paths[paths.length - 1][1]
    }
    if (
      line.includes(SPLIT_LOG_MARKERS.searchDbFallback) ||
      line.includes(SPLIT_LOG_MARKERS.searchDbRebuildFallback)
    ) {
      signals.fallbackWarnings.push(line.trim())
    }
    if (
      line.includes(SPLIT_LOG_MARKERS.portUnavailable) ||
      line.includes(SPLIT_LOG_MARKERS.readinessUnavailable)
    ) {
      signals.readinessFailures.push(line.trim())
    }
    if (line.includes(SPLIT_LOG_MARKERS.contentionExceeded)) signals.contentionWarnings += 1
    for (const code of WRITER_FAILURE_CODES) {
      if (line.includes(code) && !signals.writerFailureCodes.includes(code)) {
        signals.writerFailureCodes.push(code)
      }
    }
  }

  return signals
}

/** The split-specific marker: with `=0` the search database is never initialised, so it is absent by design. */
export function judgeSearchDbMarker(
  signals: SplitLogSignals,
  expectedSearchPath: string
): EvidenceCheck {
  const pathMatches =
    signals.searchDbPath !== null &&
    path.resolve(signals.searchDbPath) === path.resolve(expectedSearchPath)
  return checked(
    'the worker owns its own database file',
    signals.searchDbInitialized && pathMatches,
    signals.searchDbInitialized
      ? `Search index database initialized with path=${signals.searchDbPath ?? '<none>'}`
      : 'the search database initialization line is missing from the run log'
  )
}

export function judgeNoPrimaryFallback(signals: SplitLogSignals): EvidenceCheck {
  return checked(
    'no silent fallback to the primary database',
    signals.fallbackWarnings.length === 0,
    signals.fallbackWarnings.length === 0
      ? 'neither search-database fallback warning appeared'
      : signals.fallbackWarnings.slice(0, 2).join(' | ')
  )
}

/**
 * R1's runtime half: a provider write attempted before `searchIndexWriter` admission fails closed
 * and says so (`file-provider.ts:1283-1298`, `SEARCH_INDEX_WRITER_*`). The structural half — the
 * registry awaits `searchIndexWriter.initialize` in `beforeProvidersLoad` — is not re-derived here.
 */
export function judgeReadinessSignals(signals: SplitLogSignals): EvidenceCheck[] {
  return [
    checked(
      'provider writes waited for writer readiness',
      signals.readinessFailures.length === 0 && signals.writerFailureCodes.length === 0,
      signals.readinessFailures.length === 0 && signals.writerFailureCodes.length === 0
        ? 'no pre-ready provider write and no writer failure code in the run log'
        : `pre-ready writes=${signals.readinessFailures.length}, failure codes=[${signals.writerFailureCodes.join(', ')}]`
    ),
    checked(
      'no contention warnings',
      signals.contentionWarnings === 0,
      `${signals.contentionWarnings} database health snapshot(s) exceeded the contention threshold`
    )
  ]
}

export function judgeBusyStorm(logText: string): EvidenceCheck[] {
  return asEvidence(judgeLog(logText))
}

// ---------------------------------------------------------------------------------------------
// Sentinel: a positive detector for writes that must not happen
// ---------------------------------------------------------------------------------------------

export interface SentinelGuard {
  table: string
  operation: 'insert' | 'update' | 'delete'
  /** The trigger's own name, and the one `readSentinel` looks for: deriving it twice invited drift. */
  name: string
  sql: string
}

/**
 * Trigger DDL for `database.db`.
 *
 * `files` and `file_extensions` are split by *owner*, not by table: the app catalog legitimately
 * lives on the primary (`app-provider.ts:773-784`), so an unguarded trigger would fire on every
 * correct install. `IS NOT 'app'` rather than `<> 'app'` so a NULL `type` counts as a violation
 * instead of being skipped — an unknown owner is not a licensed one.
 */
export function buildSentinelGuards(tables: readonly string[]): SentinelGuard[] {
  const available = new Set(tables)
  const guards: SentinelGuard[] = []

  /** `key` is the SQL that lands in `row_key`: which row the forbidden write touched. */
  const guard = (
    table: string,
    operation: SentinelGuard['operation'],
    when: string,
    key: string
  ): void => {
    const name = `tuff_split_guard_${table}_${operation}`
    guards.push({
      table,
      operation,
      name,
      sql:
        `CREATE TRIGGER IF NOT EXISTS ${name} AFTER ${operation.toUpperCase()} ON ${table}${when} ` +
        `BEGIN INSERT INTO ${SENTINEL_TABLE} (tbl, op, row_key) VALUES ('${table}', '${operation}', ${key}); END`
    })
  }

  if (available.has('files')) {
    guard('files', 'insert', " WHEN NEW.type IS NOT 'app'", 'CAST(NEW.id AS TEXT)')
    guard(
      'files',
      'update',
      " WHEN NEW.type IS NOT 'app' OR OLD.type IS NOT 'app'",
      'CAST(NEW.id AS TEXT)'
    )
    guard('files', 'delete', " WHEN OLD.type IS NOT 'app'", 'CAST(OLD.id AS TEXT)')
  }

  if (available.has('file_extensions')) {
    guard(
      'file_extensions',
      'insert',
      " WHEN (SELECT type FROM files WHERE id = NEW.file_id) IS NOT 'app'",
      'CAST(NEW.file_id AS TEXT)'
    )
    guard(
      'file_extensions',
      'update',
      " WHEN (SELECT type FROM files WHERE id = NEW.file_id) IS NOT 'app'",
      'CAST(NEW.file_id AS TEXT)'
    )
    guard(
      'file_extensions',
      'delete',
      " WHEN (SELECT type FROM files WHERE id = OLD.file_id) IS NOT 'app'",
      'CAST(OLD.file_id AS TEXT)'
    )
  }

  for (const table of [
    'file_index_progress',
    'scan_progress',
    'keyword_mappings',
    'search_index'
  ]) {
    if (!available.has(table)) continue
    for (const operation of ['insert', 'update', 'delete'] as const) {
      guard(table, operation, '', "''")
    }
  }

  return guards
}

export const SENTINEL_TABLE_DDL = `CREATE TABLE IF NOT EXISTS ${SENTINEL_TABLE} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tbl TEXT NOT NULL,
  op TEXT NOT NULL,
  row_key TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
)`

export interface SentinelViolation {
  table: string
  operation: string
  count: number
}

export interface SentinelCoverage {
  table: string
  installed: number
  skippedReason: string | null
}

export interface SentinelInstallation {
  tables: string[]
  coverage: SentinelCoverage[]
  installedTriggers: string[]
}

export interface SentinelReport {
  installation: SentinelInstallation
  violations: SentinelViolation[]
  totalViolations: number
}

export function judgeSentinel(
  report: SentinelReport,
  mode: 'must-be-silent' | 'must-have-fired'
): EvidenceCheck[] {
  const checks: EvidenceCheck[] = []
  const covered = report.installation.coverage.filter((entry) => entry.installed > 0)
  const missingCore = ['files', 'file_extensions'].filter(
    (table) => !covered.some((entry) => entry.table === table)
  )

  checks.push(
    checked(
      'the write detector is armed',
      missingCore.length === 0,
      missingCore.length === 0
        ? `${covered.length} worker-owned table(s) instrumented: ${covered
            .map((entry) => `${entry.table}(${entry.installed})`)
            .join(', ')}`
        : `no trigger covers ${missingCore.join(', ')} — an unarmed detector is not evidence`
    )
  )

  for (const entry of report.installation.coverage) {
    if (entry.installed > 0 || entry.skippedReason === null) continue
    checks.push(notExercised(`${entry.table} instrumented`, `skipped: ${entry.skippedReason}`))
  }

  const summary = report.violations
    .map((violation) => `${violation.table}.${violation.operation}=${violation.count}`)
    .join(', ')

  if (mode === 'must-be-silent') {
    checks.push(
      checked(
        'no worker-owned write reached the primary',
        report.totalViolations === 0,
        report.totalViolations === 0
          ? 'the sentinel recorded no INSERT/UPDATE/DELETE on a worker-owned table in database.db'
          : `recorded ${report.totalViolations} write(s): ${summary}`
      )
    )
    return checks
  }

  // `=0` must put the writes back on the primary. A silent sentinel here means the rollback run
  // never exercised the shared-file path — the opposite of the assumption parity rests on.
  checks.push(
    checked(
      'rollback writes reach the primary (positive control)',
      report.totalViolations > 0,
      report.totalViolations > 0
        ? `recorded ${report.totalViolations} write(s): ${summary}`
        : 'the sentinel stayed silent while the split was off — it is not detecting anything'
    )
  )
  return checks
}

// ---------------------------------------------------------------------------------------------
// Topology judgement
// ---------------------------------------------------------------------------------------------

/** Non-app `files` rows: the ones the worker owns under the split. */
export function nonAppFileRows(byType: Record<string, number>): number {
  return Object.entries(byType)
    .filter(([type]) => type !== APP_ROW_TYPE)
    .reduce((sum, [, count]) => sum + count, 0)
}

/**
 * Judge the `TUFF_DB_SEARCH_SPLIT_ENABLED=0` relaunch.
 *
 * `beforeRollback` is the split-phase measurement of the same profile. The retired search home is
 * expected to keep what the worker wrote, so only its *growth* is a violation — and when no
 * baseline is available the check is reported as not exercised rather than assumed either way.
 */
export function judgeRollbackTopology(
  topology: Topology,
  beforeRollback: Topology | null
): EvidenceCheck[] {
  const primaryFiles = nonAppFileRows(topology.primaryFilesByType)
  const appRowsPrimary = topology.primaryFilesByType[APP_ROW_TYPE] ?? 0
  const appRowsSearch = topology.searchFilesByType[APP_ROW_TYPE] ?? 0
  const checks: EvidenceCheck[] = [
    checked(
      'the shared file carries the index again',
      primaryFiles > 0,
      `database.db holds ${primaryFiles} non-app file row(s) after the rollback`
    ),
    checked(
      'no app rows in the retired search file',
      appRowsSearch === 0,
      `search-index.db app rows=${appRowsSearch}`
    )
  ]

  checks.push(
    appRowsPrimary > 0 || appRowsSearch > 0
      ? checked(
          'the app catalog is still on the primary',
          appRowsPrimary > 0,
          `database.db app rows=${appRowsPrimary}, search-index.db app rows=${appRowsSearch}`
        )
      : notExercised(
          'the app catalog is still on the primary',
          'this profile holds no app-catalog rows, so the rollback placement was not exercised'
        )
  )

  if (beforeRollback === null) {
    checks.push(
      notExercised(
        'the retired search file is not written while the split is off',
        'no split-phase measurement for this profile: run --phase split first'
      )
    )
    return checks
  }

  const searchBefore = nonAppFileRows(beforeRollback.searchFilesByType)
  const searchAfter = nonAppFileRows(topology.searchFilesByType)
  checks.push(
    checked(
      'the retired search file is not written while the split is off',
      searchAfter <= searchBefore,
      `non-app file rows in search-index.db: ${searchBefore} before the rollback, ${searchAfter} after` +
        (searchAfter > searchBefore
          ? ' — the rollback is still writing the split home'
          : ' (stale rows are expected and are not a failure)')
    )
  )
  return checks
}

/**
 * Downgrade the app-catalog check when the profile simply has no catalog rows.
 *
 * `judgeTopology` asserts `appRowsPrimary > 0 && appRowsSearch === 0`. The second half is a real
 * invariant and always holds; the first cannot hold on an isolated profile that indexed no app
 * entries. Both being zero means the placement question was never exercised, which is reported as
 * such instead of as a pass or an unactionable failure.
 */
export function applyAppCatalogCoverage(checks: Check[], topology: Topology): EvidenceCheck[] {
  const evidence = asEvidence(checks)
  if (topology.primaryFilesByType[APP_ROW_TYPE] !== undefined) return evidence
  if (topology.searchFilesByType[APP_ROW_TYPE] !== undefined) return evidence
  return evidence.map((check) =>
    check.name === APP_CATALOG_CHECK_NAME
      ? notExercised(
          check.name,
          'this profile holds no app-catalog rows, so the catalog placement was not exercised; ' +
            'pass --seedAppCatalog to give the check a row, or accept the reduced coverage'
        )
      : check
  )
}

// ---------------------------------------------------------------------------------------------
// Query parity
// ---------------------------------------------------------------------------------------------

export interface ParityQuery {
  id: string
  /** Run against both files; rows are unioned before comparison. */
  sql: string
}

/**
 * Representative queries, deliberately run against both homes.
 *
 * Parity is about the rows the app can answer with, not about where they sit — the same reason
 * `compareParity` compares the union of the two `files` tables rather than each file alone.
 */
export const PARITY_QUERIES: ParityQuery[] = [
  {
    id: 'non-app-files',
    sql: "SELECT name FROM files WHERE type IS NOT 'app' ORDER BY name LIMIT 200"
  },
  {
    id: 'app-catalog',
    sql: `SELECT path FROM files WHERE type = 'app' ORDER BY path LIMIT 200`
  },
  {
    id: 'file-extensions',
    // Scoped to non-app owners: app-owned extensions legitimately stay on the primary in both
    // topologies, so an unscoped query would compare the primary's catalog extensions against the
    // search home's file extensions and never match.
    sql: "SELECT key FROM file_extensions WHERE file_id IN (SELECT id FROM files WHERE type IS NOT 'app') ORDER BY key LIMIT 200"
  },
  {
    id: 'keyword-mappings',
    sql: 'SELECT keyword FROM keyword_mappings ORDER BY keyword LIMIT 200'
  },
  {
    id: 'search-index-hits',
    sql: `SELECT item_id FROM search_index WHERE search_index MATCH '${FIXTURE_SEARCH_TOKEN}*' ORDER BY item_id LIMIT 200`
  }
]

export interface QueryDigest {
  id: string
  rows: number
  digest: string
  sample: string[]
}

/**
 * Queries whose rows live on the primary in **both** topologies.
 *
 * The app catalog never moves (`app-provider.ts:773-784`), so a parity comparison reads it from
 * the primary on either side while every other query is read from the run's live home.
 */
export const PRIMARY_HOME_QUERIES: Record<string, true> = { 'app-catalog': true }

export interface MeasurementQueries {
  primary: QueryDigest[]
  search: QueryDigest[]
}

/**
 * The digests a phase's **live home** answers.
 *
 * Parity is between two live homes, never between two unions: after a real `=0` rollback the
 * retired `search-index.db` still holds what the worker wrote, so unioning both files would count
 * the same row twice and call an un-rebuilt primary index parity.
 */
export function liveQueryDigests(
  queries: MeasurementQueries,
  expect: 'split' | 'shared'
): QueryDigest[] {
  const home = expect === 'shared' ? queries.primary : queries.search
  const catalog = queries.primary.filter((digest) => PRIMARY_HOME_QUERIES[digest.id] === true)
  return [...home.filter((digest) => PRIMARY_HOME_QUERIES[digest.id] !== true), ...catalog]
}

export function digestRows(id: string, rows: string[]): QueryDigest {
  const sorted = [...rows].sort()
  return {
    id,
    rows: sorted.length,
    digest: createHash('sha256')
      .update(`${id}\u0000${sorted.join('\u0001')}`)
      .digest('hex'),
    sample: sorted.slice(0, 5)
  }
}

/** Order-insensitive comparison of two unioned result sets. */
export function compareQueryResults(before: QueryDigest[], after: QueryDigest[]): Check[] {
  const ids = [...new Set([...before, ...after].map((entry) => entry.id))].sort()
  return ids.map((id) => {
    const left = before.find((entry) => entry.id === id)
    const right = after.find((entry) => entry.id === id)
    const equal = left !== undefined && right !== undefined && left.digest === right.digest
    return {
      name: `query parity: ${id}`,
      ok: equal,
      detail: equal
        ? `${left.rows} row(s) identical across both topologies`
        : `rows before=${left?.rows ?? 'absent'} after=${right?.rows ?? 'absent'}; ` +
          `sample before=[${(left?.sample ?? []).join(', ')}] after=[${(right?.sample ?? []).join(', ')}]`
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Profile measurement
// ---------------------------------------------------------------------------------------------

export interface HomeMeasurement {
  measuredAt: string
  primaryExists: boolean
  searchExists: boolean
  primaryWalBytes: number | null
  searchWalBytes: number | null
  primaryMtimeMs: number | null
  searchMtimeMs: number | null
  topology: Topology | null
  queries: MeasurementQueries
}

const isMissingTable = (error: unknown): boolean =>
  error instanceof Error && /no such table/i.test(error.message)

const isMissingColumn = (error: unknown): boolean =>
  error instanceof Error && /no such column/i.test(error.message)

async function withClient<T>(dbPath: string, run: (client: Client) => Promise<T>): Promise<T> {
  const client = createClient({ url: `file:${dbPath}` })
  try {
    return await run(client)
  } finally {
    client.close()
  }
}

async function countTables(client: Client, tables: readonly string[]): Promise<TableCounts> {
  const counts: TableCounts = {}
  for (const table of tables) {
    try {
      const result = await client.execute(`SELECT count(*) AS c FROM ${table}`)
      counts[table] = Number(result.rows[0]?.c ?? 0)
    } catch (error) {
      if (!isMissingTable(error)) throw error
      // Absent, not empty: a missing migration must not read as 0.
      counts[table] = null
    }
  }
  return counts
}

async function countFilesByType(client: Client): Promise<Record<string, number>> {
  const byType: Record<string, number> = {}
  try {
    const result = await client.execute('SELECT type, count(*) AS c FROM files GROUP BY type')
    for (const row of result.rows) byType[String(row.type)] = Number(row.c ?? 0)
  } catch (error) {
    if (!isMissingTable(error)) throw error
  }
  return byType
}

async function collectQueryDigests(client: Client, into: Map<string, string[]>): Promise<void> {
  for (const query of PARITY_QUERIES) {
    try {
      const result = await client.execute(query.sql)
      const rows = result.rows.map((row) => String(Object.values(row)[0] ?? ''))
      into.set(query.id, [...(into.get(query.id) ?? []), ...rows])
    } catch (error) {
      if (isMissingTable(error) || isMissingColumn(error)) continue
      // A busy or locked read is not "no rows": surfacing it keeps a contended profile from
      // looking like one that simply has an empty index.
      throw error
    }
  }
}

const toDigests = (rows: Map<string, string[]>): QueryDigest[] =>
  [...rows.entries()].map(([id, values]) => digestRows(id, values))

async function sizeOrNull(target: string): Promise<number | null> {
  try {
    return (await stat(target)).size
  } catch {
    return null
  }
}

async function mtimeOrNull(target: string): Promise<number | null> {
  try {
    return (await stat(target)).mtimeMs
  } catch {
    return null
  }
}

/** Read both homes **without creating them** — see `tryResolveProfileLayout`. */
export async function measureProfile(profile: string): Promise<HomeMeasurement> {
  const layout = tryResolveProfileLayout(profile)
  const measurement: HomeMeasurement = {
    measuredAt: new Date().toISOString(),
    primaryExists: layout !== null,
    searchExists: layout !== null && existsSync(layout.search),
    primaryWalBytes: null,
    searchWalBytes: null,
    primaryMtimeMs: null,
    searchMtimeMs: null,
    topology: null,
    queries: { primary: [], search: [] }
  }
  if (!layout) return measurement

  const tableCounts = ['file_index_progress', 'scan_progress', 'search_index', 'keyword_mappings']
  const primaryRows = new Map<string, string[]>()
  const searchRows = new Map<string, string[]>()

  const readPrimary = await withClient(layout.primary, async (client) => {
    const counts = await countTables(client, tableCounts)
    const byType = await countFilesByType(client)
    await collectQueryDigests(client, primaryRows)
    let nonAppExtensions: number | null = null
    try {
      const result = await client.execute(
        "SELECT count(*) AS c FROM file_extensions WHERE file_id IN (SELECT id FROM files WHERE type IS NOT 'app')"
      )
      nonAppExtensions = Number(result.rows[0]?.c ?? 0)
    } catch (error) {
      if (!isMissingTable(error)) throw error
      nonAppExtensions = null
    }
    return { counts, byType, nonAppExtensions }
  })

  const searchRead = measurement.searchExists
    ? await withClient(layout.search, async (client) => {
        const counts = await countTables(client, tableCounts)
        const byType = await countFilesByType(client)
        await collectQueryDigests(client, searchRows)
        return { counts, byType }
      })
    : null

  measurement.primaryWalBytes = await sizeOrNull(`${layout.primary}-wal`)
  measurement.searchWalBytes = await sizeOrNull(`${layout.search}-wal`)
  measurement.primaryMtimeMs = await mtimeOrNull(layout.primary)
  measurement.searchMtimeMs = await mtimeOrNull(layout.search)
  measurement.topology = {
    profile,
    primary: readPrimary.counts,
    search: searchRead?.counts ?? {},
    primaryFilesByType: readPrimary.byType,
    searchFilesByType: searchRead?.byType ?? {},
    primaryNonAppExtensions: readPrimary.nonAppExtensions
  }
  measurement.queries = {
    primary: toDigests(primaryRows),
    search: toDigests(searchRows)
  }
  return measurement
}

// ---------------------------------------------------------------------------------------------
// Process control
// ---------------------------------------------------------------------------------------------

export async function pickFreePort(start = 9600): Promise<number> {
  for (let port = start; port < start + 200; port += 1) {
    const { promise, resolve } = Promise.withResolvers<boolean>()
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')

    if (await promise) return port
  }
  throw new Error(`no free loopback port in ${start}..${start + 200}`)
}

export interface LaunchEnvInput {
  userDataDir: string
  homeDir: string
  splitFlagEnv: string | undefined
  precoreDiagPath: string
}

/**
 * The launch environment, modelled on `buildPackagedAppLaunchEnv` in the indexing probe: node and
 * pnpm variables are stripped so the child cannot inherit the toolchain, `HOME` points at the
 * fixture root, and the split flag is assigned explicitly — `undefined` deletes it, which is how
 * the split phases prove the **default** rather than an override.
 */
export function buildLaunchEnv(input: LaunchEnvInput): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const key of Object.keys(env)) {
    if (
      key === 'ELECTRON_RUN_AS_NODE' ||
      key === 'INIT_CWD' ||
      key.startsWith('NODE_') ||
      key.startsWith('TSX_') ||
      key.startsWith('npm_') ||
      key.startsWith('npm_config_') ||
      key.startsWith('PNPM_')
    ) {
      delete env[key]
    }
  }
  if (env.PATH) {
    env.PATH = env.PATH.split(path.delimiter)
      .filter((entry) => entry && path.isAbsolute(entry) && !entry.includes('node_modules/.bin'))
      .join(path.delimiter)
  }

  const next: NodeJS.ProcessEnv = {
    ...env,
    FORCE_COLOR: '0',
    HOME: input.homeDir,
    [WATCH_ROOTS_ENV]: input.homeDir,
    [USER_DATA_ENV]: input.userDataDir,
    [ISOLATED_MARKER_ENV]: '1',
    [PRECORE_DIAG_ENV]: input.precoreDiagPath
  }
  if (input.splitFlagEnv === undefined) delete next[SPLIT_FLAG_ENV]
  else next[SPLIT_FLAG_ENV] = input.splitFlagEnv
  return next
}

export function buildLaunchCommand(
  options: Pick<SearchSplitAppEvidenceOptions, 'launch' | 'appBundle' | 'coreAppDir' | 'cdpPort'>
): { command: string; args: string[]; display: string } {
  if (options.launch === 'packaged') {
    const executable = path.join(options.appBundle, 'Contents', 'MacOS', 'tuff')
    return {
      command: executable,
      args: [`--remote-debugging-port=${options.cdpPort}`],
      display: `${executable} --remote-debugging-port=${options.cdpPort}`
    }
  }
  const args = ['run', 'dev', '--', `--remote-debugging-port=${options.cdpPort}`]
  return {
    command: 'pnpm',
    args,
    display: `pnpm ${args.join(' ')} (cwd=${options.coreAppDir})`
  }
}

export async function waitForCdpEndpoint(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (response.ok) {
        const body: unknown = await response.json()
        if (Array.isArray(body) && body.length > 0) return true
      }
    } catch {
      // Endpoint is not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

/** Terminate the whole process group: `dev` mode spawns pnpm → electron-vite → Electron. */
export async function terminateChild(child: ChildProcess | null, graceMs = 15_000): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const pid = child.pid
  const signalGroup = (signal: NodeJS.Signals): void => {
    try {
      if (pid) process.kill(-pid, signal)
      else child.kill(signal)
    } catch {
      try {
        child.kill(signal)
      } catch {
        // Already gone.
      }
    }
  }
  signalGroup('SIGTERM')
  const deadline = Date.now() + graceMs
  while (Date.now() < deadline && child.exitCode === null && child.signalCode === null) {
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  if (child.exitCode === null && child.signalCode === null) signalGroup('SIGKILL')
}

// ---------------------------------------------------------------------------------------------
// Sentinel plumbing
// ---------------------------------------------------------------------------------------------

async function listPrimaryTables(primary: string): Promise<string[]> {
  return withClient(primary, async (client) => {
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    )
    return result.rows.map((row) => String(row.name ?? ''))
  })
}

export async function installSentinel(primary: string): Promise<SentinelInstallation> {
  const tables = await listPrimaryTables(primary)
  const owned = WORKER_OWNED_TABLES.filter((table) => tables.includes(table))
  const installation: SentinelInstallation = {
    tables: [...WORKER_OWNED_TABLES],
    coverage: [],
    installedTriggers: []
  }

  await withClient(primary, async (client) => {
    await client.execute(SENTINEL_TABLE_DDL)
    await client.execute(`DELETE FROM ${SENTINEL_TABLE}`)
    for (const guard of buildSentinelGuards(owned)) {
      try {
        await client.execute(guard.sql)
        installation.installedTriggers.push(guard.name)
        const entry = installation.coverage.find((item) => item.table === guard.table)
        if (entry) entry.installed += 1
        else installation.coverage.push({ table: guard.table, installed: 1, skippedReason: null })
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        const entry = installation.coverage.find((item) => item.table === guard.table)
        if (entry) entry.skippedReason = entry.skippedReason ?? reason
        else installation.coverage.push({ table: guard.table, installed: 0, skippedReason: reason })
      }
    }
    for (const table of WORKER_OWNED_TABLES) {
      if (owned.includes(table)) continue
      installation.coverage.push({
        table,
        installed: 0,
        skippedReason: 'table absent from database.db in this profile'
      })
    }
  })

  return installation
}

/**
 * Read the sentinel and re-check that its triggers still exist.
 *
 * A migration that dropped and recreated a moved table would take its triggers with it, leaving a
 * detector that looks armed because it was armed an hour ago. Coverage is therefore derived from
 * the live schema, not from the arming report.
 */
export async function readSentinel(
  primary: string,
  armed: SentinelInstallation
): Promise<SentinelReport> {
  return withClient(primary, async (client) => {
    const violations = await client.execute(
      `SELECT tbl, op, count(*) AS c FROM ${SENTINEL_TABLE} GROUP BY tbl, op ORDER BY tbl, op`
    )
    const triggers = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'tuff_split_guard_%' ORDER BY name"
    )
    const live = new Set(triggers.rows.map((row) => String(row.name ?? '')))
    const coverage = armed.coverage.map((entry) => {
      const expected = armed.installedTriggers.filter((name) =>
        name.startsWith(`tuff_split_guard_${entry.table}_`)
      )
      if (entry.installed === 0 || expected.length === 0) return entry
      const survivors = expected.filter((name) => live.has(name)).length
      return {
        ...entry,
        installed: survivors,
        skippedReason:
          survivors === entry.installed
            ? entry.skippedReason
            : `only ${survivors}/${entry.installed} trigger(s) survived the run`
      }
    })
    const rows: SentinelViolation[] = violations.rows.map((row) => ({
      table: String(row.tbl ?? ''),
      operation: String(row.op ?? ''),
      count: Number(row.c ?? 0)
    }))
    return {
      installation: { ...armed, coverage },
      violations: rows,
      totalViolations: rows.reduce((sum, violation) => sum + violation.count, 0)
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------------------------

export const FIXTURE_FILE_NAMES = [
  `${FIXTURE_SEARCH_TOKEN}alpha.txt`,
  `${FIXTURE_SEARCH_TOKEN}beta.md`,
  `${FIXTURE_SEARCH_TOKEN}gamma.json`,
  `${FIXTURE_SEARCH_TOKEN}delta.log`
] as const

/**
 * Seed the app's fake `HOME` / file-provider watch root. Refuses a root that is not a real subtree of
 * the isolated profile (see `assertIsolatedFixtureRoot`) or that already holds files without the
 * profile carrying this harness' ownership marker — so a mistyped `--fixtureRoot` can never overwrite
 * a user directory. A later phase of the same run reuses the profile's marker rather than in-process
 * state, which is what keeps bootstrap → split → rollback working across separate CLI invocations.
 */
export async function prepareFixtureRoot(fixtureRoot: string, profile: string): Promise<void> {
  const root = assertIsolatedFixtureRoot(profile, fixtureRoot)
  if (!(await hasProfileOwnershipMarker(profile))) {
    throw new Error(
      `refusing to seed fixture root ${root}: its profile carries no ownership marker`
    )
  }
  const placements: Array<[string, string]> = [
    ['Documents', FIXTURE_FILE_NAMES[0]],
    ['Documents', FIXTURE_FILE_NAMES[1]],
    ['Downloads', FIXTURE_FILE_NAMES[2]],
    ['Downloads', FIXTURE_FILE_NAMES[3]]
  ]
  const canonicalRoot = canonicalizeNearestExisting(root)
  for (const [dir, name] of placements) {
    const destination = path.join(root, dir, name)
    if (!isInside(canonicalizeNearestExisting(destination), canonicalRoot)) {
      throw new Error(`refusing fixture file ${destination}: it resolves outside ${root}`)
    }
  }
  await mkdir(path.join(root, 'Documents'), { recursive: true })
  await mkdir(path.join(root, 'Downloads'), { recursive: true })
  for (const [dir, name] of placements) {
    await writeFile(
      path.join(root, dir, name),
      `search split evidence fixture: ${name}\n`.repeat(8),
      'utf8'
    )
  }
}

/**
 * Reset the isolated profile for a fresh bootstrap.
 *
 * This is the only destructive step in the harness, so it does not trust its caller: it re-runs
 * `assertIsolatedProfileDir` (a direct import bypasses the CLI, not the guard), demands that an
 * existing non-empty directory is one this harness created — proven by its ownership marker — and
 * refuses a symlink or a non-directory outright. It never runs `rm` on a path it cannot account for.
 */
export async function prepareIsolatedProfile(profile: string, fixtureRoot: string): Promise<void> {
  const target = assertIsolatedProfileDir(profile)
  const fixture = assertIsolatedFixtureRoot(target, fixtureRoot)
  if (existsSync(target)) {
    const info = await lstat(target)
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`refusing to reset ${target}: it is not a plain directory`)
    }
    const entries = await readdir(target)
    if (entries.length > 0 && !(await hasProfileOwnershipMarker(target))) {
      throw new Error(
        `refusing to reset ${target}: it is not empty and carries no ${PROFILE_OWNERSHIP_SCHEMA} ` +
          'ownership marker (point --profile at a fresh temp directory)'
      )
    }
    await rm(target, { recursive: true, force: false })
  }
  await mkdir(target, { recursive: true })
  await writeFile(
    path.join(target, PROFILE_OWNERSHIP_MARKER),
    `${JSON.stringify({ schema: PROFILE_OWNERSHIP_SCHEMA }, null, 2)}\n`,
    'utf8'
  )
  // Both root names: the app root is `tuff-dev` in dev and `tuff` when packaged, and the harness
  // cannot know which launch mode the operator will pick when it seeds the settings.
  const setting = `${JSON.stringify(
    { beginner: { init: true }, dev: { developerMode: true } },
    null,
    2
  )}\n`
  for (const rootName of PROFILE_ROOT_NAMES) {
    const configDir = path.join(describeProfileHome(target, rootName).root, 'modules', 'config')
    await mkdir(configDir, { recursive: true })
    await writeFile(path.join(configDir, 'app-setting.ini'), setting, 'utf8')
  }
  await prepareFixtureRoot(fixture, target)
}

/**
 * Seed one managed app-catalog row on the primary, outside the fixture watch roots so the file
 * provider never rescans and re-types it. Only the columns the live table actually has are used,
 * and every NOT NULL column the insert omits is filled explicitly.
 */
export async function seedAppCatalogEntry(
  primary: string,
  entryPath: string
): Promise<number | null> {
  return withClient(primary, async (client) => {
    const info = await client.execute('PRAGMA table_info(files)')
    const columns = new Set(info.rows.map((row) => String(row.name ?? '')))
    const required = ['path', 'name', 'mtime', 'ctime', 'last_indexed_at', 'is_dir', 'type']
    const missing = required.filter((column) => !columns.has(column))
    if (missing.length > 0) {
      throw new Error(`files table is missing ${missing.join(', ')}; cannot seed an app row`)
    }
    const now = Math.floor(Date.now() / 1000)
    const values: Record<string, string> = {
      path: `'${entryPath.replace(/'/g, "''")}'`,
      name: "'tuffsplitevidenceapp'",
      display_name: "'Tuff Split Evidence App'",
      extension: "'app'",
      size: '0',
      mtime: String(now),
      ctime: String(now),
      last_indexed_at: String(now),
      is_dir: '0',
      type: `'${APP_ROW_TYPE}'`,
      embedding_status: "'none'"
    }
    const names = Object.keys(values).filter((column) => columns.has(column))
    await client.execute(
      `INSERT INTO files (${names.join(', ')}) VALUES (${names.map((name) => values[name]).join(', ')})`
    )
    const created = await client.execute(
      `SELECT id FROM files WHERE path = '${entryPath.replace(/'/g, "''")}' LIMIT 1`
    )
    return created.rows[0]?.id === undefined ? null : Number(created.rows[0].id)
  })
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

export interface PhaseRecord {
  phase: PhaseName
  startedAt: string
  completedAt: string
  splitFlag: string
  launchCommand: string
  appReachedCdp: boolean
  settled: boolean
  quiescenceSamples: number
  logFile: string | null
  logWindowBounded: boolean
  stdioTail: string
  before: HomeMeasurement
  after: HomeMeasurement
  sentinel: SentinelReport | null
  precoreUserData: string | null
  checks: EvidenceCheck[]
}

export interface SearchSplitAppEvidenceReport {
  schema: typeof SEARCH_SPLIT_APP_EVIDENCE_SCHEMA
  generatedAt: string
  ok: boolean
  profile: string
  fixtureRoot: string
  profileMutationPolicy: 'isolated-temp-profile-only'
  launch: 'dev' | 'packaged'
  phases: PhaseRecord[]
  parityChecks: EvidenceCheck[]
  coverage: {
    sentinel: SentinelCoverage[]
    notExercised: Array<{ phase: PhaseName | 'parity'; name: string; detail: string }>
    boundary: string[]
  }
  nextActions: string[]
}

export interface RedactedSummary {
  schema: string
  generatedAt: string
  ok: boolean
  launch: string
  phases: Array<{
    phase: PhaseName
    splitFlag: string
    settled: boolean
    searchIndexRows: number | null
    primaryNonAppFileRows: number | null
    failedChecks: string[]
    notExercisedChecks: string[]
  }>
  failedChecks: string[]
  parityChecks: Check[]
  uninstrumentedTables: string[]
  boundary: string[]
}

/** Repository-side evidence is a contract, not a dump: no absolute paths, no log text, no row samples. */
export function redactReport(report: SearchSplitAppEvidenceReport): RedactedSummary {
  const all = [...report.phases.flatMap((phase) => phase.checks), ...report.parityChecks]
  return {
    schema: report.schema,
    generatedAt: report.generatedAt,
    ok: report.ok,
    launch: report.launch,
    phases: report.phases.map((phase) => ({
      phase: phase.phase,
      splitFlag: phase.splitFlag,
      settled: phase.settled,
      searchIndexRows: phase.after.topology?.search.search_index ?? null,
      primaryNonAppFileRows:
        phase.after.topology === null
          ? null
          : nonAppFileRows(phase.after.topology.primaryFilesByType),
      failedChecks: phase.checks
        .filter((check) => check.status === 'failed')
        .map((check) => check.name),
      notExercisedChecks: phase.checks
        .filter((check) => check.status === 'not-exercised')
        .map((check) => check.name)
    })),
    failedChecks: all.filter((check) => check.status === 'failed').map((check) => check.name),
    parityChecks: report.parityChecks,
    uninstrumentedTables: report.coverage.notExercised
      .filter((entry) => entry.name.endsWith('instrumented'))
      .map((entry) => entry.name.replace(' instrumented', '')),
    boundary: report.coverage.boundary
  }
}

// ---------------------------------------------------------------------------------------------
// Phase execution
// ---------------------------------------------------------------------------------------------

export function splitFlagValueFor(phase: PhaseName, explicit: boolean): string | undefined {
  if (phase === 'rollback') return '0'
  return explicit ? '1' : undefined
}

async function resolveNewestLogFile(profile: string): Promise<string | null> {
  let newest: { file: string; mtimeMs: number } | null = null
  for (const rootName of PROFILE_ROOT_NAMES) {
    const logsDir = describeProfileHome(profile, rootName).logsDir
    const entries = await readdir(logsDir).catch(() => [] as string[])
    for (const entry of entries) {
      if (!/^D\..*\.log$/.test(entry)) continue
      const file = path.join(logsDir, entry)
      const info = await stat(file).catch(() => null)
      if (info && (!newest || info.mtimeMs > newest.mtimeMs))
        newest = { file, mtimeMs: info.mtimeMs }
    }
  }
  return newest?.file ?? null
}

async function readJsonOrNull<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

async function waitForIndexQuiescence(
  profile: string,
  options: { maxIndexMs: number; stableMs: number }
): Promise<{ settled: boolean; samples: number; rows: number }> {
  const deadline = Date.now() + options.maxIndexMs
  let lastSignature = ''
  let stableSince = 0
  let samples = 0
  let rows = 0

  while (Date.now() < deadline) {
    const measurement = await measureProfile(profile).catch(() => null)
    samples += 1
    const topology = measurement?.topology
    if (topology) {
      rows =
        nonAppFileRows(topology.primaryFilesByType) + nonAppFileRows(topology.searchFilesByType)
      const pending =
        (topology.primary.file_index_progress ?? 0) + (topology.search.file_index_progress ?? 0)
      const signature = `${rows}:${pending}`
      if (rows > 0 && signature === lastSignature) {
        if (stableSince === 0) stableSince = Date.now()
        if (Date.now() - stableSince >= options.stableMs) return { settled: true, samples, rows }
      } else {
        stableSince = 0
        lastSignature = signature
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  return { settled: false, samples, rows }
}

interface PrecoreDiagnostic {
  userDataAfter?: string
}

async function runPhase(
  options: SearchSplitAppEvidenceOptions,
  phase: PhaseName,
  armed: SentinelInstallation | null,
  rollbackBaseline: Topology | null
): Promise<PhaseRecord> {
  const startedAt = new Date()
  const startedAtMs = Date.now()
  const splitFlag = splitFlagValueFor(phase, options.explicitSplitFlag)
  const evidenceDir = path.join(options.profile, '.search-split-evidence')
  await mkdir(evidenceDir, { recursive: true })
  const precoreDiagPath = path.join(evidenceDir, `precore-${phase}.json`)
  const before = await measureProfile(options.profile)

  const built = buildLaunchCommand(options)
  const child = spawn(built.command, built.args, {
    cwd: options.coreAppDir,
    env: buildLaunchEnv({
      userDataDir: options.profile,
      homeDir: options.fixtureRoot,
      splitFlagEnv: splitFlag,
      precoreDiagPath
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  })
  let stdioTail = ''
  const capture = (chunk: Buffer | string): void => {
    const next = `${stdioTail}${String(chunk)}`
    stdioTail = next.length > 4000 ? next.slice(next.length - 4000) : next
  }
  child.stdout?.on('data', capture)
  child.stderr?.on('data', capture)

  try {
    const cdpUrl = `http://127.0.0.1:${options.cdpPort}/json/list`
    const appReachedCdp = await waitForCdpEndpoint(cdpUrl, options.launchTimeoutMs)
    const quiescence = await waitForIndexQuiescence(options.profile, {
      maxIndexMs: options.maxIndexMs,
      stableMs: options.quiescenceStableMs
    })
    // A moment of quiet after the index stops moving, so the log appender has flushed its tail.
    // A truncated log would read as "the marker never appeared", which is a false blocker.
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const endedAtMs = Date.now()
    const logFile = await resolveNewestLogFile(options.profile)
    const rawLog = logFile ? await readFile(logFile, 'utf8').catch(() => '') : ''
    const window: PhaseLogWindow = { startedAtMs, endedAtMs, bounded: false }
    const log = sliceLogForPhase(rawLog, window)
    const signals = parseSplitLogSignals(log)
    const after = await measureProfile(options.profile)
    const layout = tryResolveProfileLayout(options.profile)
    const precore = await readJsonOrNull<PrecoreDiagnostic>(precoreDiagPath)

    const checks: EvidenceCheck[] = [
      checked(
        'isolation-effective',
        precore?.userDataAfter !== undefined &&
          path.resolve(precore.userDataAfter) === options.profile,
        precore?.userDataAfter === undefined
          ? 'precore reported no userData — the run cannot be shown to have used the isolated profile'
          : `precore applied userData=${precore.userDataAfter}`
      ),
      checked(
        'app-booted',
        appReachedCdp,
        appReachedCdp
          ? `CDP endpoint answered at ${cdpUrl}`
          : `no CDP endpoint within ${options.launchTimeoutMs}ms; stdio tail: ${stdioTail}`
      ),
      checked(
        'indexing-settled',
        quiescence.settled,
        quiescence.settled
          ? `${quiescence.rows} file row(s) indexed and stable for ${options.quiescenceStableMs}ms`
          : `the index did not stabilise within ${options.maxIndexMs}ms (${quiescence.samples} sample(s), last=${quiescence.rows})`
      ),
      ...judgeReadinessSignals(signals),
      ...judgeBusyStorm(log)
    ]

    if (phase !== 'rollback') {
      checks.push(
        judgeSearchDbMarker(
          signals,
          layout?.search ?? describeProfileHome(options.profile, PROFILE_ROOT_NAMES[0]).search
        ),
        judgeNoPrimaryFallback(signals)
      )
    }

    if (after.topology) {
      if (phase === 'rollback')
        checks.push(...judgeRollbackTopology(after.topology, rollbackBaseline))
      else
        checks.push(
          ...applyAppCatalogCoverage(judgeTopology(after.topology, 'split'), after.topology)
        )
    } else {
      checks.push(
        checked(
          'profile-topology-measured',
          false,
          'database.db does not exist after the run — nothing to judge'
        )
      )
    }

    if (phase === 'bootstrap') {
      // Only a profile whose search file is absent can demonstrate a first launch. A re-run against
      // a warm profile cannot, and reporting that as a failure would block a legitimate re-run.
      checks.push(
        before.searchExists
          ? notExercised(
              'first-launch-reindex',
              'search-index.db already existed before this launch, so it is not a first launch; ' +
                'run the bootstrap phase against a fresh --profile to exercise the reindex'
            )
          : checked(
              'first-launch-reindex',
              after.topology !== null && nonAppFileRows(after.topology.searchFilesByType) > 0,
              after.topology === null
                ? 'search-index.db was absent before the run and the profile has no topology after it'
                : `search-index.db was absent before the run and holds ${nonAppFileRows(after.topology.searchFilesByType)} non-app file row(s) after`
            )
      )
    }

    const sentinelReport = layout && armed ? await readSentinel(layout.primary, armed) : null
    if (sentinelReport) {
      checks.push(
        ...judgeSentinel(
          sentinelReport,
          phase === 'rollback' ? 'must-have-fired' : 'must-be-silent'
        )
      )
    }

    return {
      phase,
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      splitFlag: splitFlag ?? 'unset (default)',
      launchCommand: built.display,
      appReachedCdp,
      settled: quiescence.settled,
      quiescenceSamples: quiescence.samples,
      logFile,
      logWindowBounded: window.bounded,
      stdioTail,
      before,
      after,
      sentinel: sentinelReport,
      precoreUserData: precore?.userDataAfter ?? null,
      checks
    }
  } finally {
    await terminateChild(child)
  }
}

// ---------------------------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------------------------

interface PersistedState {
  schema: string
  phases: PhaseRecord[]
  armed: SentinelInstallation | null
}

/**
 * Turn collected phase records into the judged report.
 *
 * Separated from the launches so a collected state can be re-judged without running CoreApp again:
 * `--fromState` exists for exactly that, and it keeps the parity definition in one place.
 */
export function assembleReport(
  options: SearchSplitAppEvidenceOptions,
  phases: PhaseRecord[],
  armed: SentinelInstallation | null
): SearchSplitAppEvidenceReport {
  const evidenceDir = path.join(options.profile, '.search-split-evidence')
  const splitRecord = phases.find((record) => record.phase === 'split')
  const rollbackRecord = phases.find((record) => record.phase === 'rollback')
  const parityChecks: EvidenceCheck[] = []
  if (splitRecord?.after.topology && rollbackRecord?.after.topology) {
    parityChecks.push(
      ...asEvidence(
        compareQueryResults(
          liveQueryDigests(splitRecord.after.queries, 'split'),
          liveQueryDigests(rollbackRecord.after.queries, 'shared')
        )
      ),
      ...asEvidence(
        compareParity(splitRecord.after.topology, rollbackRecord.after.topology, 'shared')
      )
    )
  } else {
    parityChecks.push(
      notExercised(
        'count-parity and query-parity',
        'both a split-phase and a rollback-phase measurement are needed for parity'
      )
    )
  }

  const allChecks = [...phases.flatMap((record) => record.checks), ...parityChecks]
  const failures = failedChecks(allChecks)
  return {
    schema: SEARCH_SPLIT_APP_EVIDENCE_SCHEMA,
    generatedAt: new Date().toISOString(),
    ok: failures.length === 0,
    profile: options.profile,
    fixtureRoot: options.fixtureRoot,
    profileMutationPolicy: 'isolated-temp-profile-only',
    launch: options.launch,
    phases,
    parityChecks,
    coverage: {
      sentinel: armed?.coverage ?? [],
      notExercised: [
        ...phases.flatMap((record) =>
          record.checks
            .filter((check) => check.status === 'not-exercised')
            .map((check) => ({ phase: record.phase, name: check.name, detail: check.detail }))
        ),
        ...parityChecks
          .filter((check) => check.status === 'not-exercised')
          .map((check) => ({ phase: 'parity' as const, name: check.name, detail: check.detail }))
      ],
      boundary: [
        'no renderer-level search: rows are read from the databases the app wrote',
        'embeddings routing is reported informationally; unit evidence owns that contract',
        `uninstrumented worker-owned tables: ${
          (armed?.coverage ?? [])
            .filter((entry) => entry.installed === 0)
            .map((entry) => entry.table)
            .join(', ') || 'none'
        }`
      ]
    },
    nextActions:
      failures.length === 0
        ? [
            `cross-check the profile with: pnpm -C apps/core-app run search-split:topology:verify -- --profile ${options.profile} --expect-split`,
            'attach the redacted summary to docs/engineering/reports/search-index-split-write-acceptance.md'
          ]
        : [
            `read the failing phase JSON under ${evidenceDir}`,
            'split acceptance stays blocked until every phase passes'
          ]
  }
}

async function emitReport(
  options: SearchSplitAppEvidenceOptions,
  report: SearchSplitAppEvidenceReport
): Promise<string> {
  const evidenceDir = path.join(options.profile, '.search-split-evidence')
  const outPath = options.out ?? path.join(evidenceDir, 'report.json')
  await mkdir(path.dirname(outPath), { recursive: true })
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  if (options.repoSummary) {
    await writeFile(
      path.resolve(options.repoSummary),
      `${JSON.stringify(redactReport(report), null, 2)}\n`,
      'utf8'
    )
  }

  const allChecks = [...report.phases.flatMap((phase) => phase.checks), ...report.parityChecks]
  if (options.printJson) {
    console.log(JSON.stringify(report, null, 2))
    return outPath
  }
  for (const phase of report.phases) {
    console.log(`\n[${phase.phase}] split flag: ${phase.splitFlag}`)
    for (const check of phase.checks) console.log(describeCheck(check))
  }
  if (report.parityChecks.length > 0) {
    console.log('\n[parity]')
    for (const check of report.parityChecks) console.log(describeCheck(check))
  }
  const failures = failedChecks(allChecks)
  console.log(
    `\n[search-split-app-evidence] ${
      report.ok
        ? `all ${allChecks.length} checks passed`
        : `${failures.length} of ${allChecks.length} checks FAILED`
    }; not exercised: ${report.coverage.notExercised.length}`
  )
  for (const entry of report.coverage.notExercised) {
    console.log(`  ~ ${entry.phase}: ${entry.name} — ${entry.detail}`)
  }
  console.log(`  report: ${outPath}`)
  return outPath
}

async function runEvidence(
  options: SearchSplitAppEvidenceOptions
): Promise<SearchSplitAppEvidenceReport> {
  assertIsolatedProfileDir(options.profile)
  assertIsolatedFixtureRoot(options.profile, options.fixtureRoot)
  const evidenceDir = path.join(options.profile, '.search-split-evidence')
  const stateFile = path.join(evidenceDir, 'state.json')
  const phasesToRun: PhaseName[] = options.phase === 'all' ? [...PHASES] : [options.phase]

  if (!existsSync(options.profile) && !phasesToRun.includes('bootstrap')) {
    throw new Error(
      `${options.profile} does not exist and --phase ${options.phase} does not include bootstrap; ` +
        'run --phase bootstrap first (the write detector needs the primary schema to exist)'
    )
  }
  if (!(await hasProfileOwnershipMarker(options.profile))) {
    await prepareIsolatedProfile(options.profile, options.fixtureRoot)
  } else {
    await prepareFixtureRoot(options.fixtureRoot, options.profile)
  }

  const previous = await readJsonOrNull<PersistedState>(stateFile)
  let phases: PhaseRecord[] = previous?.phases ?? []
  let armed = previous?.armed ?? null

  const persist = async (): Promise<void> => {
    await writeFile(
      stateFile,
      `${JSON.stringify({ schema: SEARCH_SPLIT_APP_EVIDENCE_SCHEMA, phases, armed }, null, 2)}\n`,
      'utf8'
    )
  }

  for (const phase of phasesToRun) {
    if (phase !== 'bootstrap') {
      const layout = tryResolveProfileLayout(options.profile)
      if (!layout)
        throw new Error('no database.db after bootstrap; the profile was not initialised')
      if (!armed) {
        armed = await installSentinel(layout.primary)
        if (options.seedAppCatalog) {
          await seedAppCatalogEntry(
            layout.primary,
            path.join(options.profile, 'seeded-catalog', 'tuffsplitevidenceapp.app')
          )
        }
      }
    }
    const rollbackBaseline =
      phases.find((record) => record.phase === 'split')?.after.topology ?? null
    const record = await runPhase(
      options,
      phase,
      phase === 'bootstrap' ? null : armed,
      rollbackBaseline
    )
    phases = [...phases.filter((existing) => existing.phase !== phase), record]
    await writeFile(
      path.join(evidenceDir, `phase-${phase}.json`),
      `${JSON.stringify(record, null, 2)}\n`,
      'utf8'
    )
    phases = [...phases].sort(
      (left, right) => PHASES.indexOf(left.phase) - PHASES.indexOf(right.phase)
    )
    await persist()
  }

  const report = assembleReport(options, phases, armed)
  await emitReport(options, report)

  if (options.cleanupProfile && options.phase === 'all' && report.ok) {
    assertIsolatedProfileDir(options.profile)
    if (!(await hasProfileOwnershipMarker(options.profile))) {
      throw new Error(`refusing to clean ${options.profile}: its ownership marker is missing`)
    }
    await rm(options.profile, { recursive: true, force: false })
  }

  return report
}

/** Re-judge a state file without launching anything: same parity definition, no app run. */
export async function judgeStateFile(
  options: SearchSplitAppEvidenceOptions,
  statePath: string
): Promise<SearchSplitAppEvidenceReport> {
  const state = await readJsonOrNull<PersistedState>(path.resolve(statePath))
  if (!state || !Array.isArray(state.phases) || state.phases.length === 0) {
    throw new Error(`${statePath} does not hold a collected state file (no phases)`)
  }
  const report = assembleReport(options, state.phases, state.armed ?? null)
  await emitReport(options, report)
  return report
}

function describeCheck(check: Check): string {
  const marker = 'status' in check && check.status === 'not-exercised' ? '~' : check.ok ? '✓' : '✗'
  return `  ${marker} ${check.name}: ${check.detail}`
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function printUsage(): void {
  console.log(`Usage:
  pnpm -C apps/core-app run search-split:app-evidence -- [options]

Options:
  --profile <dir>        Isolated CoreApp profile (required). Must live under a temp root.
  --fixtureRoot <dir>    Isolated HOME and file-provider watch root. Default: <profile>/home.
  --phase <name>         bootstrap | split | rollback | all. Default: all.
  --launch <mode>        dev (electron-vite, default) or packaged.
  --appBundle <path>     Packaged .app for --launch packaged. Default: dist/mac-arm64/tuff.app.
  --cdpPort <n>          Remote debugging port. Default: first free port from 9600.
  --maxIndexMs <n>       Per-phase indexing budget. Default: 180000.
  --stableMs <n>         Quiet window that counts as settled. Default: 8000.
  --launchTimeoutMs <n>  CDP endpoint wait budget. Default: 90000.
  --explicitSplitFlag    Run split phases with TUFF_DB_SEARCH_SPLIT_ENABLED=1 instead of leaving
                         it unset (the default path is what the gate is about).
  --seedAppCatalog       Seed one managed app row so the catalog-placement check is exercised.
  --cleanupProfile       Delete the profile after a fully green --phase all run.
  --fromState <file>     Re-judge a collected state.json without launching CoreApp.
  --out <file>           Report path. Default: <profile>/.search-split-evidence/report.json.
  --repoSummary <file>   Also write the redacted summary (no absolute paths, no log text).
  --json                 Print the full report instead of the check list.
  --self-check           Judgement-only smoke over synthetic inputs. No launch, no write.
  --help                 Show this help.

The harness never points CoreApp at a non-temp profile.
`)
}

function arg(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 ? argv[index + 1] : undefined
}

function has(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`)
}

export function parseCli(argv: string[], coreAppDir: string): SearchSplitAppEvidenceOptions | null {
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage()
    return null
  }
  const profileArg = arg(argv, 'profile')
  if (!profileArg) throw new Error('--profile is required (see --help)')
  const profile = assertIsolatedProfileDir(profileArg)
  const phaseArg = arg(argv, 'phase') ?? 'all'
  if (phaseArg !== 'all' && !PHASES.includes(phaseArg as PhaseName)) {
    throw new Error(`unknown --phase ${phaseArg}; expected ${PHASES.join(' | ')} | all`)
  }
  const fixtureArg = arg(argv, 'fixtureRoot')
  const fixtureRoot = assertIsolatedFixtureRoot(
    profile,
    fixtureArg ? path.resolve(fixtureArg) : path.join(profile, 'home')
  )
  return {
    profile,
    fixtureRoot,
    launch: arg(argv, 'launch') === 'packaged' ? 'packaged' : 'dev',
    appBundle: path.resolve(coreAppDir, arg(argv, 'appBundle') ?? 'dist/mac-arm64/tuff.app'),
    coreAppDir,
    phase: phaseArg as PhaseName | 'all',
    cdpPort: Number(arg(argv, 'cdpPort') ?? 0),
    maxIndexMs: Number(arg(argv, 'maxIndexMs') ?? 180_000),
    quiescenceStableMs: Number(arg(argv, 'stableMs') ?? 8000),
    launchTimeoutMs: Number(arg(argv, 'launchTimeoutMs') ?? 90_000),
    seedAppCatalog: has(argv, 'seedAppCatalog'),
    explicitSplitFlag: has(argv, 'explicitSplitFlag'),
    cleanupProfile: has(argv, 'cleanupProfile'),
    printJson: has(argv, 'json'),
    fromState: arg(argv, 'fromState'),
    out: arg(argv, 'out'),
    repoSummary: arg(argv, 'repoSummary')
  }
}

// ---------------------------------------------------------------------------------------------
// Self-check
// ---------------------------------------------------------------------------------------------

const HEALTHY_LOG = [
  '[2026-09-29T10:00:00.100] [INFO] default - Talex Touch bootstrap started {}',
  '[2026-09-29T10:00:03.200] [INFO] database - Search index database initialized {"meta":{"path":"/tmp/profile/tuff-dev/modules/database/search-index.db"}}',
  '[2026-09-29T10:00:04.000] [INFO] file-provider - FileProvider.onLoad called {}'
].join('\n')

const FALLBACK_LOG = [
  '[2026-09-29T10:00:03.200] [WARN] database - Search index database initialization failed; falling back to primary DB {"error":{}}',
  '[2026-09-29T10:00:05.000] [WARN] file-provider - File persistence port operation skipped: readiness unavailable {"reason":"file-index.incremental.insert"}',
  '[2026-09-29T10:00:06.000] [ERROR] file-provider - FILE_PERSISTENCE_PORT_UNAVAILABLE'
].join('\n')

const HEALTHY_SPLIT_TOPOLOGY: Topology = {
  profile: '/tmp/profile',
  primary: { file_index_progress: 0, scan_progress: 0, search_index: 0, keyword_mappings: 0 },
  search: { file_index_progress: 3, scan_progress: 1, search_index: 9, keyword_mappings: 4 },
  primaryFilesByType: { app: 1 },
  searchFilesByType: { file: 4 },
  primaryNonAppExtensions: 0
}

const ROLLED_BACK_TOPOLOGY: Topology = {
  profile: '/tmp/profile',
  primary: { file_index_progress: 3, scan_progress: 1, search_index: 9, keyword_mappings: 4 },
  search: { file_index_progress: 3, scan_progress: 1, search_index: 9, keyword_mappings: 4 },
  primaryFilesByType: { app: 1, file: 4 },
  searchFilesByType: { file: 4 },
  primaryNonAppExtensions: 12
}

const ARMED_SILENT_SENTINEL: SentinelReport = {
  installation: {
    tables: ['files', 'file_extensions'],
    coverage: [
      { table: 'files', installed: 3, skippedReason: null },
      { table: 'file_extensions', installed: 3, skippedReason: null }
    ],
    installedTriggers: []
  },
  violations: [],
  totalViolations: 0
}

export function runSelfCheck(): number {
  const failures: string[] = []
  const assert = (label: string, ok: boolean): void => {
    console.log(`  ${ok ? '✓' : '✗'} ${label}`)
    if (!ok) failures.push(label)
  }

  const healthy = parseSplitLogSignals(HEALTHY_LOG)
  const healthyMarker = judgeSearchDbMarker(
    healthy,
    '/tmp/profile/tuff-dev/modules/database/search-index.db'
  )
  assert('a healthy log names the split file', healthyMarker.status === 'passed')
  assert('a healthy log reports no fallback', judgeNoPrimaryFallback(healthy).status === 'passed')
  assert(
    'a healthy log reports no pre-ready write',
    judgeReadinessSignals(healthy).every((check) => check.status === 'passed')
  )
  assert(
    'a healthy log produces no busy-storm finding',
    judgeBusyStorm(HEALTHY_LOG).every((check) => check.status === 'passed')
  )

  const fallback = parseSplitLogSignals(FALLBACK_LOG)
  assert('the fallback warning is detected', judgeNoPrimaryFallback(fallback).status === 'failed')
  assert(
    'a pre-ready provider write fails the readiness check',
    judgeReadinessSignals(fallback).some((check) => check.status === 'failed')
  )
  assert(
    'a missing marker fails the split-file check',
    judgeSearchDbMarker(fallback, '/tmp/x').status === 'failed'
  )

  const splitChecks = judgeTopology(HEALTHY_SPLIT_TOPOLOGY, 'split')
  assert(
    'a healthy split topology passes the reused judge',
    splitChecks.every((check) => check.ok)
  )
  const strandedPrimary = judgeTopology(
    { ...HEALTHY_SPLIT_TOPOLOGY, primaryFilesByType: { app: 1, file: 2 } },
    'split'
  )
  assert(
    'file rows stranded on the primary fail',
    strandedPrimary.some(
      (check) => !check.ok && check.name === 'no file rows stranded on the primary'
    )
  )

  const catalogMissing = applyAppCatalogCoverage(
    judgeTopology({ ...HEALTHY_SPLIT_TOPOLOGY, primaryFilesByType: {} }, 'split'),
    { ...HEALTHY_SPLIT_TOPOLOGY, primaryFilesByType: {} }
  )
  assert(
    'an empty app catalog is not-exercised, not failed',
    catalogMissing.find((check) => check.name === APP_CATALOG_CHECK_NAME)?.status ===
      'not-exercised'
  )
  const catalogLeaked = applyAppCatalogCoverage(
    judgeTopology({ ...HEALTHY_SPLIT_TOPOLOGY, primaryFilesByType: {} }, 'split'),
    { ...HEALTHY_SPLIT_TOPOLOGY, primaryFilesByType: {}, searchFilesByType: { file: 4, app: 1 } }
  )
  assert(
    'app rows in the search file stay a failure',
    catalogLeaked.find((check) => check.name === APP_CATALOG_CHECK_NAME)?.status === 'failed'
  )

  const rollback = judgeRollbackTopology(ROLLED_BACK_TOPOLOGY, HEALTHY_SPLIT_TOPOLOGY)
  assert(
    'a clean rollback passes the rollback judge',
    rollback.every((check) => check.status === 'passed')
  )
  assert(
    'a still-written split home fails the rollback judge',
    judgeRollbackTopology(
      { ...ROLLED_BACK_TOPOLOGY, searchFilesByType: { file: 9 } },
      HEALTHY_SPLIT_TOPOLOGY
    ).some((check) => check.status === 'failed')
  )
  assert(
    'a rollback without a baseline reports the residue check as not-exercised',
    judgeRollbackTopology(ROLLED_BACK_TOPOLOGY, null).some(
      (check) => check.status === 'not-exercised'
    )
  )
  assert(
    'count parity holds across the rollback',
    compareParity(HEALTHY_SPLIT_TOPOLOGY, ROLLED_BACK_TOPOLOGY, 'shared').every((check) => check.ok)
  )
  assert(
    'a rollback that never rebuilt the primary fails parity',
    compareParity(
      HEALTHY_SPLIT_TOPOLOGY,
      { ...ROLLED_BACK_TOPOLOGY, primaryFilesByType: { app: 1 } },
      'shared'
    ).some((check) => !check.ok)
  )

  const splitQueries = {
    primary: [digestRows('app-catalog', ['/Applications/x.app'])],
    search: [
      digestRows('non-app-files', ['a']),
      digestRows('app-catalog', []),
      digestRows('file-extensions', ['txt'])
    ]
  }
  const rollbackQueries = {
    primary: [
      digestRows('app-catalog', ['/Applications/x.app']),
      digestRows('non-app-files', ['a']),
      digestRows('file-extensions', ['txt'])
    ],
    search: [digestRows('non-app-files', ['a']), digestRows('file-extensions', ['txt'])]
  }
  assert(
    'live-home query parity compares the search home against the rebuild home',
    compareQueryResults(
      liveQueryDigests(splitQueries, 'split'),
      liveQueryDigests(rollbackQueries, 'shared')
    ).every((check) => check.ok)
  )
  assert(
    'the app catalog is read from the primary on both sides',
    liveQueryDigests(splitQueries, 'split').some(
      (digest) => digest.id === 'app-catalog' && digest.sample[0] === '/Applications/x.app'
    )
  )
  assert(
    'a rollback that lost the file index fails live-home query parity',
    compareQueryResults(
      liveQueryDigests(splitQueries, 'split'),
      liveQueryDigests(
        { ...rollbackQueries, primary: [digestRows('app-catalog', ['/Applications/x.app'])] },
        'shared'
      )
    ).some((check) => !check.ok)
  )

  assert(
    'a silent armed detector passes the split phase',
    judgeSentinel(ARMED_SILENT_SENTINEL, 'must-be-silent').every(
      (check) => check.status === 'passed'
    )
  )
  assert(
    'a silent armed detector fails the rollback positive control',
    judgeSentinel(ARMED_SILENT_SENTINEL, 'must-have-fired').some(
      (check) => check.status === 'failed'
    )
  )
  assert(
    'an unarmed detector is a failure, not a pass',
    judgeSentinel(
      {
        installation: {
          tables: ['files'],
          coverage: [
            {
              table: 'files',
              installed: 0,
              skippedReason: 'cannot create triggers on virtual tables'
            }
          ],
          installedTriggers: []
        },
        violations: [],
        totalViolations: 0
      },
      'must-be-silent'
    ).some((check) => check.status === 'failed')
  )
  assert(
    'a recorded write fails the silent phase',
    judgeSentinel(
      {
        ...ARMED_SILENT_SENTINEL,
        violations: [{ table: 'files', operation: 'insert', count: 2 }],
        totalViolations: 2
      },
      'must-be-silent'
    ).some((check) => check.status === 'failed')
  )

  const digests = [digestRows('non-app-files', ['b', 'a']), digestRows('app-catalog', ['x'])]
  assert(
    'equal result sets pass query parity',
    compareQueryResults(digests, [
      digestRows('non-app-files', ['a', 'b']),
      digestRows('app-catalog', ['x'])
    ]).every((check) => check.ok)
  )
  assert(
    'a missing result set fails query parity',
    compareQueryResults(digests, [digests[0]]).some((check) => !check.ok)
  )
  assert(
    'a differing result set fails query parity',
    compareQueryResults(digests, [
      digestRows('non-app-files', ['a', 'b']),
      digestRows('app-catalog', ['y'])
    ]).some((check) => !check.ok)
  )

  const guards = buildSentinelGuards(['files', 'file_extensions', 'keyword_mappings'])
  assert(
    'the files guard excludes app rows',
    guards.some((guard) => guard.sql.includes("NEW.type IS NOT 'app'"))
  )
  assert(
    'the extension guard follows the owning row',
    guards.some((guard) => guard.sql.includes('(SELECT type FROM files WHERE id = NEW.file_id)'))
  )
  assert(
    'a wholly worker-owned table is guarded unconditionally',
    guards.filter((guard) => guard.table === 'keyword_mappings').length === 3
  )
  assert(
    'an absent table gets no guard',
    buildSentinelGuards(['files']).every((guard) => guard.table === 'files')
  )

  let rejectedHome = false
  try {
    assertIsolatedProfileDir(path.join(os.homedir(), 'Library', 'Application Support', 'Tuff'))
  } catch {
    rejectedHome = true
  }
  assert('a real profile path is rejected', rejectedHome)
  let rejectedRepo = false
  try {
    assertIsolatedProfileDir(path.join(process.cwd(), 'tmp', 'profile'))
  } catch {
    rejectedRepo = true
  }
  assert('a profile inside the repository is rejected', rejectedRepo)
  const tempProfile = path.join(os.tmpdir(), 'tuff-self-check')
  assert(
    'a temp profile path is accepted',
    assertIsolatedProfileDir(tempProfile) === path.resolve(tempProfile)
  )
  let rejectedFixtureOutside = false
  try {
    assertIsolatedFixtureRoot(tempProfile, os.homedir())
  } catch {
    rejectedFixtureOutside = true
  }
  assert('a fixture root outside the profile is rejected', rejectedFixtureOutside)
  let rejectedFixtureSelf = false
  try {
    assertIsolatedFixtureRoot(tempProfile, tempProfile)
  } catch {
    rejectedFixtureSelf = true
  }
  assert('the profile itself is not a fixture root', rejectedFixtureSelf)

  const unbounded: PhaseLogWindow = { startedAtMs: 0, endedAtMs: 0, bounded: false }
  const kept = sliceLogForPhase('a line with no timestamp', unbounded)
  assert(
    'an undatable log is not silently emptied',
    kept === 'a line with no timestamp' && !unbounded.bounded
  )
  const bounded: PhaseLogWindow = {
    startedAtMs: Date.parse('2026-09-29T10:00:02.000'),
    endedAtMs: Date.parse('2026-09-29T10:00:05.000'),
    bounded: false
  }
  assert(
    'a phase window keeps its own lines only',
    sliceLogForPhase(HEALTHY_LOG, bounded).split('\n').length === 2
  )

  console.log(
    failures.length === 0
      ? `\n[search-split-app-evidence] self-check passed\n`
      : `\n[search-split-app-evidence] self-check FAILED (${failures.length}): ${failures.join('; ')}\n`
  )
  return failures.length === 0 ? 0 : 1
}

// ---------------------------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (has(argv, 'self-check')) {
    process.exitCode = runSelfCheck()
    return
  }
  const coreAppDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const options = parseCli(argv, coreAppDir)
  if (!options) return
  if (options.fromState) {
    const report = await judgeStateFile(options, options.fromState)
    if (!report.ok) process.exitCode = 1
    return
  }
  if (options.cdpPort === 0) options.cdpPort = await pickFreePort()
  const inherited = process.env[SPLIT_FLAG_ENV]
  if (inherited !== undefined && !options.explicitSplitFlag) {
    throw new Error(
      `${SPLIT_FLAG_ENV}=${inherited} is set in this shell; the split phases must run with it unset ` +
        'to prove the default. Unset it, or pass --explicitSplitFlag to run with =1 deliberately.'
    )
  }
  const report = await runEvidence(options)
  if (!report.ok) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
