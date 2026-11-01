import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Every place the app repairs, rebuilds, recreates, resets or quarantines a database or index, with
 * the exact text it logs. Source lines are as of master 766dc087f (2026-10-30); `fragment` is the
 * literal the drift test looks up in `file`, so a reworded message fails a test instead of silently
 * going unnoticed.
 *
 * `repair`   fail   - the run triggered a repair, rebuild, recreate, reset or quarantine
 * `suspect`  warn   - no repair happened, but the next boot would run one or the topology degraded
 * `expected-on-fresh-profile` info - looks repair-like, is normal on a brand-new profile
 */
export type MarkerClass = 'repair' | 'suspect' | 'expected-on-fresh-profile'

export interface DbMarker {
  id: string
  cls: MarkerClass
  pattern: RegExp
  /** Path relative to the core-app package root. */
  source: { file: string; line: number; fragment: string }
  meaning: string
  /** The message text is verbatim from the source (template placeholders filled in); trailing key=value meta is illustrative. */
  sample: string
}

const DB = 'src/main/modules/database/index.ts'
const FILES = 'src/main/modules/box-tool/addon/files'

export const DB_MARKERS: readonly DbMarker[] = [
  {
    id: 'corrupt-detected',
    cls: 'repair',
    pattern: /Corrupt \w+ database detected; quarantining and rebuilding/,
    source: { file: DB, line: 456, fragment: 'database detected; quarantining and rebuilding' },
    meaning: 'quick_check or init found a corrupt database; it is quarantined and recreated',
    sample: 'Corrupt primary database detected; quarantining and rebuilding dbPath=/x/database.db'
  },
  {
    id: 'corrupt-detected-search-init',
    cls: 'repair',
    pattern: /Corrupt search database detected during init; quarantining and rebuilding/,
    source: {
      file: DB,
      line: 1282,
      fragment: 'database detected during init; quarantining and rebuilding'
    },
    meaning: 'search-index.db failed to open or migrate with a corruption error',
    sample: 'Corrupt search database detected during init; quarantining and rebuilding'
  },
  {
    id: 'quarantined',
    cls: 'repair',
    pattern: /Quarantined corrupt database file/,
    source: { file: DB, line: 400, fragment: 'Quarantined corrupt database file' },
    meaning: 'a database file (or its -wal/-shm/-journal) was renamed to *.corrupt',
    sample: 'Quarantined corrupt database file from=/x/database.db to=/x/database.db.corrupt'
  },
  {
    id: 'quarantine-removed',
    cls: 'repair',
    pattern: /Removed corrupt database file \(quarantine failed\)/,
    source: { file: DB, line: 408, fragment: 'Removed corrupt database file (quarantine failed)' },
    meaning: 'quarantine rename failed, the corrupt file was deleted instead',
    sample: 'Removed corrupt database file (quarantine failed) target=/x/database.db'
  },
  {
    id: 'quarantine-failed',
    cls: 'repair',
    pattern: /Failed to quarantine or remove corrupt database file/,
    source: {
      file: DB,
      line: 413,
      fragment: 'Failed to quarantine or remove corrupt database file'
    },
    meaning: 'neither quarantine nor delete worked on a corrupt database file',
    sample: 'Failed to quarantine or remove corrupt database file target=/x/database.db'
  },
  {
    id: 'rebuilt-after-corruption',
    cls: 'repair',
    pattern: /Rebuilt empty \w+ database after corruption/,
    source: { file: DB, line: 489, fragment: 'database after corruption' },
    meaning: 'a fresh empty database replaced the corrupt one',
    sample: 'Rebuilt empty search database after corruption dbPath=/x/search-index.db'
  },
  {
    id: 'rebuilt-config-failed',
    cls: 'repair',
    pattern: /Failed to configure rebuilt \w+ database/,
    source: { file: DB, line: 485, fragment: 'Failed to configure rebuilt' },
    meaning: 'the recreated database could not be configured (WAL etc.)',
    sample: 'Failed to configure rebuilt primary database; continuing with defaults'
  },
  {
    id: 'size-cap-reset',
    cls: 'repair',
    pattern: /Search index exceeded its size cap; deleted for a rebuild/,
    source: {
      file: DB,
      line: 381,
      fragment: 'Search index exceeded its size cap; deleted for a rebuild'
    },
    meaning: 'search-index.db was over its size cap at boot and deleted',
    sample:
      'Search index exceeded its size cap; deleted for a rebuild fileBytes=9000000000 maxBytes=8589934592'
  },
  {
    id: 'storage-full-reset',
    cls: 'repair',
    pattern: /Search index database was full during setup; deleted for a rebuild/,
    source: {
      file: DB,
      line: 1314,
      fragment: 'Search index database was full during setup; deleted for a rebuild'
    },
    meaning: 'search-index.db had no free page for migrations and was deleted',
    sample:
      'Search index database was full during setup; deleted for a rebuild dbPath=/x/search-index.db'
  },
  {
    id: 'search-rebuild-failed',
    cls: 'repair',
    pattern: /Search index database rebuild failed; falling back to primary DB/,
    source: {
      file: DB,
      line: 1297,
      fragment: 'Search index database rebuild failed; falling back to primary DB'
    },
    meaning: 'rebuilding search-index.db failed and search moved to the primary database',
    sample: 'Search index database rebuild failed; falling back to primary DB'
  },
  {
    id: 'integrity-recovery-failed',
    cls: 'repair',
    pattern: /Database integrity recovery failed/,
    source: { file: DB, line: 1478, fragment: 'Database integrity recovery failed' },
    meaning: 'the corruption recovery path itself threw',
    sample: 'Database integrity recovery failed'
  },
  {
    id: 'fts-inconsistency',
    cls: 'repair',
    pattern: /FTS5 index inconsistency detected \(fts=\d+, files=\d+\)/,
    source: {
      file: `${FILES}/services/file-provider-integrity-service.ts`,
      line: 85,
      fragment: 'FTS5 index inconsistency detected (fts='
    },
    meaning:
      'file index integrity check found FTS rows and files rows disagree; scan_progress is cleared for a full re-scan',
    sample:
      'FTS5 index inconsistency detected (fts=120, files=4100) — clearing scan_progress for full re-scan'
  },
  {
    id: 'fts-migrated',
    cls: 'repair',
    pattern: /FTS5 table was migrated — clearing scan_progress for full re-index/,
    source: {
      file: `${FILES}/file-provider.ts`,
      line: 3011,
      fragment: 'FTS5 table was migrated — clearing scan_progress for full re-index'
    },
    meaning:
      'search_index was dropped and recreated (SearchIndexService.repair); the file index re-scans everything',
    sample: 'FTS5 table was migrated — clearing scan_progress for full re-index'
  },
  {
    id: 'index-state-reset',
    cls: 'repair',
    pattern: /File index runtime state reset completed/,
    source: {
      file: `${FILES}/services/file-provider-runtime-reset-service.ts`,
      line: 74,
      fragment: 'File index runtime state reset completed'
    },
    meaning:
      'file index runtime state reset (integrity-repair, health-repair, schema-migration or manual-rebuild)',
    sample:
      'File index runtime state reset completed sourceId=file-provider reason=integrity-repair clearedScanProgress=true'
  },
  {
    id: 'engine-corrupt',
    cls: 'repair',
    pattern:
      /SQLITE_CORRUPT\w*|SQLITE_NOTADB|database disk image is malformed|file is not a database|malformed database schema/,
    source: {
      file: 'src/main/db/sqlite-retry.ts',
      line: 127,
      fragment: "message.includes('database disk image is malformed')"
    },
    meaning: 'the SQLite engine reported corruption (the app treats these errors as unrecoverable)',
    sample: 'Failed to write search index error=SqliteError: database disk image is malformed'
  },
  {
    id: 'integrity-probe-no-verdict',
    cls: 'suspect',
    pattern: /Database integrity probe returned no verdict/,
    source: { file: DB, line: 349, fragment: 'Database integrity probe returned no verdict' },
    meaning: 'quick_check ran after an unclean shutdown and gave no answer',
    sample: 'Database integrity probe returned no verdict; treating as healthy'
  },
  {
    id: 'integrity-probe-failed',
    cls: 'suspect',
    pattern: /Database integrity probe failed \(non-corruption\)/,
    source: { file: DB, line: 355, fragment: 'Database integrity probe failed (non-corruption)' },
    meaning: 'quick_check ran after an unclean shutdown and failed for a non-corruption reason',
    sample: 'Database integrity probe failed (non-corruption) error=SQLITE_BUSY'
  },
  {
    id: 'wal-not-entered',
    cls: 'suspect',
    pattern: /SQLite \w+ did not enter WAL mode/,
    source: { file: DB, line: 295, fragment: 'did not enter WAL mode' },
    meaning: 'two connections in different journal modes are a direct corruption path',
    sample: 'SQLite search did not enter WAL mode journalMode=delete'
  },
  {
    id: 'search-init-fallback',
    cls: 'suspect',
    pattern: /Search index database initialization failed; falling back to primary DB/,
    source: {
      file: DB,
      line: 1334,
      fragment: 'Search index database initialization failed; falling back to primary DB'
    },
    meaning: 'search-index.db could not be initialised, search runs on the primary database',
    sample: 'Search index database initialization failed; falling back to primary DB'
  },
  {
    id: 'running-marker-write-failed',
    cls: 'suspect',
    pattern: /Failed to write database running marker/,
    source: { file: DB, line: 1449, fragment: 'Failed to write database running marker' },
    meaning: 'without the marker an unclean shutdown goes unnoticed at the next boot',
    sample: 'Failed to write database running marker'
  },
  {
    id: 'running-marker-clear-failed',
    cls: 'suspect',
    pattern: /Failed to clear database running marker/,
    source: { file: DB, line: 1902, fragment: 'Failed to clear database running marker' },
    meaning: 'the next boot will run quick_check and may repair',
    sample: 'Failed to clear database running marker'
  },
  {
    id: 'final-checkpoint-failed',
    cls: 'suspect',
    pattern: /Final WAL checkpoint on shutdown failed/,
    source: { file: DB, line: 1883, fragment: 'Final WAL checkpoint on shutdown failed' },
    meaning: 'a large uncheckpointed WAL is left for the next launch',
    sample: 'Final WAL checkpoint on shutdown failed'
  },
  {
    id: 'bootstrap-reindex-failed',
    cls: 'suspect',
    pattern: /Search index bootstrap reindex failed/,
    source: {
      file: `${FILES}/services/file-provider-boot-pass-service.ts`,
      line: 206,
      fragment: 'Search index bootstrap reindex failed'
    },
    meaning: 'the one-time full reindex of an empty search index failed',
    sample: 'Search index bootstrap reindex failed'
  },
  {
    id: 'bootstrap-reindex-scheduled',
    cls: 'expected-on-fresh-profile',
    pattern: /Search index bootstrap reindex scheduled: search_index empty/,
    source: {
      file: `${FILES}/services/file-provider-boot-pass-service.ts`,
      line: 197,
      fragment: 'Search index bootstrap reindex scheduled: search_index empty'
    },
    meaning: 'first launch with an empty search index schedules the one-time full reindex',
    sample:
      "Search index bootstrap reindex scheduled: search_index empty for 'file-provider' with 2 watch root(s)"
  },
  {
    id: 'bootstrap-reindex-completed',
    cls: 'expected-on-fresh-profile',
    pattern: /Search index bootstrap reindex completed/,
    source: {
      file: `${FILES}/services/file-provider-boot-pass-service.ts`,
      line: 200,
      fragment: 'Search index bootstrap reindex completed'
    },
    meaning: 'the one-time full reindex finished',
    sample: 'Search index bootstrap reindex completed durationMs=1800'
  }
]

/** Cheap gate in front of the marker patterns; the test checks every sample passes it. */
export const MARKER_PREFILTER =
  /orrupt|uarantin|ebuil|inconsisten|migrated|state reset|malformed|NOTADB|not a database|bootstrap reindex|integrity|WAL|running marker|size cap|full during setup|falling back/

// eslint-disable-next-line no-control-regex
const ANSI = /\x1B\[[0-9;]*m/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}

export interface MarkerHit {
  marker: DbMarker
  text: string
}

export function classifyLogLine(rawLine: string): MarkerHit | null {
  const text = stripAnsi(rawLine)
  if (!MARKER_PREFILTER.test(text)) return null
  for (const marker of DB_MARKERS) {
    if (marker.pattern.test(text)) return { marker, text }
  }
  return null
}

const QUARANTINE_SUFFIX = /\.corrupt(?:[-.]\w+)?$/
const WALK_ENTRY_CAP = 5_000
const WALK_DEPTH_CAP = 4

/** Quarantined database files (`*.corrupt`) under a profile, found with a bounded walk. */
export async function findQuarantineFiles(profileDir: string): Promise<string[]> {
  const found: string[] = []
  let visited = 0
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > WALK_DEPTH_CAP || visited >= WALK_ENTRY_CAP) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (++visited > WALK_ENTRY_CAP) return
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') await walk(full, depth + 1)
      } else if (QUARANTINE_SUFFIX.test(entry.name)) {
        found.push(full)
      }
    }
  }
  await walk(profileDir, 0)
  return found.sort()
}
