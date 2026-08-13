import type { IndexedSourceDiagnostics, SearchProviderDescriptor } from '@talex-touch/utils/search'
import type { OnboardingGateDecision, OnboardingGateListener } from '../../storage'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

import {
  buildSearchProviderRegistrySnapshot,
  collectSearchProviderIdsForIndexedSource,
  SearchProviderRegistry
} from './search-provider-registry'

function createIndexedSource(id: string): IndexedSourceDiagnostics {
  return {
    descriptor: {
      id,
      kind: 'file',
      displayName: id,
      platforms: ['darwin', 'win32', 'linux'],
      priority: 'deferred',
      storage: 'sqlite-index',
      privacy: 'medium',
      capabilities: {
        scan: true,
        watch: true,
        reconcile: true,
        clear: true,
        open: true
      },
      admission: {
        owner: 'core',
        permissionScopes: ['file-system'],
        defaultState: 'enabled',
        clearable: true,
        rebuildable: true
      }
    },
    health: {
      status: 'ready',
      permissionState: 'granted',
      itemCount: 1,
      watchState: 'active',
      reconcileState: 'idle'
    },
    roots: []
  }
}

function createPluginProvider(id: string): SearchProviderDescriptor {
  return {
    id,
    displayName: 'Plugin Results',
    kind: 'plugin',
    owner: 'third-party-plugin',
    mode: 'push',
    priority: 'fast',
    defaultOrder: 100,
    policy: {
      owner: 'third-party-plugin',
      mode: 'push',
      permissionScopes: ['root-results'],
      defaultState: 'ask',
      requiresUserConsent: true,
      pushesToRootResults: true
    }
  }
}

describe('search provider registry', () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  it('observes deferred onboarding load failures, retries, and stops retrying after success', async () => {
    vi.useFakeTimers()
    let notifyOnboardingReady: ((decision: OnboardingGateDecision) => void) | undefined
    const unsubscribe = vi.fn()
    onboardingGateMock.waitForDecision.mockResolvedValueOnce({
      state: 'degraded',
      reason: 'storage-pending',
      recoverable: true
    })
    onboardingGateMock.subscribe.mockImplementationOnce((listener: OnboardingGateListener) => {
      notifyOnboardingReady = listener
      return unsubscribe
    })
    let attempts = 0
    const beforeProvidersLoad = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('first load failed')
    })
    const onProvidersReady = vi.fn(async () => undefined)
    const registry = new SearchProviderRegistry({
      beforeProvidersLoad,
      onProvidersReady,
      getSearchIndexService: () => null,
      getTouchApp: () => null,
      onProviderDeactivated: () => undefined
    })

    await expect(registry.loadWhenOnboardingAllows('all-modules-loaded')).resolves.toMatchObject({
      state: 'degraded'
    })
    expect(onboardingGateMock.subscribe).toHaveBeenCalledTimes(1)

    notifyOnboardingReady?.({ state: 'allowed' })
    await vi.advanceTimersByTimeAsync(0)
    expect(beforeProvidersLoad).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(beforeProvidersLoad).toHaveBeenCalledTimes(2)
    expect(onProvidersReady).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(beforeProvidersLoad).toHaveBeenCalledTimes(2)
    expect(unsubscribe).toHaveBeenCalledTimes(1)

    registry.destroy()
    vi.useRealTimers()
  })

  it('contains provider-load failures behind the allowed decision and retries with backoff', async () => {
    // Regression (V1 2026-08-04): a search-index worker init failure during
    // the all-modules-loaded trigger escaped the fire-and-forget event
    // listener as an UNHANDLED_REJECTION with no retry. The allowed branch
    // must resolve with the decision, warn, and arm the backoff retry instead.
    vi.useFakeTimers()
    onboardingGateMock.waitForDecision.mockResolvedValueOnce({ state: 'allowed' })
    let attempts = 0
    const beforeProvidersLoad = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('search-index worker init failed')
    })
    const onProvidersReady = vi.fn(async () => undefined)
    const registry = new SearchProviderRegistry({
      beforeProvidersLoad,
      onProvidersReady,
      getSearchIndexService: () => null,
      getTouchApp: () => null,
      onProviderDeactivated: () => undefined
    })

    await expect(registry.loadWhenOnboardingAllows('all-modules-loaded')).resolves.toEqual({
      state: 'allowed'
    })
    expect(beforeProvidersLoad).toHaveBeenCalledTimes(1)
    expect(onProvidersReady).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(beforeProvidersLoad).toHaveBeenCalledTimes(2)
    expect(onProvidersReady).toHaveBeenCalledTimes(1)

    registry.destroy()
    vi.useRealTimers()
  })

  /**
   * `destroy()` fired provider teardown without awaiting it (#334).
   *
   * `ISearchProvider` has no disposal member at all, so the registry reaches for `onDestroy`
   * structurally through a local type that declared it `() => void`. `AppProvider`'s is
   * `async onDestroy(): Promise<void>` and awaits `prepareForSearchIndexShutdown()` -- so the
   * registry resolved while the search index was still shutting down, and the `void` declaration
   * meant TypeScript saw no floating promise to complain about.
   */
  it('waits for an async provider teardown before resolving', async () => {
    let released!: () => void
    const teardownFinished = vi.fn()
    const provider = {
      id: 'slow-teardown',
      type: 'app' as never,
      onSearch: vi.fn(async () => ({ items: [] })) as never,
      onDestroy: vi.fn(async () => {
        await new Promise<void>((resolve) => {
          released = resolve
        })
        teardownFinished()
      })
    }

    const registry = new SearchProviderRegistry({
      beforeProvidersLoad: async () => undefined,
      onProvidersReady: async () => undefined,
      getSearchIndexService: () => null,
      getTouchApp: () => null,
      onProviderDeactivated: () => undefined
    })
    registry.register(provider as never)

    const destroyed = registry.destroy()
    let settled = false
    void destroyed.then(() => {
      settled = true
    })

    // The teardown has started and has not finished, so destroy() must not have resolved either.
    await Promise.resolve()
    expect(provider.onDestroy).toHaveBeenCalledTimes(1)
    expect(teardownFinished).not.toHaveBeenCalled()
    expect(settled).toBe(false)

    released()
    await destroyed
    expect(teardownFinished).toHaveBeenCalledTimes(1)
  })

  /** A rejecting teardown is logged and the remaining providers are still torn down. */
  it('keeps tearing down after one provider rejects', async () => {
    const second = vi.fn(async () => undefined)
    const registry = new SearchProviderRegistry({
      beforeProvidersLoad: async () => undefined,
      onProvidersReady: async () => undefined,
      getSearchIndexService: () => null,
      getTouchApp: () => null,
      onProviderDeactivated: () => undefined
    })
    registry.register({
      id: 'rejects',
      type: 'app' as never,
      onSearch: vi.fn(async () => ({ items: [] })) as never,
      onDestroy: async () => {
        throw new Error('teardown failed')
      }
    } as never)
    registry.register({
      id: 'after',
      type: 'app' as never,
      onSearch: vi.fn(async () => ({ items: [] })) as never,
      onDestroy: second
    } as never)

    await expect(registry.destroy()).resolves.toBeUndefined()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('combines indexed sources and plugin search providers for settings config', () => {
    const snapshot = buildSearchProviderRegistrySnapshot({
      indexedSources: [createIndexedSource('file-provider')],
      plugins: [
        {
          name: 'touch-translation',
          searchProviders: [createPluginProvider('touch-translation.results')],
          issues: []
        }
      ],
      userConfigs: [
        { providerId: 'touch-translation.results', enabled: true, order: 1 },
        { providerId: 'file-provider', enabled: false, order: 2 }
      ]
    })

    expect(snapshot.availableProviders.map((provider) => provider.id)).toEqual([
      'file-provider',
      'touch-translation.results'
    ])
    expect(snapshot.providers.map((provider) => provider.providerId)).toEqual([
      'touch-translation.results',
      'file-provider'
    ])
    expect(snapshot.providers[0]).toMatchObject({
      providerId: 'touch-translation.results',
      enabled: true,
      descriptor: {
        owner: 'third-party-plugin',
        policy: {
          permissionScopes: ['root-results']
        }
      }
    })
    expect(snapshot.providers[1]).toMatchObject({
      providerId: 'file-provider',
      enabled: false
    })
  })

  it('keeps first descriptor when provider IDs collide', () => {
    const snapshot = buildSearchProviderRegistrySnapshot({
      indexedSources: [createIndexedSource('file-provider')],
      plugins: [
        {
          name: 'bad-plugin',
          searchProviders: [createPluginProvider('file-provider')],
          issues: []
        }
      ]
    })

    expect(snapshot.availableProviders).toHaveLength(1)
    expect(snapshot.availableProviders[0]).toMatchObject({
      id: 'file-provider',
      owner: 'core'
    })
    expect(snapshot.issues).toEqual([
      {
        type: 'error',
        code: 'SEARCH_PROVIDER_ID_COLLISION',
        message:
          "Search provider 'file-provider' was ignored because the provider id is already registered.",
        providerId: 'file-provider',
        owner: 'third-party-plugin',
        mode: 'push',
        meta: {
          displayName: 'Plugin Results'
        }
      }
    ])
  })

  it('collects plugin search provider registration issues for settings diagnostics', () => {
    const snapshot = buildSearchProviderRegistrySnapshot({
      indexedSources: [],
      plugins: [
        {
          name: 'bad-plugin',
          searchProviders: [],
          issues: [
            {
              type: 'error',
              code: 'SEARCH_PROVIDER_PERMISSION_MISSING',
              message:
                "Search provider 'bad-plugin.results' requires manifest permissions: search.root-results",
              source: 'searchProvider:bad-plugin.results',
              meta: {
                providerId: 'bad-plugin.results',
                missingPermissionIds: ['search.root-results'],
                permissionScopes: ['root-results']
              }
            },
            {
              type: 'warning',
              code: 'ICON_LOAD_FAILED',
              message: 'Icon failed'
            }
          ]
        }
      ]
    })

    expect(snapshot.issues).toEqual([
      {
        type: 'error',
        code: 'SEARCH_PROVIDER_PERMISSION_MISSING',
        message:
          "Search provider 'bad-plugin.results' requires manifest permissions: search.root-results",
        pluginName: 'bad-plugin',
        providerId: 'bad-plugin.results',
        source: 'searchProvider:bad-plugin.results',
        meta: {
          providerId: 'bad-plugin.results',
          missingPermissionIds: ['search.root-results'],
          permissionScopes: ['root-results']
        }
      }
    ])
  })

  it('preserves plugin provider links to runtime indexed source ids', () => {
    const browserProvider = createPluginProvider('touch-browser-data.browser-bookmarks')
    browserProvider.kind = 'browser-bookmark'
    browserProvider.owner = 'official-plugin'
    browserProvider.policy = {
      owner: 'official-plugin',
      mode: 'push',
      permissionScopes: ['root-results', 'browser-data'],
      defaultState: 'ask',
      requiresUserConsent: true,
      pushesToRootResults: true,
      indexedSourceId: 'browser-bookmarks'
    }

    const snapshot = buildSearchProviderRegistrySnapshot({
      indexedSources: [createIndexedSource('browser-bookmarks')],
      plugins: [
        {
          name: 'touch-browser-data',
          searchProviders: [browserProvider],
          issues: []
        }
      ]
    })

    expect(
      snapshot.availableProviders.find(
        (provider) => provider.id === 'touch-browser-data.browser-bookmarks'
      )
    ).toMatchObject({
      kind: 'browser-bookmark',
      owner: 'official-plugin',
      policy: {
        indexedSourceId: 'browser-bookmarks',
        permissionScopes: ['root-results', 'browser-data']
      }
    })
    expect(snapshot.sourceLinks).toEqual([
      {
        sourceId: 'browser-bookmarks',
        providerIds: ['browser-bookmarks', 'touch-browser-data.browser-bookmarks']
      }
    ])
  })

  it('resolves provider ids linked to a runtime indexed source', () => {
    const browserProvider = createPluginProvider('touch-browser-data.browser-bookmarks')
    browserProvider.kind = 'browser-bookmark'
    browserProvider.owner = 'official-plugin'
    browserProvider.policy = {
      owner: 'official-plugin',
      mode: 'push',
      permissionScopes: ['root-results', 'browser-data'],
      defaultState: 'ask',
      requiresUserConsent: true,
      pushesToRootResults: true,
      indexedSourceId: 'browser-bookmarks'
    }

    expect(
      collectSearchProviderIdsForIndexedSource('browser-bookmarks', {
        indexedSources: [createIndexedSource('browser-bookmarks')],
        plugins: [
          {
            name: 'touch-browser-data',
            searchProviders: [browserProvider, createPluginProvider('touch-translation.results')],
            issues: []
          }
        ]
      })
    ).toEqual(['browser-bookmarks', 'touch-browser-data.browser-bookmarks'])
  })
})
