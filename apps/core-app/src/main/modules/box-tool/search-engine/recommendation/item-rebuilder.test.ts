import { afterEach, describe, expect, it, vi } from 'vitest'

const { mapAppsToRecommendationItemsMock, processSearchResultsMock } = vi.hoisted(() => ({
  mapAppsToRecommendationItemsMock: vi.fn(),
  processSearchResultsMock: vi.fn(() => {
    throw new Error('processSearchResults should not be used for recommendation rebuild')
  })
}))

vi.mock('../../addon/apps/search-processing-service', () => ({
  mapAppsToRecommendationItems: mapAppsToRecommendationItemsMock,
  processSearchResults: processSearchResultsMock
}))

import type { ScoredItem } from './recommendation-engine'
import { ItemRebuilder } from './item-rebuilder'

const usageStats = {
  sourceId: 'app-provider',
  itemId: '/Applications/Demo.app',
  sourceType: 'app',
  searchCount: 1,
  executeCount: 0,
  cancelCount: 0,
  lastSearched: null,
  lastExecuted: null,
  lastCancelled: null,
  createdAt: new Date(),
  updatedAt: new Date()
}

describe('ItemRebuilder', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('rebuilds app recommendations via direct app mapping instead of dummy query search reuse', async () => {
    const dbUtils = {
      getFilesByPaths: vi.fn(async () => [
        {
          id: 1,
          path: '/Applications/Demo.app',
          name: 'Demo',
          displayName: 'Demo',
          extension: 'app',
          size: 0,
          mtime: new Date(),
          ctime: new Date(),
          lastIndexedAt: new Date(),
          isDir: false,
          type: 'application',
          content: null,
          embeddingStatus: 'none'
        }
      ]),
      getFilesByBundleIds: vi.fn(async () => []),
      getFileExtensionsByFileIds: vi.fn(async () => [
        { fileId: 1, key: 'bundleId', value: 'com.demo.app' },
        { fileId: 1, key: 'description', value: 'Demo App' }
      ])
    }

    mapAppsToRecommendationItemsMock.mockReturnValue([
      {
        id: '/Applications/Demo.app',
        source: {
          id: 'app-provider',
          type: 'application',
          name: 'App Provider'
        },
        kind: 'app',
        render: {
          mode: 'default',
          basic: {
            title: 'Demo',
            subtitle: '/Applications/Demo.app'
          }
        },
        actions: [],
        meta: {}
      }
    ])

    const rebuilder = new ItemRebuilder(dbUtils as never)
    const scoredItems: ScoredItem[] = [
      {
        sourceId: 'app-provider',
        itemId: '/Applications/Demo.app',
        sourceType: 'app',
        usageStats,
        source: 'frequent',
        score: 0.91
      }
    ]

    const result = await rebuilder.rebuildItems(scoredItems)

    expect(mapAppsToRecommendationItemsMock).toHaveBeenCalledTimes(1)
    expect(processSearchResultsMock).not.toHaveBeenCalled()
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('/Applications/Demo.app')
    expect((result[0]?.meta as Record<string, unknown>).recommendation).toMatchObject({
      score: 0.91,
      source: 'frequent'
    })
  })

  it('returns items in scored order across sources and publishes the score', async () => {
    const dbUtils = {
      getFilesByPaths: vi.fn(async () => [
        {
          id: 1,
          path: '/Applications/Demo.app',
          name: 'Demo',
          displayName: 'Demo',
          extension: 'app',
          size: 0,
          mtime: new Date(),
          ctime: new Date(),
          lastIndexedAt: new Date(),
          isDir: false,
          type: 'application',
          content: null,
          embeddingStatus: 'none'
        }
      ]),
      getFilesByBundleIds: vi.fn(async () => []),
      getFileExtensionsByFileIds: vi.fn(async () => [])
    }

    mapAppsToRecommendationItemsMock.mockReturnValue([
      {
        id: '/Applications/Demo.app',
        source: { id: 'app-provider', type: 'application', name: 'App Provider' },
        kind: 'app',
        render: { mode: 'default', basic: { title: 'Demo' } },
        actions: [],
        meta: {}
      }
    ])

    const rebuilder = new ItemRebuilder(dbUtils as never)
    // The app candidate scores lowest, and app items are rebuilt in the first
    // batch — grouping by source would surface it first.
    const scoredItems: ScoredItem[] = [
      {
        sourceId: 'plugin-recommend:demo-provider',
        itemId: 'top-action',
        sourceType: 'plugin-recommend',
        usageStats,
        source: 'plugin',
        score: 9_000,
        pluginCandidate: {
          providerId: 'demo-provider',
          id: 'top-action',
          title: 'Top Action',
          action: 'open'
        }
      },
      {
        sourceId: 'app-provider',
        itemId: '/Applications/Demo.app',
        sourceType: 'app',
        usageStats,
        source: 'frequent',
        score: 120
      }
    ]

    const result = await rebuilder.rebuildItems(scoredItems)

    expect(result.map((item) => item.id)).toEqual(['top-action', '/Applications/Demo.app'])
    expect(result.map((item) => item.scoring?.final)).toEqual([9_000, 120])
  })

  it('preserves plugin recommendation icon metadata and class badge icons', async () => {
    const rebuilder = new ItemRebuilder({} as never)
    const scoredItems: ScoredItem[] = [
      {
        sourceId: 'plugin-recommend:demo-provider',
        itemId: 'open-demo',
        sourceType: 'plugin-recommend',
        usageStats,
        source: 'plugin',
        score: 0.88,
        pluginCandidate: {
          providerId: 'demo-provider',
          id: 'open-demo',
          title: 'Open Demo',
          subtitle: 'Plugin action',
          icon: {
            type: 'url',
            value: 'data:image/svg+xml,<svg></svg>',
            color: '#22c55e',
            colorful: true,
            status: 'loading',
            error: 'pending'
          } as never,
          action: 'open',
          data: { target: 'demo' }
        }
      }
    ]

    const result = await rebuilder.rebuildItems(scoredItems)

    expect(result).toHaveLength(1)
    expect(result[0]?.render.basic?.icon).toMatchObject({
      type: 'url',
      value: 'data:image/svg+xml,<svg></svg>',
      color: '#22c55e',
      colorful: true,
      status: 'loading',
      error: 'pending'
    })
    expect((result[0]?.meta as Record<string, unknown>).recommendation).toMatchObject({
      source: 'plugin',
      reason: 'Plugin',
      badge: {
        text: '插件',
        icon: 'i-ri-puzzle-line',
        variant: 'plugin'
      }
    })
  })

  it('labels newly installed and cold-start items with their own badge', async () => {
    const dbUtils = {
      getFilesByPaths: vi.fn(async () => [
        {
          id: 1,
          path: '/Applications/Demo.app',
          name: 'Demo',
          displayName: 'Demo',
          extension: 'app',
          size: 0,
          mtime: new Date(),
          ctime: new Date(),
          lastIndexedAt: new Date(),
          isDir: false,
          type: 'application',
          content: null,
          embeddingStatus: 'none'
        }
      ]),
      getFilesByBundleIds: vi.fn(async () => []),
      getFileExtensionsByFileIds: vi.fn(async () => [])
    }

    mapAppsToRecommendationItemsMock.mockReturnValue([
      {
        id: '/Applications/Demo.app',
        source: { id: 'app-provider', type: 'application', name: 'App Provider' },
        kind: 'app',
        render: { mode: 'default', basic: { title: 'Demo' } },
        actions: [],
        meta: {}
      }
    ])

    const rebuilder = new ItemRebuilder(dbUtils as never)
    const rebuild = async (source: ScoredItem['source']) => {
      const [item] = await rebuilder.rebuildItems([
        {
          sourceId: 'app-provider',
          itemId: '/Applications/Demo.app',
          sourceType: 'app',
          usageStats,
          source,
          score: 1
        }
      ])
      return (item?.meta as Record<string, unknown>).recommendation
    }

    expect(await rebuild('newly-installed')).toMatchObject({
      reason: 'Just Installed',
      badge: { text: '新安装', icon: 'i-ri-download-2-line', variant: 'newly-installed' }
    })
    expect(await rebuild('cold-start')).toMatchObject({
      reason: 'Suggested',
      badge: { text: '推荐', icon: 'i-ri-lightbulb-line', variant: 'intelligent' }
    })
  })

  it('drops an app candidate whose catalog row is gone (uninstalled)', async () => {
    const dbUtils = {
      // Uninstall cascades the files row away; the usage stats row survives.
      getFilesByPaths: vi.fn(async () => []),
      getFilesByBundleIds: vi.fn(async () => []),
      getFileExtensionsByFileIds: vi.fn(async () => [])
    }

    const rebuilder = new ItemRebuilder(dbUtils as never)
    const result = await rebuilder.rebuildItems([
      {
        sourceId: 'app-provider',
        itemId: '/Applications/Removed.app',
        sourceType: 'app',
        usageStats,
        source: 'frequent',
        score: 5_000
      }
    ])

    expect(result).toEqual([])
    expect(mapAppsToRecommendationItemsMock).not.toHaveBeenCalled()
  })

  it('uses class icons for plugin recommendation fallbacks', async () => {
    const rebuilder = new ItemRebuilder({} as never)
    const scoredItems: ScoredItem[] = [
      {
        sourceId: 'plugin-recommend:demo-provider',
        itemId: 'missing-icon',
        sourceType: 'plugin-recommend',
        usageStats,
        source: 'plugin',
        score: 0.5,
        pluginCandidate: {
          providerId: 'demo-provider',
          id: 'missing-icon',
          title: 'Missing Icon',
          action: 'open'
        }
      }
    ]

    const result = await rebuilder.rebuildItems(scoredItems)

    expect(result[0]?.render.basic?.icon).toEqual({
      type: 'class',
      value: 'i-ri-lightbulb-line'
    })
  })
})
