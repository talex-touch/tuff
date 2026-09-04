import type { TuffItem } from '@talex-touch/utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ScoredItem } from './recommendation-engine'
import { ItemRebuilder } from './item-rebuilder'
import { recommendationSourceRegistry } from './recommendation-source-registry'

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

const scoredApp = (itemId: string, score: number, extra: Partial<ScoredItem> = {}): ScoredItem => ({
  sourceId: 'app-provider',
  itemId,
  sourceType: 'app',
  usageStats,
  source: 'frequent',
  score,
  ...extra
})

const appItem = (id: string, meta: Record<string, unknown> = {}): TuffItem =>
  ({
    id,
    source: { id: 'app-provider', type: 'application', name: 'App Provider' },
    kind: 'app',
    render: { mode: 'default', basic: { title: id } },
    actions: [],
    meta
  }) as unknown as TuffItem

/**
 * Registers a stub source for the duration of one test.
 *
 * The rebuilder owns dispatch and enrichment, not lookups, so driving it through a stub is the
 * accurate unit boundary. The corresponding database behaviour lives in each source's own suite
 * (`app-recommendation-source.test.ts`, `file-recommendation-source.ts`, …).
 */
function withSource(
  sourceId: string,
  items: TuffItem[] | ((ids: readonly string[]) => TuffItem[]),
  aliases: readonly string[] = []
): { rebuild: ReturnType<typeof vi.fn>; dispose: () => void } {
  const rebuild = vi.fn(async (ids: readonly string[]) =>
    typeof items === 'function' ? items(ids) : items
  )
  const dispose = recommendationSourceRegistry.registerSource({ sourceId, aliases, rebuild })
  return { rebuild, dispose }
}

describe('ItemRebuilder', () => {
  const disposers: Array<() => void> = []

  afterEach(() => {
    while (disposers.length) disposers.pop()?.()
    vi.clearAllMocks()
  })

  const register = (
    sourceId: string,
    items: TuffItem[] | ((ids: readonly string[]) => TuffItem[]),
    aliases: readonly string[] = []
  ): ReturnType<typeof vi.fn> => {
    const { rebuild, dispose } = withSource(sourceId, items, aliases)
    disposers.push(dispose)
    return rebuild
  }

  it('publishes the recommendation score and reason onto the rebuilt item', async () => {
    register('app-provider', [appItem('/Applications/Demo.app')])

    const result = await new ItemRebuilder().rebuildItems([
      scoredApp('/Applications/Demo.app', 0.91)
    ])

    expect(result).toHaveLength(1)
    expect((result[0]?.meta as Record<string, unknown>).recommendation).toMatchObject({
      score: 0.91,
      source: 'frequent'
    })
    expect(result[0]?.scoring?.final).toBe(0.91)
  })

  it('returns items in scored order across sources', async () => {
    // App items come back in their own batch; grouping by source would surface them first
    // regardless of score, so ordering has to be restored from the scored input.
    register('app-provider', [appItem('/Applications/Demo.app')])

    const result = await new ItemRebuilder().rebuildItems([
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
      scoredApp('/Applications/Demo.app', 120)
    ])

    expect(result.map((item) => item.id)).toEqual(['top-action', '/Applications/Demo.app'])
    expect(result.map((item) => item.scoring?.final)).toEqual([9_000, 120])
  })

  it("does not let one app inherit a longer-named sibling's score", async () => {
    // 'com.google.Chrome' is a substring of 'com.google.Chrome.canary'. The old two-way `includes`
    // matched Chrome against Canary's scored entry, handing Chrome the wrong score and, via
    // _originalItemId, the wrong pin and dedupe identity (#666).
    register('app-provider', [
      appItem('com.google.Chrome', {
        app: { path: '/Applications/Google Chrome.app', bundleId: 'com.google.Chrome' }
      })
    ])

    const result = await new ItemRebuilder().rebuildItems([
      scoredApp('com.google.Chrome.canary', 9_999)
    ])

    expect(result.find((item) => item.id === 'com.google.Chrome')?.scoring?.final ?? 0).not.toBe(
      9_999
    )
  })

  it('still matches an app recorded under a different identity form', async () => {
    // The rebuilt id (appIdentity) and the scored entry (path) can be different forms of the same
    // app. Equality across the identity set has to keep working, or #666's fix trades one bug for
    // another.
    register('app-provider', [
      appItem('com.google.Chrome', {
        app: { path: '/Applications/Google Chrome.app', bundleId: 'com.google.Chrome' }
      })
    ])

    const result = await new ItemRebuilder().rebuildItems([
      scoredApp('/Applications/Google Chrome.app', 321)
    ])

    expect(result.find((item) => item.id === 'com.google.Chrome')?.scoring?.final).toBe(321)
  })

  it('prefers the candidate whose source matches the item over a bare id collision', async () => {
    // item_usage_stats still carries both spellings of the app source, so two candidates can share
    // an itemId and both survive deduplication, which keys on sourceId:itemId. Querying the bare
    // key first returned whichever happened to be registered last (#667).
    register('app-provider', [appItem('/Applications/Demo.app')], ['application'])

    const result = await new ItemRebuilder().rebuildItems([
      scoredApp('/Applications/Demo.app', 500),
      scoredApp('/Applications/Demo.app', 42, { sourceId: 'application' })
    ])

    // The rebuilt item's source is 'app-provider', so it must take that score.
    expect(result.find((item) => item.id === '/Applications/Demo.app')?.scoring?.final).toBe(500)
  })

  it('labels newly installed and cold-start items with their own badge', async () => {
    register('app-provider', [appItem('/Applications/Demo.app')])

    const rebuilder = new ItemRebuilder()
    const badgeFor = async (source: ScoredItem['source']): Promise<unknown> => {
      const [item] = await rebuilder.rebuildItems([
        scoredApp('/Applications/Demo.app', 1, { source })
      ])
      return (item?.meta as Record<string, unknown>).recommendation
    }

    expect(await badgeFor('newly-installed')).toMatchObject({
      reason: 'Just Installed',
      badge: { text: '新安装', icon: 'i-ri-download-2-line', variant: 'newly-installed' }
    })
    expect(await badgeFor('cold-start')).toMatchObject({
      reason: 'Suggested',
      badge: { text: '推荐', icon: 'i-ri-lightbulb-line', variant: 'intelligent' }
    })
  })

  it('drops a candidate whose source no longer has a backing record', async () => {
    // Uninstall cascades the catalog row away while the usage stats row survives.
    const rebuild = register('app-provider', [])

    const result = await new ItemRebuilder().rebuildItems([
      scoredApp('/Applications/Removed.app', 5_000)
    ])

    expect(rebuild).toHaveBeenCalledWith(['/Applications/Removed.app'])
    expect(result).toEqual([])
  })

  describe('dispatch', () => {
    it('routes each candidate to the source that claimed its id', async () => {
      const appRebuild = register('app-provider', [appItem('/Applications/Demo.app')])
      const fileRebuild = register('file-provider', [], ['file', 'files'])

      await new ItemRebuilder().rebuildItems([
        scoredApp('/Applications/Demo.app', 0.9),
        { ...scoredApp('/tmp/a.txt', 0.8), sourceId: 'files' }
      ])

      expect(appRebuild).toHaveBeenCalledWith(['/Applications/Demo.app'])
      expect(fileRebuild).toHaveBeenCalledWith(['/tmp/a.txt'])
    })

    it('batches every candidate of one source into a single call', async () => {
      const rebuild = register('app-provider', [])

      await new ItemRebuilder().rebuildItems([
        scoredApp('/a.app', 3),
        scoredApp('/b.app', 2),
        scoredApp('/c.app', 1)
      ])

      expect(rebuild).toHaveBeenCalledTimes(1)
      expect(rebuild).toHaveBeenCalledWith(['/a.app', '/b.app', '/c.app'])
    })

    it('drops candidates from an unknown source without failing the rest of the batch', async () => {
      register('app-provider', [appItem('/Applications/Demo.app')])

      const result = await new ItemRebuilder().rebuildItems([
        { ...scoredApp('who-knows', 0.95), sourceId: 'totally-unregistered-source' },
        scoredApp('/Applications/Demo.app', 0.9)
      ])

      expect(result.map((item) => item.id)).toEqual(['/Applications/Demo.app'])
    })

    it('keeps the other sources when one throws', async () => {
      register('app-provider', [appItem('/Applications/Demo.app')])
      const dispose = recommendationSourceRegistry.registerSource({
        sourceId: 'file-provider',
        rebuild: async () => {
          throw new Error('source exploded')
        }
      })
      disposers.push(dispose)

      const result = await new ItemRebuilder().rebuildItems([
        { ...scoredApp('/tmp/a.txt', 0.95), sourceId: 'file-provider' },
        scoredApp('/Applications/Demo.app', 0.9)
      ])

      expect(result.map((item) => item.id)).toEqual(['/Applications/Demo.app'])
    })

    it('does not dispatch plugin-recommend candidates as a source group', async () => {
      const rebuild = register('plugin-recommend:demo-provider', [])

      const result = await new ItemRebuilder().rebuildItems([
        {
          sourceId: 'plugin-recommend:demo-provider',
          itemId: 'open-demo',
          sourceType: 'plugin-recommend',
          usageStats,
          source: 'plugin',
          score: 1,
          pluginCandidate: {
            providerId: 'demo-provider',
            id: 'open-demo',
            title: 'Open Demo',
            action: 'open'
          }
        }
      ])

      // Their payload travels inline, so a source lookup would be a second, conflicting rebuild.
      expect(rebuild).not.toHaveBeenCalled()
      expect(result.map((item) => item.id)).toEqual(['open-demo'])
    })
  })

  describe('plugin recommendation candidates', () => {
    it('preserves icon metadata and the plugin badge', async () => {
      const result = await new ItemRebuilder().rebuildItems([
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
      ])

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
        badge: { text: '插件', icon: 'i-ri-puzzle-line', variant: 'plugin' }
      })
    })

    it('falls back to a class icon when the candidate has none', async () => {
      const result = await new ItemRebuilder().rebuildItems([
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
      ])

      expect(result[0]?.render.basic?.icon).toEqual({
        type: 'class',
        value: 'i-ri-lightbulb-line'
      })
    })
  })
})
