import { describe, expect, it, vi } from 'vitest'
import { SearchIndexCommitHub } from './search-index-commit-hub'

describe('search index commit hub', () => {
  it('publishes monotonic revisions with deterministic provider ids', () => {
    const hub = new SearchIndexCommitHub()
    const listener = vi.fn()
    const unsubscribe = hub.subscribe(listener)

    const first = hub.markCommitted(['file-provider', 'app-provider', 'file-provider'])
    const second = hub.markCommitted()

    expect(first).toMatchObject({
      revision: 1,
      providerIds: ['app-provider', 'file-provider']
    })
    expect(second).toMatchObject({ revision: 2, providerIds: [] })
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    hub.markCommitted(['app-provider'])
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('isolates listener failures after a durable commit', () => {
    const hub = new SearchIndexCommitHub()
    const healthyListener = vi.fn()
    hub.subscribe(() => {
      throw new Error('listener failed')
    })
    hub.subscribe(healthyListener)

    expect(() => hub.markCommitted(['app-provider'])).not.toThrow()
    expect(healthyListener).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 1, providerIds: ['app-provider'] })
    )
  })
})
