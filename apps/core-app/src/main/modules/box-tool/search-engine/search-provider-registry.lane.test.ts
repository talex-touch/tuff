import type { OnboardingGateDecision, OnboardingGateListener } from '../../storage'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../database', () => ({
  databaseModule: {}
}))

const onboardingGateMock = vi.hoisted(() => ({
  evaluate: vi.fn<() => OnboardingGateDecision>(() => ({ state: 'allowed' })),
  waitForDecision: vi.fn<() => Promise<OnboardingGateDecision>>(async () => ({ state: 'allowed' })),
  subscribe: vi.fn<(listener: OnboardingGateListener) => () => void>((_listener) => () => {})
}))

vi.mock('../../storage', () => ({
  storageModule: {},
  onboardingGate: onboardingGateMock
}))

import type { ISearchProvider } from '@talex-touch/utils'
import type { ProviderContext } from './types'
import type { SearchIndexService } from './search-index-service'
import { SearchProviderRegistry } from './search-provider-registry'

function createProvider(
  id: string,
  priority: 'fast' | 'deferred',
  onLoad: (context: ProviderContext) => void
): ISearchProvider<ProviderContext> {
  return {
    id,
    name: id,
    type: 'application',
    priority,
    onLoad: async (context: ProviderContext) => onLoad(context),
    onSearch: async () => ({ items: [], sources: [], duration: 0, query: { text: '' } })
  } as unknown as ISearchProvider<ProviderContext>
}

/**
 * The registry hands each provider the reader its owner picks for it. The fast lane exists so an
 * app lookup does not queue behind a file FTS on the single-slot deferred reader; the split is
 * decided by whoever owns the readers, the registry only has to ask with the provider in hand.
 */
describe('search provider registry read lanes', () => {
  it('asks for the index reader per provider and passes the provider along', async () => {
    const fastReader = { lane: 'fast' } as unknown as SearchIndexService
    const deferredReader = { lane: 'deferred' } as unknown as SearchIndexService
    const getSearchIndexService = vi.fn((provider?: ISearchProvider<ProviderContext>) =>
      provider?.priority === 'fast' ? fastReader : deferredReader
    )
    const seen = new Map<string, ProviderContext>()
    const registry = new SearchProviderRegistry({
      getTouchApp: () => ({}) as never,
      getSearchIndexService,
      onProvidersReady: () => undefined,
      onProviderDeactivated: () => undefined
    })
    const appProvider = createProvider('app-provider', 'fast', (context) =>
      seen.set('app-provider', context)
    )
    const fileProvider = createProvider('file-provider', 'deferred', (context) =>
      seen.set('file-provider', context)
    )
    registry.register(appProvider)
    registry.register(fileProvider)

    await registry.loadWhenOnboardingAllows('test')

    expect(getSearchIndexService).toHaveBeenCalledWith(appProvider)
    expect(getSearchIndexService).toHaveBeenCalledWith(fileProvider)
    expect(seen.get('app-provider')?.searchIndex).toBe(fastReader)
    expect(seen.get('file-provider')?.searchIndex).toBe(deferredReader)
    registry.destroy()
  })
})
