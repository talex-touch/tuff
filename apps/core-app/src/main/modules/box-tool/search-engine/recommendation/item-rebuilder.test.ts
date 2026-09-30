import type { ITuffIcon, TuffItem } from '@talex-touch/utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ScoredItem } from './recommendation-engine'
import { ItemRebuilder } from './item-rebuilder'
import {
  createSnapshotRecommendationSource,
  type PluginRecommendSnapshot
} from './plugin-recommendation-source'
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
      scoredApp('/Applications/Demo.app', 0.91, {
        // A `frequent` recall only keeps its habit badge with real dated evidence (5 uses over 3
        // days); without `behavior` the reason is withheld rather than fabricated (R9).
        behavior: {
          executeCount: 5,
          executeCount30: 5,
          executeCount7: 2,
          activeDays30: 3,
          lastExecutedAt: Date.now(),
          decayedExecuteScore30: 4,
          hourDistribution30: Array.from({ length: 24 }, () => 0),
          dayOfWeekDistribution30: Array.from({ length: 7 }, () => 0),
          timeSlotDistribution30: { morning: 0, afternoon: 0, evening: 0, night: 0 }
        }
      })
    ])

    expect(result).toHaveLength(1)
    expect((result[0]?.meta as Record<string, unknown>).recommendation).toMatchObject({
      score: 0.91,
      source: 'frequent'
    })
    expect(result[0]?.scoring?.final).toBe(0.91)
  })

  it('withholds the habit reason from a frequent recall that has no dated evidence', async () => {
    register('app-provider', [appItem('/Applications/Demo.app')])

    const result = await new ItemRebuilder().rebuildItems([
      scoredApp('/Applications/Demo.app', 0.91)
    ])

    // The lifetime count is a fact, but with no accepted execution the item has no dated proof of
    // a habit: it must not wear "常用" (R9).
    const meta = result[0]?.meta as Record<string, unknown>
    const recommendation = meta.recommendation as {
      source?: string
      frequentEligible?: boolean
    }
    expect(recommendation.source).toBe('cold-start')
    expect(recommendation.frequentEligible).toBe(false)
  })

  it('returns items in scored order across sources', async () => {
    // App items come back in their own batch; grouping by source would surface them first
    // regardless of score, so ordering has to be restored from the scored input. Every candidate
    // — app and plugin — is rebuilt by a registered source.
    register('app-provider', [appItem('/Applications/Demo.app')])
    const pluginSnapshot: PluginRecommendSnapshot = {
      candidate: {
        providerId: 'demo-provider',
        id: 'top-action',
        title: 'Top Action',
        action: 'open'
      }
    }
    disposers.push(
      recommendationSourceRegistry.registerSource(
        createSnapshotRecommendationSource(
          'plugin-recommend:demo-provider',
          () => new Map([['top-action', pluginSnapshot]]),
          async () => ({ accepted: true })
        )
      )
    )

    const result = await new ItemRebuilder().rebuildItems([
      {
        sourceId: 'plugin-recommend:demo-provider',
        itemId: 'top-action',
        sourceType: 'plugin-recommend',
        usageStats,
        source: 'plugin',
        score: 9_000,
        pluginCandidate: pluginSnapshot.candidate
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

    // Badge text is an `$i18n:` key, not a literal: main has no locale, and the renderer resolves
    // it. A hardcoded Chinese string here would pass while the English UI showed Chinese.
    expect(await badgeFor('newly-installed')).toMatchObject({
      reason: 'Just Installed',
      badge: {
        text: '$i18n:coreBox.recommendation.badge.newlyInstalled',
        icon: 'i-ri-download-2-line',
        variant: 'newly-installed'
      }
    })
    expect(await badgeFor('cold-start')).toMatchObject({
      reason: 'Suggested',
      badge: {
        text: '$i18n:coreBox.recommendation.badge.suggested',
        icon: 'i-ri-lightbulb-line',
        variant: 'intelligent'
      }
    })
  })

  it('marks a rebuilt candidate grid-eligible only from dated behaviour, never from its label', async () => {
    // The grid admits a tile by this flag, so it must be the scorer's threshold verdict rather
    // than the reason label: a `frequent`-labelled row with no dated executions is not a habit.
    register('app-provider', [appItem('/Applications/Demo.app')])
    const rebuilder = new ItemRebuilder()

    const eligible = (
      await rebuilder.rebuildItems([
        scoredApp('/Applications/Demo.app', 1, {
          source: 'frequent',
          behavior: {
            executeCount: 12,
            executeCount30: 5,
            executeCount7: 2,
            activeDays30: 3,
            lastExecutedAt: Date.now(),
            decayedExecuteScore30: 4,
            hourDistribution30: Array.from({ length: 24 }, () => 0),
            dayOfWeekDistribution30: Array.from({ length: 7 }, () => 0),
            timeSlotDistribution30: { morning: 0, afternoon: 0, evening: 0, night: 0 }
          }
        })
      ])
    )[0]?.meta as Record<string, unknown>

    const labelledOnly = (
      await rebuilder.rebuildItems([scoredApp('/Applications/Demo.app', 1, { source: 'frequent' })])
    )[0]?.meta as Record<string, unknown>

    expect((eligible.recommendation as { frequentEligible?: boolean }).frequentEligible).toBe(true)
    expect((labelledOnly.recommendation as { frequentEligible?: boolean }).frequentEligible).toBe(
      false
    )
  })

  it('reports last-executed evidence only from a dated execution ledger', async () => {
    // A legacy row can carry a stored `lastExecuted` from before the ledger existed; that is not
    // proof of when the user ran the item, so no `lastExecutedAt` reason may be shown (R9).
    register('app-provider', [appItem('/Applications/Demo.app')])
    const rebuilder = new ItemRebuilder()

    const legacy = (
      await rebuilder.rebuildItems([
        scoredApp('/Applications/Demo.app', 1, {
          usageStats: {
            ...usageStats,
            itemId: '/Applications/Demo.app',
            executeCount: 30,
            lastExecuted: new Date()
          }
        })
      ])
    )[0]?.meta as { recommendation?: { evidence?: Record<string, unknown> } }

    expect(legacy.recommendation?.evidence).toMatchObject({ executeCount: 30 })
    expect(legacy.recommendation?.evidence).not.toHaveProperty('lastExecutedAt')

    const dated = (
      await rebuilder.rebuildItems([
        scoredApp('/Applications/Demo.app', 1, {
          behavior: {
            executeCount: 30,
            executeCount30: 12,
            executeCount7: 4,
            activeDays30: 4,
            lastExecutedAt: 1_700_000_000_000,
            decayedExecuteScore30: 9,
            hourDistribution30: Array.from({ length: 24 }, () => 0),
            dayOfWeekDistribution30: Array.from({ length: 7 }, () => 0),
            timeSlotDistribution30: { morning: 0, afternoon: 0, evening: 0, night: 0 }
          }
        })
      ])
    )[0]?.meta as { recommendation?: { evidence?: Record<string, unknown> } }

    expect(dated.recommendation?.evidence).toMatchObject({
      executeCount: 30,
      lastExecutedAt: 1_700_000_000_000
    })
  })

  it('claims a peak-hour reason only when the hour spread covers enough distinct days', async () => {
    register('app-provider', [appItem('/Applications/Demo.app')])
    const rebuilder = new ItemRebuilder()
    const peakHours = Array.from({ length: 24 }, () => 0)
    peakHours[9] = 10

    const evidenceFor = async (activeDays30: number) => {
      const [item] = await rebuilder.rebuildItems([
        scoredApp('/Applications/Demo.app', 1, {
          behavior: {
            executeCount: 10,
            executeCount30: 10,
            executeCount7: 3,
            activeDays30,
            lastExecutedAt: Date.now(),
            decayedExecuteScore30: 5,
            hourDistribution30: peakHours,
            dayOfWeekDistribution30: Array.from({ length: 7 }, () => 0),
            timeSlotDistribution30: { morning: 10, afternoon: 0, evening: 0, night: 0 }
          }
        })
      ])
      return (item?.meta as { recommendation?: { evidence?: Record<string, unknown> } })
        ?.recommendation?.evidence
    }

    expect(await evidenceFor(5)).toHaveProperty('peakHourRange')
    // Ten uses in ten hours all inside one day is a session; the reason would be fabricated.
    expect(await evidenceFor(1)).not.toHaveProperty('peakHourRange')
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
  })

  describe('plugin recommendation candidates', () => {
    const PLUGIN_SOURCE_ID = 'plugin-recommend:demo-provider'

    it('rebuilds a plugin candidate through its registered source, not an inline branch', async () => {
      // The clickable card and its id belong to the provider's source now. A candidate with no
      // registered source is not executable and legitimately rebuilds to [] ("no source").
      const snapshot: PluginRecommendSnapshot = {
        candidate: {
          providerId: 'demo-provider',
          id: 'open-demo',
          title: 'Open Demo',
          action: 'open'
        }
      }
      const entry = createSnapshotRecommendationSource(
        PLUGIN_SOURCE_ID,
        () => new Map([['open-demo', snapshot]]),
        async () => ({ accepted: true })
      )
      disposers.push(recommendationSourceRegistry.registerSource(entry))

      const result = await new ItemRebuilder().rebuildItems([
        {
          sourceId: PLUGIN_SOURCE_ID,
          itemId: 'open-demo',
          sourceType: 'plugin-recommend',
          usageStats,
          source: 'plugin',
          score: 0.88,
          pluginCandidate: snapshot.candidate
        }
      ])

      expect(result.map((item) => item.id)).toEqual(['open-demo'])
    })

    it('drops a plugin candidate the provider no longer holds in its snapshot', async () => {
      // A stale card the host has forgotten must not come back: it would render but dispatch to
      // nothing. `createSnapshotRecommendationSource.rebuild` refuses an id it does not know.
      const entry = createSnapshotRecommendationSource(
        PLUGIN_SOURCE_ID,
        () => new Map(),
        async () => ({ accepted: true })
      )
      disposers.push(recommendationSourceRegistry.registerSource(entry))

      const result = await new ItemRebuilder().rebuildItems([
        {
          sourceId: PLUGIN_SOURCE_ID,
          itemId: 'gone-demo',
          sourceType: 'plugin-recommend',
          usageStats,
          source: 'plugin',
          score: 0.5,
          pluginCandidate: {
            providerId: 'demo-provider',
            id: 'gone-demo',
            title: 'Gone',
            action: 'open'
          }
        }
      ])

      expect(result).toEqual([])
    })

    it('publishes the plugin badge and the original identity for a rebuilt candidate', async () => {
      // A real icon DTO, not a two-field literal: colour/colourful/status/error are part of the
      // contract this test preserves, and a narrow literal would erase them at compile time.
      const icon: ITuffIcon = {
        type: 'url',
        value: 'data:image/svg+xml,<svg></svg>',
        color: '#22c55e',
        colorful: true,
        status: 'loading',
        error: 'pending'
      }
      const snapshot: PluginRecommendSnapshot = {
        candidate: {
          providerId: 'demo-provider',
          id: 'open-demo',
          title: 'Open Demo',
          subtitle: 'Plugin action',
          icon,
          action: 'open',
          data: { target: 'demo' }
        }
      }
      const entry = createSnapshotRecommendationSource(
        PLUGIN_SOURCE_ID,
        () => new Map([['open-demo', snapshot]]),
        async () => ({ accepted: true })
      )
      disposers.push(recommendationSourceRegistry.registerSource(entry))

      const result = await new ItemRebuilder().rebuildItems([
        {
          sourceId: PLUGIN_SOURCE_ID,
          itemId: 'open-demo',
          sourceType: 'plugin-recommend',
          usageStats,
          source: 'plugin',
          score: 0.88,
          pluginCandidate: snapshot.candidate
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
        badge: {
          text: '$i18n:coreBox.recommendation.badge.plugin',
          icon: 'i-ri-puzzle-line',
          variant: 'plugin'
        }
      })
      // The original identity is what dispatch and the usage count key on, not the card id.
      expect((result[0]?.meta as Record<string, unknown>)._originalSourceId).toBe(PLUGIN_SOURCE_ID)
    })

    it('falls back to a class icon when the candidate has none', async () => {
      const snapshot: PluginRecommendSnapshot = {
        candidate: {
          providerId: 'demo-provider',
          id: 'missing-icon',
          title: 'Missing Icon',
          action: 'open'
        }
      }
      const entry = createSnapshotRecommendationSource(
        PLUGIN_SOURCE_ID,
        () => new Map([['missing-icon', snapshot]]),
        async () => ({ accepted: true })
      )
      disposers.push(recommendationSourceRegistry.registerSource(entry))

      const result = await new ItemRebuilder().rebuildItems([
        {
          sourceId: PLUGIN_SOURCE_ID,
          itemId: 'missing-icon',
          sourceType: 'plugin-recommend',
          usageStats,
          source: 'plugin',
          score: 0.5,
          pluginCandidate: snapshot.candidate
        }
      ])

      expect(result[0]?.render.basic?.icon).toEqual({
        type: 'class',
        value: 'i-ri-lightbulb-line'
      })
    })
  })
})
