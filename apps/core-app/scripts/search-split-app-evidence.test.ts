import { describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createServer as HttpServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@libsql/client'
import {
  APP_CATALOG_CHECK_NAME,
  SPLIT_FLAG_ENV,
  USER_DATA_ENV,
  WATCH_ROOTS_ENV,
  applyAppCatalogCoverage,
  FIXTURE_FILE_NAMES,
  FIXTURE_SEARCH_TOKEN,
  assertIsolatedFixtureRoot,
  assertIsolatedProfileDir,
  hasProfileOwnershipMarker,
  prepareFixtureRoot,
  prepareIsolatedProfile,
  PROFILE_OWNERSHIP_MARKER,
  buildLaunchCommand,
  buildLaunchEnv,
  buildSentinelGuards,
  compareQueryResults,
  digestRows,
  judgeNoPrimaryFallback,
  judgeReadinessSignals,
  judgeRollbackTopology,
  judgeSearchDbMarker,
  installSentinel,
  judgeSentinel,
  judgeStateFile,
  liveQueryDigests,
  measureProfile,
  nonAppFileRows,
  notExercised,
  parseCli,
  parseSplitLogSignals,
  pickFreePort,
  readSentinel,
  redactReport,
  sliceLogForPhase,
  splitFlagValueFor,
  terminateChild,
  tryResolveProfileLayout,
  waitForCdpEndpoint,
  type HomeMeasurement,
  type MeasurementQueries,
  type PhaseLogWindow,
  type PhaseRecord,
  type SearchSplitAppEvidenceReport,
  type SentinelReport
} from './search-split-app-evidence'
import { judgeTopology, type Topology } from './search-split-topology-verify'

/**
 * The isolated-profile evidence harness. Every case is paired the same way the sibling verifier's
 * tests are: the healthy shape passes, and the specific damage the check exists to catch fails. The
 * expensive half (launching CoreApp) is not exercised here — `--self-check` covers the wiring, and
 * the assertions themselves are what these tests pin.
 */

type HomeMeasurementLike = HomeMeasurement
type PhaseRecordLike = PhaseRecord

function topology(over: Partial<Topology> = {}): Topology {
  return {
    profile: '/tmp/p',
    primary: {
      file_index_progress: 0,
      scan_progress: 0,
      search_index: 0,
      keyword_mappings: 0
    },
    search: {
      file_index_progress: 3,
      scan_progress: 6,
      search_index: 400,
      keyword_mappings: 90
    },
    primaryFilesByType: { app: 220 },
    searchFilesByType: { file: 5000 },
    primaryNonAppExtensions: 0,
    ...over
  }
}

const failing = (checks: Array<{ name: string; ok: boolean }>): string[] =>
  checks.filter((check) => !check.ok).map((check) => check.name)

const statusOf = (
  checks: Array<{ name: string; status: string }>,
  name: string
): string | undefined => checks.find((check) => check.name === name)?.status

describe('assertIsolatedProfileDir', () => {
  it('accepts a directory under the temp root', () => {
    const profile = path.join(os.tmpdir(), 'tuff-split-evidence-test')
    expect(assertIsolatedProfileDir(profile)).toBe(path.resolve(profile))
  })

  it('accepts /tmp, which is not os.tmpdir() on macOS', () => {
    expect(assertIsolatedProfileDir('/tmp/tuff-split-evidence-test')).toBe(
      '/tmp/tuff-split-evidence-test'
    )
  })

  it('refuses the real profile under Application Support', () => {
    expect(() =>
      assertIsolatedProfileDir(path.join(os.homedir(), 'Library', 'Application Support', 'Tuff'))
    ).toThrow(/refusing to use/)
  })

  it('refuses a temp-looking directory inside the repository', () => {
    expect(() => assertIsolatedProfileDir(path.join(process.cwd(), 'tmp', 'profile'))).toThrow(
      /refusing to use/
    )
  })

  it('refuses the temp root itself, which is not a profile', () => {
    expect(() => assertIsolatedProfileDir(os.tmpdir())).toThrow(/refusing to use/)
  })

  /**
   * The lexical gate alone passes a temp-looking path; `/tmp` on macOS is a symlink, so an attacker
   * (or a mistyped path) can point a temp directory at the real home. The canonicalised path is the
   * one checked, and it must be rejected **before** the profile is ever created or written to.
   */
  it('refuses a temp path whose ancestor symlinks into the real home', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'tuff-split-guard-'))
    try {
      await symlink(os.homedir(), path.join(base, 'escape'), 'dir')
      expect(() => assertIsolatedProfileDir(path.join(base, 'escape', 'Tuff'))).toThrow(
        /refusing to use/
      )
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})

describe('assertIsolatedFixtureRoot', () => {
  it('rejects a fixture root that is not a subtree of the profile', () => {
    expect(() => assertIsolatedFixtureRoot('/tmp/profile', '/tmp/profile-sibling/home')).toThrow(
      /refusing fixture root/
    )
  })

  it('rejects the profile itself as the fixture root', () => {
    expect(() => assertIsolatedFixtureRoot('/tmp/profile', '/tmp/profile')).toThrow(
      /refusing fixture root/
    )
  })

  /**
   * The app's fake `HOME` and watch root must live inside the disposable profile. A symlinked
   * fixture root resolves outside it, so the app would index and write into a real directory while
   * the harness believes it is isolated.
   */
  it('rejects a fixture root that symlinks out of the profile', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'tuff-split-fixture-'))
    try {
      const profile = path.join(base, 'profile')
      const outside = path.join(base, 'outside')
      await mkdir(profile, { recursive: true })
      await mkdir(outside, { recursive: true })
      await symlink(outside, path.join(profile, 'home'), 'dir')
      expect(() => assertIsolatedFixtureRoot(profile, path.join(profile, 'home'))).toThrow(
        /refusing fixture root/
      )
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})

describe('prepareFixtureRoot / prepareIsolatedProfile boundaries', () => {
  /**
   * A direct import of `prepareFixtureRoot` must not be a way around the profile guard. The profile
   * is the real home and the fixture root is a fresh subdirectory of it that does not exist yet, so
   * nothing pre-existing is at risk and the only way to produce /refusing to use/ is
   * `assertIsolatedProfileDir` (run through `assertIsolatedFixtureRoot`). A version that skipped it
   * would create the fixture directory inside the real home.
   */
  it('refuses a direct call aimed at the real home instead of a temp profile', async () => {
    const fixture = path.join(os.homedir(), 'tuff-split-guard-should-not-exist', 'home')
    try {
      await expect(prepareFixtureRoot(fixture, os.homedir())).rejects.toThrow(/refusing to use/)
      expect(existsSync(fixture)).toBe(false)
    } finally {
      await rm(path.join(os.homedir(), 'tuff-split-guard-should-not-exist'), {
        recursive: true,
        force: true
      })
    }
  })

  /**
   * The bug: an existing profile directory that this harness does not own must be refused even when
   * the fixture subdirectory has not been created yet. Otherwise the run proceeds and `--cleanupProfile`
   * later `rm -rf`s a directory the harness never created.
   */
  it('refuses an unowned non-empty profile even when the fixture root does not exist yet', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'tuff-split-unowned-'))
    try {
      const profile = path.join(base, 'profile')
      const fixture = path.join(profile, 'home')
      await mkdir(profile, { recursive: true })
      const sentinel = path.join(profile, 'IMPORTANT-user-file.txt')
      await writeFile(sentinel, 'do not delete\n', 'utf8')

      await expect(prepareFixtureRoot(fixture, profile)).rejects.toThrow(/refusing/)

      expect(await readFile(sentinel, 'utf8')).toBe('do not delete\n')
      expect(existsSync(path.join(fixture, 'Documents'))).toBe(false)
      expect(await hasProfileOwnershipMarker(profile)).toBe(false)
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  /**
   * A seeded fixture entry that is really a symlink to a file outside the profile must never be
   * written through: `writeFile` on the link would clobber a real user file. This is the overwrite
   * the guard exists to prevent, exercised against a real symlink on the temp filesystem.
   */
  it('never overwrites a file outside the profile through a symlinked fixture entry', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'tuff-split-entry-escape-'))
    try {
      const profile = path.join(base, 'profile')
      const fixture = path.join(profile, 'home')
      const outside = path.join(base, 'outside')
      await mkdir(outside, { recursive: true })
      const sentinel = path.join(outside, 'sentinel.txt')
      await writeFile(sentinel, 'ORIGINAL-SENTINEL\n', 'utf8')

      await prepareIsolatedProfile(profile, fixture)
      const linked = path.join(fixture, 'Documents', FIXTURE_FILE_NAMES[0])
      await rm(linked, { force: true })
      await symlink(sentinel, linked)

      await expect(prepareFixtureRoot(fixture, profile)).rejects.toThrow(/refusing/)
      expect(await readFile(sentinel, 'utf8')).toBe('ORIGINAL-SENTINEL\n')
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  it('refuses a fixture subdirectory that symlinks outside the profile', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'tuff-split-dir-escape-'))
    try {
      const profile = path.join(base, 'profile')
      const fixture = path.join(profile, 'home')
      const outside = path.join(base, 'outside')
      await mkdir(outside, { recursive: true })

      await prepareIsolatedProfile(profile, fixture)
      await rm(path.join(fixture, 'Documents'), { recursive: true, force: true })
      await symlink(outside, path.join(fixture, 'Documents'), 'dir')

      await expect(prepareFixtureRoot(fixture, profile)).rejects.toThrow(/refusing/)
      const leaked = (await readdir(outside)).filter((entry) =>
        (FIXTURE_FILE_NAMES as readonly string[]).includes(entry)
      )
      expect(leaked).toEqual([])
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })

  /**
   * The guard must not break the legitimate second phase: an owned profile seeded for bootstrap is
   * reused for split/rollback, so its collected `state.json` and ownership marker must survive.
   */
  it('keeps an owned profile and its collected state across phases', async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'tuff-split-multiphase-'))
    try {
      const profile = path.join(base, 'profile')
      const fixture = path.join(profile, 'home')
      await prepareIsolatedProfile(profile, fixture)
      expect(await hasProfileOwnershipMarker(profile)).toBe(true)

      const stateFile = path.join(profile, '.search-split-evidence', 'state.json')
      await mkdir(path.dirname(stateFile), { recursive: true })
      await writeFile(stateFile, '{"phases":[]}\n', 'utf8')

      await prepareFixtureRoot(fixture, profile)

      expect(await readFile(stateFile, 'utf8')).toBe('{"phases":[]}\n')
      expect(existsSync(path.join(profile, PROFILE_OWNERSHIP_MARKER))).toBe(true)
      for (const name of FIXTURE_FILE_NAMES) {
        expect(
          existsSync(path.join(fixture, 'Documents', name)) ||
            existsSync(path.join(fixture, 'Downloads', name))
        ).toBe(true)
      }
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})

describe('splitFlagValueFor', () => {
  /** The split phases must run with the variable absent: the gate is about the default, not an override. */
  it('leaves the flag unset for the default split phases', () => {
    expect(splitFlagValueFor('bootstrap', false)).toBeUndefined()
    expect(splitFlagValueFor('split', false)).toBeUndefined()
  })

  it('sets =1 only when the operator asks for it', () => {
    expect(splitFlagValueFor('split', true)).toBe('1')
  })

  it('always rolls back with =0', () => {
    expect(splitFlagValueFor('rollback', false)).toBe('0')
    expect(splitFlagValueFor('rollback', true)).toBe('0')
  })
})

describe('buildLaunchEnv', () => {
  it('isolates HOME, watch roots and userData', () => {
    const env = buildLaunchEnv({
      userDataDir: '/tmp/profile',
      homeDir: '/tmp/profile/home',
      splitFlagEnv: undefined,
      precoreDiagPath: '/tmp/profile/.search-split-evidence/precore-split.json'
    })
    expect(env.HOME).toBe('/tmp/profile/home')
    expect(env[WATCH_ROOTS_ENV]).toBe('/tmp/profile/home')
    expect(env[USER_DATA_ENV]).toBe('/tmp/profile')
    expect(env.TUFF_PACKAGED_ACCEPTANCE_ISOLATED).toBe('1')
  })

  /**
   * An inherited flag would turn the "default path" phases into an explicit override without
   * changing anything visible in the report, so the deletion is the load-bearing part.
   */
  it('deletes an inherited split flag when the phase runs the default', () => {
    process.env[SPLIT_FLAG_ENV] = '0'
    try {
      const env = buildLaunchEnv({
        userDataDir: '/tmp/profile',
        homeDir: '/tmp/profile/home',
        splitFlagEnv: undefined,
        precoreDiagPath: '/tmp/diag.json'
      })
      expect(env[SPLIT_FLAG_ENV]).toBeUndefined()
    } finally {
      delete process.env[SPLIT_FLAG_ENV]
    }
  })

  it('sets =0 for the rollback phase', () => {
    const env = buildLaunchEnv({
      userDataDir: '/tmp/profile',
      homeDir: '/tmp/profile/home',
      splitFlagEnv: '0',
      precoreDiagPath: '/tmp/diag.json'
    })
    expect(env[SPLIT_FLAG_ENV]).toBe('0')
  })

  it('strips the inherited toolchain so the child cannot reach the runner', () => {
    process.env.PNPM_HOME_TEST = '/should-be-stripped'
    try {
      const env = buildLaunchEnv({
        userDataDir: '/tmp/profile',
        homeDir: '/tmp/profile/home',
        splitFlagEnv: undefined,
        precoreDiagPath: '/tmp/diag.json'
      })
      expect(Object.keys(env).some((key) => key.startsWith('PNPM_'))).toBe(false)
      expect(Object.keys(env).some((key) => key.startsWith('npm_config_'))).toBe(false)
    } finally {
      delete process.env.PNPM_HOME_TEST
    }
  })
})

describe('buildLaunchCommand', () => {
  it('launches the packaged binary with a debugging port', () => {
    const built = buildLaunchCommand({
      launch: 'packaged',
      appBundle: '/tmp/dist/tuff.app',
      coreAppDir: '/tmp/core-app',
      cdpPort: 9333
    })
    expect(built.command).toBe('/tmp/dist/tuff.app/Contents/MacOS/tuff')
    expect(built.args).toEqual(['--remote-debugging-port=9333'])
  })

  it('passes the flag through the dev wrapper', () => {
    const built = buildLaunchCommand({
      launch: 'dev',
      appBundle: '/tmp/dist/tuff.app',
      coreAppDir: '/tmp/core-app',
      cdpPort: 9333
    })
    expect(built.command).toBe('pnpm')
    expect(built.args).toEqual(['run', 'dev', '--', '--remote-debugging-port=9333'])
  })
})

describe('parseSplitLogSignals', () => {
  const healthy = [
    '[2026-09-29T10:00:03.200] [INFO] database - Search index database initialized {"meta":{"path":"/tmp/p/tuff-dev/modules/database/search-index.db"}}'
  ].join('\n')

  it('reads the file the worker opened out of the initialization line', () => {
    const signals = parseSplitLogSignals(healthy)
    expect(signals.searchDbInitialized).toBe(true)
    expect(signals.searchDbPath).toBe('/tmp/p/tuff-dev/modules/database/search-index.db')
  })

  it('passes the marker check only when the path is the profile\u2019s search file', () => {
    const signals = parseSplitLogSignals(healthy)
    expect(
      judgeSearchDbMarker(signals, '/tmp/p/tuff-dev/modules/database/search-index.db').status
    ).toBe('passed')
    expect(judgeSearchDbMarker(signals, '/tmp/other/search-index.db').status).toBe('failed')
  })

  it('detects the silent-fallback warning', () => {
    const signals = parseSplitLogSignals(
      '[2026-09-29T10:00:03.200] [WARN] database - Search index database initialization failed; falling back to primary DB {"error":{}}'
    )
    expect(judgeNoPrimaryFallback(signals).status).toBe('failed')
  })

  it('detects a provider write that ran before the writer was ready', () => {
    const signals = parseSplitLogSignals(
      '[2026-09-29T10:00:05.000] [WARN] file-provider - File persistence port operation skipped: readiness unavailable {"reason":"file-index.incremental.insert"}\n' +
        '[2026-09-29T10:00:06.000] [ERROR] file-provider - FILE_PERSISTENCE_PORT_UNAVAILABLE'
    )
    expect(failing(judgeReadinessSignals(signals))).toContain(
      'provider writes waited for writer readiness'
    )
    expect(signals.writerFailureCodes).toEqual(['FILE_PERSISTENCE_PORT_UNAVAILABLE'])
  })

  it('counts contention-threshold warnings', () => {
    const signals = parseSplitLogSignals(
      '[2026-09-29T10:00:07.000] [WARN] database - Database health snapshot exceeded contention threshold {"meta":{}}'
    )
    expect(failing(judgeReadinessSignals(signals))).toContain('no contention warnings')
  })
})

describe('sliceLogForPhase', () => {
  const dated = [
    '[2026-09-29T10:00:00.000] [INFO] before the window {}',
    '[2026-09-29T10:00:03.000] [INFO] inside the window {}',
    '[2026-09-29T10:00:30.000] [INFO] after the window {}'
  ].join('\n')

  it('keeps only the lines written inside the phase', () => {
    const window: PhaseLogWindow = {
      startedAtMs: Date.parse('2026-09-29T10:00:01.500'),
      endedAtMs: Date.parse('2026-09-29T10:00:10.000'),
      bounded: false
    }
    expect(sliceLogForPhase(dated, window)).toBe(
      '[2026-09-29T10:00:03.000] [INFO] inside the window {}'
    )
    expect(window.bounded).toBe(true)
  })

  /** The slack is load-bearing: the appender's first line can predate the harness' own start. */
  it('keeps a line written just before the window opened', () => {
    const window: PhaseLogWindow = {
      startedAtMs: Date.parse('2026-09-29T10:00:00.500'),
      endedAtMs: Date.parse('2026-09-29T10:00:10.000'),
      bounded: false
    }
    expect(sliceLogForPhase(dated, window)).toContain('before the window')
  })

  /**
   * A log whose layout changed must not be filtered to nothing: an empty log reads as "the marker
   * never appeared", which would block a healthy run on a formatting change.
   */
  it('keeps everything when the file carries no parseable timestamps', () => {
    const window: PhaseLogWindow = { startedAtMs: 1, endedAtMs: 2, bounded: true }
    expect(sliceLogForPhase('untimed line', window)).toBe('untimed line')
    expect(window.bounded).toBe(false)
  })
})

describe('buildSentinelGuards', () => {
  const guards = buildSentinelGuards([
    'files',
    'file_extensions',
    'file_index_progress',
    'keyword_mappings'
  ])

  it('leaves the app catalog unguarded but everything else on files guarded', () => {
    const files = guards.filter((guard) => guard.table === 'files')
    expect(files).toHaveLength(3)
    expect(files.every((guard) => guard.sql.includes("IS NOT 'app'"))).toBe(true)
  })

  it('ties an extension write to the owning row\u2019s type', () => {
    const extensions = guards.filter((guard) => guard.table === 'file_extensions')
    expect(extensions).toHaveLength(3)
    expect(
      extensions.every((guard) => guard.sql.includes('(SELECT type FROM files WHERE id ='))
    ).toBe(true)
  })

  it('guards a wholly worker-owned table unconditionally', () => {
    const keyword = guards.filter((guard) => guard.table === 'keyword_mappings')
    expect(keyword).toHaveLength(3)
    expect(keyword.every((guard) => !guard.sql.includes('IS NOT'))).toBe(true)
  })

  /** The arming report and the SQL have to agree on the name, or a live check reads armed as unarmed. */
  it('records each guard under the name its own SQL creates', () => {
    for (const guard of guards) {
      expect(guard.sql).toContain(`CREATE TRIGGER IF NOT EXISTS ${guard.name} `)
    }
  })

  it('emits nothing for a table that is absent from the primary', () => {
    expect(buildSentinelGuards(['files']).map((guard) => guard.table)).toEqual([
      'files',
      'files',
      'files'
    ])
  })
})

describe('judgeSentinel', () => {
  const armed = (violations: SentinelReport['violations']): SentinelReport => ({
    installation: {
      tables: ['files', 'file_extensions', 'search_index'],
      coverage: [
        { table: 'files', installed: 3, skippedReason: null },
        { table: 'file_extensions', installed: 3, skippedReason: null },
        {
          table: 'search_index',
          installed: 0,
          skippedReason: 'cannot create triggers on virtual tables'
        }
      ],
      installedTriggers: []
    },
    violations,
    totalViolations: violations.reduce((sum, violation) => sum + violation.count, 0)
  })

  it('passes a silent armed detector while a virtual table stays uninstrumented', () => {
    const checks = judgeSentinel(armed([]), 'must-be-silent')
    expect(failing(checks)).toEqual([])
    expect(statusOf(checks, 'search_index instrumented')).toBe('not-exercised')
  })

  it('fails on a recorded worker-owned write', () => {
    const checks = judgeSentinel(
      armed([{ table: 'files', operation: 'insert', count: 2 }]),
      'must-be-silent'
    )
    expect(failing(checks)).toContain('no worker-owned write reached the primary')
    expect(
      checks.find((check) => check.name === 'no worker-owned write reached the primary')?.detail
    ).toContain('files.insert=2')
  })

  it('fails when the core guards could not be armed at all', () => {
    const checks = judgeSentinel(
      {
        installation: {
          tables: ['files'],
          coverage: [{ table: 'files', installed: 0, skippedReason: 'database is locked' }],
          installedTriggers: []
        },
        violations: [],
        totalViolations: 0
      },
      'must-be-silent'
    )
    expect(failing(checks)).toContain('the write detector is armed')
  })

  it('requires the rollback run to prove the detector fires', () => {
    expect(failing(judgeSentinel(armed([]), 'must-have-fired'))).toContain(
      'rollback writes reach the primary (positive control)'
    )
    expect(
      failing(
        judgeSentinel(armed([{ table: 'files', operation: 'insert', count: 9 }]), 'must-have-fired')
      )
    ).toEqual([])
  })
})

describe('judgeRollbackTopology', () => {
  const before = topology()

  it('passes when the primary carries the index and the retired home stopped changing', () => {
    const after = topology({ primaryFilesByType: { app: 220, file: 5000 } })
    expect(failing(judgeRollbackTopology(after, before))).toEqual([])
  })

  it('fails when the retired search file keeps growing', () => {
    const after = topology({
      primaryFilesByType: { app: 220, file: 5000 },
      searchFilesByType: { file: 5001 }
    })
    expect(failing(judgeRollbackTopology(after, before))).toContain(
      'the retired search file is not written while the split is off'
    )
  })

  it('fails when the rollback left the index on the search home only', () => {
    const after = topology({ primaryFilesByType: { app: 220 }, searchFilesByType: { file: 5000 } })
    expect(failing(judgeRollbackTopology(after, before))).toContain(
      'the shared file carries the index again'
    )
  })

  it('reports the residue check as not exercised without a split-phase baseline', () => {
    const checks = judgeRollbackTopology(
      topology({ primaryFilesByType: { app: 220, file: 5000 } }),
      null
    )
    expect(statusOf(checks, 'the retired search file is not written while the split is off')).toBe(
      'not-exercised'
    )
  })

  it('does not claim the catalog placement when the profile has no catalog rows', () => {
    const checks = judgeRollbackTopology(
      topology({ primaryFilesByType: { file: 5000 }, searchFilesByType: {} }),
      before
    )
    expect(statusOf(checks, 'the app catalog is still on the primary')).toBe('not-exercised')
  })
})

describe('installSentinel against a real database', () => {
  /**
   * The trigger SQL is the part that cannot be reasoned about on paper: `IS NOT 'app'` must count a
   * NULL type as a violation, the extension guard has to follow the owning row, and an FTS5 virtual
   * table has to end up reported as uninstrumented instead of silently counted as covered. All of
   * that is only true of real SQLite, so this runs against a real file.
   */
  it('arms the guards, records only forbidden writes, and reports the virtual table', async () => {
    const { createClient } = await import('@libsql/client')
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tuff-sentinel-test-'))
    const primary = path.join(dir, 'database.db')
    const client = createClient({ url: `file:${primary}` })
    try {
      await client.execute(
        'CREATE TABLE files (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, name TEXT NOT NULL, type TEXT)'
      )
      await client.execute(
        'CREATE TABLE file_extensions (file_id INTEGER NOT NULL, key TEXT NOT NULL)'
      )
      await client.execute('CREATE TABLE file_index_progress (file_id INTEGER NOT NULL)')
      await client.execute('CREATE TABLE scan_progress (id INTEGER PRIMARY KEY)')
      await client.execute('CREATE TABLE keyword_mappings (id INTEGER PRIMARY KEY, keyword TEXT)')
      await client.execute(
        'CREATE VIRTUAL TABLE search_index USING fts5(item_id UNINDEXED, provider UNINDEXED, title)'
      )
    } finally {
      client.close()
    }

    try {
      const armed = await installSentinel(primary)
      const coverage = Object.fromEntries(
        armed.coverage.map((entry) => [entry.table, entry.installed])
      )
      expect(coverage.files).toBe(3)
      expect(coverage.file_extensions).toBe(3)
      expect(coverage.keyword_mappings).toBe(3)
      expect(coverage.search_index).toBe(0)
      expect(armed.coverage.find((entry) => entry.table === 'search_index')?.skippedReason).toMatch(
        /virtual table/i
      )

      const writer = createClient({ url: `file:${primary}` })
      try {
        await writer.execute(
          "INSERT INTO files (path, name, type) VALUES ('/tmp/a.txt', 'a', 'file')"
        )
        await writer.execute(
          "INSERT INTO files (path, name, type) VALUES ('/Applications/x.app', 'x', 'app')"
        )
        // NULL type is not a licensed owner: it must be recorded, not skipped.
        await writer.execute(
          "INSERT INTO files (path, name, type) VALUES ('/tmp/b.txt', 'b', NULL)"
        )
        await writer.execute(
          "INSERT INTO file_extensions (file_id, key) VALUES (1, 'icon'), (2, 'bundleId'), (3, 'icon')"
        )
        await writer.execute("DELETE FROM files WHERE path = '/tmp/a.txt'")
        await writer.execute("UPDATE files SET name = 'x2' WHERE path = '/Applications/x.app'")
        await writer.execute("INSERT INTO keyword_mappings (keyword) VALUES ('chat')")
      } finally {
        writer.close()
      }

      const report = await readSentinel(primary, armed)
      const totals = Object.fromEntries(
        report.violations.map((violation) => [
          `${violation.table}.${violation.operation}`,
          violation.count
        ])
      )
      expect(totals['files.insert']).toBe(2)
      expect(totals['files.delete']).toBe(1)
      expect(totals['files.update']).toBeUndefined()
      expect(totals['file_extensions.insert']).toBe(2)
      expect(totals['keyword_mappings.insert']).toBe(1)
      expect(report.totalViolations).toBe(6)
      expect(failing(judgeSentinel(report, 'must-be-silent'))).toContain(
        'no worker-owned write reached the primary'
      )
      expect(failing(judgeSentinel(report, 'must-have-fired'))).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 30_000)
})

describe('applyAppCatalogCoverage', () => {
  const emptyCatalog = { primaryFilesByType: {}, searchFilesByType: { file: 4 } }

  it('downgrades the catalog check when the profile has no app rows at all', () => {
    const checks = applyAppCatalogCoverage(
      judgeTopology(topology(emptyCatalog), 'split'),
      topology(emptyCatalog)
    )
    expect(statusOf(checks, APP_CATALOG_CHECK_NAME)).toBe('not-exercised')
  })

  /** Rows in the search file are the damage this check exists to catch, so coverage never excuses it. */
  it('keeps a real leak a failure', () => {
    const leaked = { primaryFilesByType: {}, searchFilesByType: { file: 4, app: 2 } }
    const checks = applyAppCatalogCoverage(
      judgeTopology(topology(leaked), 'split'),
      topology(leaked)
    )
    expect(statusOf(checks, APP_CATALOG_CHECK_NAME)).toBe('failed')
  })

  it('leaves a healthy catalog alone', () => {
    const checks = applyAppCatalogCoverage(judgeTopology(topology(), 'split'), topology())
    expect(statusOf(checks, APP_CATALOG_CHECK_NAME)).toBe('passed')
  })
})

describe('live-home query digests', () => {
  const queries: MeasurementQueries = {
    primary: [digestRows('app-catalog', ['/Applications/x.app']), digestRows('non-app-files', [])],
    search: [digestRows('non-app-files', ['tuffsplitevidencealpha.txt'])]
  }

  it('reads the split phase from the search home, except for the catalog', () => {
    const split = liveQueryDigests(queries, 'split')
    expect(split.find((digest) => digest.id === 'non-app-files')?.sample).toEqual([
      'tuffsplitevidencealpha.txt'
    ])
    expect(split.find((digest) => digest.id === 'app-catalog')?.sample).toEqual([
      '/Applications/x.app'
    ])
  })

  it('reads the rollback phase from the primary', () => {
    const rollback = liveQueryDigests(
      { ...queries, primary: [digestRows('non-app-files', ['tuffsplitevidencealpha.txt'])] },
      'shared'
    )
    expect(rollback.find((digest) => digest.id === 'non-app-files')?.sample).toEqual([
      'tuffsplitevidencealpha.txt'
    ])
  })

  it('matches a rollback that rebuilt the index', () => {
    const rollback: MeasurementQueries = {
      primary: [
        digestRows('non-app-files', ['tuffsplitevidencealpha.txt']),
        digestRows('app-catalog', ['/Applications/x.app'])
      ],
      search: [digestRows('non-app-files', ['tuffsplitevidencealpha.txt'])]
    }
    expect(
      failing(
        compareQueryResults(
          liveQueryDigests(queries, 'split'),
          liveQueryDigests(rollback, 'shared')
        )
      )
    ).toEqual([])
  })

  /**
   * The stale-union trap: the retired search file still answers, so a comparison that included it
   * would call an empty primary index parity.
   */
  it('fails when only the stale search file answers after the rollback', () => {
    const rollback: MeasurementQueries = {
      primary: [
        digestRows('app-catalog', ['/Applications/x.app']),
        digestRows('non-app-files', [])
      ],
      search: [digestRows('non-app-files', ['tuffsplitevidencealpha.txt'])]
    }
    expect(
      failing(
        compareQueryResults(
          liveQueryDigests(queries, 'split'),
          liveQueryDigests(rollback, 'shared')
        )
      )
    ).toContain('query parity: non-app-files')
  })

  it('fails when a result set is missing on one side entirely', () => {
    expect(
      failing(
        compareQueryResults(liveQueryDigests(queries, 'split'), [digestRows('non-app-files', [])])
      )
    ).toContain('query parity: app-catalog')
  })
})

describe('redactReport', () => {
  const report = {
    schema: 'search-split-app-evidence/v1',
    generatedAt: '2026-09-29T00:00:00.000Z',
    ok: false,
    profile: '/tmp/tuff-split-evidence-12345',
    fixtureRoot: '/tmp/tuff-split-evidence-12345/home',
    profileMutationPolicy: 'isolated-temp-profile-only',
    launch: 'dev',
    phases: [
      {
        phase: 'split',
        splitFlag: 'unset (default)',
        settled: true,
        after: {
          topology: topology(),
          queries: { primary: [], search: [] }
        },
        checks: [
          { name: 'ok', ok: true, detail: 'fine', status: 'passed' },
          { name: 'bad', ok: false, detail: 'leaked-detail-marker', status: 'failed' },
          notExercised('unmeasured', 'no rows in this profile')
        ]
      }
    ],
    parityChecks: [],
    coverage: {
      sentinel: [],
      notExercised: [
        { phase: 'split', name: 'search_index instrumented', detail: 'virtual table' }
      ],
      boundary: ['no renderer-level search']
    },
    nextActions: ['fix it']
  } as unknown as SearchSplitAppEvidenceReport

  it('drops absolute profile paths and log text', () => {
    const redacted = redactReport(report)
    const serialized = JSON.stringify(redacted)
    expect(serialized).not.toContain('/tmp/tuff-split-evidence-12345')
    expect(serialized).not.toContain('leaked-detail-marker')
  })

  it('keeps the counts a reviewer needs and names the failures', () => {
    const redacted = redactReport(report)
    expect(redacted.phases[0]).toMatchObject({
      phase: 'split',
      splitFlag: 'unset (default)',
      settled: true,
      searchIndexRows: 400,
      primaryNonAppFileRows: 0,
      failedChecks: ['bad'],
      notExercisedChecks: ['unmeasured']
    })
    expect(redacted.failedChecks).toEqual(['bad'])
    expect(redacted.uninstrumentedTables).toEqual(['search_index'])
  })

  it('records the coverage boundary', () => {
    expect(redactReport(report).boundary).toContain('no renderer-level search')
  })
})

describe('measureProfile', () => {
  async function fabricateProfile(withSearch: boolean): Promise<{ profile: string; dir: string }> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tuff-measure-test-'))
    const profile = dir
    const dbDir = path.join(dir, 'tuff-dev', 'modules', 'database')
    await mkdir(dbDir, { recursive: true })
    const primary = createClient({ url: `file:${path.join(dbDir, 'database.db')}` })
    try {
      await primary.execute(
        'CREATE TABLE files (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL)'
      )
      await primary.execute(
        'CREATE TABLE file_extensions (file_id INTEGER NOT NULL, key TEXT NOT NULL)'
      )
      await primary.execute('CREATE TABLE file_index_progress (file_id INTEGER NOT NULL)')
      await primary.execute('CREATE TABLE scan_progress (id INTEGER PRIMARY KEY)')
      await primary.execute('CREATE TABLE keyword_mappings (id INTEGER PRIMARY KEY, keyword TEXT)')
      await primary.execute(
        'CREATE VIRTUAL TABLE search_index USING fts5(item_id UNINDEXED, provider UNINDEXED, title)'
      )
      await primary.execute(
        "INSERT INTO files (path, name, type) VALUES ('/Applications/x.app', 'x', 'app')"
      )
    } finally {
      primary.close()
    }
    if (withSearch) {
      const search = createClient({ url: `file:${path.join(dbDir, 'search-index.db')}` })
      try {
        await search.execute(
          'CREATE TABLE files (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL)'
        )
        await search.execute(
          'CREATE TABLE file_extensions (file_id INTEGER NOT NULL, key TEXT NOT NULL)'
        )
        await search.execute('CREATE TABLE file_index_progress (file_id INTEGER NOT NULL)')
        await search.execute('CREATE TABLE scan_progress (id INTEGER PRIMARY KEY)')
        await search.execute('CREATE TABLE keyword_mappings (id INTEGER PRIMARY KEY, keyword TEXT)')
        await search.execute(
          'CREATE VIRTUAL TABLE search_index USING fts5(item_id UNINDEXED, provider UNINDEXED, title)'
        )
        await search.execute(
          `INSERT INTO files (path, name, type) VALUES ('/tmp/home/a.txt', '${FIXTURE_SEARCH_TOKEN}alpha.txt', 'file'), ('/tmp/home/b.md', 'b.md', 'file')`
        )
        await search.execute(
          `INSERT INTO search_index (item_id, provider, title) VALUES ('1', 'file-provider', '${FIXTURE_SEARCH_TOKEN}alpha.txt')`
        )
      } finally {
        search.close()
      }
    }
    return { profile, dir }
  }

  it('reads both live homes and their queries', async () => {
    const { profile, dir } = await fabricateProfile(true)
    try {
      const measurement = await measureProfile(profile)
      expect(measurement.primaryExists).toBe(true)
      expect(measurement.searchExists).toBe(true)
      expect(measurement.topology?.primaryFilesByType).toEqual({ app: 1 })
      expect(measurement.topology?.searchFilesByType).toEqual({ file: 2 })
      expect(nonAppFileRows(measurement.topology!.searchFilesByType)).toBe(2)
      // The catalog query answers from the primary even though the split phase reads the search home.
      expect(
        liveQueryDigests(measurement.queries, 'split').find((digest) => digest.id === 'app-catalog')
          ?.rows
      ).toBe(1)
      expect(
        liveQueryDigests(measurement.queries, 'split').find(
          (digest) => digest.id === 'search-index-hits'
        )?.rows
      ).toBe(1)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  /**
   * `@libsql/client` creates a `file:` database on open, so a measurement that probed the search
   * file unconditionally would create the very file the first-launch evidence needs to see absent.
   */
  it('does not create a missing search file while measuring', async () => {
    const { profile, dir } = await fabricateProfile(false)
    try {
      const search = path.join(profile, 'tuff-dev', 'modules', 'database', 'search-index.db')
      expect(existsSync(search)).toBe(false)
      const measurement = await measureProfile(profile)
      expect(measurement.searchExists).toBe(false)
      expect(measurement.queries.search).toEqual([])
      expect(existsSync(search)).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports nothing for a profile the app never ran against', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tuff-measure-empty-'))
    try {
      const measurement = await measureProfile(dir)
      expect(measurement.primaryExists).toBe(false)
      expect(measurement.topology).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('refuses to guess the layout when the app root name is unknown', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tuff-measure-other-'))
    try {
      await mkdir(path.join(dir, 'modules', 'database'), { recursive: true })
      const stray = createClient({
        url: `file:${path.join(dir, 'modules', 'database', 'database.db')}`
      })
      stray.close()
      expect(tryResolveProfileLayout(dir)).toBeNull()
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('process control', () => {
  it('detects a booted app through its debugging endpoint', async () => {
    const server = HttpServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify([{ id: 'page-1', type: 'page' }]))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    try {
      await expect(waitForCdpEndpoint(`http://127.0.0.1:${port}/json/list`, 4000)).resolves.toBe(
        true
      )
    } finally {
      server.close()
    }
  })

  it('keeps waiting while no endpoint answers', async () => {
    const port = await pickFreePort(19800)
    await expect(waitForCdpEndpoint(`http://127.0.0.1:${port}/json/list`, 1200)).resolves.toBe(
      false
    )
  })

  /** A dev launch is pnpm → electron-vite → Electron; killing only the first leaves the app running. */
  it('signals the whole process group', async () => {
    const child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' })
    try {
      expect(child.pid).toBeGreaterThan(0)
      await terminateChild(child, 5000)
      expect(child.killed || child.exitCode !== null || child.signalCode !== null).toBe(true)
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          process.kill(-(child.pid as number), 'SIGKILL')
        } catch {
          // Already gone.
        }
      }
    }
  })

  it('accepts an already-exited child', async () => {
    await expect(terminateChild(null)).resolves.toBeUndefined()
  })
})

describe('judgeStateFile', () => {
  const measurement = (
    profile: string,
    primaryFiles: Record<string, number>,
    searchFiles: Record<string, number>,
    queries: MeasurementQueries
  ): HomeMeasurementLike => ({
    measuredAt: '2026-09-29T10:00:00.000Z',
    primaryExists: true,
    searchExists: true,
    primaryWalBytes: 1024,
    searchWalBytes: 2048,
    primaryMtimeMs: 1,
    searchMtimeMs: 2,
    topology: {
      profile,
      primary: { file_index_progress: 0, scan_progress: 0, search_index: 0, keyword_mappings: 0 },
      search: { file_index_progress: 3, scan_progress: 1, search_index: 9, keyword_mappings: 4 },
      primaryFilesByType: primaryFiles,
      searchFilesByType: searchFiles,
      primaryNonAppExtensions: 0
    },
    queries
  })

  const phase = (
    name: 'split' | 'rollback',
    after: HomeMeasurementLike,
    checks: PhaseRecordLike['checks']
  ): PhaseRecordLike => ({
    phase: name,
    startedAt: '2026-09-29T10:00:00.000Z',
    completedAt: '2026-09-29T10:05:00.000Z',
    splitFlag: name === 'rollback' ? '0' : 'unset (default)',
    launchCommand: 'pnpm run dev',
    appReachedCdp: true,
    settled: true,
    quiescenceSamples: 12,
    logFile: '/tmp/whatever/logs/D.2026-09-29.log',
    logWindowBounded: true,
    stdioTail: '',
    before: after,
    after,
    sentinel: null,
    precoreUserData: null,
    checks
  })

  const queriesFor = (home: 'search' | 'primary'): MeasurementQueries => {
    const fileDigest = digestRows('non-app-files', ['tuffsplitevidencealpha.txt'])
    const catalog = digestRows('app-catalog', ['/Applications/x.app'])
    return home === 'search'
      ? { primary: [catalog], search: [fileDigest, catalog] }
      : { primary: [fileDigest, catalog], search: [fileDigest] }
  }

  async function writeState(
    dir: string,
    rollbackPrimaryFiles: Record<string, number>
  ): Promise<string> {
    const state = {
      schema: 'search-split-app-evidence/v1',
      armed: {
        tables: ['files'],
        coverage: [{ table: 'files', installed: 3, skippedReason: null }],
        installedTriggers: ['tuff_split_guard_files_insert']
      },
      phases: [
        phase('split', measurement(dir, { app: 1 }, { file: 4 }, queriesFor('search')), [
          { name: 'isolation-effective', ok: true, detail: 'ok', status: 'passed' }
        ]),
        phase(
          'rollback',
          measurement(dir, rollbackPrimaryFiles, { file: 4 }, queriesFor('primary')),
          [
            { name: 'isolation-effective', ok: true, detail: 'ok', status: 'passed' },
            { name: 'shared index', ok: true, detail: 'ok', status: 'passed' }
          ]
        )
      ]
    }
    const statePath = path.join(dir, 'state.json')
    await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8')
    return statePath
  }

  it('re-judges a collected state into a report without launching anything', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tuff-judge-test-'))
    try {
      const statePath = await writeState(dir, { app: 1, file: 4 })
      const out = path.join(dir, 'report.json')
      const summary = path.join(dir, 'summary.json')
      const options = parseCli(
        ['--profile', dir, '--out', out, '--repoSummary', summary],
        '/tmp/core-app'
      )
      const report = await judgeStateFile(options!, statePath)
      expect(report.ok).toBe(true)
      expect(report.parityChecks.map((check) => check.name)).toContain(
        'file count parity across the rollback'
      )
      expect(report.parityChecks.every((check) => check.status === 'passed')).toBe(true)
      expect(existsSync(out)).toBe(true)
      expect(JSON.stringify(JSON.parse(await readFile(summary, 'utf8')))).not.toContain(dir)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reports a rollback that lost the index as a failure', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tuff-judge-bad-'))
    try {
      const statePath = await writeState(dir, { app: 1 })
      const options = parseCli(
        ['--profile', dir, '--out', path.join(dir, 'report.json')],
        '/tmp/core-app'
      )
      const report = await judgeStateFile(options!, statePath)
      expect(report.ok).toBe(false)
      expect(
        report.parityChecks.filter((check) => check.status === 'failed').map((check) => check.name)
      ).toContain('file count parity across the rollback')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('refuses a state file that holds no phases', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tuff-judge-empty-'))
    try {
      const statePath = path.join(dir, 'state.json')
      await writeFile(statePath, JSON.stringify({ schema: 'x', phases: [] }), 'utf8')
      const options = parseCli(['--profile', dir], '/tmp/core-app')
      await expect(judgeStateFile(options!, statePath)).rejects.toThrow(/no phases/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('parseCli', () => {
  const coreAppDir = '/tmp/core-app'

  it('refuses a profile outside the temp roots', () => {
    expect(() =>
      parseCli(['--profile', path.join(os.homedir(), 'p'), '--phase', 'bootstrap'], coreAppDir)
    ).toThrow(/refusing to use/)
  })

  it('defaults the fixture root into the profile, not into the real home', () => {
    const options = parseCli(
      ['--profile', '/tmp/tuff-cli-test', '--phase', 'bootstrap'],
      coreAppDir
    )
    expect(options?.fixtureRoot).toBe('/tmp/tuff-cli-test/home')
    expect(options?.phase).toBe('bootstrap')
    expect(options?.appBundle).toBe(path.join(coreAppDir, 'dist/mac-arm64/tuff.app'))
  })

  it('defaults the split phases to the unset flag and takes the explicit override', () => {
    expect(
      parseCli(['--profile', '/tmp/tuff-cli-test', '--phase', 'all'], coreAppDir)?.explicitSplitFlag
    ).toBe(false)
    expect(
      parseCli(['--profile', '/tmp/tuff-cli-test', '--explicitSplitFlag'], coreAppDir)
        ?.explicitSplitFlag
    ).toBe(true)
  })

  it('rejects an unknown phase instead of running the whole gate', () => {
    expect(() =>
      parseCli(['--profile', '/tmp/tuff-cli-test', '--phase', 'split-on'], coreAppDir)
    ).toThrow(/unknown --phase/)
  })

  it('requires a profile', () => {
    expect(() => parseCli(['--phase', 'all'], coreAppDir)).toThrow(/--profile is required/)
  })
})
