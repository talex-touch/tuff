import type { IndexedSourceDiagnostics, SearchProviderDescriptor } from '@talex-touch/utils/search'
import { describe, expect, it } from 'vitest'

import {
  buildSearchProviderRegistrySnapshot,
  collectSearchProviderIdsForIndexedSource
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
  it('combines indexed sources and plugin search providers for settings config', () => {
    const snapshot = buildSearchProviderRegistrySnapshot({
      indexedSources: [createIndexedSource('file-provider')],
      plugins: [
        {
          name: 'touch-translation',
          searchProviders: [createPluginProvider('touch-translation.results')]
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
          searchProviders: [createPluginProvider('file-provider')]
        }
      ]
    })

    expect(snapshot.availableProviders).toHaveLength(1)
    expect(snapshot.availableProviders[0]).toMatchObject({
      id: 'file-provider',
      owner: 'core'
    })
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
          searchProviders: [browserProvider]
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
            searchProviders: [browserProvider, createPluginProvider('touch-translation.results')]
          }
        ]
      })
    ).toEqual(['browser-bookmarks', 'touch-browser-data.browser-bookmarks'])
  })
})
