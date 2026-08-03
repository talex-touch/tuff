/**
 * Flow Bus Module
 *
 * Main module class for Flow Transfer system.
 * Handles initialization, IPC registration, and plugin integration.
 */

import type { MaybePromise, ModuleInitContext, NativeShareOptions } from '@talex-touch/utils'
import type { getTuffTransportMain, HandlerContext } from '@talex-touch/utils/transport/main'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { FlowBusIPC } from './ipc'
import { FlowEvents } from '@talex-touch/utils/transport/main'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { BaseModule } from '../abstract-base-module'
import { getPermissionModule } from '../permission'
import { flowBus } from './flow-bus'
import { initializeFlowBusIPC } from './ipc'
import { flowBusModuleLog } from './logger'
import { nativeShareService } from './native-share'
import { flowTargetRegistry } from './target-registry'

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
  async onInit(ctx: ModuleInitContext<TalexEvents>): Promise<void> {
    const runtime = resolveMainRuntime(ctx, 'FlowBusModule.onInit')
    const transport = runtime.transport

    // Initialize IPC handlers
    this.ipc = initializeFlowBusIPC(transport)

    this.registerTransportHandlers(transport)

    // Register native share targets
    this.registerNativeShareTargets()

    flowBusModuleLog.info('Module initialized')
  }

  private registerTransportHandlers(tx: ReturnType<typeof getTuffTransportMain>): void {
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
              await tx.sendToPlugin(pluginId, FlowEvents.deliver, {
                sessionId: session.sessionId,
                payload: session.payload,
                senderId: session.senderId
              })
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
          options.target = nativeShareService.normalizeTarget(
            payload.target
          ) as NativeShareOptions['target']
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

    flowBusModuleLog.info('Registered native share targets', {
      meta: {
        count: targets.length
      }
    })
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

    flowBusModuleLog.info('Module destroyed')
  }
}

export const flowBusModule = new FlowBusModule()
