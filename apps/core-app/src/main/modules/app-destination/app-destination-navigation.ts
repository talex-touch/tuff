import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type { BrowserWindow, WebContents } from 'electron'
import type { AppDestinationId } from '../../../shared/app-destinations'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { getAppDestination, isAppDestinationId } from '../../../shared/app-destinations'

/**
 * The runtime surface the destination navigation service needs.
 *
 * It is structural rather than the `TouchApp` class on purpose: the provider, tray,
 * Assistant, local-AI and the privileged plugin host all resolve the same instance,
 * and importing the app class here would drag the whole main-process graph into a
 * service that only needs a window and a channel. `channel` stays optional because
 * the shared `TalexTouch.TouchApp` interface does not declare it, while every
 * concrete runtime instance carries one.
 */
export interface AppDestinationRuntime {
  readonly window: { readonly window: BrowserWindow }
  readonly channel?: unknown
}

export type AppDestinationOpenStatus = 'opened' | 'queued' | 'unavailable'

export type AppDestinationUnavailableReason =
  | 'window-unavailable'
  | 'renderer-unavailable'
  | 'destination-unavailable'

export interface AppDestinationOpenResult {
  readonly status: AppDestinationOpenStatus
  readonly destinationId: AppDestinationId
  readonly reason?: AppDestinationUnavailableReason
}

/**
 * Per-call hook for callers that must fence their own authority.
 *
 * `beforeEffect` runs immediately before every native mutation the open performs —
 * the minimized restore, `show`, `focus`, and the routed broadcast — so a caller such
 * as the privileged plugin host can re-validate its activation generation between
 * individual effects instead of only around the whole call. A throw from the hook is
 * a caller-authority failure and propagates untouched; it is never converted into an
 * unavailable result.
 */
export interface AppDestinationOpenOptions {
  readonly beforeEffect?: () => void
}

const services = new WeakMap<object, AppDestinationNavigationService>()

/**
 * Owns the one main-window reveal plus allowlisted route delivery sequence.
 *
 * Callers hand it a destination ID only; the route comes from the shared catalog, so a
 * search result, tray item or plugin can never inject an arbitrary renderer path. Delivery
 * waits for the primary renderer's readiness announcement — sent once its navigate listener
 * is registered, not at preload metadata time — and keeps only the latest route, which
 * is what makes a request issued during a reload land on the surface the user asked for
 * instead of being dropped or replayed twice.
 */
export class AppDestinationNavigationService {
  private ready = false
  private pendingRoute: string | null = null
  private observedWebContents: WebContents | null = null
  private observedWindow: BrowserWindow | null = null
  private transport: ITuffTransportMain | null = null

  constructor(private readonly runtime: AppDestinationRuntime) {}

  open(
    destinationId: AppDestinationId,
    options?: AppDestinationOpenOptions
  ): AppDestinationOpenResult {
    if (!isAppDestinationId(destinationId)) {
      return { status: 'unavailable', destinationId, reason: 'destination-unavailable' }
    }

    const window = this.resolveWindow()
    if (!window) {
      this.resetForUnavailableWindow()
      return { status: 'unavailable', destinationId, reason: 'window-unavailable' }
    }

    const webContents = window.webContents
    if (!webContents || webContents.isDestroyed()) {
      this.resetForUnavailableRenderer()
      return { status: 'unavailable', destinationId, reason: 'renderer-unavailable' }
    }

    this.observeRenderer(window, webContents)
    const beforeEffect = options?.beforeEffect
    if (!this.revealWindow(window, beforeEffect)) {
      return { status: 'unavailable', destinationId, reason: 'window-unavailable' }
    }

    const route = getAppDestination(destinationId).route
    if (route === null) {
      return { status: 'opened', destinationId }
    }

    if (!this.ready) {
      this.pendingRoute = route
      return { status: 'queued', destinationId }
    }

    beforeEffect?.()
    if (!this.broadcastRoute(window, route)) {
      // Never drop the requested destination: keep it as the latest pending route and drop
      // readiness so the next primary handshake retries after a transient delivery failure.
      this.pendingRoute = route
      this.ready = false

      const currentWindow = this.resolveWindow()
      if (!currentWindow) {
        this.resetForUnavailableWindow()
        return { status: 'unavailable', destinationId, reason: 'window-unavailable' }
      }
      const currentWebContents = currentWindow.webContents
      if (!currentWebContents || currentWebContents.isDestroyed()) {
        this.resetForUnavailableRenderer()
        return { status: 'unavailable', destinationId, reason: 'renderer-unavailable' }
      }
      return { status: 'queued', destinationId }
    }
    return { status: 'opened', destinationId }
  }

  markPrimaryRendererReady(senderId: number): void {
    const window = this.resolveWindow()
    if (!window) {
      this.resetForUnavailableWindow()
      return
    }

    const webContents = window.webContents
    if (!webContents || webContents.isDestroyed()) {
      this.resetForUnavailableRenderer()
      return
    }

    // Only the primary renderer may flip readiness: a CoreBox or plugin view sending the
    // same handshake must not be able to release a route meant for the main window.
    if (senderId !== webContents.id) {
      return
    }

    this.observeRenderer(window, webContents)
    this.ready = true

    const route = this.pendingRoute
    if (route === null) {
      return
    }
    if (this.broadcastRoute(window, route)) {
      this.pendingRoute = null
      return
    }
    // Delivery failed transiently (e.g. the channel is not attached yet): keep the route
    // and drop readiness so the next primary handshake retries instead of losing the intent.
    this.ready = false
  }

  /**
   * Clears readiness when the primary document is replaced.
   *
   * `did-start-loading` was too broad: an iframe, an `srcdoc` frame or an in-page
   * (same-document) navigation fires it too, and each would drop readiness that is in fact
   * still valid. Only a main-frame, non-in-place navigation replaces the renderer that
   * acknowledged readiness, and its listeners with it. The route requested before or during
   * that reload survives and is delivered by the next handshake.
   */
  private handleMainFrameNavigation = (
    _event: unknown,
    _url: string,
    isInPlace: boolean,
    isMainFrame: boolean
  ): void => {
    if (!isMainFrame || isInPlace) {
      return
    }
    this.ready = false
  }

  private handleRendererLost = (): void => {
    // Crash or restart: readiness is gone, but the queued destination is still what the
    // user asked for, so it is kept for the next primary handshake.
    this.ready = false
    this.releaseObservedRenderer()
  }

  private handleWindowClosed = (): void => {
    this.ready = false
    this.pendingRoute = null
    this.releaseObservedRenderer()
  }

  private resetForUnavailableWindow(): void {
    this.ready = false
    this.pendingRoute = null
    this.releaseObservedRenderer()
  }

  private resetForUnavailableRenderer(): void {
    this.ready = false
    this.releaseObservedRenderer()
  }

  private observeRenderer(window: BrowserWindow, webContents: WebContents): void {
    if (this.observedWebContents === webContents && this.observedWindow === window) {
      return
    }
    // Detach from the previous renderer/window first: a crash-restart cycle must not leave
    // duplicate handlers feeding this service's readiness state.
    this.releaseObservedRenderer()
    this.observedWebContents = webContents
    this.observedWindow = window
    try {
      webContents.on('did-start-navigation', this.handleMainFrameNavigation)
      webContents.on('render-process-gone', this.handleRendererLost)
      window.once('closed', this.handleWindowClosed)
    } catch {
      // The renderer can already be gone between the availability check and this call.
    }
  }

  private releaseObservedRenderer(): void {
    const webContents = this.observedWebContents
    const window = this.observedWindow
    this.observedWebContents = null
    this.observedWindow = null
    try {
      webContents?.removeListener('did-start-navigation', this.handleMainFrameNavigation)
      webContents?.removeListener('render-process-gone', this.handleRendererLost)
      window?.removeListener('closed', this.handleWindowClosed)
    } catch {
      // A destroyed WebContents/window has already dropped its listeners.
    }
  }

  private resolveWindow(): BrowserWindow | null {
    try {
      const window = this.runtime.window.window
      if (!window || window.isDestroyed()) {
        return null
      }
      return window
    } catch {
      return null
    }
  }

  private revealWindow(window: BrowserWindow, beforeEffect?: () => void): boolean {
    let minimized: boolean
    try {
      minimized = window.isMinimized()
    } catch {
      return false
    }
    if (minimized) {
      beforeEffect?.()
      if (!this.applyWindowEffect(() => window.restore())) {
        return false
      }
    }
    beforeEffect?.()
    if (!this.applyWindowEffect(() => window.show())) {
      return false
    }
    beforeEffect?.()
    return this.applyWindowEffect(() => window.focus())
  }

  private applyWindowEffect(effect: () => void): boolean {
    try {
      effect()
      return true
    } catch {
      return false
    }
  }

  private broadcastRoute(window: BrowserWindow, route: string): boolean {
    const channel = this.runtime.channel
    if (channel === undefined || channel === null) {
      return false
    }
    try {
      // `broadcastToWindow` is fire-and-forget by contract; the request/response `sendTo`
      // path times out after 60 seconds when the renderer does not answer navigation.
      this.getTransport(channel).broadcastToWindow(window.id, AppEvents.window.navigate, {
        path: route
      })
      return true
    } catch {
      // The window can disappear between readiness and delivery; the reveal already happened.
      return false
    }
  }

  private getTransport(channel: unknown): ITuffTransportMain {
    if (!this.transport) {
      const keyManager =
        (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
      this.transport = getTuffTransportMain(channel, keyManager)
    }
    return this.transport
  }
}

/**
 * One service per runtime. The key is the runtime object itself (the `TouchApp` instance),
 * so every caller shares readiness state without a process-global mutable singleton and
 * without providers importing the navigation service's callers.
 */
export function getAppDestinationNavigationService(
  runtime: AppDestinationRuntime
): AppDestinationNavigationService {
  const key = runtime as object
  const existing = services.get(key)
  if (existing) {
    return existing
  }
  const created = new AppDestinationNavigationService(runtime)
  services.set(key, created)
  return created
}
