import type {
  BrowserSideState,
  BrowserViewportRequest
} from '@talex-touch/utils/transport/sdk/domains/browser'
import type { BrowserWindow, WebContentsView } from 'electron'
import {
  clampBrowserViewport,
  isAllowedBrowserUrl,
  isRemoteWebUrl,
  normalizeBrowserInput
} from './policy'

export interface SideBrowserDependencies {
  owner: BrowserWindow
  createView: () => WebContentsView
  notify: (state: BrowserSideState) => void
  notifySnapshot?: (snapshot: string) => void
}

interface ActiveGuest {
  view: WebContentsView
  disposers: Array<() => void>
  attached: boolean
  generation: number
}

/**
 * Owns at most one on-demand WebContentsView for the Home right-sidebar browser pane.
 *
 * Nothing is allocated until a user opens a web URL inside the right sidebar, and closing the
 * pane or tearing down the owner destroys the view immediately so no hidden Chromium guest lingers.
 */
export class SideBrowserManager {
  private guest: ActiveGuest | null = null
  private revision = 0
  private url = ''
  private title = ''
  private favicon: string | null = null
  private loading = false
  private canGoBack = false
  private canGoForward = false
  private error: string | null = null
  private disposed = false
  private viewport: BrowserViewportRequest = {
    visible: false,
    bounds: { x: 0, y: 0, width: 0, height: 0 }
  }
  private readonly ownerDisposers: Array<() => void> = []

  constructor(private readonly deps: SideBrowserDependencies) {
    const resize = () => this.refreshViewport()
    const reset = () => {
      this.viewport = { visible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } }
      this.destroyGuest()
    }
    const navigation = (_event: unknown, _url: string, isInPlace: boolean, mainFrame: boolean) => {
      if (mainFrame && !isInPlace) reset()
    }
    const destroy = () => {
      this.dispose()
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

  getState(): BrowserSideState {
    return {
      revision: this.revision,
      url: this.url,
      title: this.title,
      favicon: this.favicon,
      loading: this.loading,
      canGoBack: this.canGoBack,
      canGoForward: this.canGoForward,
      error: this.error
    }
  }

  private changed(): void {
    this.revision += 1
    if (!this.disposed) this.deps.notify(this.getState())
  }

  private updateHistory(): void {
    const wc = this.guest?.view.webContents
    this.canGoBack = Boolean(wc && !wc.isDestroyed() && wc.navigationHistory.canGoBack())
    this.canGoForward = Boolean(wc && !wc.isDestroyed() && wc.navigationHistory.canGoForward())
  }

  private ensureGuest(): ActiveGuest {
    if (this.guest && !this.guest.view.webContents.isDestroyed()) {
      return this.guest
    }
    this.destroyGuest()
    const view = this.deps.createView()
    view.setVisible(false)
    const wc = view.webContents
    const guest: ActiveGuest = {
      view,
      disposers: [],
      attached: false,
      generation: 0
    }
    this.guest = guest

    const isCurrent = () => !this.disposed && this.guest === guest && !wc.isDestroyed()
    const on = <Args extends unknown[]>(event: string, listener: (...args: Args) => void) => {
      wc.on(event as never, listener)
      guest.disposers.push(() => wc.removeListener(event as never, listener))
    }

    const block = (event: { preventDefault: () => void }, targetUrl: string) => {
      if (!isAllowedBrowserUrl(targetUrl) || !isRemoteWebUrl(targetUrl)) {
        event.preventDefault()
        this.error = 'BROWSER_URL_BLOCKED'
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
      if (isCurrent() && isAllowedBrowserUrl(url) && isRemoteWebUrl(url)) {
        void this.navigate(url)
      }
      return { action: 'deny' }
    })

    on('did-start-loading', () => {
      if (!isCurrent()) return
      this.loading = true
      this.error = null
      this.changed()
    })

    on('did-stop-loading', () => {
      if (!isCurrent()) return
      this.loading = false
      this.updateHistory()
      this.changed()
      if (this.deps.notifySnapshot) {
        void this.captureSnapshot().then((snapshot) => {
          if (snapshot && isCurrent() && this.deps.notifySnapshot) {
            this.deps.notifySnapshot(snapshot)
          }
        })
      }
    })

    on('did-navigate', (_event: unknown, nextUrl: string) => {
      if (!isCurrent() || !isRemoteWebUrl(nextUrl)) return
      this.url = nextUrl
      this.updateHistory()
      this.changed()
    })

    on('did-navigate-in-page', (_event: unknown, nextUrl: string, isMainFrame: boolean) => {
      if (!isCurrent() || !isMainFrame || !isRemoteWebUrl(nextUrl)) return
      this.url = nextUrl
      this.updateHistory()
      this.changed()
    })

    on('page-title-updated', (_event: unknown, title: string) => {
      if (!isCurrent()) return
      this.title = title.slice(0, 512)
      this.changed()
    })

    on('page-favicon-updated', (_event: unknown, favicons: string[]) => {
      if (!isCurrent()) return
      this.favicon = favicons.find(isAllowedBrowserUrl) ?? null
      this.changed()
    })

    on(
      'did-fail-load',
      (
        _event: unknown,
        errorCode: number,
        errorDescription: string,
        validatedUrl: string,
        isMainFrame: boolean
      ) => {
        if (!isCurrent() || !isMainFrame || errorCode === -3) return
        this.loading = false
        this.error = errorDescription || `LOAD_FAILED (${errorCode})`
        if (isRemoteWebUrl(validatedUrl)) this.url = validatedUrl
        this.changed()
      }
    )

    on('render-process-gone', () => {
      if (!isCurrent()) return
      this.loading = false
      this.error = 'BROWSER_RENDER_GONE'
      this.destroyGuest()
      this.changed()
    })

    return guest
  }

  private loadCurrent(guest: ActiveGuest): void {
    const wc = guest.view.webContents
    if (!this.url || wc.isDestroyed()) return
    const generation = ++guest.generation
    this.loading = true
    this.error = null
    this.changed()
    void wc.loadURL(this.url).catch((failure: unknown) => {
      if (this.disposed || this.guest !== guest || guest.generation !== generation) return
      const code =
        typeof failure === 'object' && failure !== null && 'code' in failure
          ? String((failure as { code?: unknown }).code)
          : ''
      if (code === 'ERR_ABORTED') return
      this.loading = false
      this.error = failure instanceof Error ? failure.message : 'BROWSER_LOAD_FAILED'
      this.changed()
    })
  }

  navigate(input: string): BrowserSideState {
    if (this.disposed) throw new Error('BROWSER_DISPOSED')
    const normalized = normalizeBrowserInput(input)
    if (!normalized) {
      return this.close()
    }
    if (!isRemoteWebUrl(normalized)) {
      throw new Error('BROWSER_URL_BLOCKED')
    }
    this.url = normalized
    this.error = null
    this.favicon = null
    const guest = this.ensureGuest()
    this.loadCurrent(guest)
    this.refreshViewport()
    return this.getState()
  }

  back(): BrowserSideState {
    const wc = this.guest?.view.webContents
    if (wc && !wc.isDestroyed() && wc.navigationHistory.canGoBack()) {
      wc.navigationHistory.goBack()
    }
    this.updateHistory()
    this.changed()
    return this.getState()
  }

  forward(): BrowserSideState {
    const wc = this.guest?.view.webContents
    if (wc && !wc.isDestroyed() && wc.navigationHistory.canGoForward()) {
      wc.navigationHistory.goForward()
    }
    this.updateHistory()
    this.changed()
    return this.getState()
  }

  reload(): BrowserSideState {
    this.error = null
    if (this.guest && !this.guest.view.webContents.isDestroyed()) {
      this.guest.view.webContents.reload()
    } else if (this.url) {
      const guest = this.ensureGuest()
      this.loadCurrent(guest)
    }
    this.refreshViewport()
    this.changed()
    return this.getState()
  }

  stop(): BrowserSideState {
    if (this.guest && !this.guest.view.webContents.isDestroyed()) {
      this.guest.view.webContents.stop()
    }
    this.loading = false
    this.changed()
    return this.getState()
  }

  async captureSnapshot(): Promise<string | null> {
    const guest = this.guest
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
    if (!request.visible && this.viewport.visible && this.deps.notifySnapshot) {
      void this.captureSnapshot().then((snapshot) => {
        if (!this.disposed && snapshot && this.deps.notifySnapshot) {
          this.deps.notifySnapshot(snapshot)
        }
      })
    }
    this.viewport = { visible: request.visible, bounds: { ...request.bounds } }
    this.refreshViewport()
  }

  refreshViewport(): void {
    if (this.disposed || this.deps.owner.isDestroyed()) return
    const [width, height] = this.deps.owner.getContentSize()
    const bounds = clampBrowserViewport(this.viewport, { width, height })
    const remote = isRemoteWebUrl(this.url)
    if (bounds && this.deps.owner.isVisible() && remote && !this.guest) {
      const guest = this.ensureGuest()
      this.loadCurrent(guest)
    }
    if (!this.guest) return
    const visible = Boolean(bounds && this.deps.owner.isVisible() && remote && !this.error)
    if (visible && bounds) {
      this.guest.view.setBounds(bounds)
      if (!this.guest.attached) {
        this.deps.owner.contentView.addChildView(this.guest.view)
        this.guest.attached = true
      }
    }
    this.guest.view.setVisible(visible)
    if (!visible && this.guest.attached) {
      this.deps.owner.contentView.removeChildView(this.guest.view)
      this.guest.attached = false
    }
  }

  close(): BrowserSideState {
    this.destroyGuest()
    this.url = ''
    this.title = ''
    this.favicon = null
    this.loading = false
    this.canGoBack = false
    this.canGoForward = false
    this.error = null
    this.viewport = { visible: false, bounds: { x: 0, y: 0, width: 0, height: 0 } }
    this.changed()
    return this.getState()
  }

  private destroyGuest(): void {
    const guest = this.guest
    this.guest = null
    if (!guest) return
    for (const dispose of guest.disposers.splice(0)) dispose()
    if (guest.attached && !this.deps.owner.isDestroyed()) {
      try {
        this.deps.owner.contentView.removeChildView(guest.view)
      } catch {
        // ignore if already detached
      }
      guest.attached = false
    }
    try {
      guest.view.setVisible(false)
      if (!guest.view.webContents.isDestroyed()) {
        guest.view.webContents.close({ waitForBeforeUnload: false })
      }
    } catch {
      // ignore teardown errors
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.destroyGuest()
    for (const dispose of this.ownerDisposers.splice(0)) dispose()
  }
}
