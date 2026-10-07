import type { Mock } from 'vitest'
import type { TuffItem, TuffQuery } from '@talex-touch/utils'
import { describe, expect, it, vi } from 'vitest'
import {
  FileProviderSearchResultService,
  type FileProviderSearchResultServiceDeps
} from './file-provider-search-result-service'

interface FakeRow {
  path: string
  name: string
}

interface FtsCall {
  query: string
  limit: number
  options: Record<string, unknown>
}

interface ServiceHarness {
  service: FileProviderSearchResultService
  /** Every FTS request the service made, in call order. */
  ftsCalls: () => FtsCall[]
  /** Queries handed to the bounded ngram stage, in call order. */
  ngramQueries: () => string[]
  subsequenceCalls: Mock
  cleanupStaleCandidates: Mock
}

/**
 * Mirrors the candidate pipeline a real query walks: the precise/prefix keyword lookups and the
 * main FTS query run first, and only while they come back empty does the service probe selective
 * query tokens and finally the bounded ngram stage. `ngramCandidates` therefore stands for "the
 * bounded fuzzy stage saw this file" and `ftsResponses[i]` for the i-th index search.
 */
function makeService(opts: {
  rows: FakeRow[]
  ngramCandidates?: string[]
  ftsResponses?: Array<Array<{ itemId: string; score: number }>>
  preciseHits?: string[]
}): ServiceHarness {
  const mtime = new Date()
  const dbRows = opts.rows.map((row) => ({
    file: {
      id: row.path,
      path: row.path,
      name: row.name,
      type: 'file',
      extension: '.ts',
      isDir: false,
      mtime
    },
    extensionKey: null,
    extensionValue: null
  }))

  const getDb = (): unknown => ({
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => Promise.resolve(dbRows)
        })
      })
    })
  })

  const ftsCalls: FtsCall[] = []
  const ngramQueries: string[] = []
  const subsequenceCalls = vi.fn()
  const cleanupStaleCandidates = vi.fn()

  const deps: FileProviderSearchResultServiceDeps = {
    providerId: 'files',
    getDbUtils: () => ({ getDb, getFileIndexReadDb: getDb }) as never,
    getSearchIndex: () =>
      ({
        lookupByKeywords: async (_providerId: string, lookupTerms: string[]) => {
          const hits = opts.preciseHits
          if (!hits || hits.length === 0) return new Map()
          const [lookupKey] = lookupTerms
          if (!lookupKey) return new Map()
          return new Map([[lookupKey, hits.map((itemId) => ({ itemId }))]])
        },
        lookupByKeywordPrefix: async () => [],
        search: async (
          _providerId: string,
          query: string,
          limit: number,
          _signal: AbortSignal,
          searchOptions?: Record<string, unknown>
        ) => {
          ftsCalls.push({ query, limit, options: searchOptions ?? {} })
          return opts.ftsResponses?.[ftsCalls.length - 1] ?? []
        },
        lookupByNgrams: async (_providerId: string, query: string) => {
          ngramQueries.push(query)
          return (opts.ngramCandidates ?? []).map((itemId) => ({ itemId, score: 1 }))
        },
        lookupBySubsequence: subsequenceCalls
      }) as never,
    isContentIndexingEnabled: () => false,
    isPathAdmitted: (path) => path.startsWith('/work/'),
    buildItem: (file) =>
      ({
        id: file.path,
        kind: 'file',
        source: { type: 'file', id: 'files', name: 'Files' },
        render: { mode: 'default', basic: { title: file.path } },
        meta: {}
      }) as TuffItem,
    normalizeItem: (item) => item,
    sanitizeExtensions: (extensions) => extensions,
    cleanupStaleCandidates,
    semanticSearch: async () => [],
    logDebug: () => {},
    formatDuration: (ms) => `${ms}ms`,
    now: () => 0
  }

  return {
    service: new FileProviderSearchResultService(deps),
    ftsCalls: () => ftsCalls,
    ngramQueries: () => ngramQueries,
    subsequenceCalls,
    cleanupStaleCandidates
  }
}

/** The fuzzy signal and match label the result list reads off a published item. */
function signalsOf(result: {
  items: TuffItem[]
}): (itemId: string) => { fuzzyScore: number; type?: string } {
  const byId = new Map(result.items.map((item) => [item.id, item]))
  return (itemId: string) => {
    const item = byId.get(itemId)
    const extension = item?.meta?.extension as { search?: { fuzzyScore?: number } } | undefined
    return {
      fuzzyScore: extension?.search?.fuzzyScore ?? 0,
      type: item?.scoring?.match_details?.type
    }
  }
}

const QUERY = { text: 'cfg' } as TuffQuery
const signal = new AbortController().signal

describe('FileProviderSearchResultService bounded candidate ranking', () => {
  it('ranks ngram-admitted candidates by fuzzy score and publishes descending finals', async () => {
    const inFileName = '/work/my-cfg-notes.ts'
    const pathOnly = '/work/cfg-main/readme.ts'
    const unmatched = '/work/plain.ts'
    const harness = makeService({
      rows: [
        { path: inFileName, name: 'my-cfg-notes.ts' },
        { path: pathOnly, name: 'readme.ts' },
        { path: unmatched, name: 'plain.ts' }
      ],
      ngramCandidates: [inFileName, pathOnly, unmatched],
      ftsResponses: [[]]
    })

    const result = await harness.service.search(QUERY, signal)
    const signals = signalsOf(result)

    expect(result.items.map((item) => item.id)).toEqual([inFileName, pathOnly, unmatched])
    // A file-name match is the best a bounded candidate can score (0.92); the same query found
    // only through a directory stays positive but strictly lower.
    expect(signals(inFileName)).toEqual({ fuzzyScore: 0.92, type: 'fuzzy' })
    expect(signals(pathOnly).fuzzyScore).toBeGreaterThan(0)
    expect(signals(pathOnly).fuzzyScore).toBeLessThan(0.92)
    expect(signals(unmatched).fuzzyScore).toBe(0)
    // The published order is the descending-score contract the result list renders.
    const finals = result.items.map((item) => item.scoring?.final ?? 0)
    expect(finals).toEqual([...finals].sort((left, right) => right - left))

    // The bounded ngram stage is the fuzzy source: one probe, for the whole query.
    expect(harness.ngramQueries()).toEqual(['cfg'])
    // The unbounded subsequence scan is off the file hot path entirely.
    expect(harness.subsequenceCalls).not.toHaveBeenCalled()
    // Every candidate had a row, so nothing was routed into destructive cleanup.
    expect(harness.cleanupStaleCandidates).not.toHaveBeenCalled()
  })

  it('rescues a transposed filename through the ngram stage, ranking it first', async () => {
    const intended = '/work/settings.ts'
    const decoy = '/work/report.pdf'
    const harness = makeService({
      rows: [
        { path: intended, name: 'settings.ts' },
        { path: decoy, name: 'report.pdf' }
      ],
      ngramCandidates: [intended, decoy],
      ftsResponses: [[]]
    })

    const result = await harness.service.search({ text: 'settnig' } as TuffQuery, signal)
    const signals = signalsOf(result)

    expect(result.items.map((item) => item.id)).toEqual([intended, decoy])
    expect(signals(intended).type).toBe('fuzzy')
    expect(signals(intended).fuzzyScore).toBeGreaterThan(0)
    // An unrelated name carries no fuzzy evidence even though the candidate query returned it.
    expect(signals(decoy)).toEqual({ fuzzyScore: 0, type: undefined })
  })

  it('skips the ngram stage once a precise keyword has already matched', async () => {
    const exact = '/work/my-cfg-notes.ts'
    const harness = makeService({
      rows: [{ path: exact, name: 'my-cfg-notes.ts' }],
      preciseHits: [exact],
      ftsResponses: [[]]
    })

    const result = await harness.service.search(QUERY, signal)

    expect(result.items.map((item) => item.id)).toEqual([exact])
    expect(signalsOf(result)(exact).type).toBe('exact')
    // An exact hit is already evidence enough: no bounded fuzzy probe is worth its cost.
    expect(harness.ngramQueries()).toEqual([])
  })

  it('scores a file lower when only the FTS stage admitted it', async () => {
    const shared = '/work/my-cfg-notes.ts'
    const plain = '/work/plain.ts'
    const rows: FakeRow[] = [
      { path: shared, name: 'my-cfg-notes.ts' },
      { path: plain, name: 'plain.ts' }
    ]
    const bounded = makeService({ rows, ngramCandidates: [shared], ftsResponses: [[]] })
    const ftsOnly = makeService({
      rows,
      ngramCandidates: [],
      ftsResponses: [
        [
          { itemId: shared, score: 9 },
          { itemId: plain, score: 9 }
        ]
      ]
    })

    const boundedSignals = signalsOf(await bounded.service.search(QUERY, signal))
    const ftsOnlyResult = await ftsOnly.service.search(QUERY, signal)
    const ftsOnlySignals = signalsOf(ftsOnlyResult)

    // Fuzzy credit is reserved for candidates the bounded stage actually saw; a file the FTS
    // stage produced on its own keeps only a discounted share of the same filename match.
    expect(boundedSignals(shared).fuzzyScore).toBe(0.92)
    expect(ftsOnlySignals(shared).fuzzyScore).toBeGreaterThan(0)
    expect(ftsOnlySignals(shared).fuzzyScore).toBeLessThan(boundedSignals(shared).fuzzyScore)
    // An index hit with no fuzzy evidence at all is still reported, as a semantic match.
    expect(ftsOnlySignals(plain)).toEqual({ fuzzyScore: 0, type: 'semantic' })
    expect(ftsOnlyResult.items.map((item) => item.id)).toEqual([shared, plain])
    // FTS already produced candidates, so the fallback stages stay untouched.
    expect(ftsOnly.ngramQueries()).toEqual([])
  })

  it('probes a selective query token before falling back to ngrams', async () => {
    const candidate = '/work/report-2026.pdf'
    const harness = makeService({
      rows: [{ path: candidate, name: 'report-2026.pdf' }],
      // The main FTS query for the whole text matches nothing; the selective probe does.
      ftsResponses: [[], [{ itemId: candidate, score: 5 }]]
    })

    const result = await harness.service.search({ text: 'report2026' } as TuffQuery, signal)
    const calls = harness.ftsCalls()

    expect(result.items.map((item) => item.id)).toEqual([candidate])
    // Only the probe could have admitted it, and the probe's candidates stay eligible for
    // undiscounted fuzzy credit.
    expect(result.items[0]?.scoring?.match_details).toMatchObject({
      type: 'fuzzy',
      query: 'report2026'
    })
    expect(result.items[0]?.scoring?.match ?? 0).toBeGreaterThan(0)
    // Two index searches: the whole-query attempt, then one probe. The probe prefers the
    // numeric run, asks for fewer rows than the primary search, and stops as soon as it hits.
    expect(calls).toHaveLength(2)
    expect(calls[1]?.query).toContain('2026')
    expect(calls[1]?.limit).toBeLessThan(calls[0]?.limit ?? 0)
    // The selective probe found the candidate, so the ngram stage never runs.
    expect(harness.ngramQueries()).toEqual([])
  })
})
