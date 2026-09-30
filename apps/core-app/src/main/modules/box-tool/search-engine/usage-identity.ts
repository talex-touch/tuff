import type { TuffItem } from '@talex-touch/utils'
import { recommendationSourceRegistry } from './recommendation/recommendation-source-registry'

/**
 * The identities a statistic row is keyed by.
 *
 * `_originalSourceId` / `_originalItemId` are set by the recommendation rebuilder (and by
 * `injectUsageStats`) and name the catalogue entry the display row was rebuilt from; the rendered
 * ids may be a temporary handle that changes between sessions. Falling back to `item.source.id` /
 * `item.id` keeps the typed-query list — which never rebuilds — on the same key.
 */
export function resolveUsageIdentity(item: TuffItem): { sourceId: string; itemId: string } {
  const meta = item.meta as Record<string, unknown> | undefined
  const rawSourceId =
    typeof meta?._originalSourceId === 'string' ? meta._originalSourceId : item.source.id
  const itemId = typeof meta?._originalItemId === 'string' ? meta._originalItemId : item.id
  // Platform file providers / app spellings register aliases; without canonicalizing, the same
  // logical source would keep two counters (R2).
  return { sourceId: recommendationSourceRegistry.canonicalize(rawSourceId), itemId }
}
