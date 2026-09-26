import type { ScannedAppInfo } from '../app-types'
import type { AppCatalogEntry, AppCatalogRow } from './app-search-catalog-service'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeSearchText } from '@talex-touch/utils/search'
import {
  AppSearchCatalogService,
  buildAppCatalogEntry,
  buildFtsQueryTokens,
  recallAppCatalogEntries
} from './app-search-catalog-service'

interface FakeApp {
  id: number
  name: string
  displayName?: string
  path?: string
  bundleId?: string
  alternateNames?: string[]
  aliases?: string[]
}

function createRow(app: FakeApp): AppCatalogRow {
  const path = app.path ?? `/Applications/${app.name}.app`
  const extensions: Record<string, string | null> = {
    bundleId: app.bundleId ?? null,
    appIdentity: path,
    alternateNames: app.alternateNames ? JSON.stringify(app.alternateNames) : null,
    aliases: app.aliases ? app.aliases.join(',') : null
  }
  return {
    id: app.id,
    path,
    name: app.name,
    displayName: app.displayName ?? null,
    extension: '.app',
    size: 0,
    mtime: new Date(1000),
    ctime: new Date(1000),
    lastIndexedAt: new Date(1000),
    isDir: false,
    type: 'app',
    content: null,
    embeddingStatus: 'none',
    extensions
  } as unknown as AppCatalogRow
}

function toScannedInfo(row: AppCatalogRow): ScannedAppInfo {
  const alternateNames = row.extensions.alternateNames
    ? (JSON.parse(row.extensions.alternateNames) as string[])
    : []
  return {
    name: row.name,
    displayName: row.displayName ?? undefined,
    fileName: row.name,
    path: row.path,
    icon: '',
    bundleId: row.extensions.bundleId ?? '',
    uniqueId: row.path,
    stableId: row.path,
    launchKind: 'path',
    launchTarget: row.path,
    alternateNames
  } as unknown as ScannedAppInfo
}

/** The provider's generator, minus pinyin: names in full, compact, per word, and as initials. */
async function generateKeywords(info: ScannedAppInfo): Promise<Set<string>> {
  const names = [info.displayName, info.name, info.fileName, ...(info.alternateNames ?? [])]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim())
  const generated = new Set<string>()
  for (const name of names) {
    const lower = name.toLowerCase()
    generated.add(lower)
    generated.add(lower.replace(/\s/g, ''))
    for (const word of lower.split(/[\s-]/)) if (word) generated.add(word)
    if (name.includes(' ')) {
      generated.add(
        name
          .split(/\s+/)
          .map((word) => word.charAt(0).toLowerCase())
          .join('')
      )
    }
  }
  const aliases = ((info as unknown as { aliases?: string[] }).aliases ?? []).map((alias) =>
    alias.toLowerCase()
  )
  for (const alias of aliases) generated.add(alias)
  const final = new Set<string>()
  for (const keyword of generated) {
    const normalized = normalizeSearchText(keyword)
    if (normalized.length > 1) final.add(normalized)
  }
  return final
}

const deps = {
  toScannedInfo: (row: AppCatalogRow) => {
    const info = toScannedInfo(row)
    const aliases = row.extensions.aliases ? row.extensions.aliases.split(',') : []
    return Object.assign(info, { aliases })
  },
  generateKeywords
}

async function buildEntries(apps: FakeApp[]): Promise<AppCatalogEntry[]> {
  const entries: AppCatalogEntry[] = []
  for (const app of apps) entries.push(await buildAppCatalogEntry(createRow(app), deps))
  return entries
}

const names = (rows: AppCatalogRow[]): string[] => rows.map((row) => row.name).sort()

const catalog: FakeApp[] = [
  { id: 1, name: 'Visual Studio Code', bundleId: 'com.microsoft.VSCode', aliases: ['vs code'] },
  { id: 2, name: 'Code Notes' },
  { id: 3, name: 'Obsidian', bundleId: 'md.obsidian' },
  { id: 4, name: 'Apple Music' },
  { id: 5, name: 'WeChat', displayName: '微信', alternateNames: ['WeChat'] },
  {
    id: 6,
    name: 'NetEase Cloud Music',
    displayName: '网易云音乐',
    alternateNames: ['NetEase Cloud Music']
  },
  { id: 7, name: 'Übersicht' },
  { id: 8, name: 'Terminal' }
]

describe('recallAppCatalogEntries — the SQL funnel replayed in memory', () => {
  it('exact keyword hits are precise, so fuzzy matching stays off', async () => {
    const entries = await buildEntries(catalog)
    const recall = recallAppCatalogEntries(entries, 'code')
    expect(names(recall.rows)).toEqual(['Code Notes', 'Visual Studio Code'])
    expect(recall.isFuzzySearch).toBe(false)
    expect(recall.stats.precise).toBe(2)
  })

  it('a multi-word query needs every word for a precise hit, and the whole phrase reaches spaced aliases', async () => {
    const entries = await buildEntries(catalog)
    // "visual" and "notes" never share an app: no precise hit, so what comes back arrives through
    // the typo funnel with fuzzy matching on, exactly as the n-gram rows in the index would do.
    const mixed = recallAppCatalogEntries(entries, 'visual notes')
    expect(mixed.stats.precise).toBe(0)
    expect(mixed.isFuzzySearch).toBe(true)
    expect(mixed.stats.ngram).toBeGreaterThan(0)
    const alias = recallAppCatalogEntries(entries, 'vs code')
    expect(names(alias.rows)).toContain('Visual Studio Code')
    expect(alias.stats.precise).toBe(1)
    expect(alias.isFuzzySearch).toBe(false)
  })

  it('short queries recall by keyword prefix and count as precise', async () => {
    const entries = await buildEntries(catalog)
    const recall = recallAppCatalogEntries(entries, 'obs')
    expect(names(recall.rows)).toContain('Obsidian')
    expect(recall.isFuzzySearch).toBe(false)
    expect(recall.stats.prefix).toBe(1)
  })

  it('prefix recall stops at five characters, as the LIKE lookup did', async () => {
    const entries = await buildEntries(catalog)
    const recall = recallAppCatalogEntries(entries, 'obsidi')
    expect(recall.stats.prefix).toBe(0)
    // The FTS shape still finds it: one token, prefix matched.
    expect(names(recall.rows)).toEqual(['Obsidian'])
    expect(recall.isFuzzySearch).toBe(true)
  })

  it('FTS-shaped recall prefix-matches every token when nothing is exact', async () => {
    const entries = await buildEntries(catalog)
    const recall = recallAppCatalogEntries(entries, 'vis stu')
    expect(names(recall.rows)).toEqual(['Visual Studio Code'])
    expect(recall.isFuzzySearch).toBe(true)
    expect(recall.stats.fts).toBe(1)
  })

  it('recovers a typo through 2-gram overlap when nothing else recalls', async () => {
    const entries = await buildEntries(catalog)
    const recall = recallAppCatalogEntries(entries, 'aplpe')
    expect(names(recall.rows)).toContain('Apple Music')
    expect(recall.stats.ngram).toBeGreaterThan(0)
    expect(recall.isFuzzySearch).toBe(true)
  })

  it('falls back to subsequence recall for two-letter queries', async () => {
    const entries = await buildEntries(catalog)
    const recall = recallAppCatalogEntries(entries, 'wc')
    expect(names(recall.rows)).toContain('WeChat')
    expect(recall.stats.subsequence).toBeGreaterThan(0)
  })

  it('reaches accented names however the user types them', async () => {
    const entries = await buildEntries(catalog)
    expect(recallAppCatalogEntries(entries, 'ubersicht').isFuzzySearch).toBe(false)
    expect(names(recallAppCatalogEntries(entries, 'ubersicht').rows)).toEqual(['Übersicht'])
    expect(names(recallAppCatalogEntries(entries, 'Übersicht').rows)).toEqual(['Übersicht'])
  })

  it('treats the record mapper aliases as exact keys, so a bundle id is a precise hit', async () => {
    const entries = await buildEntries(catalog)
    const recall = recallAppCatalogEntries(entries, 'com.microsoft.vscode')
    expect(names(recall.rows)).toEqual(['Visual Studio Code'])
    expect(recall.stats.precise).toBe(1)
    expect(recall.isFuzzySearch).toBe(false)
  })

  it('keeps path pieces as exact keys but out of the typo sources, as the index does', async () => {
    const entries = await buildEntries([
      { id: 40, name: 'Terminal', path: '/Volumes/Workbench/Tools/Terminal.app' }
    ])
    // The index stores the segment at priority 1.0: an exact key, but below the 1.1 line
    // `prepareDocument` requires of an n-gram source.
    expect(recallAppCatalogEntries(entries, 'workbench').stats.precise).toBe(1)
    const typo = recallAppCatalogEntries(entries, 'workbnech')
    expect(typo.stats.ngram).toBe(0)
    expect(typo.rows).toEqual([])
  })

  it('caps FTS-shaped additions at the funnel limit while exact hits are never cut', async () => {
    const many: FakeApp[] = Array.from({ length: 140 }, (_, index) => ({
      id: 100 + index,
      name: `Helper Tool ${index}`
    }))
    const entries = await buildEntries(many)
    // Two prefix tokens, no exact keyword: every row arrives through the FTS shape.
    const fts = recallAppCatalogEntries(entries, 'hel too')
    expect(fts.stats.fts).toBe(140)
    expect(fts.rows.length).toBe(120)
    expect(fts.stats.candidates).toBe(120)
    // An exact keyword hit is precise, and the SQL path never capped those.
    const exact = recallAppCatalogEntries(entries, 'helper')
    expect(exact.stats.precise).toBe(140)
    expect(exact.rows.length).toBe(140)
  })

  it('builds the FTS tokens the way the provider did', () => {
    expect(buildFtsQueryTokens(['7-zip'])).toEqual(['7', 'zip'])
    expect(buildFtsQueryTokens(['a', 'b', 'c', 'd', 'e', 'f'])).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})

describe('AppSearchCatalogService lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function createService(loadRows: () => Promise<AppCatalogRow[]>) {
    let commitListener: ((providerIds: readonly string[]) => void) | null = null
    const unsubscribe = vi.fn()
    const service = new AppSearchCatalogService({
      providerId: 'app-provider',
      loadRows,
      ...deps,
      subscribeCommits: (listener) => {
        commitListener = listener
        return unsubscribe
      },
      debounceMs: 50,
      staleAfterMs: 1_000
    })
    return {
      service,
      unsubscribe,
      commit: (providerIds: string[]) => commitListener?.(providerIds)
    }
  }

  it('is not ready before the first load and serves the snapshot after it', async () => {
    const loadRows = vi.fn(async () => [createRow(catalog[2]!)])
    const { service } = createService(loadRows)
    expect(service.isReady()).toBe(false)
    await service.reload('load')
    expect(service.isReady()).toBe(true)
    expect(service.size()).toBe(1)
    expect(names(service.recall({ text: 'obs' } as never).rows)).toEqual(['Obsidian'])
  })

  it('reloads once, debounced, when a commit names this provider and ignores other providers', async () => {
    vi.useFakeTimers()
    const loadRows = vi.fn(async () => [createRow(catalog[2]!)])
    const { service, commit } = createService(loadRows)
    await service.reload('load')
    expect(loadRows).toHaveBeenCalledTimes(1)

    commit(['file-provider'])
    await vi.advanceTimersByTimeAsync(100)
    expect(loadRows).toHaveBeenCalledTimes(1)

    commit(['app-provider'])
    commit(['app-provider'])
    commit(['app-provider', 'file-provider'])
    await vi.advanceTimersByTimeAsync(100)
    expect(loadRows).toHaveBeenCalledTimes(2)
  })

  it('keeps the previous snapshot when a reload fails', async () => {
    let fail = false
    const loadRows = vi.fn(async () => {
      if (fail) throw new Error('db gone')
      return [createRow(catalog[2]!), createRow(catalog[7]!)]
    })
    const { service } = createService(loadRows)
    await service.reload('load')
    expect(service.size()).toBe(2)
    fail = true
    await service.reload('index-commit')
    expect(service.isReady()).toBe(true)
    expect(service.size()).toBe(2)
    expect(names(service.recall({ text: 'term' } as never).rows)).toEqual(['Terminal'])
  })

  it('schedules a background reload when a search finds the snapshot stale', async () => {
    vi.useFakeTimers()
    const loadRows = vi.fn(async () => [createRow(catalog[7]!)])
    const { service } = createService(loadRows)
    await service.reload('load')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(loadRows).toHaveBeenCalledTimes(1)
    service.recall({ text: 'term' } as never)
    await vi.advanceTimersByTimeAsync(100)
    expect(loadRows).toHaveBeenCalledTimes(2)
  })

  it('dispose unsubscribes from commits and drops pending reloads', async () => {
    vi.useFakeTimers()
    const loadRows = vi.fn(async () => [createRow(catalog[7]!)])
    const { service, unsubscribe, commit } = createService(loadRows)
    await service.reload('load')
    commit(['app-provider'])
    service.dispose()
    await vi.advanceTimersByTimeAsync(200)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(loadRows).toHaveBeenCalledTimes(1)
  })
})
