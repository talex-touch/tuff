/**
 * Flow Bus Module
 *
 * Main module class for Flow Transfer system.
 * Handles initialization, IPC registration, and plugin integration.
 */

import type { MaybePromise, NativeShareOptions } from '@talex-touch/utils'
import type { ITouchChannel } from '@talex-touch/utils/channel'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { FlowBusIPC } from './ipc'
import { FlowEvents, getTuffTransportMain, type HandlerContext } from '@talex-touch/utils/transport'
import { genTouchApp } from '../../core'
import { BaseModule } from '../abstract-base-module'
import { coreBoxManager } from '../box-tool/core-box/manager'
import { getCoreBoxWindow, windowManager } from '../box-tool/core-box/window'
import { DivisionBoxManager } from '../division-box/manager'
import { shortcutModule } from '../global-shortcon'
import { getPermissionModule } from '../permission'
import { flowBus } from './flow-bus'
import { initializeFlowBusIPC } from './ipc'
import { nativeShareService } from './native-share'
import { flowTargetRegistry } from './target-registry'

const LOG_PREFIX = '[FlowBus]'

/** Shortcut IDs for Flow operations */
export const FLOW_SHORTCUT_IDS = {
  DETACH: 'flow:detach-to-divisionbox',
  TRANSFER: 'flow:transfer-to-plugin'
} as const

/**
 * FlowBusModule
 *
 * Manages the lifecycle of the Flow Transfer system.
 */
export class FlowBusModule extends BaseModule<TalexEvents> {
  static key: symbol = Symbol.for('FlowBus')

  private ipc: FlowBusIPC | null = null
  private transportDisposers: Array<() => void> = []
  private flowDeliveryDisposers: Map<string, () => void> = new Map()

  constructor() {
    super(FlowBusModule.key, {
      create: false
    })
  }

  /**
   * Initializes the Flow Bus module
   */
  async onInit(): Promise<void> {
    const channel: ITouchChannel = $app.channel

    // Initialize IPC handlers
    this.ipc = initializeFlowBusIPC(channel)

    this.registerTransportHandlers(channel)

    // Register native share targets
    this.registerNativeShareTargets()

    // Register global shortcuts
    this.registerShortcuts()

    console.log('[FlowBusModule] Module initialized')
  }

  private registerTransportHandlers(channel: ITouchChannel): void {
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const tx = getTuffTransportMain(channel, keyManager)

    const enforce = (context: HandlerContext, apiName: string, sdkapi?: number) => {
      const pluginId = context?.plugin?.name
      if (!pluginId) {
        return
      }
      const perm = getPermissionModule()
      if (!perm) {
        return
      }
      perm.enforcePermission(pluginId, apiName, sdkapi)
    }

    this.transportDisposers.push(
      tx.on(FlowEvents.registerTargets, async (payload, context) => {
        enforce(context, 'flow:plugin:register-targets', payload?._sdkapi)
        const { pluginId, targets, pluginName, pluginIcon, isEnabled } = payload || {}
        if (targets?.length) {
          flowTargetRegistry.registerPluginTargets(pluginId, targets, {
            pluginName,
            pluginIcon,
            isEnabled
          })
        }
        return { success: true }
      })
    )

    this.transportDisposers.push(
      tx.on(FlowEvents.unregisterTargets, async (payload, context) => {
        enforce(context, 'flow:plugin:unregister-targets', payload?._sdkapi)
        flowTargetRegistry.unregisterPluginTargets(payload.pluginId)
        return { success: true }
      })
    )

    this.transportDisposers.push(
      tx.on(FlowEvents.setPluginEnabled, async (payload, context) => {
        enforce(context, 'flow:plugin:set-plugin-enabled', payload?._sdkapi)
        flowTargetRegistry.setPluginEnabled(payload.pluginId, payload.enabled)
        return { success: true }
      })
    )

    this.transportDisposers.push(
      tx.on(FlowEvents.setPluginHandler, async (payload, context) => {
        enforce(context, 'flow:plugin:set-plugin-handler', payload?._sdkapi)
        flowTargetRegistry.setPluginFlowHandler(payload.pluginId, payload.hasHandler)

        const pluginId = payload.pluginId as string
        const hasHandler = Boolean(payload.hasHandler)
        if (pluginId) {
          const existing = this.flowDeliveryDisposers.get(pluginId)
          if (existing) {
            existing()
            this.flowDeliveryDisposers.delete(pluginId)
          }

          if (hasHandler) {
            const dispose = flowBus.registerDeliveryHandler(pluginId, async (session) => {
              await tx
                .sendToPlugin(pluginId, FlowEvents.deliver, {
                  sessionId: session.sessionId,
                  payload: session.payload,
                  senderId: session.senderId
                })
                .catch(() => {})
            })
            this.flowDeliveryDisposers.set(pluginId, dispose)
          }
        }
        return { success: true }
      })
    )

    this.transportDisposers.push(
      tx.on(FlowEvents.nativeShare, async (payload, context) => {
        enforce(context, 'flow:native:share', payload?._sdkapi)
        const options = nativeShareService.payloadToShareOptions(payload.payload)
        if (payload.target) {
          options.target = payload.target as NativeShareOptions['target']
        }
        return await nativeShareService.share(options)
      })
    )
  }

  /**
   * Registers native system share targets
   */
  private registerNativeShareTargets(): void {
    const targets = nativeShareService.getAvailableTargets()

    for (const target of targets) {
      flowTargetRegistry.registerTarget('native', target, {
        pluginName: '系统分享',
        pluginIcon: 'ri:share-forward-line',
        isEnabled: true,
        hasFlowHandler: true, // Native share always has handler
        isNativeShare: true
      })
    }

    console.log(LOG_PREFIX, `Registered ${targets.length} native share targets`)
  }

  /**
   * Registers global shortcuts for Flow operations
   */
  private registerShortcuts(): void {
    // Command+D: Detach current item to DivisionBox
    shortcutModule.registerMainShortcut(FLOW_SHORTCUT_IDS.DETACH, 'CommandOrControl+D', () => {
      if (coreBoxManager.isUIMode) {
        this.triggerDetach()
        return
      }

      const coreBoxWindow = getCoreBoxWindow()
      if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
        console.warn('[FlowBusModule] CoreBox window not available for detach')
        return
      }

      const channel = genTouchApp().channel
      const keyManager =
        (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
      const tx = getTuffTransportMain(channel, keyManager)

      tx.sendToWindow(coreBoxWindow.window.id, FlowEvents.triggerDetach, undefined).catch(() => {})
    })

    // Command+Shift+D: Transfer current item to another plugin
    shortcutModule.registerMainShortcut(
      FLOW_SHORTCUT_IDS.TRANSFER,
      'CommandOrControl+Shift+D',
      () => {
        this.triggerFlowTransfer()
      }
    )
  }

  /**
   * Triggers detach operation - transfers UI view from CoreBox to new DivisionBox
   */
  private async triggerDetach(): Promise<void> {
    type ExtractedUIView = ReturnType<typeof windowManager.extractUIView>
    let extracted: ExtractedUIView = null
    try {
      // Check if CoreBox is in UI mode
      if (!coreBoxManager.isUIMode) {
        console.log(LOG_PREFIX, 'CoreBox not in UI mode, nothing to detach')
        return
      }

      const coreBoxWindow = getCoreBoxWindow()
      if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
        console.warn(LOG_PREFIX, 'CoreBox window not available, cannot detach')
        return
      }

      if (!coreBoxWindow.window.isVisible()) {
        console.warn(LOG_PREFIX, 'CoreBox window is not visible, aborting detach')
        return
      }

      // Extract the UI view from CoreBox (doesn't destroy it)
      extracted = windowManager.extractUIView()
      if (!extracted) {
        console.warn(LOG_PREFIX, 'No UI view to extract from CoreBox')
        return
      }

      const { view, plugin } = extracted
      console.log(LOG_PREFIX, `Detaching plugin → ${plugin.name}`)

      // Create DivisionBox session config (without URL - we'll attach existing view)
      const config = {
        url: `plugin://${plugin.name}/index.html`, // Required by config validation
        title: plugin.name,
        icon: plugin.icon?.value || plugin.icon?.toString?.() || undefined,
        size: 'medium' as const,
        keepAlive: true,
        pluginId: plugin.name,
        ui: {
          showInput: true
        }
      }

      // Create DivisionBox session (creates window only)
      const manager = DivisionBoxManager.getInstance()
      const session = await manager.createSessionWithoutUI(config)

      // Attach the extracted UI view to DivisionBox
      await session.attachExistingUIView(view, plugin)

      console.log(LOG_PREFIX, `✓ DivisionBox created (${session.sessionId})`)

      // Reset CoreBox to default state (shrink, exit UI mode flag)
      coreBoxManager.exitUIMode()

      // Hide CoreBox
      if (!coreBoxWindow.window.isDestroyed()) coreBoxWindow.window.hide()

      console.log(LOG_PREFIX, '✓ Detach completed')
    } catch (error) {
      console.error(LOG_PREFIX, '✗ Failed to detach:', error)

      // Rollback: put the extracted view back to CoreBox to avoid "view lost"
      if (extracted?.view && extracted?.plugin) {
        try {
          const restored = windowManager.restoreExtractedUIView(extracted.view, extracted.plugin)
          if (restored) {
            console.warn(LOG_PREFIX, 'Rollback: UI view restored to CoreBox after detach failure')
          } else {
            console.warn(LOG_PREFIX, 'Rollback failed: UI view could not be restored to CoreBox')
          }
        } catch (restoreError) {
          console.error(LOG_PREFIX, 'Rollback error:', restoreError)
        }
      }
    }
  }

  /**
   * Triggers flow transfer operation - sends event to CoreBox window
   */
  private triggerFlowTransfer(): void {
    const coreBoxWindow = getCoreBoxWindow()
    if (!coreBoxWindow || coreBoxWindow.window.isDestroyed()) {
      console.warn('[FlowBusModule] CoreBox window not available for flow transfer')
      return
    }

    const channel = genTouchApp().channel
    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    const tx = getTuffTransportMain(channel, keyManager)

    tx.sendToWindow(coreBoxWindow.window.id, FlowEvents.triggerTransfer, undefined).catch(() => {})
    console.log('[FlowBusModule] Triggered flow transfer shortcut')
  }

  /**
   * Cleans up the Flow Bus module
   */
  onDestroy(): MaybePromise<void> {
    if (this.ipc) {
      this.ipc.unregisterHandlers()
      this.ipc = null
    }

    for (const dispose of this.flowDeliveryDisposers.values()) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.flowDeliveryDisposers.clear()

    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.transportDisposers = []

    // Clear all targets
    flowTargetRegistry.clear()

    console.log('[FlowBusModule] Module destroyed')
  }
}

export const flowBusModule = new FlowBusModule()
