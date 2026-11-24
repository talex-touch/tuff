import type { ITuffTransport } from '../../types'
import { defineEvent } from '../../event/builder'

export interface BrowserTabState {
  id: string
  /** Empty for the local new-tab page; remote pages are HTTP(S) only. */
  url: string
  title: string
  favicon: string | null
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: string | null
}

export interface BrowserSavedPage {
  url: string
  title: string
  favicon: string | null
  visitedAt: number
}

export interface BrowserWorkspaceState {
  /** Monotonic within the owning main-process session. */
  revision: number
  tabs: BrowserTabState[]
  activeTabId: string
  recent: BrowserSavedPage[]
  bookmarks: BrowserSavedPage[]
}

export interface BrowserViewportRequest {
  /** Main-window content coordinates, in device-independent pixels. */
  bounds: { x: number, y: number, width: number, height: number }
  visible: boolean
}

export interface BrowserSideState {
  revision: number
  url: string
  title: string
  favicon: string | null
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  error: string | null
}

const api = defineEvent('browser').module('workspace')
const sideApi = defineEvent('browser').module('side')

export const BrowserEvents = {
  getState: api.event('get').define<void, BrowserWorkspaceState>(),
  createTab: api.event('create-tab').define<{ input?: string }, BrowserWorkspaceState>(),
  activateTab: api.event('activate-tab').define<{ tabId: string }, BrowserWorkspaceState>(),
  closeTab: api.event('close-tab').define<{ tabId: string }, BrowserWorkspaceState>(),
  moveTab: api.event('move-tab').define<{ tabId: string, beforeTabId: string | null }, BrowserWorkspaceState>(),
  navigate: api.event('navigate').define<{ tabId: string, input: string }, BrowserWorkspaceState>(),
  back: api.event('back').define<{ tabId: string }, BrowserWorkspaceState>(),
  forward: api.event('forward').define<{ tabId: string }, BrowserWorkspaceState>(),
  reload: api.event('reload').define<{ tabId: string }, BrowserWorkspaceState>(),
  stop: api.event('stop').define<{ tabId: string }, BrowserWorkspaceState>(),
  setViewport: api.event('set-viewport').define<BrowserViewportRequest, void>(),
  captureSnapshot: api.event('capture-snapshot').define<{ tabId?: string }, { snapshot: string | null }>(),
  toggleBookmark: api.event('toggle-bookmark').define<{ tabId: string }, BrowserWorkspaceState>(),
  changed: defineEvent('browser').module('push').event('changed').define<BrowserWorkspaceState, void>(),
  snapshot: defineEvent('browser').module('push').event('snapshot').define<{ tabId: string, snapshot: string }, void>(),
  focusAddress: defineEvent('browser').module('push').event('focus-address').define<void, void>(),
  sideGetState: sideApi.event('get').define<void, BrowserSideState>(),
  sideNavigate: sideApi.event('navigate').define<{ input: string }, BrowserSideState>(),
  sideBack: sideApi.event('back').define<void, BrowserSideState>(),
  sideForward: sideApi.event('forward').define<void, BrowserSideState>(),
  sideReload: sideApi.event('reload').define<void, BrowserSideState>(),
  sideStop: sideApi.event('stop').define<void, BrowserSideState>(),
  sideSetViewport: sideApi.event('set-viewport').define<BrowserViewportRequest, void>(),
  sideCaptureSnapshot: sideApi.event('capture-snapshot').define<void, { snapshot: string | null }>(),
  sideClose: sideApi.event('close').define<void, BrowserSideState>(),
  sideChanged: defineEvent('browser').module('push').event('side-changed').define<BrowserSideState, void>(),
  sideSnapshot: defineEvent('browser').module('push').event('side-snapshot').define<{ snapshot: string }, void>(),
} as const

export interface BrowserSdk {
  getState: () => Promise<BrowserWorkspaceState>
  createTab: (input?: string) => Promise<BrowserWorkspaceState>
  activateTab: (tabId: string) => Promise<BrowserWorkspaceState>
  closeTab: (tabId: string) => Promise<BrowserWorkspaceState>
  moveTab: (tabId: string, beforeTabId: string | null) => Promise<BrowserWorkspaceState>
  navigate: (tabId: string, input: string) => Promise<BrowserWorkspaceState>
  back: (tabId: string) => Promise<BrowserWorkspaceState>
  forward: (tabId: string) => Promise<BrowserWorkspaceState>
  reload: (tabId: string) => Promise<BrowserWorkspaceState>
  stop: (tabId: string) => Promise<BrowserWorkspaceState>
  setViewport: (request: BrowserViewportRequest) => Promise<void>
  captureSnapshot: (tabId?: string) => Promise<{ snapshot: string | null }>
  toggleBookmark: (tabId: string) => Promise<BrowserWorkspaceState>
  onChanged: (listener: (state: BrowserWorkspaceState) => void) => () => void
  onSnapshot: (listener: (payload: { tabId: string, snapshot: string }) => void) => () => void
  onFocusAddress: (listener: () => void) => () => void
  sideGetState: () => Promise<BrowserSideState>
  sideNavigate: (input: string) => Promise<BrowserSideState>
  sideBack: () => Promise<BrowserSideState>
  sideForward: () => Promise<BrowserSideState>
  sideReload: () => Promise<BrowserSideState>
  sideStop: () => Promise<BrowserSideState>
  sideSetViewport: (request: BrowserViewportRequest) => Promise<void>
  sideCaptureSnapshot: () => Promise<{ snapshot: string | null }>
  sideClose: () => Promise<BrowserSideState>
  onSideChanged: (listener: (state: BrowserSideState) => void) => () => void
  onSideSnapshot: (listener: (payload: { snapshot: string }) => void) => () => void
}

export function createBrowserSdk(transport: Pick<ITuffTransport, 'send' | 'on'>): BrowserSdk {
  return {
    getState: () => transport.send(BrowserEvents.getState),
    createTab: input => transport.send(BrowserEvents.createTab, input ? { input } : {}),
    activateTab: tabId => transport.send(BrowserEvents.activateTab, { tabId }),
    closeTab: tabId => transport.send(BrowserEvents.closeTab, { tabId }),
    moveTab: (tabId, beforeTabId) => transport.send(BrowserEvents.moveTab, { tabId, beforeTabId }),
    navigate: (tabId, input) => transport.send(BrowserEvents.navigate, { tabId, input }),
    back: tabId => transport.send(BrowserEvents.back, { tabId }),
    forward: tabId => transport.send(BrowserEvents.forward, { tabId }),
    reload: tabId => transport.send(BrowserEvents.reload, { tabId }),
    stop: tabId => transport.send(BrowserEvents.stop, { tabId }),
    setViewport: request => transport.send(BrowserEvents.setViewport, request),
    captureSnapshot: tabId => transport.send(BrowserEvents.captureSnapshot, { tabId }),
    toggleBookmark: tabId => transport.send(BrowserEvents.toggleBookmark, { tabId }),
    onChanged: listener => transport.on(BrowserEvents.changed, listener),
    onSnapshot: listener => transport.on(BrowserEvents.snapshot, listener),
    onFocusAddress: listener => transport.on(BrowserEvents.focusAddress, listener),
    sideGetState: () => transport.send(BrowserEvents.sideGetState),
    sideNavigate: input => transport.send(BrowserEvents.sideNavigate, { input }),
    sideBack: () => transport.send(BrowserEvents.sideBack),
    sideForward: () => transport.send(BrowserEvents.sideForward),
    sideReload: () => transport.send(BrowserEvents.sideReload),
    sideStop: () => transport.send(BrowserEvents.sideStop),
    sideSetViewport: request => transport.send(BrowserEvents.sideSetViewport, request),
    sideCaptureSnapshot: () => transport.send(BrowserEvents.sideCaptureSnapshot),
    sideClose: () => transport.send(BrowserEvents.sideClose),
    onSideChanged: listener => transport.on(BrowserEvents.sideChanged, listener),
    onSideSnapshot: listener => transport.on(BrowserEvents.sideSnapshot, listener),
  }
}
