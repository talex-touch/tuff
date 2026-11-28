import type {
  BrowserCreateTabResult,
  BrowserSavedPage,
  BrowserTabState,
  BrowserViewportRequest,
  BrowserWorkspaceState
} from '@talex-touch/utils/transport/sdk/domains/browser'
import type { BrowserWindow, Input, WebContentsView } from 'electron'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  clampBrowserViewport,
  isAllowedBrowserUrl,
  MAX_BROWSER_BOOKMARKS,
  MAX_BROWSER_RECENT,
  MAX_BROWSER_TABS,
  normalizeBrowserInput
} from './policy'

export interface BrowserPersistedWorkspace {
  tabs: Array<{ id: string; url: string; title: string }>
  activeTabId: string
  recent: BrowserSavedPage[]
  bookmarks: BrowserSavedPage[]
}

export const DEFAULT_MAX_WARM_GUESTS = 6
export const DEFAULT_IDLE_DISCARD_MS = 10 * 60 * 1000

export interface BrowserWorkspaceDependencies {
  owner: BrowserWindow
  createView: () => WebContentsView
  persist: (state: BrowserPersistedWorkspace) => Promise<void>
  notify: (state: BrowserWorkspaceState) => void
  notifySnapshot?: (tabId: string, snapshot: string) => void
  focusAddress?: () => void
  now?: () => number
  /** Maximum live background/foreground WebContentsView guests retained at once. */
  maxWarmGuests?: number
  /** Duration in ms before an inactive (or hidden) guest WebContentsView is discarded. */
  idleDiscardMs?: number
}

interface Guest {
  view: WebContentsView
  disposers: Array<() => void>
  generation: number
  attached: boolean
  lastActiveAt: number
}

const persistedTabSchema = z.object({
  id: z.string().regex(/^[a-z\d-]{1,128}$/i),
  url: z.string().refine((url) => url === '' || isAllowedBrowserUrl(url)),
  title: z.string().max(512).catch('')
})
const savedPageSchema = z.object({
  url: z.string().refine(isAllowedBrowserUrl),
  title: z.string().max(512).catch(''),
  favicon: z.string().refine(isAllowedBrowserUrl).nullable().catch(null),
  visitedAt: z.number().finite().catch(0)
})
const restoredWorkspaceSchema = z.object({
  tabs: z.array(z.unknown()).catch([]),
  activeTabId: z.string().catch(''),
  recent: z.array(z.unknown()).catch([]),
  bookmarks: z.array(z.unknown()).catch([])
})

function savedPages(value: unknown, limit: number): BrowserSavedPage[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const pages: BrowserSavedPage[] = []
  for (const candidate of value) {
    const result = savedPageSchema.safeParse(candidate)
    if (!result.success || seen.has(result.data.url)) continue
    const page = result.data
    seen.add(page.url)
    pages.push(page)
    if (pages.length === limit) break
  }
  return pages
}

export class BrowserWorkspaceManager {
  private readonly tabs: BrowserTabState[] = []
  private readonly guests = new Map<string, Guest>()
  private recent: BrowserSavedPage[] = []
  private bookmarks: BrowserSavedPage[] = []
  private activeTabId = ''
  private revision = 0
  private viewport: BrowserViewportRequest = {
    visible: false,
    bounds: { x: 0, y: 0, width: 0, height: 0 }
  }
  private writes: Promise<void> = Promise.resolve()
  private disposed = false
  private readonly ownerDisposers: Array<() => void> = []
  private readonly maxWarmGuests: number
  private readonly idleDiscardMs: number
  private discardTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly deps: BrowserWorkspaceDependencies,
    restored?: unknown
  ) {
    this.maxWarmGuests =
      typeof deps.maxWarmGuests === 'number' &&
      Number.isFinite(deps.maxWarmGuests) &&
      deps.maxWarmGuests >= 1
        ? Math.floor(deps.maxWarmGuests)
        : DEFAULT_MAX_WARM_GUESTS
    this.idleDiscardMs =
      typeof deps.idleDiscardMs === 'number' &&
      !Number.isNaN(deps.idleDiscardMs) &&
      deps.idleDiscardMs >= 0
        ? deps.idleDiscardMs
        : DEFAULT_IDLE_DISCARD_MS
    const result = restoredWorkspaceSchema.safeParse(restored)
    const value = result.success
      ? result.data
      : { tabs: [], activeTabId: '', recent: [], bookmarks: [] }
    if (Array.isArray(value.tabs)) {
      for (const candidate of value.tabs.slice(0, MAX_BROWSER_TABS)) {
        const result = persistedTabSchema.safeParse(candidate)
        if (!result.success || this.tabs.some((item) => item.id === result.data.id)) continue
        const tab = result.data
        this.tabs.push(this.blankTab(tab.id, tab.url, tab.title))
      }
    }
    if (!this.tabs.length) this.tabs.push(this.blankTab())
    this.activeTabId = this.tabs.find((tab) => tab.id === value.activeTabId)?.id ?? this.tabs[0]!.id
    this.recent = savedPages(value.recent, MAX_BROWSER_RECENT)
    this.bookmarks = savedPages(value.bookmarks, MAX_BROWSER_BOOKMARKS)
    const resize = () => this.refreshViewport()
    const reset = () => this.resetGuests()
    const navigation = (_event: unknown, _url: string, isInPlace: boolean, mainFrame: boolean) => {
      if (mainFrame && !isInPlace) this.resetGuests()
    }
    const destroy = () => {
      void this.dispose()
    }
    deps.owner.on('resize', resize)
    deps.owner.on('hide', resize)
    deps.owner.on('show', resize)
    deps.owner.on('closed', destroy)
    deps.owner.webContents.on('did-start-navigation', navigation)
    deps.owner.webContents.on('render-process-gone', reset)
    deps.owner.webContents.on('destroyed', destroy)
    this.ownerDisposers.push(
      () => deps.owner.removeListener('resize', resize),
      () => deps.owner.removeListener('hide', resize),
      () => deps.owner.removeListener('show', resize),
      () => deps.owner.removeListener('closed', destroy),
      () => deps.owner.webContents.removeListener('did-start-navigation', navigation),
      () => deps.owner.webContents.removeListener('render-process-gone', reset),
      () => deps.owner.webContents.removeListener('destroyed', destroy)
    )
  }

  private blankTab(id: string = randomUUID(), url = '', title = ''): BrowserTabState {
    return {
      id,
      url,
      // An internal page is named by the renderer from its URL, in the language the interface is in
      // now. A title kept here is persisted, and stayed in the language the tab was opened in.
      title: url.startsWith('tuff://') ? '' : title,
      favicon: null,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      error: null
    }
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  private clearDiscardTimer(): void {
    if (this.discardTimer !== null) {
      clearTimeout(this.discardTimer)
      this.discardTimer = null
    }
  }

  private isGuestIdleEligible(id: string): boolean {
    if (id !== this.activeTabId) return true
    return !this.viewport.visible || this.deps.owner.isDestroyed() || !this.deps.owner.isVisible()
  }

  private scheduleDiscardTimer(): void {
    this.clearDiscardTimer()
    if (
      this.disposed ||
      this.idleDiscardMs <= 0 ||
      !Number.isFinite(this.idleDiscardMs) ||
      this.guests.size === 0
    )
      return

    let earliestDeadline = Infinity
    for (const [id, guest] of this.guests) {
      if (!this.isGuestIdleEligible(id)) continue
      earliestDeadline = Math.min(earliestDeadline, guest.lastActiveAt + this.idleDiscardMs)
    }
    if (!Number.isFinite(earliestDeadline)) return

    const delay = Math.max(0, earliestDeadline - this.now())
    this.discardTimer = setTimeout(() => {
      this.discardTimer = null
      this.discardIdleGuests()
    }, delay)
    this.discardTimer.unref?.()
  }

  private discardGuest(id: string): { discarded: boolean; stateChanged: boolean } {
    const guest = this.guests.get(id)
    if (!guest) return { discarded: false, stateChanged: false }
    this.closeGuest(id)
    const tab = this.tabs.find((item) => item.id === id)
    let stateChanged = false
    if (tab) {
      stateChanged = tab.loading || tab.canGoBack || tab.canGoForward
      tab.loading = false
      tab.canGoBack = false
      tab.canGoForward = false
    }
    return { discarded: true, stateChanged }
  }

  private evictExcessGuests(): void {
    if (this.guests.size <= this.maxWarmGuests) return
    const candidates = Array.from(this.guests.entries())
      .filter(([id]) => id !== this.activeTabId)
      .sort(([idA, guestA], [idB, guestB]) => {
        const loadingA = this.tabs.find((item) => item.id === idA)?.loading ? 1 : 0
        const loadingB = this.tabs.find((item) => item.id === idB)?.loading ? 1 : 0
        if (loadingA !== loadingB) return loadingA - loadingB
        return guestA.lastActiveAt - guestB.lastActiveAt
      })

    let stateChanged = false
    for (const [id] of candidates) {
      if (this.guests.size <= this.maxWarmGuests) break
      const result = this.discardGuest(id)
      if (result.stateChanged) stateChanged = true
    }
    if (stateChanged) this.changed()
  }

  /** Discards any inactive (or long-hidden) guest views past the idle threshold. */
  discardIdleGuests(): number {
    if (this.disposed || this.idleDiscardMs <= 0 || !Number.isFinite(this.idleDiscardMs)) return 0
    const cutoff = this.now() - this.idleDiscardMs
    let count = 0
    let stateChanged = false
    for (const [id, guest] of Array.from(this.guests.entries())) {
      if (!this.isGuestIdleEligible(id)) continue
      if (guest.lastActiveAt <= cutoff) {
        const result = this.discardGuest(id)
        if (result.discarded) count += 1
        if (result.stateChanged) stateChanged = true
      }
    }
    if (stateChanged) this.changed()
    this.scheduleDiscardTimer()
    return count
  }

  /** Releases a background tab's WebContentsView immediately while keeping its tab entry. */
  discardTab(id: string): boolean {
    this.tab(id)
    if (!this.isGuestIdleEligible(id)) return false
    const result = this.discardGuest(id)
    if (result.stateChanged) this.changed()
    this.scheduleDiscardTimer()
    return result.discarded
  }

  getState(): BrowserWorkspaceState {
    return {
      revision: this.revision,
      tabs: this.tabs.map((tab) => ({ ...tab })),
      activeTabId: this.activeTabId,
      recent: this.recent.map((page) => ({ ...page })),
      bookmarks: this.bookmarks.map((page) => ({ ...page }))
    }
  }

  private changed(): void {
    this.revision += 1
    if (
      !this.disposed &&
      !this.deps.owner.isDestroyed() &&
      !this.deps.owner.webContents.isDestroyed()
    )
      this.deps.notify(this.getState())
  }

  private tab(id: string): BrowserTabState {
    if (this.disposed) throw new Error('BROWSER_DISPOSED')
    const tab = this.tabs.find((item) => item.id === id)
    if (!tab) throw new Error('BROWSER_TAB_NOT_FOUND')
    return tab
  }

  private persistedState(bookmarks = this.bookmarks): BrowserPersistedWorkspace {
    return {
      tabs: this.tabs.map(({ id, url, title }) => ({ id, url, title })),
      activeTabId: this.activeTabId,
      recent: this.recent.map((page) => ({ ...page })),
      bookmarks: bookmarks.map((page) => ({ ...page }))
    }
  }

  private persist(): Promise<void> {
    // Snapshot at execution: an earlier queued bookmark commit must not be overwritten by a
    // visit/navigation that was queued while that commit was still awaiting SQLite.
    const queued = this.writes.catch(() => {}).then(() => this.deps.persist(this.persistedState()))
    this.writes = queued
    return queued.catch(() => {
      const tab = this.tabs.find((item) => item.id === this.activeTabId)
      if (tab) tab.error = 'BROWSER_PERSIST_FAILED'
      this.changed()
      throw new Error('BROWSER_PERSIST_FAILED')
    })
  }

  async createTab(input = ''): Promise<BrowserCreateTabResult> {
    if (this.disposed) throw new Error('BROWSER_DISPOSED')
    if (this.tabs.length >= MAX_BROWSER_TABS) throw new Error('BROWSER_TAB_LIMIT')
    const url = normalizeBrowserInput(input)
    const tab = this.blankTab(randomUUID(), url)
    this.tabs.push(tab)
    this.activeTabId = tab.id
    this.refreshViewport()
    this.changed()
    await this.persist()
    return {
      ...this.getState(),
      createdTabId: tab.id
    }
  }

  async activateTab(id: string): Promise<BrowserWorkspaceState> {
    this.tab(id)
    this.activeTabId = id
    this.refreshViewport()
    this.changed()
    await this.persist()
    return this.getState()
  }

  async closeTab(id: string): Promise<BrowserWorkspaceState> {
    this.tab(id)
    const index = this.tabs.findIndex((tab) => tab.id === id)
    this.closeGuest(id)
    this.tabs.splice(index, 1)
    if (!this.tabs.length) this.tabs.push(this.blankTab())
    if (this.activeTabId === id)
      this.activeTabId = this.tabs[Math.min(index, this.tabs.length - 1)]!.id
    this.refreshViewport()
    this.changed()
    await this.persist()
    return this.getState()
  }

  async moveTab(id: string, beforeTabId: string | null): Promise<BrowserWorkspaceState> {
    const tab = this.tab(id)
    if (beforeTabId !== null && typeof beforeTabId !== 'string')
      throw new Error('BROWSER_TAB_NOT_FOUND')
    const sourceIndex = this.tabs.indexOf(tab)
    const beforeIndex =
      beforeTabId === null
        ? this.tabs.length
        : this.tabs.findIndex((item) => item.id === beforeTabId)
    if (beforeIndex < 0) throw new Error('BROWSER_TAB_NOT_FOUND')
    const destinationIndex = beforeIndex > sourceIndex ? beforeIndex - 1 : beforeIndex
    if (destinationIndex === sourceIndex) return this.getState()
    this.tabs.splice(sourceIndex, 1)
    this.tabs.splice(destinationIndex, 0, tab)
    this.changed()
    await this.persist()
    return this.getState()
  }

  async navigate(id: string, input: string): Promise<BrowserWorkspaceState> {
    const tab = this.tab(id)
    const url = normalizeBrowserInput(input)
    tab.url = url
    tab.error = null
    tab.favicon = null
    const isRemote = Boolean(url && (url.startsWith('https://') || url.startsWith('http://')))
    if (!isRemote) {
      this.closeGuest(id)
      if (!url) {
        Object.assign(tab, this.blankTab(id))
      }
    } else {
      const guest = this.guests.get(id)
      if (guest) {
        guest.lastActiveAt = this.now()
        this.load(tab, guest)
      }
    }
    this.refreshViewport()
    this.changed()
    await this.persist()
    return this.getState()
  }

  async back(id: string): Promise<BrowserWorkspaceState> {
    const tab = this.tab(id)
    const guest = this.guests.get(id)
    if (guest) guest.lastActiveAt = this.now()
    const wc = guest?.view.webContents
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
    this.updateHistory(tab)
    this.changed()
    return this.getState()
  }

  async forward(id: string): Promise<BrowserWorkspaceState> {
    const tab = this.tab(id)
    const guest = this.guests.get(id)
    if (guest) guest.lastActiveAt = this.now()
    const wc = guest?.view.webContents
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
    this.updateHistory(tab)
    this.changed()
    return this.getState()
  }

  async reload(id: string): Promise<BrowserWorkspaceState> {
    const tab = this.tab(id)
    tab.error = null
    const guest = this.guests.get(id)
    if (guest) {
      guest.lastActiveAt = this.now()
      guest.view.webContents.reload()
    } else this.refreshViewport()
    this.changed()
    return this.getState()
  }

  async stop(id: string): Promise<BrowserWorkspaceState> {
    const tab = this.tab(id)
    this.guests.get(id)?.view.webContents.stop()
    tab.loading = false
    this.changed()
    return this.getState()
  }

  async toggleBookmark(id: string): Promise<BrowserWorkspaceState> {
    const tab = this.tab(id)
    const isRemote = Boolean(
      tab.url && (tab.url.startsWith('https://') || tab.url.startsWith('http://'))
    )
    if (!isAllowedBrowserUrl(tab.url) || !isRemote) throw new Error('BROWSER_BOOKMARK_INVALID')
    const page = {
      url: tab.url,
      title: tab.title,
      favicon: tab.favicon,
      visitedAt: (this.deps.now ?? Date.now)()
    }
    const queued = this.writes
      .catch(() => {})
      .then(async () => {
        const index = this.bookmarks.findIndex((bookmark) => bookmark.url === page.url)
        if (index < 0 && this.bookmarks.length >= MAX_BROWSER_BOOKMARKS)
          throw new Error('BROWSER_BOOKMARK_LIMIT')
        const bookmarks =
          index >= 0
            ? this.bookmarks.filter((bookmark) => bookmark.url !== page.url)
            : [page, ...this.bookmarks]
        try {
          await this.deps.persist(this.persistedState(bookmarks))
        } catch {
          const active = this.tabs.find((item) => item.id === this.activeTabId)
          if (active) active.error = 'BROWSER_PERSIST_FAILED'
          this.changed()
          throw new Error('BROWSER_PERSIST_FAILED')
        }
        // Publish only after the durable write succeeds. Later toggles are on this same queue,
        // so a failed write cannot roll back a newer toggle or a concurrent recorded visit.
        this.bookmarks = bookmarks
        this.changed()
      })
    this.writes = queued
    await queued
    return this.getState()
  }

  async captureSnapshot(tabId?: string): Promise<string | null> {
    const id = tabId ?? this.activeTabId
    const guest = this.guests.get(id)
    if (!guest || guest.view.webContents.isDestroyed()) return null
    try {
      const image = await guest.view.webContents.capturePage()
      if (image.isEmpty()) return null
      return `data:image/jpeg;base64,${image.toJPEG(82).toString('base64')}`
    } catch {
      return null
    }
  }

  setViewport(request: BrowserViewportRequest): void {
    if (this.disposed) throw new Error('BROWSER_DISPOSED')
    const [width, height] = this.deps.owner.getContentSize()
    clampBrowserViewport(request, { width, height })
    if (!request.visible && this.viewport.visible) {
      const activeGuest = this.guests.get(this.activeTabId)
      if (activeGuest) activeGuest.lastActiveAt = this.now()
      if (this.deps.notifySnapshot) {
        const activeId = this.activeTabId
        void this.captureSnapshot(activeId).then((snapshot) => {
          if (
            !this.disposed &&
            this.tabs.some((item) => item.id === activeId) &&
            snapshot &&
            this.deps.notifySnapshot
          ) {
            this.deps.notifySnapshot(activeId, snapshot)
          }
        })
      }
    }
    this.viewport = { visible: request.visible, bounds: { ...request.bounds } }
    this.refreshViewport()
  }

  refreshViewport(): void {
    if (this.disposed || this.deps.owner.isDestroyed()) return
    const [width, height] = this.deps.owner.getContentSize()
    const bounds = clampBrowserViewport(this.viewport, { width, height })
    const tab = this.tabs.find((item) => item.id === this.activeTabId)
    const isRemote = Boolean(
      tab?.url && (tab.url.startsWith('https://') || tab.url.startsWith('http://'))
    )
    if (bounds && this.deps.owner.isVisible() && isRemote && !this.guests.has(tab!.id))
      this.createGuest(tab!)
    const currentNow = this.now()
    for (const [id, guest] of this.guests) {
      const visible = Boolean(
        bounds && this.deps.owner.isVisible() && id === this.activeTabId && isRemote
      )
      if (visible && bounds) {
        guest.lastActiveAt = currentNow
        guest.view.setBounds(bounds)
        if (!guest.attached) {
          this.deps.owner.contentView.addChildView(guest.view)
          guest.attached = true
        }
      }
      guest.view.setVisible(visible)
      if (!visible && guest.attached) {
        guest.lastActiveAt = currentNow
        this.deps.owner.contentView.removeChildView(guest.view)
        guest.attached = false
      }
    }
    this.evictExcessGuests()
    this.scheduleDiscardTimer()
  }

  private updateHistory(tab: BrowserTabState): void {
    const wc = this.guests.get(tab.id)?.view.webContents
    tab.canGoBack = Boolean(wc && !wc.isDestroyed() && wc.navigationHistory.canGoBack())
    tab.canGoForward = Boolean(wc && !wc.isDestroyed() && wc.navigationHistory.canGoForward())
  }

  private createGuest(tab: BrowserTabState): void {
    const view = this.deps.createView()
    view.setVisible(false)
    const wc = view.webContents
    const guest: Guest = {
      view,
      disposers: [],
      generation: 0,
      attached: false,
      lastActiveAt: this.now()
    }
    this.guests.set(tab.id, guest)
    const on = <Args extends unknown[]>(event: string, listener: (...args: Args) => void) => {
      wc.on(event as never, listener)
      guest.disposers.push(() => wc.removeListener(event as never, listener))
    }
    const current = () => !this.disposed && this.guests.get(tab.id) === guest && !wc.isDestroyed()
    const block = (event: { preventDefault: () => void }, url: string) => {
      if (!isAllowedBrowserUrl(url)) {
        event.preventDefault()
        tab.error = 'BROWSER_URL_BLOCKED'
        this.changed()
      }
    }
    on('will-navigate', block)
    on('will-redirect', block)
    on('will-frame-navigate', (event: { url: string; preventDefault: () => void }) =>
      block(event, event.url)
    )
    on('will-attach-webview', (event: { preventDefault: () => void }) => event.preventDefault())
    wc.setWindowOpenHandler(({ url }) => {
      if (current() && isAllowedBrowserUrl(url))
        void this.createTab(url).catch(() => {
          if (current()) {
            tab.error = 'BROWSER_POPUP_FAILED'
            this.changed()
          }
        })
      return { action: 'deny' }
    })
    on('did-start-loading', () => {
      if (current()) {
        tab.loading = true
        tab.error = null
        this.changed()
      }
    })
    on('did-stop-loading', () => {
      if (current()) {
        tab.loading = false
        this.updateHistory(tab)
        this.changed()
        if (this.deps.notifySnapshot) {
          void this.captureSnapshot(tab.id).then((snapshot) => {
            if (snapshot && current() && this.deps.notifySnapshot) {
              this.deps.notifySnapshot(tab.id, snapshot)
            }
          })
        }
      }
    })
    on('page-title-updated', (_event: unknown, title: string) => {
      if (current()) {
        tab.title = title.slice(0, 512)
        this.changed()
      }
    })
    on('page-favicon-updated', (_event: unknown, favicons: string[]) => {
      if (current()) {
        tab.favicon = favicons.find(isAllowedBrowserUrl) ?? null
        this.changed()
      }
    })
    on('before-input-event', (event: { preventDefault: () => void }, input: Input) => {
      if (
        !current() ||
        tab.id !== this.activeTabId ||
        input.type !== 'keyDown' ||
        input.isAutoRepeat
      )
        return
      const key = input.key.toLowerCase()
      const code = typeof input.code === 'string' ? input.code : ''
      const isMac = process.platform === 'darwin'
      const hasPrimaryModifier = isMac ? input.meta && !input.control : input.control && !input.meta
      const command = hasPrimaryModifier && !input.alt && !input.shift
      const commandWithOptionalShift = hasPrimaryModifier && !input.alt
      const previousActiveId = this.activeTabId
      let action: Promise<BrowserWorkspaceState> | undefined
      if (command && (code === 'KeyL' || key === 'l') && this.deps.focusAddress) {
        event.preventDefault()
        if (!this.deps.owner.isDestroyed() && !this.deps.owner.webContents.isDestroyed()) {
          this.deps.owner.webContents.focus()
        }
        this.deps.focusAddress()
        return
      }
      if (command && (code === 'KeyT' || key === 't')) action = this.createTab()
      else if (command && (code === 'KeyW' || key === 'w')) action = this.closeTab(tab.id)
      else if (commandWithOptionalShift && (code === 'KeyR' || key === 'r'))
        action = this.reload(tab.id)
      else if (
        (isMac && command && (code === 'BracketLeft' || key === '[')) ||
        (input.alt &&
          !input.meta &&
          !input.control &&
          !input.shift &&
          (code === 'ArrowLeft' || key === 'arrowleft'))
      )
        action = this.back(tab.id)
      else if (
        (isMac && command && (code === 'BracketRight' || key === ']')) ||
        (input.alt &&
          !input.meta &&
          !input.control &&
          !input.shift &&
          (code === 'ArrowRight' || key === 'arrowright'))
      )
        action = this.forward(tab.id)
      if (action) {
        event.preventDefault()
        const isTabSwitch =
          command && (code === 'KeyT' || key === 't' || code === 'KeyW' || key === 'w')
        if (isTabSwitch && this.activeTabId !== previousActiveId) {
          const active = this.tabs.find((item) => item.id === this.activeTabId)
          const activeGuest = active ? this.guests.get(active.id) : undefined
          if (active && (!active.url || !activeGuest)) {
            if (!this.deps.owner.isDestroyed() && !this.deps.owner.webContents.isDestroyed()) {
              this.deps.owner.webContents.focus()
            }
            if (!active.url) this.deps.focusAddress?.()
          } else if (activeGuest && !activeGuest.view.webContents.isDestroyed()) {
            activeGuest.view.webContents.focus()
          }
        }
        void action.catch((failure: unknown) => {
          if (this.disposed) return
          const active = this.tabs.find((item) => item.id === this.activeTabId)
          if (active && !active.error) {
            active.error =
              failure instanceof Error && /^BROWSER_[A-Z_]+$/.test(failure.message)
                ? failure.message
                : 'BROWSER_COMMAND_FAILED'
            this.changed()
          }
        })
      }
    })
    const navigated = (_event: unknown, url: string) => {
      if (current() && isAllowedBrowserUrl(url)) {
        tab.url = url
        tab.error = null
        this.updateHistory(tab)
        this.changed()
      }
    }
    on('did-navigate', navigated)
    on('did-navigate-in-page', (event: unknown, url: string, mainFrame: boolean) => {
      if (!mainFrame || !current() || !isAllowedBrowserUrl(url)) return
      navigated(event, url)
      this.recordVisit(tab)
    })
    on('did-finish-load', () => {
      if (!current() || !isAllowedBrowserUrl(wc.getURL())) return
      tab.url = wc.getURL()
      tab.title = wc.getTitle().slice(0, 512)
      tab.loading = false
      tab.error = null
      this.updateHistory(tab)
      this.recordVisit(tab)
    })
    on(
      'did-fail-load',
      (_event: unknown, code: number, _description: string, url: string, mainFrame: boolean) => {
        if (current() && mainFrame && code !== -3 && url === tab.url) {
          tab.loading = false
          tab.error = 'BROWSER_LOAD_FAILED'
          this.changed()
        }
      }
    )
    on('render-process-gone', () => {
      if (current()) {
        this.closeGuest(tab.id)
        tab.loading = false
        tab.error = 'BROWSER_RENDERER_GONE'
        this.changed()
      }
    })
    on('destroyed', () => {
      if (this.guests.get(tab.id) === guest) {
        this.closeGuest(tab.id)
        tab.loading = false
        tab.error = 'BROWSER_RENDERER_GONE'
        this.changed()
      }
    })
    this.load(tab, guest)
  }

  private recordVisit(tab: BrowserTabState): void {
    this.recent = [
      {
        url: tab.url,
        title: tab.title,
        favicon: tab.favicon,
        visitedAt: (this.deps.now ?? Date.now)()
      },
      ...this.recent.filter((page) => page.url !== tab.url)
    ].slice(0, MAX_BROWSER_RECENT)
    this.changed()
    void this.persist().catch(() => {})
  }

  private load(tab: BrowserTabState, guest: Guest): void {
    const generation = ++guest.generation
    tab.loading = true
    tab.error = null
    void guest.view.webContents.loadURL(tab.url).catch((error: unknown) => {
      if (
        this.disposed ||
        this.guests.get(tab.id) !== guest ||
        generation !== guest.generation ||
        (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_ABORTED')
      )
        return
      tab.loading = false
      tab.error = 'BROWSER_LOAD_FAILED'
      this.changed()
    })
  }

  private closeGuest(id: string): void {
    const guest = this.guests.get(id)
    if (!guest) return
    this.guests.delete(id)
    guest.generation += 1
    for (const dispose of guest.disposers) dispose()
    guest.disposers.length = 0
    guest.view.setVisible(false)
    if (guest.attached && !this.deps.owner.isDestroyed())
      this.deps.owner.contentView.removeChildView(guest.view)
    guest.attached = false
    if (!guest.view.webContents.isDestroyed())
      guest.view.webContents.close({ waitForBeforeUnload: false })
  }

  resetGuests(): void {
    this.clearDiscardTimer()
    this.viewport.visible = false
    for (const id of Array.from(this.guests.keys())) this.closeGuest(id)
    for (const tab of this.tabs) {
      tab.loading = false
      tab.canGoBack = false
      tab.canGoForward = false
    }
    this.changed()
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.clearDiscardTimer()
    for (const dispose of this.ownerDisposers) dispose()
    this.ownerDisposers.length = 0
    for (const id of Array.from(this.guests.keys())) this.closeGuest(id)
    await this.writes.catch(() => {})
  }
}
