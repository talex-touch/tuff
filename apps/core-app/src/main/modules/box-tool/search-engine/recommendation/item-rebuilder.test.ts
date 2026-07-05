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
