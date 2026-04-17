/**
 * MetaOverlay Manager
 *
 * Manages the MetaOverlay WebContentsView that floats above plugin UI.
 * Provides action panel functionality with built-in, item, and plugin actions.
 *
 * @module CoreBox/MetaOverlay
 */

import type { TuffItem } from '@talex-touch/utils/core-box'
import type {
  MetaAction,
  MetaShowRequest
} from '@talex-touch/utils/transport/events/types/meta-overlay'
import type { BrowserWindow } from 'electron'
import type { TouchApp } from '../../../core/touch-app'
import path from 'node:path'
import process from 'node:process'
import { buildWindowArgs } from '@talex-touch/utils/renderer/window-role'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { ClipboardEvents } from '@talex-touch/utils/transport/events'
import { MetaOverlayEvents } from '@talex-touch/utils/transport/events/meta-overlay'
import { app, WebContentsView } from 'electron'
import { BoxWindowOption } from '../../../config/default'
import { maybeGetRegisteredMainRuntime } from '../../../core/runtime-accessor'
import { useAliveTarget, useAliveWebContents } from '../../../hooks/use-electron-guard'
import { createLogger } from '../../../utils/logger'
import { getCoreBoxWindow } from './window'

const metaOverlayLog = createLogger('CoreBox').child('MetaOverlay')
const resolveKeyManager = (channel: unknown): unknown =>
  (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
const getCoreBoxRuntimeOrNull = () => maybeGetRegisteredMainRuntime('core-box')
const metaOverlayActionExecutedEvent = defineRawEvent<
  {
    actionId: string
    item: TuffItem
    pluginId: string
  },
  void
>('meta-overlay:action-executed')
const metaOverlayItemActionEvent = defineRawEvent<
  {
    actionId: string
    item: TuffItem
  },
  void
>('meta-overlay:item-action')
const coreBoxTogglePinEvent = defineRawEvent<
  {
    sourceId: string
    itemId: string
    sourceType: string
  },
  void
>('core-box:toggle-pin')
const shellShowItemInFolderEvent = defineRawEvent<{ path: string }, void>(
  'shell:show-item-in-folder'
)
const metaOverlayFlowTransferEvent = defineRawEvent<{ item: TuffItem }, void>(
  'meta-overlay:flow-transfer'
)

const BUILTIN_ACTION_IDS = new Set([
  'toggle-pin',
  'copy-title',
  'reveal-in-finder',
  'flow-transfer'
])

/**
 * Manages the MetaOverlay WebContentsView in persistent mode.
 * The view is created with the CoreBox window and shown/hidden as needed.
 */
export class MetaOverlayManager {
  private static instance: MetaOverlayManager
  private static readonly HEIGHT_SYNC_DELAY_MS = 220
  private metaView: WebContentsView | null = null
  private parentWindow: BrowserWindow | null = null
  private isVisible = false
  private currentItem: TuffItem | null = null
  private pluginActions: Map<string, MetaAction[]> = new Map()
  private heightSyncTimer: NodeJS.Timeout | null = null

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
   * Initializes MetaOverlay in persistent mode.
   * Creates the WebContentsView but keeps it hidden initially.
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

    const preloadPath = BoxWindowOption.webPreferences?.preload
    if (!preloadPath) {
      metaOverlayLog.error('MetaOverlay preload path missing')
      return
    }

    const webPreferences: Electron.WebPreferences = {
      preload: preloadPath,
      webSecurity: false,
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      additionalArguments: buildWindowArgs({ touchType: 'core-box', metaOverlay: true })
    }

    this.metaView = new WebContentsView({ webPreferences })

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

    // Handle ESC key to close MetaOverlay
    this.metaView.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape' && this.isVisible) {
        this.hide()
        event.preventDefault()
      }
    })

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
    if (
      this.metaView &&
      this.parentWindow &&
      this.getAliveMetaWebContents() &&
      this.getAliveParentWindow()
    ) {
      return true
    }

    const coreBoxWindow = getCoreBoxWindow()
    const coreBoxParentWindow = useAliveTarget(coreBoxWindow?.window ?? null)
    if (coreBoxParentWindow) {
      this.init(coreBoxParentWindow)
    }

    return Boolean(
      this.metaView &&
      this.parentWindow &&
      this.getAliveMetaWebContents() &&
      this.getAliveParentWindow()
    )
  }

  public getView(): WebContentsView | null {
    return this.metaView
  }

  public ensureOnTop(): void {
    if (!this.ensureInitialized()) return

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
   * Shows MetaOverlay with merged actions.
   *
   * @param request - The show request containing item and actions
   */
  public show(request: MetaShowRequest): void {
    if (!this.ensureInitialized() || !this.metaView || !this.parentWindow) {
      metaOverlayLog.error('Cannot show MetaOverlay: not initialized')
      return
    }

    // Merge actions: plugin (priority 100) > item (priority 50) > builtin (priority 0)
    const allActions: MetaAction[] = [
      ...(request.pluginActions || []),
      ...(request.itemActions || []),
      ...request.builtinActions
    ].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    this.currentItem = request.item

    // Update bounds
    const bounds = this.parentWindow.getBounds()
    this.metaView.setBounds({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height
    })

    this.ensureOnTop()

    // Wait for content to be loaded before showing
    const waitForContent = () => {
      const metaWebContents = this.getAliveMetaWebContents()
      if (!this.metaView || !metaWebContents) {
        return
      }

      // Check if content is loaded
      const isLoading = metaWebContents.isLoading()
      if (isLoading) {
        metaOverlayLog.debug('MetaOverlay still loading, waiting...')
        setTimeout(waitForContent, 50)
        return
      }

      const runtime = getCoreBoxRuntimeOrNull()
      if (!runtime) {
        metaOverlayLog.debug('Skip MetaOverlay show sync: CoreBox runtime unavailable')
        return
      }

      const tx = getTuffTransportMain(runtime.channel, resolveKeyManager(runtime.channel))

      tx.sendTo(metaWebContents, MetaOverlayEvents.ui.show, {
        item: request.item,
        builtinActions: request.builtinActions,
        itemActions: request.itemActions,
        pluginActions: request.pluginActions
      }).catch(() => {})

      metaOverlayLog.debug('Sent show message to MetaOverlay renderer')

      // Show the view
      this.metaView.setVisible(true)
      this.isVisible = true
      this.scheduleHeightSync()
      const afterVisible = this.metaView.getVisible()

      metaOverlayLog.debug(
        `MetaOverlay shown with ${allActions.length} actions, visible: ${afterVisible}, bounds: ${bounds.width}x${bounds.height}, loading: ${metaWebContents.isLoading()}`
      )

      // Focus after a short delay to ensure DOM is ready
      setTimeout(() => {
        const focusTarget = this.getAliveMetaWebContents()
        if (focusTarget) {
          focusTarget.focus()
          metaOverlayLog.debug('MetaOverlay focused')
        }
      }, 100)
    }

    // Start waiting for content
    waitForContent()
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
   * Hides MetaOverlay.
   */
  public hide(): void {
    this.clearHeightSyncTimer()
    const metaWebContents = this.getAliveMetaWebContents()
    if (!this.metaView || !metaWebContents) {
      this.isVisible = false
      this.currentItem = null
      return
    }

    this.metaView.setVisible(false)
    this.isVisible = false
    this.currentItem = null

    const runtime = getCoreBoxRuntimeOrNull()
    if (!runtime) {
      useAliveWebContents(this.getAliveParentWindow())?.focus()
      metaOverlayLog.debug('MetaOverlay hidden after CoreBox runtime teardown')
      return
    }

    const tx = getTuffTransportMain(runtime.channel, resolveKeyManager(runtime.channel))

    tx.sendTo(metaWebContents, MetaOverlayEvents.ui.hide, undefined).catch(() => {})

    // Return focus to parent window
    useAliveWebContents(this.getAliveParentWindow())?.focus()

    metaOverlayLog.debug('MetaOverlay hidden')
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
  public async executeAction(actionId: string, item?: TuffItem): Promise<void> {
    // Find the action
    let action: MetaAction | undefined
    let pluginId: string | undefined
    let handler: 'plugin' | 'builtin' | 'item' | undefined

    // Check plugin actions first
    for (const [pid, actions] of this.pluginActions.entries()) {
      const found = actions.find((a) => a.id === actionId)
      if (found) {
        action = found
        pluginId = pid
        handler = 'plugin'
        break
      }
    }

    // If not found in plugin actions, determine handler type
    if (!action) {
      handler = BUILTIN_ACTION_IDS.has(actionId) ? 'builtin' : 'item'
      metaOverlayLog.debug(`Executing ${handler} action ${actionId}`)
    }

    const targetItem = item ?? this.currentItem
    if (!targetItem) {
      metaOverlayLog.warn(`Cannot execute action ${actionId}: missing item context`)
      this.hide()
      return
    }

    const runtime = getCoreBoxRuntimeOrNull()
    if (!runtime) {
      metaOverlayLog.debug(`Skip executing action ${actionId}: CoreBox runtime unavailable`)
      this.hide()
      return
    }

    const touchApp = runtime.app

    // Handle based on action type
    if (handler === 'plugin' && pluginId) {
      // Plugin action - notify the plugin
      const channel = touchApp.channel
      const transport = getTuffTransportMain(channel, resolveKeyManager(channel))
      void transport
        .sendToPlugin(pluginId, metaOverlayActionExecutedEvent, {
          actionId,
          item: targetItem,
          pluginId
        })
        .catch((error) => {
          metaOverlayLog.error(`Failed to notify plugin ${pluginId} of action execution`, { error })
        })
    } else if (handler === 'builtin') {
      // Built-in action - handle in main process
      await this.handleBuiltinAction(actionId, targetItem, touchApp)
    } else if (handler === 'item') {
      // Item action - broadcast to renderer to handle
      const coreBoxWindow = getCoreBoxWindow()
      const coreBoxWebContents = useAliveWebContents(coreBoxWindow?.window ?? null)
      if (coreBoxWindow && coreBoxWebContents) {
        const channel = touchApp.channel
        const transport = getTuffTransportMain(channel, resolveKeyManager(channel))
        void transport
          .sendTo(coreBoxWebContents, metaOverlayItemActionEvent, {
            actionId,
            item: targetItem
          })
          .catch(() => {})
      }
    }

    // Hide MetaOverlay after execution
    this.hide()
  }

  /**
   * Handles built-in actions.
   *
   * @param actionId - The built-in action ID
   * @param item - The item context
   * @param touchApp - The TouchApp instance
   */
  private async handleBuiltinAction(
    actionId: string,
    item: TuffItem,
    touchApp: TouchApp
  ): Promise<void> {
    const coreBoxWindow = getCoreBoxWindow()
    const coreBoxWebContents = useAliveWebContents(coreBoxWindow?.window ?? null)
    if (!coreBoxWindow || !coreBoxWebContents) {
      return
    }

    const channel = touchApp.channel
    const transport = getTuffTransportMain(channel, resolveKeyManager(channel))

    switch (actionId) {
      case 'toggle-pin': {
        void transport.sendTo(coreBoxWebContents, coreBoxTogglePinEvent, {
          sourceId: item.source.id,
          itemId: item.id,
          sourceType: item.source.type
        })
        break
      }
      case 'copy-title': {
        const title = item.render?.basic?.title
        if (title) {
          void transport.sendTo(coreBoxWebContents, ClipboardEvents.write, {
            text: title
          })
        }
        break
      }
      case 'reveal-in-finder': {
        const filePath = item.meta?.app?.path ?? item.meta?.file?.path
        if (filePath) {
          void transport.sendTo(coreBoxWebContents, shellShowItemInFolderEvent, {
            path: filePath
          })
        }
        break
      }
      case 'flow-transfer': {
        void transport.sendTo(coreBoxWebContents, metaOverlayFlowTransferEvent, {
          item
        })
        break
      }
      default:
        metaOverlayLog.warn(`Unknown built-in action: ${actionId}`)
    }
  }

  /**
   * Updates window bounds when parent window resizes.
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
  public destroy(): void {
    this.clearHeightSyncTimer()

    if (this.metaView) {
      const metaWebContents = this.getAliveMetaWebContents()
      if (metaWebContents) {
        metaWebContents.close()
      }
      const parentWindow = this.getAliveParentWindow()
      if (parentWindow) {
        try {
          parentWindow.contentView.removeChildView(this.metaView)
        } catch (error) {
          metaOverlayLog.warn('Failed to remove MetaOverlay view', { error })
        }
      }
      this.metaView = null
    }

    this.pluginActions.clear()
    this.currentItem = null
    this.parentWindow = null
    this.isVisible = false

    metaOverlayLog.info('MetaOverlay destroyed')
  }
}

export const metaOverlayManager = MetaOverlayManager.getInstance()
