import type { TuffItem } from '@talex-touch/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const boxItemManagerMock = vi.hoisted(() => ({
  getVisibleItems: vi.fn<() => TuffItem[]>()
}))

vi.mock('../item-sdk', () => ({
  getBoxItemManager: () => boxItemManagerMock
}))

vi.mock('../../storage', () => ({
  getMainConfig: () => ({ searchProviders: { providers: [] } })
}))

import {
  loadQuicklinksRootResultsSnapshot,
  mapRootResultToQuicklinkItem
} from './quicklinks-root-results-feed'

function createRootItem(
  id: string,
  providerId: string,
  payload: Record<string, unknown> = {}
): TuffItem {
  return {
    id,
    source: {
      type: 'plugin',
      id: 'plugin-features',
      name: 'plugin-features'
    },
    render: {
      mode: 'default',
      basic: {
        title: '打开 · Docs',
        subtitle: 'https://docs.example.com'
      }
    },
    icon: { type: 'class', value: 'i-ri-links-line' },
    meta: {
      pluginName: 'touch-dev-toolbox',
      featureId: 'dev-toolbox',
      searchProviderId: providerId,
      payload
    }
  } as TuffItem
}

describe('quicklinks root results feed', () => {
  beforeEach(() => {
    boxItemManagerMock.getVisibleItems.mockReset()
  })

  it('maps visible linked provider root results into quicklink snapshot items', () => {
    boxItemManagerMock.getVisibleItems.mockReturnValue([
      createRootItem('docs', 'touch-dev-toolbox.dev-toolbox', {
        title: 'Docs',
        url: 'https://docs.example.com'
      }),
      createRootItem('bookmark', 'touch-browser-bookmarks.quicklinks', {
        title: 'Bookmark',
        url: 'https://bookmark.example.com'
      }),
      createRootItem('other-provider', 'custom.other', {
        title: 'Other',
        url: 'https://other.example.com'
      }),
      createRootItem('invalid-url', 'touch-dev-toolbox.dev-toolbox', {
        title: 'Local',
        url: 'file:///tmp/local'
      })
    ])

    const snapshot = loadQuicklinksRootResultsSnapshot()

    expect(snapshot.items).toEqual([
      expect.objectContaining({
        id: 'docs',
        title: 'Docs',
        url: 'https://docs.example.com/',
        metadata: expect.objectContaining({
          pluginName: 'touch-dev-toolbox',
          featureId: 'dev-toolbox',
          searchProviderId: 'touch-dev-toolbox.dev-toolbox',
          source: 'root-results'
        })
      }),
      expect.objectContaining({
        id: 'bookmark',
        title: 'Bookmark',
        url: 'https://bookmark.example.com/'
      })
    ])
    expect(snapshot.evidence).toEqual([
      expect.objectContaining({
        id: 'quicklinks:root-results-feed',
        status: 'ready',
        itemCount: 2,
        metadata: expect.objectContaining({
          providerCount: 3,
          storage: 'root-results-visible'
        })
      })
    ])
  })

  it('reports degraded evidence when no visible linked root results are available', () => {
    boxItemManagerMock.getVisibleItems.mockReturnValue([])

    const snapshot = loadQuicklinksRootResultsSnapshot()

    expect(snapshot.items).toEqual([])
    expect(snapshot.evidence).toEqual([
      expect.objectContaining({
        status: 'degraded',
        itemCount: 0,
        reason: 'quicklinks-root-results-feed-empty'
      })
    ])
  })

  it('falls back to subtitle URL and strips action prefixes from titles', () => {
    const mapped = mapRootResultToQuicklinkItem(
      createRootItem('recent', 'touch-browser-bookmarks.quicklinks', {})
    )

    expect(mapped).toEqual(
      expect.objectContaining({
        id: 'recent',
        title: 'Docs',
        url: 'https://docs.example.com/'
      })
    )
  })
})
