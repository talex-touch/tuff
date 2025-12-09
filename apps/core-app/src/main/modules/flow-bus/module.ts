/**
 * Flow Bus Module
 *
 * Main module class for Flow Transfer system.
 * Handles initialization, IPC registration, and plugin integration.
 */

import type { MaybePromise } from '@talex-touch/utils'
import type { ITouchChannel } from '@talex-touch/utils/channel'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { genTouchApp } from '../../core'
import { BaseModule } from '../abstract-base-module'
import { shortcutModule } from '../global-shortcon'
import { FlowBusIPC, initializeFlowBusIPC } from './ipc'
import { flowTargetRegistry } from './target-registry'
import { getCoreBoxWindow, windowManager } from '../box-tool/core-box/window'
import { coreBoxManager } from '../box-tool/core-box/manager'
import { DivisionBoxManager } from '../division-box/manager'

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

    // Listen for plugin load/unload to register/unregister flow targets
    this.setupPluginIntegration()

    // Register global shortcuts
    this.registerShortcuts()

    console.log('[FlowBusModule] Module initialized')
  }

  /**
   * Registers global shortcuts for Flow operations
   */
  private registerShortcuts(): void {
    // Command+D: Detach current item to DivisionBox
    shortcutModule.registerMainShortcut(
      FLOW_SHORTCUT_IDS.DETACH,
      'CommandOrControl+D',
      () => {
        this.triggerDetach()
      }
    )

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
    try {
      // Check if CoreBox is in UI mode
      if (!coreBoxManager.isUIMode) {
        console.log(LOG_PREFIX, 'CoreBox not in UI mode, nothing to detach')
        return
      }

      // Extract the UI view from CoreBox (doesn't destroy it)
      const extracted = windowManager.extractUIView()
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
      const coreBoxWindow = getCoreBoxWindow()
      if (coreBoxWindow && !coreBoxWindow.window.isDestroyed()) {
        coreBoxWindow.window.hide()
      }

      console.log(LOG_PREFIX, '✓ Detach completed')
    } catch (error) {
      console.error(LOG_PREFIX, '✗ Failed to detach:', error)
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

    genTouchApp().channel.sendTo(coreBoxWindow.window, ChannelType.MAIN, 'flow:trigger-transfer', {})
    console.log('[FlowBusModule] Triggered flow transfer shortcut')
  }

  /**
   * Sets up integration with plugin system
   */
  private setupPluginIntegration(): void {
    const channel = genTouchApp().channel
    
    // Register channel to receive plugin flow target registrations
    channel.regChannel(
      ChannelType.MAIN,
      'flow:register-targets',
      (data) => {
        const { pluginId, targets, pluginName, pluginIcon, isEnabled } = data.data as {
          pluginId: string
          targets: any[]
          pluginName?: string
          pluginIcon?: string
          isEnabled?: boolean
        }

        if (targets?.length) {
          flowTargetRegistry.registerPluginTargets(pluginId, targets, {
            pluginName,
            pluginIcon,
            isEnabled
          })
        }

        data.reply(DataCode.SUCCESS, { success: true })
      }
    )

    // Register channel to unregister plugin targets
    channel.regChannel(
      ChannelType.MAIN,
      'flow:unregister-targets',
      (data) => {
        const { pluginId } = data.data as { pluginId: string }
        flowTargetRegistry.unregisterPluginTargets(pluginId)
        data.reply(DataCode.SUCCESS, { success: true })
      }
    )

    // Register channel to update plugin enabled state
    channel.regChannel(
      ChannelType.MAIN,
      'flow:set-plugin-enabled',
      (data) => {
        const { pluginId, enabled } = data.data as { pluginId: string; enabled: boolean }
        flowTargetRegistry.setPluginEnabled(pluginId, enabled)
        data.reply(DataCode.SUCCESS, { success: true })
      }
    )
  }

  /**
   * Cleans up the Flow Bus module
   */
  onDestroy(): MaybePromise<void> {
    if (this.ipc) {
      this.ipc.unregisterHandlers()
      this.ipc = null
    }

    // Clear all targets
    flowTargetRegistry.clear()

    console.log('[FlowBusModule] Module destroyed')
  }
}

export const flowBusModule = new FlowBusModule()
