import type { RecommendationEvidence, TuffItem } from '@talex-touch/utils'
import type { ScoredItem } from './recommendation-engine'
import { createLogger } from '../../../../utils/logger'
import {
  isFrequentEligible,
  resolveEvidenceBackedReason,
  resolvePeakHourRange
} from './recommendation-utils'
import { recommendationSourceRegistry } from './recommendation-source-registry'
import { DEFAULT_RECOMMENDATION_BADGE, RECOMMENDATION_BADGES } from './recommendation-presentation'

const itemRebuilderLog = createLogger('RecommendationEngine').child('ItemRebuilder')

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

    // Every candidate — plugin, builtin, or a search provider's — is rebuilt by whichever source
    // claimed its id. There is no carrier branch here: a plugin candidate is executable only because
    // its provider registered a source, which is also what makes the builtin clipboard card work.
    const grouped = this.groupByNormalizedSource(scoredItems)

    const batches = await Promise.all(
      [...grouped].map(([sourceId, items]) => this.rebuildSourceItems(sourceId, items))
    )

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
      // The recall tag says what put the item in the pool; the *reason* it is shown with is
      // derived from dated evidence here, so a `frequent` recall carrying only a legacy lifetime
      // count cannot print a habit badge it cannot support (R9).
      const reasonSource = resolveEvidenceBackedReason(scored.source, scored.behavior)
      meta.recommendation = {
        score: scored.score,
        source: reasonSource,
        reason: this.getReasonLabel(reasonSource),
        isIntelligent: true,
        badge: this.generateBadge(reasonSource),
        evidence: this.buildEvidence(scored),
        // The grid admits a tile by this flag, not by the badge: the label says what recalled the
        // item, this says whether the dated behaviour crossed the frequent threshold. Absent means
        // "no evidence" (not executable by habit), and the layout treats it as such.
        frequentEligible: scored.behavior !== undefined && isFrequentEligible(scored.behavior)
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

  private getReasonLabel(source: ScoredItem['source']): string {
    const labels: Record<string, string> = {
      pinned: 'Pinned',
      frequent: 'Frequent',
      'time-based': 'Popular Now',
      recent: 'Recent',
      trending: 'Trending',
      context: 'Smart Match',
      plugin: 'Plugin',
      'newly-installed': 'Just Installed',
      'cold-start': 'Suggested'
    }
    return labels[source] || 'Recommended'
  }

  private generateBadge(source: ScoredItem['source']): {
    text: string
    icon: string
    variant: string
  } {
    return RECOMMENDATION_BADGES[source] ?? DEFAULT_RECOMMENDATION_BADGE
  }

  /**
   * Collects the data behind a recommendation so the UI can show a reason the
   * user can check ("used 23 times", "usually around 09-11").
   *
   * Every dated field comes from the batch behaviour read, never from the stored aggregate: a
   * legacy row's `lastExecuted` can predate the entry fix, so quoting it would date a "recent" claim
   * to an execution the ledger never accepted (R9). The lifetime `executeCount` is still the
   * aggregate — it is a real fact, just not a dated one. Nothing known means the whole object is
   * dropped; a zero count is treated as unknown because "used 0 times" is not a reason.
   */
  private buildEvidence(scored: ScoredItem): RecommendationEvidence | undefined {
    const evidence: RecommendationEvidence = {}

    // The lifetime aggregate is a real fact, and both carriers come from `item_usage_stats`: the
    // candidate's `usageStats` row and the behaviour facts' `executeCount`. Prefer the row, fall
    // back to the facts so a rehydrated candidate that carries only the batch read still shows
    // "used N times" — never a dated field, which is what R9 forbids here.
    const usageExecuteCount = scored.usageStats?.executeCount
    const executeCount =
      typeof usageExecuteCount === 'number' && usageExecuteCount > 0
        ? usageExecuteCount
        : scored.behavior?.executeCount
    if (typeof executeCount === 'number' && Number.isFinite(executeCount) && executeCount > 0) {
      evidence.executeCount = executeCount
    }

    const lastExecutedAt = scored.behavior?.lastExecutedAt
    if (
      typeof lastExecutedAt === 'number' &&
      Number.isFinite(lastExecutedAt) &&
      lastExecutedAt > 0
    ) {
      evidence.lastExecutedAt = lastExecutedAt
    }

    const installedAt = scored.source === 'newly-installed' ? scored.firstSeenAt : undefined
    if (typeof installedAt === 'number' && Number.isFinite(installedAt) && installedAt > 0) {
      evidence.installedAt = installedAt
    }

    // The peak-hour reason may only be claimed from the same reliable 30-day distribution the
    // scorer uses, never the lifetime stored histogram, and only once that distribution is spread
    // over enough distinct days. `resolvePeakHourRange` returns null when the sample, the count or
    // the day gate fails, so no reason is shown (R9).
    const peakHourRange = resolvePeakHourRange(
      scored.behavior?.hourDistribution30,
      scored.behavior?.activeDays30,
      scored.behavior?.executeCount30
    )
    if (peakHourRange) evidence.peakHourRange = peakHourRange

    return Object.keys(evidence).length > 0 ? evidence : undefined
  }
}
