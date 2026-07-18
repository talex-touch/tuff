import type { CoreBoxSearchIndexCommitPayload } from '@talex-touch/utils/transport/events/types'
import { getLogger } from '@talex-touch/utils/common/logger'

export type SearchIndexCommitListener = (payload: CoreBoxSearchIndexCommitPayload) => void

const log = getLogger('search-index-commit')

export class SearchIndexCommitHub {
  private revision = 0
  private readonly listeners = new Set<SearchIndexCommitListener>()
  private readonly sourceGenerations = new Map<string, number>()

  markCommitted(providerIds: Iterable<string> = []): CoreBoxSearchIndexCommitPayload {
    const normalizedProviderIds = Array.from(new Set(providerIds)).filter(Boolean).sort()
    const sourceGenerations: Record<string, number> = {}
    for (const providerId of normalizedProviderIds) {
      const generation = (this.sourceGenerations.get(providerId) ?? 0) + 1
      this.sourceGenerations.set(providerId, generation)
      sourceGenerations[providerId] = generation
    }
    const payload: CoreBoxSearchIndexCommitPayload = {
      revision: ++this.revision,
      providerIds: normalizedProviderIds,
      sourceGenerations,
      committedAt: Date.now()
    }

    for (const listener of this.listeners) {
      try {
        listener(payload)
      } catch (error) {
        log.warn('Search index commit listener failed', { error })
      }
    }

    return payload
  }

  getRevision(): number {
    return this.revision
  }

  getSourceGeneration(sourceId: string): number {
    return this.sourceGenerations.get(sourceId) ?? 0
  }

  getSourceGenerations(sourceIds?: Iterable<string>): Record<string, number> {
    const ids = sourceIds ? Array.from(new Set(sourceIds)) : [...this.sourceGenerations.keys()]
    const generations: Record<string, number> = {}
    for (const sourceId of ids.sort()) {
      generations[sourceId] = this.getSourceGeneration(sourceId)
    }
    return generations
  }

  subscribe(listener: SearchIndexCommitListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const searchIndexCommitHub = new SearchIndexCommitHub()
