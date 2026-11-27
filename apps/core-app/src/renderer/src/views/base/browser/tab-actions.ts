import type {
  BrowserSdk,
  BrowserTabState,
  BrowserWorkspaceState
} from '@talex-touch/utils/transport/sdk/domains/browser'

export type BrowserTabMenuAction =
  | 'reload'
  | 'duplicate'
  | 'close'
  | 'close-others'
  | 'close-left'
  | 'close-right'

export interface RunBrowserTabActionOptions {
  /** Restrict bulk-close actions to tabs visible in the current scope (e.g. standalone tabs). */
  filter?: (tab: BrowserTabState) => boolean
}

export async function runBrowserTabAction(
  sdk: BrowserSdk,
  action: BrowserTabMenuAction,
  tabId: string,
  options?: RunBrowserTabActionOptions
): Promise<BrowserWorkspaceState> {
  let state = await sdk.getState()
  const scopedTabs = options?.filter ? state.tabs.filter(options.filter) : state.tabs
  const index = scopedTabs.findIndex((tab) => tab.id === tabId)
  const target = scopedTabs[index]
  if (!target) throw new Error('BROWSER_TAB_NOT_FOUND')

  if (action === 'reload') return sdk.reload(target.id)
  if (action === 'duplicate') return sdk.createTab(target.url)
  if (action === 'close') return sdk.closeTab(target.id)

  const tabs =
    action === 'close-left'
      ? scopedTabs.slice(0, index)
      : action === 'close-right'
        ? scopedTabs.slice(index + 1)
        : scopedTabs.filter((tab) => tab.id !== target.id)
  if (tabs.length === 0) return state

  if (tabs.some((tab) => tab.id === state.activeTabId)) {
    state = await sdk.activateTab(target.id)
  }
  for (const tab of tabs) {
    state = await sdk.closeTab(tab.id)
  }
  return state
}
