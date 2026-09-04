import type { TuffItem, TuffRender } from '@talex-touch/utils'
import type { ScoredItem } from './recommendation-engine'
import { createLogger } from '../../../../utils/logger'
import { recommendationSourceRegistry } from './recommendation-source-registry'
import { DEFAULT_RECOMMENDATION_BADGE, RECOMMENDATION_BADGES } from './recommendation-presentation'

const itemRebuilderLog = createLogger('RecommendationEngine').child('ItemRebuilder')

type TuffBasicIcon = NonNullable<NonNullable<TuffRender['basic']>['icon']>

const DEFAULT_PLUGIN_RECOMMEND_ICON: TuffBasicIcon = {
  type: 'class',
  value: 'i-ri-lightbulb-line'
}
const SUPPORTED_RECOMMEND_ICON_TYPES = new Set(['emoji', 'url', 'file', 'class', 'builtin'])

const getMetaString = (item: TuffItem, key: string): string | undefined => {
  const meta = item.meta as Record<string, unknown> | undefined
  const value = meta?.[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Every identifier an app item is legitimately known by. buildProcessedAppItem
 * ids an app as `appIdentity || path || bundleId`, and a scored candidate may
 * have been recorded under any of those, so matching has to span the forms —
 * but only by exact equality, never by containment.
 */
const getAppIdentitySet = (item: TuffItem): Set<string> => {
  const meta = item.meta as Record<string, unknown> | undefined
  const app = meta?.app as Record<string, unknown> | undefined
  const identities = new Set<string>()

  for (const value of [
    item.id,
    getMetaString(item, '_originalItemId'),
    typeof app?.path === 'string' ? app.path : undefined,
    typeof app?.bundleId === 'string' ? app.bundleId : undefined,
    typeof app?.launchTarget === 'string' ? app.launchTarget : undefined
  ]) {
    if (value) identities.add(value)
  }

  return identities
}

function normalizePluginRecommendIcon(icon: unknown): TuffBasicIcon {
  if (!icon || typeof icon !== 'object') return { ...DEFAULT_PLUGIN_RECOMMEND_ICON }

  const raw = icon as Record<string, unknown>
  if (
    typeof raw.type !== 'string' ||
    !SUPPORTED_RECOMMEND_ICON_TYPES.has(raw.type) ||
    typeof raw.value !== 'string' ||
    !raw.value.trim()
  ) {
    return { ...DEFAULT_PLUGIN_RECOMMEND_ICON }
  }

  const normalized: TuffBasicIcon = {
    type: raw.type as TuffBasicIcon['type'],
    value: raw.value
  }

  if (typeof raw.color === 'string') normalized.color = raw.color
  if (typeof raw.colorful === 'boolean') normalized.colorful = raw.colorful
  if (raw.status === 'normal' || raw.status === 'loading' || raw.status === 'error') {
    normalized.status = raw.status
  }
  if (typeof raw.error === 'string') normalized.error = raw.error

  return normalized
}

/**
 * Turns scored candidates back into renderable items.
 *
 * This class owns dispatch and enrichment only. Every source-specific lookup — which database to
 * read, how to filter, how to map a row — belongs to the registered source, which is why there is
 * no db handle here: adding a recommendation source must never require editing this file.
 */
export class ItemRebuilder {
  /**
   * Rebuilding fans out per source, so the batches come back grouped by source
   * (and, inside a batch, in DB row order) — the ranking `scoreAndRank` already
   * computed. `mergeAndEnrichItems` puts the input order back before returning,
   * so the caller always sees items ordered by recommendation score.
   */
  async rebuildItems(scoredItems: ScoredItem[]): Promise<TuffItem[]> {
    if (scoredItems.length === 0) return []

    // Plugin-recommend candidates carry their whole payload inline and are rebuilt from the flat
    // list below, so they must not also be dispatched as a source group.
    const sourceCandidates = scoredItems.filter((scored) => !scored.pluginCandidate)
    const grouped = this.groupByNormalizedSource(sourceCandidates)

    const batches = await Promise.all(
      [...grouped].map(([sourceId, items]) => this.rebuildSourceItems(sourceId, items))
    )

    batches.push(this.rebuildPluginRecommendItems(scoredItems))

    return this.mergeAndEnrichItems(batches.flat(), scoredItems)
  }

  /**
   * Dispatches one source group to whichever source claimed that id. This file holds no knowledge
   * of any concrete source: adding one is a registration, not an edit here.
   */
  private async rebuildSourceItems(sourceId: string, items: ScoredItem[]): Promise<TuffItem[]> {
    const entry = recommendationSourceRegistry.resolve(sourceId)
    if (entry) {
      try {
        return await entry.rebuild(items.map((item) => item.itemId))
      } catch (error) {
        // One source failing must not empty the whole grid.
        itemRebuilderLog.error('Recommendation source rebuild failed', {
          error,
          meta: { sourceId, itemCount: items.length }
        })
        return []
      }
    }

    itemRebuilderLog.warn('No recommendation source registered', {
      meta: { sourceId, itemCount: items.length }
    })
    return []
  }

  /** Alias resolution is owned by the sources themselves via `recommendationSourceAliases`. */
  private normalizeSourceId(sourceId: string): string {
    return recommendationSourceRegistry.canonicalize(sourceId)
  }

  private groupByNormalizedSource(items: ScoredItem[]): Map<string, ScoredItem[]> {
    const groups = new Map<string, ScoredItem[]>()

    for (const item of items) {
      const normalized = this.normalizeSourceId(item.sourceId)
      if (!groups.has(normalized)) {
        groups.set(normalized, [])
      }
      groups.get(normalized)!.push(item)
    }

    return groups
  }

  /**
   * 重建插件功能项
   */
  /**
   * 重建插件推荐候选项和内置候选项（如剪贴板 URL）
   */
  private rebuildPluginRecommendItems(scoredItems: ScoredItem[]): TuffItem[] {
    const items: TuffItem[] = []

    for (const scored of scoredItems) {
      if (!scored.pluginCandidate) continue

      const candidate = scored.pluginCandidate
      const isBuiltinUrl = scored.sourceId === '__builtin_clipboard_url__'

      const tuffItem: TuffItem = {
        id: candidate.id,
        source: {
          id: scored.sourceId,
          type: isBuiltinUrl ? 'system' : 'plugin',
          name: isBuiltinUrl ? 'Clipboard URL' : `Plugin: ${candidate.providerId || 'unknown'}`
        },
        kind: 'action',
        render: {
          mode: 'default',
          basic: {
            title: candidate.title,
            subtitle: candidate.subtitle,
            icon: normalizePluginRecommendIcon(candidate.icon)
          }
        },
        actions: isBuiltinUrl
          ? [
              {
                id: 'open-url',
                type: 'execute',
                label: '打开',
                shortcut: 'Enter'
              },
              {
                id: 'copy-url',
                type: 'copy',
                label: '复制',
                shortcut: 'CmdOrCtrl+C'
              }
            ]
          : [
              {
                id: candidate.action,
                type: 'execute',
                label: 'Execute',
                shortcut: 'Enter'
              }
            ],
        meta: {
          pluginRecommend: {
            providerId: candidate.providerId,
            action: candidate.action,
            data: candidate.data
          },
          _originalItemId: scored.itemId,
          _originalSourceId: scored.sourceId
        } as TuffItem['meta']
      }

      items.push(tuffItem)
    }

    return items
  }

  private findScoredByPartialMatch(
    item: TuffItem,
    scoredItems: ScoredItem[]
  ): ScoredItem | undefined {
    const itemId = item.id
    const sourceId = item.source.id
    const originalItemId = getMetaString(item, '_originalItemId')

    // Direct match with original ID (highest priority)
    if (originalItemId) {
      const match = scoredItems.find((s) => s.itemId === originalItemId && s.sourceId === sourceId)
      if (match) return match
    }

    // Plugin features: match by suffix or exact
    if (sourceId === 'plugin-features' || sourceId.includes('plugin')) {
      return scoredItems.find((s) => s.itemId.endsWith(`/${itemId}`) || s.itemId === itemId)
    }

    // App provider: the rebuilt item and the scored candidate can legitimately
    // carry different forms of the same app (buildProcessedAppItem ids by
    // appIdentity || path || bundleId), so this still matches across forms — but
    // against the item's own identity set, by equality.
    //
    // It used to be a two-way `includes`, which made one app inherit another's
    // score whenever one id was a prefix of the other: 'com.google.Chrome' is a
    // substring of 'com.google.Chrome.canary', so Chrome was enriched with
    // Canary's score and, through _originalItemId, deduped and pin-matched as
    // Canary (#666).
    if (sourceId === 'app-provider' || sourceId === 'application') {
      const identities = getAppIdentitySet(item)
      return scoredItems.find((s) => identities.has(s.itemId))
    }

    return undefined
  }

  private mergeAndEnrichItems(items: TuffItem[], scoredItems: ScoredItem[]): TuffItem[] {
    const scoreMap = new Map<string, ScoredItem>()
    const rankByScored = new Map<ScoredItem, number>()
    scoredItems.forEach((s, rank) => {
      scoreMap.set(s.itemId, s)
      scoreMap.set(`${s.sourceId}:${s.itemId}`, s)
      rankByScored.set(s, rank)
    })

    const ranked: Array<{ item: TuffItem; rank: number }> = []

    for (const item of items) {
      const originalItemId = getMetaString(item, '_originalItemId')
      // Source-qualified keys are tried before bare ones. scoreMap holds both
      // spellings, and item_usage_stats still carries two source ids for apps
      // ('application' and 'app-provider'), so two candidates can share an
      // itemId; a bare-key hit returns whichever was registered last (#667).
      const scored =
        (originalItemId && scoreMap.get(`${item.source.id}:${originalItemId}`)) ||
        scoreMap.get(`${item.source.id}:${item.id}`) ||
        scoreMap.get(item.id) ||
        this.findScoredByPartialMatch(item, scoredItems)
      if (!scored) continue

      const meta: Record<string, unknown> = {
        ...(item.meta as Record<string, unknown> | undefined)
      }
      meta.recommendation = {
        score: scored.score,
        source: scored.source,
        reason: this.getReasonLabel(scored),
        isIntelligent: true,
        badge: this.generateBadge(scored)
      }
      // Store original itemId for deduplication in recommendation-engine
      meta._originalItemId = scored.itemId
      meta._originalSourceId = scored.sourceId
      item.meta = meta as TuffItem['meta']
      // Absolute score, higher first — the same contract the tuff sorter writes
      // for searched items, so anything ranking a mixed list reads one field.
      item.scoring = { ...item.scoring, final: scored.score }

      ranked.push({ item, rank: rankByScored.get(scored) ?? Number.MAX_SAFE_INTEGER })
    }

    // Stable by rank: two rebuilt items resolving to one scored candidate keep
    // the order their source batch produced them in.
    return ranked.sort((a, b) => a.rank - b.rank).map(({ item }) => item)
  }

  private getReasonLabel(scored: ScoredItem): string {
    const labels: Record<string, string> = {
      frequent: 'Frequent',
      'time-based': 'Popular Now',
      recent: 'Recent',
      trending: 'Trending',
      context: 'Smart Match',
      plugin: 'Plugin',
      'newly-installed': 'Just Installed',
      'cold-start': 'Suggested'
    }
    return labels[scored.source] || 'Recommended'
  }

  private generateBadge(scored: ScoredItem): { text: string; icon: string; variant: string } {
    return RECOMMENDATION_BADGES[scored.source] ?? DEFAULT_RECOMMENDATION_BADGE
  }
}
