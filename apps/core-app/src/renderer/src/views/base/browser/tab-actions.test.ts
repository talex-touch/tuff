import type {
  BrowserSdk,
  BrowserTabState,
  BrowserWorkspaceState
} from '@talex-touch/utils/transport/sdk/domains/browser'
import type { BrowserTabMenuAction } from './tab-actions'
import { describe, expect, it } from 'vitest'
import { runBrowserTabAction } from './tab-actions'

function createWorkspace(
  ids: string[],
  activeTabId: string,
  options: { blankTabId?: string; closeFailure?: { tabId: string; error: Error } } = {}
): BrowserSdk {
  const tab = (id: string, url = `https://${id}.example/`): BrowserTabState => ({
    id,
    url,
    title: id,
    favicon: null,
    loading: false,
    canGoBack: false,
    canGoForward: false,
    error: null
  })
  const state: BrowserWorkspaceState = {
    revision: 0,
    tabs: ids.map((id) => tab(id, id === options.blankTabId ? '' : undefined)),
    activeTabId,
    recent: [],
    bookmarks: []
  }
  const listeners = new Set<(state: BrowserWorkspaceState) => void>()
  let created = 0
  let closeFailure = options.closeFailure
  const snapshot = () => structuredClone(state)
  const requireTab = (id: string) => {
    const match = state.tabs.find((candidate) => candidate.id === id)
    if (!match) throw new Error('BROWSER_TAB_NOT_FOUND')
    return match
  }
  const changed = () => {
    state.revision += 1
    for (const listener of listeners) listener(snapshot())
    return snapshot()
  }
  const unsupported = (): never => {
    throw new Error('Unexpected browser command')
  }

  return {
    getState: async () => snapshot(),
    createTab: async (input = '') => {
      const createdTab = tab(`created-${++created}`, input)
      state.tabs.push(createdTab)
      state.activeTabId = createdTab.id
      return changed()
    },
    activateTab: async (id) => {
      requireTab(id)
      state.activeTabId = id
      return changed()
    },
    closeTab: async (id) => {
      requireTab(id)
      const index = state.tabs.findIndex((candidate) => candidate.id === id)
      state.tabs.splice(index, 1)
      if (!state.tabs.length) state.tabs.push(tab(`created-${++created}`, ''))
      if (state.activeTabId === id) {
        state.activeTabId = state.tabs[Math.min(index, state.tabs.length - 1)]!.id
      }
      const result = changed()
      // Persistence can reject after the main process has already removed the tab.
      if (closeFailure?.tabId === id) {
        const { error } = closeFailure
        closeFailure = undefined
        throw error
      }
      return result
    },
    reload: async (id) => {
      requireTab(id).loading = true
      return changed()
    },
    onChanged: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    navigate: unsupported,
    moveTab: unsupported,
    back: unsupported,
    forward: unsupported,
    stop: unsupported,
    setViewport: unsupported,
    captureSnapshot: unsupported,
    toggleBookmark: unsupported,
    onSnapshot: unsupported,
    onFocusAddress: unsupported,
    sideGetState: unsupported,
    sideNavigate: unsupported,
    sideBack: unsupported,
    sideForward: unsupported,
    sideReload: unsupported,
    sideStop: unsupported,
    sideSetViewport: unsupported,
    sideCaptureSnapshot: unsupported,
    sideClose: unsupported,
    onSideChanged: unsupported,
    onSideSnapshot: unsupported
  }
}

function observe(sdk: BrowserSdk) {
  const changes: BrowserWorkspaceState[] = []
  sdk.onChanged((state) => changes.push(state))
  return changes
}

const orderedTabs = ['left-1', 'left-2', 'anchor', 'right-1', 'right-2']

const bulkCases: Array<{
  action: BrowserTabMenuAction
  active: string
  remaining: string[]
  expectedActive: string
}> = [
  {
    action: 'close-left',
    active: 'right-2',
    remaining: ['anchor', 'right-1', 'right-2'],
    expectedActive: 'right-2'
  },
  {
    action: 'close-left',
    active: 'left-1',
    remaining: ['anchor', 'right-1', 'right-2'],
    expectedActive: 'anchor'
  },
  {
    action: 'close-right',
    active: 'left-1',
    remaining: ['left-1', 'left-2', 'anchor'],
    expectedActive: 'left-1'
  },
  {
    action: 'close-right',
    active: 'right-2',
    remaining: ['left-1', 'left-2', 'anchor'],
    expectedActive: 'anchor'
  },
  {
    action: 'close-others',
    active: 'anchor',
    remaining: ['anchor'],
    expectedActive: 'anchor'
  },
  {
    action: 'close-others',
    active: 'right-1',
    remaining: ['anchor'],
    expectedActive: 'anchor'
  }
]

const actions: BrowserTabMenuAction[] = [
  'reload',
  'duplicate',
  'close',
  'close-others',
  'close-left',
  'close-right'
]

describe('browser tab context actions', () => {
  it('reloads the background target without reloading or activating the foreground tab', async () => {
    const sdk = createWorkspace(['foreground', 'anchor'], 'foreground')

    const result = await runBrowserTabAction(sdk, 'reload', 'anchor')

    expect(result.tabs.map(({ id, loading }) => ({ id, loading }))).toEqual([
      { id: 'foreground', loading: false },
      { id: 'anchor', loading: true }
    ])
    expect(result.activeTabId).toBe('foreground')
    expect(await sdk.getState()).toEqual(result)
  })

  it.each([
    { name: 'remote page', blankTabId: undefined, expectedUrl: 'https://anchor.example/' },
    { name: 'local new-tab page', blankTabId: 'anchor', expectedUrl: '' }
  ])(
    'duplicates the background $name rather than the active page',
    async ({ blankTabId, expectedUrl }) => {
      const sdk = createWorkspace(['foreground', 'anchor'], 'foreground', { blankTabId })
      const before = await sdk.getState()

      const result = await runBrowserTabAction(sdk, 'duplicate', 'anchor')

      expect(result.tabs.slice(0, 2)).toEqual(before.tabs)
      expect(result.tabs.map(({ id, url }) => ({ id, url }))).toEqual([
        { id: 'foreground', url: 'https://foreground.example/' },
        { id: 'anchor', url: expectedUrl },
        { id: 'created-1', url: expectedUrl }
      ])
      expect(result.activeTabId).toBe('created-1')
      expect(await sdk.getState()).toEqual(result)
    }
  )

  it('closes the background target and leaves the active page untouched', async () => {
    const sdk = createWorkspace(['foreground', 'anchor', 'neighbor'], 'foreground')
    const before = await sdk.getState()
    const changes = observe(sdk)

    const result = await runBrowserTabAction(sdk, 'close', 'anchor')

    expect(result.tabs).toEqual([before.tabs[0], before.tabs[2]])
    expect(result.activeTabId).toBe('foreground')
    expect(changes.map((state) => state.activeTabId)).toEqual(['foreground'])
    expect(await sdk.getState()).toEqual(result)
  })

  it.each(bulkCases)(
    '$action with active $active preserves the exact range and never activates an unrelated page',
    async ({ action, active, remaining, expectedActive }) => {
      const sdk = createWorkspace(orderedTabs, active)
      const changes = observe(sdk)

      const result = await runBrowserTabAction(sdk, action, 'anchor')

      expect(result.tabs.map((tab) => tab.id)).toEqual(remaining)
      expect(result.activeTabId).toBe(expectedActive)
      // Observe every published transition, not just the final selection: moving to the
      // anchor after closing the active tab would briefly load an unrelated guest.
      for (const state of changes) {
        expect(state.activeTabId).toBe(expectedActive)
      }
      expect(await sdk.getState()).toEqual(result)
    }
  )

  it.each([
    { action: 'close-left' as const, ids: ['anchor', 'other'], active: 'other' },
    { action: 'close-right' as const, ids: ['other', 'anchor'], active: 'other' },
    { action: 'close-others' as const, ids: ['anchor'], active: 'anchor' }
  ])(
    '$action at an empty boundary does not change the workspace',
    async ({ action, ids, active }) => {
      const sdk = createWorkspace(ids, active)
      const before = await sdk.getState()
      const changes = observe(sdk)

      expect(await runBrowserTabAction(sdk, action, 'anchor')).toEqual(before)
      expect(await sdk.getState()).toEqual(before)
      expect(changes).toEqual([])
    }
  )

  it.each(actions)(
    '%s rejects a target closed since the menu opened without touching the active tab',
    async (action) => {
      const sdk = createWorkspace(['foreground', 'anchor', 'neighbor'], 'foreground')
      await sdk.closeTab('anchor')
      const before = await sdk.getState()
      const changes = observe(sdk)

      await expect(runBrowserTabAction(sdk, action, 'anchor')).rejects.toThrow(
        'BROWSER_TAB_NOT_FOUND'
      )

      expect(await sdk.getState()).toEqual(before)
      expect(changes).toEqual([])
    }
  )

  it('propagates a partial close failure and retries from current state without closing removed IDs again', async () => {
    const error = new Error('BROWSER_PERSIST_FAILED')
    const sdk = createWorkspace(orderedTabs, 'right-2', {
      closeFailure: { tabId: 'left-2', error }
    })

    await expect(runBrowserTabAction(sdk, 'close-others', 'anchor')).rejects.toBe(error)

    const partial = await sdk.getState()
    expect(partial.tabs.map((tab) => tab.id)).toEqual(['anchor', 'right-1', 'right-2'])
    expect(partial.activeTabId).toBe('anchor')

    const result = await runBrowserTabAction(sdk, 'close-others', 'anchor')

    expect(result.tabs).toEqual([partial.tabs[0]])
    expect(result.activeTabId).toBe('anchor')
    expect(await sdk.getState()).toEqual(result)
  })
})
