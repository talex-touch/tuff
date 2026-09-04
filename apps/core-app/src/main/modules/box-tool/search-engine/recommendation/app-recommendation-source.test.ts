import { afterEach, describe, expect, it, vi } from 'vitest'

const { mapAppsToRecommendationItemsMock, processSearchResultsMock } = vi.hoisted(() => ({
  // Typed parameter (rather than `() => []`) so `mock.calls[0][0]` keeps a usable arg tuple.
  mapAppsToRecommendationItemsMock: vi.fn(
    (_apps: Array<{ path: string; name: string; extensions: Record<string, string> }>) => []
  ),
  processSearchResultsMock: vi.fn(() => {
    throw new Error('processSearchResults should not be used for recommendation rebuild')
  })
}))

vi.mock('../../addon/apps/search-processing-service', () => ({
  mapAppsToRecommendationItems: mapAppsToRecommendationItemsMock,
  processSearchResults: processSearchResultsMock
}))

import { createAppRecommendationSource } from './app-recommendation-source'

const appRow = (id: number, path: string, name: string): Record<string, unknown> => ({
  id,
  path,
  name,
  displayName: name,
  extension: 'app',
  size: 0,
  mtime: new Date(),
  ctime: new Date(),
  lastIndexedAt: new Date(),
  isDir: false,
  type: 'application',
  content: null,
  embeddingStatus: 'none'
})

type Ext = { fileId: number; key: string; value: string | null }

function makeDb(options: {
  byPath?: Array<Record<string, unknown>>
  byBundleId?: Array<Record<string, unknown>>
  extensions?: Ext[]
}): {
  getFilesByPaths: ReturnType<typeof vi.fn>
  getFilesByBundleIds: ReturnType<typeof vi.fn>
  getFileExtensionsByFileIds: ReturnType<typeof vi.fn>
} {
  return {
    getFilesByPaths: vi.fn(async () => options.byPath ?? []),
    getFilesByBundleIds: vi.fn(async () => options.byBundleId ?? []),
    getFileExtensionsByFileIds: vi.fn(async () => options.extensions ?? [])
  }
}

const mappedApps = (): Array<{ path: string; name: string; extensions: Record<string, string> }> =>
  mapAppsToRecommendationItemsMock.mock.calls[0]?.[0] ?? []

describe('app recommendation source', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('declares the canonical id and both legacy spellings as aliases', () => {
    const source = createAppRecommendationSource(makeDb({}) as never)
    expect(source.sourceId).toBe('app-provider')
    // `item_usage_stats` still carries 'application' and 'app' for the same rows.
    expect(source.aliases).toEqual(['application', 'app'])
  })

  it('returns [] without touching the db for an empty id list', async () => {
    const db = makeDb({})
    await expect(createAppRecommendationSource(db as never).rebuild([])).resolves.toEqual([])
    expect(db.getFilesByPaths).not.toHaveBeenCalled()
  })

  it('maps apps directly instead of reusing the search-result pipeline', async () => {
    const db = makeDb({ byPath: [appRow(1, '/Applications/Demo.app', 'Demo')] })

    await createAppRecommendationSource(db as never).rebuild(['/Applications/Demo.app'])

    expect(mapAppsToRecommendationItemsMock).toHaveBeenCalledTimes(1)
    expect(processSearchResultsMock).not.toHaveBeenCalled()
  })

  it('splits path and bundle-id candidates into one batched lookup each (no N+1)', async () => {
    const db = makeDb({
      byPath: [
        appRow(1, '/Applications/A.app', 'A'),
        appRow(2, '/Applications/B.app', 'B'),
        appRow(3, '/Applications/C.app', 'C')
      ],
      byBundleId: [appRow(4, '/Applications/D.app', 'D')]
    })

    await createAppRecommendationSource(db as never).rebuild([
      '/Applications/A.app',
      '/Applications/B.app',
      '/Applications/C.app',
      'com.d.app'
    ])

    expect(db.getFilesByPaths).toHaveBeenCalledTimes(1)
    expect(db.getFilesByPaths).toHaveBeenCalledWith([
      '/Applications/A.app',
      '/Applications/B.app',
      '/Applications/C.app'
    ])
    expect(db.getFilesByBundleIds).toHaveBeenCalledTimes(1)
    expect(db.getFilesByBundleIds).toHaveBeenCalledWith(['com.d.app'])
    expect(db.getFileExtensionsByFileIds).toHaveBeenCalledTimes(1)
  })

  it('skips the bundle-id lookup entirely when every candidate is a path', async () => {
    const db = makeDb({ byPath: [appRow(1, '/Applications/A.app', 'A')] })

    await createAppRecommendationSource(db as never).rebuild(['/Applications/A.app'])

    expect(db.getFilesByBundleIds).not.toHaveBeenCalled()
  })

  it('drops Touch itself (isSelfAppIdentity by bundle id)', async () => {
    const db = makeDb({
      byPath: [
        appRow(1, '/Applications/Tuff.app', 'Tuff'),
        appRow(2, '/Applications/Demo.app', 'Demo')
      ],
      extensions: [
        { fileId: 1, key: 'bundleId', value: 'com.tagzxia.app.tuff' },
        { fileId: 2, key: 'bundleId', value: 'com.demo.app' }
      ]
    })

    await createAppRecommendationSource(db as never).rebuild([
      '/Applications/Tuff.app',
      '/Applications/Demo.app'
    ])

    // The filter runs before mapping, so the self app must never reach the mapper.
    expect(mappedApps().map((app) => app.path)).toEqual(['/Applications/Demo.app'])
  })

  it('drops noisy system apps but keeps allowlisted ones', async () => {
    const db = makeDb({
      byPath: [
        appRow(1, '/Applications/Xcode.app/Contents/Simulator.app', 'Simulator'),
        appRow(2, '/System/Library/CoreServices/DiscHelper.app', 'DiscHelper'),
        appRow(3, '/System/Library/CoreServices/Finder.app', 'Finder')
      ],
      extensions: [{ fileId: 3, key: 'bundleId', value: 'com.apple.finder' }]
    })

    await createAppRecommendationSource(db as never).rebuild([
      '/Applications/Xcode.app/Contents/Simulator.app',
      '/System/Library/CoreServices/DiscHelper.app',
      '/System/Library/CoreServices/Finder.app'
    ])

    expect(mappedApps().map((app) => app.name)).toEqual(['Finder'])
  })

  it('merges extensions per fileId without cross-contaminating siblings', async () => {
    const db = makeDb({
      byPath: [
        appRow(1, '/Applications/Alpha.app', 'Alpha'),
        appRow(2, '/Applications/Beta.app', 'Beta')
      ],
      extensions: [
        { fileId: 1, key: 'bundleId', value: 'com.alpha.app' },
        { fileId: 1, key: 'installedAt', value: '111' },
        { fileId: 2, key: 'bundleId', value: 'com.beta.app' },
        { fileId: 2, key: 'installedAt', value: '222' }
      ]
    })

    await createAppRecommendationSource(db as never).rebuild([
      '/Applications/Alpha.app',
      '/Applications/Beta.app'
    ])

    const mapped = mappedApps()
    expect(mapped).toHaveLength(2)
    expect(mapped.find((app) => app.path === '/Applications/Alpha.app')?.extensions).toEqual({
      bundleId: 'com.alpha.app',
      installedAt: '111'
    })
    expect(mapped.find((app) => app.path === '/Applications/Beta.app')?.extensions).toEqual({
      bundleId: 'com.beta.app',
      installedAt: '222'
    })
  })

  it('returns [] when the catalog row is gone (uninstalled)', async () => {
    // Uninstall cascades the files row away; the usage stats row survives.
    const db = makeDb({})

    await expect(
      createAppRecommendationSource(db as never).rebuild(['/Applications/Removed.app'])
    ).resolves.toEqual([])
    expect(mapAppsToRecommendationItemsMock).not.toHaveBeenCalled()
  })

  it('degrades to [] when a lookup throws', async () => {
    const db = {
      getFilesByPaths: vi.fn(async () => {
        throw new Error('db unavailable')
      }),
      getFilesByBundleIds: vi.fn(async () => []),
      getFileExtensionsByFileIds: vi.fn(async () => [])
    }

    await expect(
      createAppRecommendationSource(db as never).rebuild(['/Applications/A.app'])
    ).resolves.toEqual([])
  })
})
