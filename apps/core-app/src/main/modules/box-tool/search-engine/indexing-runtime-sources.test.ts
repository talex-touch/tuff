import { describe, expect, it, vi, beforeEach } from 'vitest'

const { getMainConfigMock } = vi.hoisted(() => ({
  getMainConfigMock: vi.fn()
}))

vi.mock('../../storage', () => ({
  getMainConfig: getMainConfigMock
}))

import {
  getBrowserBookmarksLinkedProviderIds,
  isBrowserBookmarksSourceEnabled
} from './browser-bookmarks-source-config'

function setProviderConfig(
  providers: Array<{ providerId: string; enabled: boolean; order: number }>
) {
  getMainConfigMock.mockReturnValue({
    searchProviders: {
      providers
    }
  })
}

describe('indexing runtime sources', () => {
  beforeEach(() => {
    getMainConfigMock.mockReset()
  })

  it('keeps browser bookmarks disabled without explicit provider config', () => {
    setProviderConfig([])

    expect(isBrowserBookmarksSourceEnabled()).toBe(false)
  })

  it('enables browser bookmarks from the core source provider config', () => {
    setProviderConfig([{ providerId: 'browser-bookmarks', enabled: true, order: 1 }])

    expect(isBrowserBookmarksSourceEnabled()).toBe(true)
  })

  it('enables browser bookmarks from the official plugin provider config', () => {
    setProviderConfig([
      { providerId: 'touch-browser-data.browser-bookmarks', enabled: true, order: 1 }
    ])

    expect(isBrowserBookmarksSourceEnabled()).toBe(true)
  })

  it('does not enable browser bookmarks when linked providers are explicitly disabled', () => {
    setProviderConfig([
      { providerId: 'browser-bookmarks', enabled: false, order: 1 },
      { providerId: 'touch-browser-data.browser-bookmarks', enabled: false, order: 2 }
    ])

    expect(isBrowserBookmarksSourceEnabled()).toBe(false)
  })

  it('resolves browser bookmarks linked provider ids from descriptors', () => {
    expect(
      getBrowserBookmarksLinkedProviderIds([
        {
          id: 'custom.browser-bookmarks',
          displayName: 'Custom Browser Bookmarks',
          kind: 'browser-bookmark',
          owner: 'official-plugin',
          mode: 'push',
          priority: 'fast',
          defaultOrder: 1,
          policy: {
            owner: 'official-plugin',
            mode: 'push',
            permissionScopes: ['root-results', 'browser-data'],
            defaultState: 'ask',
            indexedSourceId: 'browser-bookmarks'
          }
        }
      ])
    ).toEqual(['browser-bookmarks', 'custom.browser-bookmarks'])
  })
})
