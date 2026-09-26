/**
 * MetaOverlay Manager
 *
 * Manages the MetaOverlay WebContentsView that floats above plugin UI.
 * Provides action panel functionality with built-in, item, and plugin actions.
 *
 * @module CoreBox/MetaOverlay
 */

import type { TuffItem } from '@talex-touch/utils/core-box'
import type { CoreBoxMetaOverlayPanelStatePayload } from '@talex-touch/utils/transport/events/types'
import type {
  MetaAction,
  MetaShowRequest
} from '@talex-touch/utils/transport/events/types/meta-overlay'
import type { BrowserWindow } from 'electron'
import path from 'node:path'
import process from 'node:process'
import { buildWindowArgs } from '@talex-touch/utils/renderer/window-role'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { app, WebContentsView } from 'electron'
import { BoxWindowOption } from '../../../config/default'
import { maybeGetRegisteredMainRuntime } from '../../../core/runtime-accessor'
import { buildWindowWebPreferences } from '../../../core/window-security-profile'
import { useAliveTarget, useAliveWebContents } from '../../../hooks/use-electron-guard'
import { createLogger } from '../../../utils/logger'
import { getCoreBoxWindow, windowManager } from './window'
import { installAppViewNavigationPolicy } from '../../../core/app-view-navigation-policy'
import { getCoreBoxRendererUrl } from '../../../utils/renderer-url'
import { resolveMetaOverlayWindowHeight } from '../../../../shared/meta-overlay-geometry'

const metaOverlayLog = createLogger('CoreBox').child('MetaOverlay')
const resolveKeyManager = (channel: unknown): unknown =>
  (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
const getCoreBoxRuntimeOrNull = () => maybeGetRegisteredMainRuntime('core-box')

/**
 * Manages the MetaOverlay view attached above the current CoreBox window. The renderer is built
 * once and retained across dismissals, so only the first show pays a renderer start.
 */
export class MetaOverlayManager {
  private static instance: MetaOverlayManager
  private static readonly HEIGHT_SYNC_DELAY_MS = 220
  /** How often a closed panel checks whether the height it handed back has landed. */
  private static readonly HAND_BACK_POLL_MS = 32
  /** Longest CoreBox keeps painting for a hand-back; an animated resize takes at most 220ms. */
  private static readonly HAND_BACK_MAX_WAIT_MS = 1_000
  private metaView: WebContentsView | null = null
  private parentWindow: BrowserWindow | null = null
  private isVisible = false
  private currentItem: TuffItem | null = null
  private pluginActions: Map<string, MetaAction[]> = new Map()
  private heightSyncTimer: NodeJS.Timeout | null = null
  private pendingShowRequest: MetaShowRequest | null = null
  private rendererReadyWebContentsId: number | null = null
  /** CoreBox height before the panel grew the window, restored when the panel closes. */
  private restoreHeight: number | null = null
  /** The latest CoreBox layout update that arrived while the panel was open. */
  private heldLayoutReplay: (() => void) | null = null
  private detachParentHideListener: (() => void) | null = null
  /** The panel closed, and the window it grew is still animating back (see `watchHandBack`). */
  private handBackPending = false
  private handBackTimer: NodeJS.Timeout | null = null
  /** What the CoreBox renderer was last told about the panel (see `publishPanelState`). */
  private publishedPanelState: CoreBoxMetaOverlayPanelStatePayload = {
    visible: false,
    grown: false
  }

  private getAliveMetaWebContents(): Electron.WebContents | null {
    return useAliveWebContents(this.metaView)
  }

  private getAliveParentWindow(): BrowserWindow | null {
    return useAliveTarget(this.parentWindow)
  }

  /**
   * Gets the singleton instance of MetaOverlayManager.
   *
   * @returns The singleton instance
   */
  public static getInstance(): MetaOverlayManager {
    if (!MetaOverlayManager.instance) {
      MetaOverlayManager.instance = new MetaOverlayManager()
    }
    return MetaOverlayManager.instance
  }

  /**
   * Initializes a fresh MetaOverlay renderer and keeps it hidden until its ready handshake.
   *
   * @param parentWindow - The parent BrowserWindow to attach to
   */
  public init(parentWindow: BrowserWindow): void {
    if (this.metaView) {
      const sameParent = this.parentWindow === parentWindow
      const parentAlive = !!this.getAliveParentWindow()
      const viewAlive = !!this.getAliveMetaWebContents()
      if (sameParent && parentAlive && viewAlive) {
        metaOverlayLog.warn('MetaOverlay already initialized')
        return
      }

      metaOverlayLog.warn('MetaOverlay has stale instance, rebuilding')
      this.destroy()
    }

    this.parentWindow = parentWindow
    this.pendingShowRequest = null
    this.rendererReadyWebContentsId = null

    const preloadPath = BoxWindowOption.webPreferences?.preload
    if (!preloadPath) {
      metaOverlayLog.error('MetaOverlay preload path missing')
      return
    }

    const webPreferences = buildWindowWebPreferences('app', {
      preload: preloadPath,
      additionalArguments: buildWindowArgs({ touchType: 'core-box', metaOverlay: true })
    })

    this.metaView = new WebContentsView({ webPreferences })

    // This view only ever shows the app's own renderer, and had no window-open handler and no
    // navigation restriction at all (#793).
    installAppViewNavigationPolicy(this.metaView.webContents, {
      entryUrl: getCoreBoxRendererUrl()
    })

    this.metaView.webContents.addListener('dom-ready', () => {
      metaOverlayLog.debug('MetaOverlay DOM ready')
    })

    this.metaView.webContents.addListener('did-finish-load', () => {
      metaOverlayLog.debug('MetaOverlay finished loading')
    })

    this.metaView.webContents.addListener(
      'did-fail-load',
      (_event, errorCode, errorDescription, validatedURL) => {
        metaOverlayLog.error('MetaOverlay failed to load', {
          meta: {
            errorCode,
            errorDescription,
            validatedURL
          }
        })
      }
    )

    const ownedMetaView = this.metaView
    ownedMetaView.webContents.on('render-process-gone', () => {
      if (this.metaView !== ownedMetaView) return
      metaOverlayLog.warn('MetaOverlay renderer exited; releasing stale view')
      this.destroyRenderer()
    })

    // Handle ESC key to close MetaOverlay. Not while an IME composes: its Esc cancels the
    // composition, and the renderer closes the panel on the next plain Esc.
    this.metaView.webContents.on('before-input-event', (event, input) => {
      if (
        input.type === 'keyDown' &&
        input.key === 'Escape' &&
        !input.isComposing &&
        this.isVisible
      ) {
        this.hide()
        event.preventDefault()
      }
    })

    // CoreBox can hide under an open panel (blur, the toggle shortcut). The panel goes with it;
    // otherwise its layout hold would outlive it and the next show would reveal a stale panel.
    const onParentHidden = (): void => {
      if (this.parentWindow === parentWindow) this.dismissWithHost()
    }
    parentWindow.on('hide', onParentHidden)
    this.detachParentHideListener = () => parentWindow.removeListener('hide', onParentHidden)

    // Add to window (but keep hidden initially)
    // Note: addChildView order determines z-index (last = top)
    // MetaOverlay should be added AFTER uiView to ensure it's on top
    // This is handled in WindowManager.attachUIView() - MetaOverlay is initialized first
    parentWindow.contentView.addChildView(this.metaView)

    const bounds = parentWindow.getBounds()
    this.metaView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height
    })

    // Set background transparent (but allow content to be visible)
    // Use a slightly opaque background to ensure content is visible
    this.metaView.setBackgroundColor('#00000001')

    // Initially hide the view
    this.metaView.setVisible(false)

    // Load URL
    const loadUrl = app.isPackaged
      ? `${path.join(__dirname, '..', 'renderer', 'index.html')}#/meta-overlay`
      : `${process.env.ELECTRON_RENDERER_URL as string}#/meta-overlay`

    if (app.isPackaged) {
      this.metaView.webContents.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'), {
        hash: '/meta-overlay'
      })
    } else {
      this.metaView.webContents.loadURL(loadUrl)
    }

    metaOverlayLog.info(`MetaOverlay initialized, loading: ${loadUrl}`)
  }

  private ensureInitialized(): boolean {
    if (this.isRendererAlive()) {
      return true
    }

    const coreBoxWindow = getCoreBoxWindow()
    const coreBoxParentWindow = useAliveTarget(coreBoxWindow?.window ?? null)
    if (coreBoxParentWindow) {
      this.init(coreBoxParentWindow)
    }

    return this.isRendererAlive()
  }

  private isRendererAlive(): boolean {
    return Boolean(
      this.metaView &&
      this.parentWindow &&
      this.getAliveMetaWebContents() &&
      this.getAliveParentWindow()
    )
  }

  /**
   * Builds the overlay renderer before the first show so the panel is not gated on a cold start.
   *
   * Deferred off the caller's frame: CoreBox calls this while it is revealing its own window, and
   * constructing a WebContentsView there would land inside that animation.
   */
  public prewarm(): void {
    if (this.isRendererAlive()) return

    setImmediate(() => {
      if (this.isRendererAlive()) return
      this.ensureInitialized()
    })
  }

  public getView(): WebContentsView | null {
    return this.metaView
  }

  /** Whether a renderer sender is the live WebContents owned by this overlay. */
  public ownsRenderer(webContentsId: number): boolean {
    return this.getAliveMetaWebContents()?.id === webContentsId
  }

  public ensureOnTop(): void {
    if (!this.metaView || !this.parentWindow) return

    try {
      if (this.parentWindow.contentView.children.includes(this.metaView)) {
        this.parentWindow.contentView.removeChildView(this.metaView)
      }
      this.parentWindow.contentView.addChildView(this.metaView)
    } catch (error) {
      metaOverlayLog.warn('Failed to reorder MetaOverlay', { error })
    }
  }

  /**
   * Queues the latest MetaOverlay contents and releases them only after the current renderer has
   * mounted its transport listeners. `webContents.isLoading() === false` is not sufficient: the
   * async renderer bootstrap can still be between document load and component mount.
   *
   * @param request - The show request containing item and actions
   */
  public show(request: MetaShowRequest): void {
    if (!this.ensureInitialized() || !this.metaView || !this.parentWindow) {
      metaOverlayLog.error('Cannot show MetaOverlay: not initialized')
      return
    }

    // The panel draws inside CoreBox. A ⌘K from a detached DivisionBox reaches here while CoreBox
    // is hidden: that panel could never be seen, and left "open" it would surface stale on the
    // next CoreBox show and hold CoreBox's layout until then.
    if (!this.parentWindow.isVisible()) {
      metaOverlayLog.debug('Skip MetaOverlay show: CoreBox window is hidden')
      return
    }

    this.pendingShowRequest = request
    this.currentItem = request.item

    const bounds = this.parentWindow.getBounds()
    this.metaView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height
    })
    this.ensureOnTop()
    this.flushPendingShow()
  }

  /**
   * Accepts readiness only from the WebContents currently owned by this manager.
   *
   * @returns `true` when the sender is the active MetaOverlay renderer.
   */
  public markRendererReady(webContentsId: number): boolean {
    const metaWebContents = this.getAliveMetaWebContents()
    if (!metaWebContents || metaWebContents.id !== webContentsId) {
      metaOverlayLog.warn('Ignored MetaOverlay readiness from a stale renderer', {
        meta: {
          senderId: webContentsId,
          activeRendererId: metaWebContents?.id ?? null
        }
      })
      return false
    }

    this.rendererReadyWebContentsId = webContentsId
    this.flushPendingShow()
    return true
  }

  private flushPendingShow(): void {
    const request = this.pendingShowRequest
    const metaView = this.metaView
    const metaWebContents = this.getAliveMetaWebContents()
    const parentWindow = this.getAliveParentWindow()

    if (!request || !metaView || !metaWebContents || !parentWindow) return
    if (this.rendererReadyWebContentsId !== metaWebContents.id) {
      metaOverlayLog.debug('MetaOverlay show queued until renderer readiness')
      return
    }

    const runtime = getCoreBoxRuntimeOrNull()
    if (!runtime) {
      metaOverlayLog.debug('Skip MetaOverlay show sync: CoreBox runtime unavailable')
      return
    }

    this.pendingShowRequest = null
    this.isVisible = true
    // Grow before revealing, so the first frame already has room for the panel. setBounds syncs
    // this view to the new window size on the way.
    this.fitParentToPanel(request)
    const tx = getTuffTransportMain(runtime.channel, resolveKeyManager(runtime.channel))
    void tx
      .sendTo(metaWebContents, MetaOverlayEvents.ui.show, request)
      .catch((error) =>
        metaOverlayLog.error('Failed to deliver MetaOverlay show request', { error })
      )

    const bounds = parentWindow.getBounds()
    metaView.setVisible(true)
    // A panel that grew the window has said so already; this covers one that fits as it is.
    this.publishPanelState()
    this.scheduleHeightSync()

    const actionCount =
      (request.pluginActions?.length ?? 0) +
      (request.itemActions?.length ?? 0) +
      request.builtinActions.length
    metaOverlayLog.debug(
      `MetaOverlay shown with ${actionCount} actions, visible: ${metaView.getVisible()}, bounds: ${bounds.width}x${bounds.height}`
    )

    const focusTarget = this.getAliveMetaWebContents()
    if (focusTarget) {
      focusTarget.focus()
      metaOverlayLog.debug('MetaOverlay focused')
    }
  }

  private findHostWindow(): (typeof windowManager.windows)[number] | undefined {
    const parentWindow = this.getAliveParentWindow()
    if (!parentWindow) return undefined
    return windowManager.windows.find((candidate) => candidate.window === parentWindow)
  }

  /**
   * Grows CoreBox only when the panel does not fit at its current height, and remembers the height
   * to return to. A window tall enough already is left exactly as it is.
   *
   * CoreBox hears about the growth before it happens: its first frame at the new size then
   * already paints the added space, which would otherwise show the desktop behind the window.
   */
  private fitParentToPanel(request: MetaShowRequest): void {
    const requiredHeight = resolveMetaOverlayWindowHeight(request)
    const hostWindow = this.findHostWindow()
    if (requiredHeight === null || !hostWindow) return

    const currentHeight = windowManager.getSettledHeight(hostWindow)
    if (currentHeight === null || currentHeight >= requiredHeight) return

    if (this.restoreHeight === null) this.restoreHeight = currentHeight
    this.publishPanelState()
    windowManager.setHeight(requiredHeight, hostWindow)
  }

  /**
   * Hands the window's height back when the panel closes. A layout update held while the panel
   * was open wins over the pre-open height: the results may have changed underneath the panel.
   */
  private releaseHostLayout(): void {
    const replay = this.heldLayoutReplay
    const restoreHeight = this.restoreHeight
    this.heldLayoutReplay = null
    this.restoreHeight = null

    if (replay) {
      replay()
      return
    }
    const hostWindow = this.findHostWindow()
    if (restoreHeight !== null && hostWindow) {
      windowManager.setHeight(restoreHeight, hostWindow)
    }
  }

  /**
   * Holds a CoreBox layout update while the panel is on screen, keeping only the latest one.
   * Applying it would resize the window under the panel and clip it; it is replayed on close.
   *
   * @returns `true` when the update was held and must not be applied now.
   */
  public holdLayoutUpdate(replay: () => void): boolean {
    if (!this.isVisible) return false
    this.heldLayoutReplay = replay
    return true
  }

  private scheduleHeightSync(): void {
    this.clearHeightSyncTimer()

    this.heightSyncTimer = setTimeout(() => {
      this.heightSyncTimer = null
      if (!this.isVisible) {
        return
      }
      this.updateBounds()
    }, MetaOverlayManager.HEIGHT_SYNC_DELAY_MS)
  }

  private clearHeightSyncTimer(): void {
    if (!this.heightSyncTimer) {
      return
    }
    clearTimeout(this.heightSyncTimer)
    this.heightSyncTimer = null
  }

  /**
   * Hides the overlay without releasing its renderer.
   *
   * Rebuilding per dismissal made every open pay a full renderer cold start - a new process
   * parsing the whole CoreApp entry chunk - before main was allowed to deliver the panel at all,
   * because delivery is gated on that renderer's readiness handshake.
   *
   * `ui.hide` must reach the retained renderer: it is what resets `visible`, `searchQuery`,
   * `activeIndex` and `executingActionId`. Without it a reused renderer keeps the dismissed
   * panel's state, and its `visible` watcher never re-runs because `visible` never left `true`.
   */
  public hide(): void {
    this.clearHeightSyncTimer()
    // A show queued for a panel the user just dismissed must not surface on a later handshake.
    this.pendingShowRequest = null
    const parentWindow = this.getAliveParentWindow()
    const metaWebContents = this.getAliveMetaWebContents()
    if (this.metaView && metaWebContents) {
      this.metaView.setVisible(false)
      this.dispatchHideToRenderer(metaWebContents)
    }
    this.isVisible = false
    this.currentItem = null
    const grewWindow = this.restoreHeight !== null
    this.releaseHostLayout()
    if (grewWindow) this.watchHandBack()
    this.publishPanelState()
    useAliveWebContents(parentWindow)?.focus()
    metaOverlayLog.debug('MetaOverlay hidden, renderer retained')
  }

  /**
   * Closes the panel because CoreBox itself hid. The window's height is not handed back: CoreBox
   * resets its size on the next show and its renderer re-sends a fresh layout then, so a restore
   * or a replay here would only resize a hidden window. Focus is not moved either.
   */
  private dismissWithHost(): void {
    this.clearHeightSyncTimer()
    this.clearHandBackWatch()
    this.pendingShowRequest = null
    this.heldLayoutReplay = null
    this.restoreHeight = null
    if (this.isVisible) {
      const metaWebContents = this.getAliveMetaWebContents()
      if (this.metaView && metaWebContents) {
        this.metaView.setVisible(false)
        this.dispatchHideToRenderer(metaWebContents)
      }
      this.isVisible = false
      this.currentItem = null
      metaOverlayLog.debug('MetaOverlay dismissed with its CoreBox window')
    }
    // Also ends a hand-back still landing: the next show must not open on a painted window.
    this.publishPanelState()
  }

  /**
   * Keeps CoreBox painting the space the panel added while the window animates back to its
   * height (`animation.coreBoxResize`, up to 220ms): dropping the paint at close would show the
   * desktop through the shrinking strip. A resize without the animation has landed already.
   */
  private watchHandBack(): void {
    this.clearHandBackWatch()
    if (!this.isHostResizing()) return

    this.handBackPending = true
    const deadline = Date.now() + MetaOverlayManager.HAND_BACK_MAX_WAIT_MS
    const check = (): void => {
      if (this.isHostResizing() && Date.now() < deadline) {
        this.handBackTimer = setTimeout(check, MetaOverlayManager.HAND_BACK_POLL_MS)
        return
      }
      this.handBackTimer = null
      this.handBackPending = false
      this.publishPanelState()
    }
    this.handBackTimer = setTimeout(check, MetaOverlayManager.HAND_BACK_POLL_MS)
  }

  private clearHandBackWatch(): void {
    if (this.handBackTimer) {
      clearTimeout(this.handBackTimer)
      this.handBackTimer = null
    }
    this.handBackPending = false
  }

  private isHostResizing(): boolean {
    const hostWindow = this.findHostWindow()
    return hostWindow ? windowManager.isResizing(hostWindow) : false
  }

  private dispatchHideToRenderer(metaWebContents: Electron.WebContents): void {
    const runtime = getCoreBoxRuntimeOrNull()
    if (!runtime) {
      metaOverlayLog.debug('Skip MetaOverlay hide sync: CoreBox runtime unavailable')
      return
    }

    const tx = getTuffTransportMain(runtime.channel, resolveKeyManager(runtime.channel))
    void tx
      .sendTo(metaWebContents, MetaOverlayEvents.ui.hide, undefined)
      .catch((error) =>
        metaOverlayLog.error('Failed to deliver MetaOverlay hide request', { error })
      )
  }

  /**
   * Tells the CoreBox renderer whether the panel is open and whether the window is taller than its
   * own layout because of it. CoreBox paints the grown space while it is; otherwise that space
   * shows the window material, a blur of the desktop behind CoreBox. `grown` rises before the
   * window grows and, with an animated restore, falls only once the height handed back has landed.
   *
   * Fire-and-forget and only on change: the renderer answers nothing, and closing a panel that
   * never opened tells it nothing new.
   */
  private publishPanelState(): void {
    const next: CoreBoxMetaOverlayPanelStatePayload = {
      visible: this.isVisible,
      grown: (this.isVisible && this.restoreHeight !== null) || this.handBackPending
    }
    const last = this.publishedPanelState
    if (last.visible === next.visible && last.grown === next.grown) return

    const parentWindow = this.getAliveParentWindow()
    const runtime = getCoreBoxRuntimeOrNull()
    if (!parentWindow || !runtime) return

    this.publishedPanelState = next
    const tx = getTuffTransportMain(runtime.channel, resolveKeyManager(runtime.channel))
    try {
      tx.broadcastToWindow(parentWindow.id, CoreBoxEvents.metaOverlay.panelState, next)
    } catch (error) {
      metaOverlayLog.warn('Failed to publish the panel state to CoreBox', { error })
    }
  }

  /**
   * Checks if MetaOverlay is visible.
   *
   * @returns `true` if visible, `false` otherwise
   */
  public getVisible(): boolean {
    return this.isVisible
  }

  /**
   * Registers a plugin action.
   *
   * @param pluginId - The plugin identifier
   * @param action - The action to register
   */
  public registerPluginAction(pluginId: string, action: MetaAction): void {
    if (!this.pluginActions.has(pluginId)) {
      this.pluginActions.set(pluginId, [])
    }
    this.pluginActions.get(pluginId)!.push(action)
    metaOverlayLog.debug(`Registered action ${action.id} for plugin ${pluginId}`)
  }

  /**
   * Unregisters all actions for a plugin.
   *
   * @param pluginId - The plugin identifier
   */
  public unregisterPluginActions(pluginId: string): void {
    this.pluginActions.delete(pluginId)
    metaOverlayLog.debug(`Unregistered all actions for plugin ${pluginId}`)
  }

  /**
   * Unregisters a specific action for a plugin.
   *
   * @param pluginId - The plugin identifier
   * @param actionId - The action ID to unregister
   */
  public unregisterPluginAction(pluginId: string, actionId: string): void {
    const actions = this.pluginActions.get(pluginId)
    if (actions) {
      const index = actions.findIndex((a) => a.id === actionId)
      if (index >= 0) {
        actions.splice(index, 1)
        if (actions.length === 0) {
          this.pluginActions.delete(pluginId)
        }
        metaOverlayLog.debug(`Unregistered action ${actionId} for plugin ${pluginId}`)
      }
    }
  }

  /**
   * Gets all plugin actions.
   *
   * @returns Array of all registered plugin actions
   */
  public getPluginActions(): MetaAction[] {
    const allActions: MetaAction[] = []
    for (const actions of this.pluginActions.values()) {
      allActions.push(...actions)
    }
    return allActions
  }

  /**
   * Executes an action.
   *
   * @param actionId - The action ID to execute
   * @param item - The item context for the action
   */
  public async executeAction(
    actionId: string,
    item?: TuffItem
  ): Promise<{ success: boolean; error?: string }> {
    const targetItem = item ?? this.currentItem
    if (!targetItem) {
      metaOverlayLog.warn(`Cannot execute action ${actionId}: missing item context`)
      this.hide()
      return { success: false, error: 'Missing item context' }
    }

    // Find the action
    let action: MetaAction | undefined
    let pluginId: string | undefined
    const hasItemAction = targetItem.actions?.some((itemAction) => itemAction.id === actionId)

    // Item actions belong to the CoreBox renderer action pipeline.
    if (!hasItemAction) {
      for (const [pid, actions] of this.pluginActions.entries()) {
        const found = actions.find((a) => a.id === actionId)
        if (found) {
          action = found
          pluginId = pid
          break
        }
      }
    }

    if (!action) {
      metaOverlayLog.debug(`Executing CoreBox renderer action ${actionId}`)
    }

    const runtime = getCoreBoxRuntimeOrNull()
    if (!runtime) {
      metaOverlayLog.debug(`Skip executing action ${actionId}: CoreBox runtime unavailable`)
      this.hide()
      return { success: false, error: 'CoreBox runtime unavailable' }
    }

    const touchApp = runtime.app

    // Handle based on action type
    if (pluginId) {
      // Plugin action - notify the plugin
      const channel = touchApp.channel
      const transport = getTuffTransportMain(channel, resolveKeyManager(channel))
      void transport
        .sendToPlugin(pluginId, CoreBoxEvents.metaOverlay.actionExecuted, {
          actionId,
          item: targetItem,
          pluginId
        })
        .catch((error) => {
          metaOverlayLog.error(`Failed to notify plugin ${pluginId} of action execution`, { error })
        })
    } else {
      // Item actions are notifications back to the CoreBox renderer that owns this overlay.
      // Target the attached parent window, never a caller-supplied sender: the overlay is a
      // WebContentsView and the parent is the sole renderer with the action-panel listener.
      // `broadcastToWindow` avoids the 60-second request timeout a void `sendTo` creates.
      const coreBoxWindow = this.getAliveParentWindow()
      if (coreBoxWindow) {
        const channel = touchApp.channel
        const transport = getTuffTransportMain(channel, resolveKeyManager(channel))
        transport.broadcastToWindow(coreBoxWindow.id, CoreBoxEvents.metaOverlay.itemAction, {
          actionId,
          item: targetItem
        })
      }
    }

    // Hide MetaOverlay after execution
    this.hide()
    return { success: true }
  }

  /**
   * Updates view bounds when the parent window resizes.
   *
   * Runs while hidden too: the retained view stays attached across dismissals, and a view left at
   * the previous window size would show at the wrong bounds on the frame the next show reveals it.
   */
  public updateBounds(): void {
    const parentWindow = this.getAliveParentWindow()
    if (!this.metaView || !parentWindow) return

    const bounds = parentWindow.getBounds()
    this.metaView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height
    })
  }

  /**
   * Destroys MetaOverlay and cleans up resources.
   */
  private destroyRenderer(): void {
    this.clearHeightSyncTimer()
    this.clearHandBackWatch()
    this.pendingShowRequest = null
    this.rendererReadyWebContentsId = null
    // A renderer lost under an open panel still owes CoreBox its height back.
    const wasVisible = this.isVisible
    this.isVisible = false
    if (wasVisible) this.releaseHostLayout()
    this.heldLayoutReplay = null
    this.restoreHeight = null
    this.publishPanelState()
    // Whatever that reached, the next parent's renderer starts from a closed panel.
    this.publishedPanelState = { visible: false, grown: false }
    this.detachParentHideListener?.()
    this.detachParentHideListener = null
    const parentWindow = this.getAliveParentWindow()
    if (this.metaView) {
      const metaWebContents = this.getAliveMetaWebContents()
      if (metaWebContents) metaWebContents.close()
      if (parentWindow) {
        try {
          parentWindow.contentView.removeChildView(this.metaView)
        } catch (error) {
          metaOverlayLog.warn('Failed to remove MetaOverlay view', { error })
        }
      }
    }
    this.metaView = null
    this.currentItem = null
    this.parentWindow = null
    this.isVisible = false
  }

  public destroy(): void {
    this.destroyRenderer()
    this.pluginActions.clear()
    metaOverlayLog.info('MetaOverlay destroyed')
  }
}

export const metaOverlayManager = MetaOverlayManager.getInstance()
