/**
 * Flow Bus Module
 *
 * Main module class for Flow Transfer system.
 * Handles initialization, IPC registration, and plugin integration.
 */

import type { MaybePromise } from '@talex-touch/utils'
import type { ITouchChannel } from '@talex-touch/utils/channel'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { BrowserWindow } from 'electron'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { BaseModule } from '../abstract-base-module'
import { shortcutModule } from '../global-shortcon'
import { FlowBusIPC, initializeFlowBusIPC } from './ipc'
import { flowTargetRegistry } from './target-registry'

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
   * Triggers detach operation - sends event to focused CoreBox window
   */
  private triggerDetach(): void {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (!focusedWindow) return

    $app.channel.sendTo(focusedWindow, ChannelType.MAIN, 'flow:trigger-detach', {})
    console.log('[FlowBusModule] Triggered detach shortcut')
  }

  /**
   * Triggers flow transfer operation - sends event to focused CoreBox window
   */
  private triggerFlowTransfer(): void {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (!focusedWindow) return

    $app.channel.sendTo(focusedWindow, ChannelType.MAIN, 'flow:trigger-transfer', {})
    console.log('[FlowBusModule] Triggered flow transfer shortcut')
  }

  /**
   * Sets up integration with plugin system
   */
  private setupPluginIntegration(): void {
    // Register channel to receive plugin flow target registrations
    $app.channel.regChannel(
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
    $app.channel.regChannel(
      ChannelType.MAIN,
      'flow:unregister-targets',
      (data) => {
        const { pluginId } = data.data as { pluginId: string }
        flowTargetRegistry.unregisterPluginTargets(pluginId)
        data.reply(DataCode.SUCCESS, { success: true })
      }
    )

    // Register channel to update plugin enabled state
    $app.channel.regChannel(
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
