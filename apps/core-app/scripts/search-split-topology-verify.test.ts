import { describe, expect, it } from 'vitest'
import {
  compareParity,
  candidateDatabaseDirs,
  resolveProfileLayout,
  judgeLog,
  judgeTopology,
  type Topology
} from './search-split-topology-verify'

/**
 * The judging half of #1748's runtime gate. A verifier that cannot fail on a divergent profile is
 * worse than none, because it converts "nobody checked" into "checked and clean" — so every case
 * here is paired: the healthy shape passes, and the specific damage it exists to catch fails.
 */

function topology(over: Partial<Topology> = {}): Topology {
  return {
    profile: '/tmp/p',
    primary: {
      file_extensions: 0,
      file_index_progress: 0,
      scan_progress: 0,
      search_index: 0,
      keyword_mappings: 0
    },
    search: {
      file_extensions: 120,
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

const failing = (checks: ReturnType<typeof judgeTopology>): string[] =>
  checks.filter((check) => !check.ok).map((check) => check.name)

describe('judgeTopology under the default-on split', () => {
  it('passes a healthy split profile', () => {
    expect(failing(judgeTopology(topology(), 'split'))).toEqual([])
  })

  /** The exact failure the issue names: a provider still writing database.db. */
  it('fails when file rows are stranded on the primary', () => {
    const checks = judgeTopology(
      topology({ primaryFilesByType: { app: 220, file: 4000 } }),
      'split'
    )
    expect(failing(checks)).toContain('no file rows stranded on the primary')
  })

  it('fails when the search file was never populated', () => {
    const checks = judgeTopology(topology({ searchFilesByType: {} }), 'split')
    expect(failing(checks)).toContain('the search file is actually populated')
  })

  /**
   * The mirror-image mistake, and a real one: routing the app catalog through the split was
   * ship-blocker #3 on 2026-08-05. Moving it is as wrong as leaving file rows behind.
   */
  it('fails when the app catalog moved into the search file', () => {
    const checks = judgeTopology(
      topology({ primaryFilesByType: {}, searchFilesByType: { file: 5000, app: 220 } }),
      'split'
    )
    expect(failing(checks)).toContain('the app catalog stayed on the primary')
  })

  /** Live profiles carry app-owned extensions on the primary; only non-app ones are a leak. */
  it('ignores app-owned file_extensions on the primary and flags non-app ones', () => {
    expect(failing(judgeTopology(topology({ primaryNonAppExtensions: 0 }), 'split'))).toEqual([])
    expect(failing(judgeTopology(topology({ primaryNonAppExtensions: 2300 }), 'split'))).toContain(
      'no file extensions stranded on the primary'
    )
  })

  it('skips the extension check when the table could not be read', () => {
    const checks = judgeTopology(topology({ primaryNonAppExtensions: null }), 'split')
    expect(checks.map((c) => c.name)).not.toContain('no file extensions stranded on the primary')
  })

  it('fails when a worker-owned table is written on the primary', () => {
    const checks = judgeTopology(
      topology({ primary: { ...topology().primary, keyword_mappings: 17 } }),
      'split'
    )
    expect(failing(checks)).toContain('keyword_mappings is not written on the primary')
  })

  /**
   * A table missing from `database.db` is not the same as an empty one, and must not be judged as
   * a pass on a technicality — it is skipped, so a missing migration cannot read as clean.
   */
  it('skips a table that is absent rather than counting it as zero', () => {
    const checks = judgeTopology(
      topology({ primary: { ...topology().primary, keyword_mappings: null } }),
      'split'
    )
    expect(checks.map((check) => check.name)).not.toContain(
      'keyword_mappings is not written on the primary'
    )
  })
})

describe('judgeTopology after the =0 rollback', () => {
  it('passes when the shared file carries the index', () => {
    const shared = topology({
      primaryFilesByType: { app: 220, file: 5000 },
      searchFilesByType: {}
    })
    expect(failing(judgeTopology(shared, 'shared'))).toEqual([])
  })

  /** Rolling back without reconciling leaves the real rows in the file nothing reads any more. */
  it('fails when rows were left behind in search-index.db', () => {
    const checks = judgeTopology(
      topology({ primaryFilesByType: { app: 220, file: 5000 } }),
      'shared'
    )
    expect(failing(checks)).toContain('search-index.db is not the live store')
  })
})

describe('compareParity', () => {
  it('accepts the same content in a different file', () => {
    const before = topology()
    const after = topology({
      primaryFilesByType: { app: 220, file: 5000 },
      searchFilesByType: {}
    })
    expect(failing(compareParity(before, after))).toEqual([])
  })

  it('fails when the rollback lost files', () => {
    const before = topology()
    const after = topology({
      primaryFilesByType: { app: 220, file: 4990 },
      searchFilesByType: {}
    })
    expect(failing(compareParity(before, after))).toContain('file count parity across the rollback')
  })

  it('fails when the rollback lost apps', () => {
    const before = topology()
    const after = topology({
      primaryFilesByType: { app: 0, file: 5000 },
      searchFilesByType: {}
    })
    expect(failing(compareParity(before, after))).toContain('app count parity across the rollback')
  })
})

describe('judgeLog', () => {
  it('passes a clean log', () => {
    expect(failing(judgeLog('[info] started\n[info] indexed 5000'))).toEqual([])
  })

  it('fails on SQLITE_BUSY', () => {
    expect(failing(judgeLog('err: SQLITE_BUSY: database is busy'))).toContain('no SQLITE_BUSY')
  })

  it('fails on a lock message regardless of case', () => {
    expect(failing(judgeLog('Error: Database Is Locked'))).toContain('no "database is locked"')
  })
})

describe('resolveProfileLayout', () => {
  /**
   * `resolveRuntimeRootPath` names the app root `tuff` when packaged and `tuff-dev` otherwise, so a
   * verifier that knew only one would open two nonexistent files against the other and report every
   * table absent -- which reads as "the search file was never populated" rather than "I read
   * nothing". A live dev launch produced `tuff-dev`, which is what caught this.
   */
  it('finds a packaged profile', () => {
    const paths = resolveProfileLayout('/p', (c) => c === '/p/tuff/modules/database/database.db')
    expect(paths.primary).toBe('/p/tuff/modules/database/database.db')
    expect(paths.search).toBe('/p/tuff/modules/database/search-index.db')
  })

  it('finds a dev profile', () => {
    const paths = resolveProfileLayout(
      '/p',
      (c) => c === '/p/tuff-dev/modules/database/database.db'
    )
    expect(paths.primary).toBe('/p/tuff-dev/modules/database/database.db')
    expect(paths.search).toBe('/p/tuff-dev/modules/database/search-index.db')
  })

  it('prefers the packaged layout when both are present', () => {
    expect(resolveProfileLayout('/p', () => true).primary).toBe(
      '/p/tuff/modules/database/database.db'
    )
  })

  /** The whole point: never return a plausible path it has not verified. */
  it('throws rather than guessing when neither layout exists', () => {
    expect(() => resolveProfileLayout('/p', () => false)).toThrow(/no database\.db under \/p/)
    expect(() => resolveProfileLayout('/p', () => false)).toThrow(/tuff-dev/)
  })

  it('offers both layouts as candidates', () => {
    expect(candidateDatabaseDirs('/p')).toEqual([
      '/p/tuff/modules/database',
      '/p/tuff-dev/modules/database'
    ])
  })
})
