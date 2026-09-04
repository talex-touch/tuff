import type { RecommendationRebuildCapable, TuffItem } from '@talex-touch/utils'
import { createLogger } from '../../../../utils/logger'

const registryLog = createLogger('RecommendationEngine').child('SourceRegistry')

/**
 * One registered recommendation source, flattened to what the rebuilder needs.
 */
export interface RecommendationSourceEntry {
  /** Canonical source id. Candidates recorded under an alias resolve to this. */
  readonly sourceId: string
  readonly aliases: readonly string[]
  rebuild(itemIds: readonly string[]): Promise<TuffItem[]>
}

/** Minimal shape a search provider must have to be auto-registered. */
interface IdentifiedSource {
  readonly id: string
}

function hasRebuildCapability(
  candidate: unknown
): candidate is IdentifiedSource & RecommendationRebuildCapable {
  if (!candidate || typeof candidate !== 'object') return false
  const source = candidate as Partial<IdentifiedSource & RecommendationRebuildCapable>
  return typeof source.id === 'string' && typeof source.rebuildRecommendationItems === 'function'
}

/**
 * Resolves `(sourceId → rebuilder)` for the recommendation item rebuilder.
 *
 * Registration is always *pushed in* by the source; neither this registry nor the rebuilder may
 * import a concrete provider. That is not a style preference — `item-rebuilder` currently reaches
 * its providers through `await import()`, and five of those six dynamic imports resolve back into
 * `search-engine/recommendation/` (via `search-core → recommendation-engine → item-rebuilder`).
 * Importing a provider from here would turn a cycle that dynamic import papers over into a static
 * one, and the symptom is a boot-time `Cannot access '...' before initialization`, not a type
 * error. See `research/provider-consolidation.md` §1 for the measured graph.
 */
export class RecommendationSourceRegistry {
  private readonly entries = new Map<string, RecommendationSourceEntry>()
  /** alias → canonical source id */
  private readonly aliasIndex = new Map<string, string>()

  /**
   * Register a search provider that also implements the rebuild capability.
   *
   * Returns `null` for providers without the capability so `registerProvider` can call this
   * unconditionally: most providers never appear in recommendations, and that is not an error.
   */
  registerProviderSource(provider: unknown): (() => void) | null {
    if (!hasRebuildCapability(provider)) return null

    return this.registerSource({
      sourceId: provider.id,
      aliases: provider.recommendationSourceAliases ?? [],
      rebuild: (itemIds) => provider.rebuildRecommendationItems(itemIds)
    })
  }

  /**
   * Register a source that is not a search provider.
   *
   * Clipboard history is the case that makes this path mandatory rather than a convenience: it
   * contributes recommendation candidates but has no entry in the search provider registry at all.
   */
  registerSource(entry: {
    sourceId: string
    aliases?: readonly string[]
    rebuild(itemIds: readonly string[]): Promise<TuffItem[]>
  }): () => void {
    const { sourceId } = entry
    const aliases = entry.aliases ?? []

    const existing = this.entries.get(sourceId)
    if (existing) {
      throw new Error(`[RecommendationSourceRegistry] Source "${sourceId}" is already registered`)
    }

    // Claim aliases before storing anything, so a conflict leaves the registry untouched.
    for (const alias of aliases) {
      const owner = this.aliasIndex.get(alias)
      if (owner && owner !== sourceId) {
        throw new Error(
          `[RecommendationSourceRegistry] Alias "${alias}" is already claimed by "${owner}"; ` +
            `"${sourceId}" cannot claim it too`
        )
      }
      if (this.entries.has(alias)) {
        throw new Error(
          `[RecommendationSourceRegistry] Alias "${alias}" collides with registered source id`
        )
      }
    }

    const resolved: RecommendationSourceEntry = { sourceId, aliases, rebuild: entry.rebuild }
    this.entries.set(sourceId, resolved)
    for (const alias of aliases) this.aliasIndex.set(alias, sourceId)

    registryLog.debug('Registered recommendation source', {
      meta: { sourceId, aliasCount: aliases.length }
    })

    return () => {
      // Deliberately swallows `unregister`'s boolean: the dispose contract is `() => void`, and
      // leaking the result invites callers to branch on "was it still registered?", which is a
      // race, not information.
      this.unregister(sourceId)
    }
  }

  unregister(sourceId: string): boolean {
    const entry = this.entries.get(sourceId)
    if (!entry) return false

    this.entries.delete(sourceId)
    for (const alias of entry.aliases) {
      // Only drop aliases this source still owns; a re-registration may have taken over.
      if (this.aliasIndex.get(alias) === sourceId) this.aliasIndex.delete(alias)
    }
    return true
  }

  /** Alias → canonical source id. Unknown ids pass through unchanged. */
  canonicalize(sourceId: string): string {
    return this.aliasIndex.get(sourceId) ?? sourceId
  }

  /** Resolves through aliases, so callers may pass either form. */
  resolve(sourceId: string): RecommendationSourceEntry | undefined {
    return this.entries.get(this.canonicalize(sourceId))
  }

  /** Registered canonical source ids, for diagnostics. */
  listSourceIds(): string[] {
    return [...this.entries.keys()]
  }

  clear(): void {
    this.entries.clear()
    this.aliasIndex.clear()
  }
}

/**
 * Process-wide registry.
 *
 * A singleton because both registration paths are wired from module scope during startup
 * (`search-core.registerProvider` and the standalone sources) while the only consumer,
 * `ItemRebuilder`, is constructed later and per-engine.
 */
export const recommendationSourceRegistry = new RecommendationSourceRegistry()
