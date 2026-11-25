// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  attachBrowserTabToSpace,
  BROWSER_SCOPE_KEY,
  closeConversationTabEverywhere,
  closeSpaceTabsBulk,
  conversationTabId,
  draftTabId,
  ensureConversationTab,
  ensureDraftTab,
  getSpaceTabs,
  isDeprecatedInternalBrowserUrl,
  projectIdFromSpaceKey,
  projectSpaceKey,
  removeSpaceTab,
  reorderSpaceTab,
  resetShellWorkspaceTabsForTests,
  resolveBrowserTabSpaceKey,
  spaceBrowserTabId,
  syncBrowserTabsWithSpaces,
  TEMPORARY_SPACE_KEY
} from './useShellWorkspaceTabs'

describe('useShellWorkspaceTabs', () => {
  beforeEach(() => {
    resetShellWorkspaceTabsForTests()
  })

  it('classifies deprecated tuff://store and tuff://settings URLs without blocking preview/web URLs', () => {
    expect(isDeprecatedInternalBrowserUrl('tuff://store')).toBe(true)
    expect(isDeprecatedInternalBrowserUrl('tuff://settings')).toBe(true)
    expect(isDeprecatedInternalBrowserUrl('tuff://setting/overview')).toBe(true)
    expect(isDeprecatedInternalBrowserUrl('tuff://preview?path=/tmp/a.ts')).toBe(false)
    expect(isDeprecatedInternalBrowserUrl('https://github.com')).toBe(false)
    expect(isDeprecatedInternalBrowserUrl('')).toBe(false)
  })

  it('keeps Space tab lists isolated per project and temporary space, and promotes draft on first message', () => {
    const projectA = projectSpaceKey('proj-a')
    expect(projectA).toBe('space:project:proj-a')
    expect(projectIdFromSpaceKey(projectA)).toBe('proj-a')
    expect(projectSpaceKey(null)).toBe(TEMPORARY_SPACE_KEY)
    expect(projectIdFromSpaceKey(TEMPORARY_SPACE_KEY)).toBeNull()
    expect(projectIdFromSpaceKey(BROWSER_SCOPE_KEY)).toBeNull()

    ensureDraftTab(projectA)
    expect(getSpaceTabs(projectA).map((t) => t.id)).toEqual([draftTabId(projectA)])

    // First message promotes the draft tab in place into the real conversation tab.
    ensureConversationTab(projectA, 'conv-1', { promoteDraft: true })
    expect(getSpaceTabs(projectA).map((t) => t.id)).toEqual([conversationTabId('conv-1')])

    // Opening another conversation in the same space appends beside it.
    ensureConversationTab(projectA, 'conv-2')
    expect(getSpaceTabs(projectA).map((t) => t.id)).toEqual([
      conversationTabId('conv-1'),
      conversationTabId('conv-2')
    ])

    // Conversations in temporary space stay isolated from project A.
    ensureConversationTab(TEMPORARY_SPACE_KEY, 'conv-temp')
    expect(getSpaceTabs(TEMPORARY_SPACE_KEY).map((t) => t.id)).toEqual([
      conversationTabId('conv-temp')
    ])
    expect(getSpaceTabs(projectA)).toHaveLength(2)

    // Reordering moves tabs within the space cleanly.
    expect(
      reorderSpaceTab(projectA, conversationTabId('conv-2'), conversationTabId('conv-1'))
    ).toBe(true)
    expect(getSpaceTabs(projectA).map((t) => t.id)).toEqual([
      conversationTabId('conv-2'),
      conversationTabId('conv-1')
    ])
  })

  it('binds file preview and space web tabs to their owning Space and prunes closed browser tabs', () => {
    const projectA = projectSpaceKey('proj-a')
    ensureConversationTab(projectA, 'conv-1')
    attachBrowserTabToSpace('bt-web', projectA, 'conv-1')

    const liveTabs = [
      {
        id: 'bt-web',
        url: 'https://example.com',
        title: 'Example',
        favicon: null,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        error: null
      },
      {
        id: 'bt-preview',
        url: 'tuff://preview?path=%2Frepo%2FREADME.md&conversationId=conv-1',
        title: '',
        favicon: null,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        error: null
      }
    ]

    syncBrowserTabsWithSpaces(liveTabs, (convId) => (convId === 'conv-1' ? projectA : null))

    expect(resolveBrowserTabSpaceKey(liveTabs[0]!)).toBe(projectA)
    expect(resolveBrowserTabSpaceKey(liveTabs[1]!)).toBe(projectA)
    expect(getSpaceTabs(projectA).map((t) => t.id)).toEqual([
      conversationTabId('conv-1'),
      spaceBrowserTabId('bt-web'),
      spaceBrowserTabId('bt-preview')
    ])

    // Closing bt-web from BrowserWorkspaceState prunes it from the space list automatically.
    syncBrowserTabsWithSpaces([liveTabs[1]!])
    expect(getSpaceTabs(projectA).map((t) => t.id)).toEqual([
      conversationTabId('conv-1'),
      spaceBrowserTabId('bt-preview')
    ])

    // Bulk close returns browser tab IDs that need sdk.closeTab cleanup.
    const bulk = closeSpaceTabsBulk(projectA, conversationTabId('conv-1'), 'close-others')
    expect(bulk.removedBrowserTabIds).toEqual(['bt-preview'])
    expect(getSpaceTabs(projectA).map((t) => t.id)).toEqual([conversationTabId('conv-1')])

    closeConversationTabEverywhere('conv-1')
    expect(getSpaceTabs(projectA)).toEqual([])
  })

  it('returns the adjacent tab when removing a tab in the middle of a Space list', () => {
    const projectA = projectSpaceKey('proj-a')
    ensureConversationTab(projectA, 'c1')
    ensureConversationTab(projectA, 'c2')
    ensureConversationTab(projectA, 'c3')

    const { removed, nextTab } = removeSpaceTab(projectA, conversationTabId('c2'))
    expect(removed?.id).toBe(conversationTabId('c2'))
    expect(nextTab?.id).toBe(conversationTabId('c3'))
  })

  it('evicts the oldest tab rather than dropping a newly opened tab at capacity', () => {
    const projectA = projectSpaceKey('proj-cap')
    for (let i = 1; i <= 25; i += 1) {
      ensureConversationTab(projectA, `c-${i}`)
    }
    const tabs = getSpaceTabs(projectA)
    expect(tabs).toHaveLength(24)
    expect(tabs[0]?.id).toBe(conversationTabId('c-2'))
    expect(tabs[tabs.length - 1]?.id).toBe(conversationTabId('c-25'))
  })
})
