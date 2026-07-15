import type { CoreBoxSearchIndexCommitPayload } from '@talex-touch/utils/transport/events/types'
import { getLogger } from '@talex-touch/utils/common/logger'

export type SearchIndexCommitListener = (payload: CoreBoxSearchIndexCommitPayload) => void

const log = getLogger('search-index-commit')

export class SearchIndexCommitHub {
  private revision = 0
  private readonly listeners = new Set<SearchIndexCommitListener>()

  markCommitted(providerIds: Iterable<string> = []): CoreBoxSearchIndexCommitPayload {
    const payload: CoreBoxSearchIndexCommitPayload = {
      revision: ++this.revision,
      providerIds: Array.from(new Set(providerIds)).filter(Boolean).sort(),
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

  subscribe(listener: SearchIndexCommitListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const searchIndexCommitHub = new SearchIndexCommitHub()
