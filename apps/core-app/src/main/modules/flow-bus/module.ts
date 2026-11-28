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
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { t } from '../../utils/i18n-helper'
import { BaseModule } from '../abstract-base-module'
import { getPermissionModule } from '../permission'
import { pluginModule } from '../plugin/plugin-module'
import { flowBus } from './flow-bus'
import { initializeFlowBusIPC } from './ipc'
import { flowBusModuleLog } from './logger'
import { nativeShareService } from './native-share'
import { flowTargetRegistry } from './target-registry'

function createModuleSecurityError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string }
  err.code = code
  return err
}

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

    // Register native share targets and delivery handler
    this.registerNativeShareTargets()

    flowBusModuleLog.info('Module initialized')
  }

  private registerTransportHandlers(tx: ReturnType<typeof getTuffTransportMain>): void {
    const resolvePluginSdkapi = (pluginId: string, payloadSdkapi?: number): number | undefined => {
      const declaredSdkapi = pluginModule.pluginManager?.plugins.get(pluginId)?.sdkapi
      if (
        typeof declaredSdkapi === 'number' &&
        typeof payloadSdkapi === 'number' &&
        payloadSdkapi !== declaredSdkapi
      ) {
        throw createModuleSecurityError(
          'SDKAPI_MISMATCH',
          `Plugin sdkapi mismatch: payload=${payloadSdkapi}, declared=${declaredSdkapi}`
        )
      }
      return declaredSdkapi ?? payloadSdkapi
    }

    const resolveCallerPlugin = (
      context: HandlerContext,
      apiName: string,
      payloadPluginId?: string,
      payloadSdkapi?: number
    ): { pluginId?: string; sdkapi?: number; isPluginCaller: boolean } => {
      if (context?.plugin) {
        if (!isAuthoritativePluginContext(context.plugin)) {
          throw createModuleSecurityError(
            'PERMISSION_DENIED',
            'Flow target management requires an authoritative plugin caller.'
          )
        }
        const pluginId = context.plugin.name
        if (payloadPluginId && payloadPluginId !== pluginId) {
          throw createModuleSecurityError(
            'PERMISSION_DENIED',
            'Plugin cannot modify Flow targets owned by another plugin.'
          )
        }
        const sdkapi = resolvePluginSdkapi(pluginId, payloadSdkapi)
        const perm = getPermissionModule()
        if (perm) {
          perm.enforcePermission(pluginId, apiName, sdkapi)
        }
        return { pluginId, sdkapi, isPluginCaller: true }
      }

      if (payloadPluginId === 'native') {
        throw createModuleSecurityError(
          'PERMISSION_DENIED',
          'Native Flow targets cannot be modified via plugin target channels.'
        )
      }

      return { pluginId: payloadPluginId, isPluginCaller: false }
    }

    this.transportDisposers.push(
      tx.on(FlowEvents.registerTargets, async (payload, context) => {
        const { pluginId: resolvedPluginId } = resolveCallerPlugin(
          context,
          'flow:plugin:register-targets',
          payload?.pluginId,
          payload?._sdkapi
        )
        const { targets, pluginName, pluginIcon, isEnabled } = payload || {}
        if (!resolvedPluginId) {
          throw createModuleSecurityError('INVALID_PAYLOAD', 'pluginId is required')
        }
        if (targets?.length) {
          flowTargetRegistry.registerPluginTargets(resolvedPluginId, targets, {
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
        const { pluginId: resolvedPluginId } = resolveCallerPlugin(
          context,
          'flow:plugin:unregister-targets',
          payload?.pluginId,
          payload?._sdkapi
        )
        if (!resolvedPluginId) {
          throw createModuleSecurityError('INVALID_PAYLOAD', 'pluginId is required')
        }
        flowTargetRegistry.unregisterPluginTargets(resolvedPluginId)
        return { success: true }
      })
    )

    this.transportDisposers.push(
      tx.on(FlowEvents.setPluginEnabled, async (payload, context) => {
        const { pluginId: resolvedPluginId } = resolveCallerPlugin(
          context,
          'flow:plugin:set-plugin-enabled',
          payload?.pluginId,
          payload?._sdkapi
        )
        if (!resolvedPluginId) {
          throw createModuleSecurityError('INVALID_PAYLOAD', 'pluginId is required')
        }
        flowTargetRegistry.setPluginEnabled(resolvedPluginId, payload.enabled)
        return { success: true }
      })
    )

    this.transportDisposers.push(
      tx.on(FlowEvents.setPluginHandler, async (payload, context) => {
        const { pluginId: resolvedPluginId } = resolveCallerPlugin(
          context,
          'flow:plugin:set-plugin-handler',
          payload?.pluginId,
          payload?._sdkapi
        )
        if (!resolvedPluginId) {
          throw createModuleSecurityError('INVALID_PAYLOAD', 'pluginId is required')
        }
        flowTargetRegistry.setPluginFlowHandler(resolvedPluginId, payload.hasHandler)

        const hasHandler = Boolean(payload.hasHandler)
        const existing = this.flowDeliveryDisposers.get(resolvedPluginId)
        if (existing) {
          existing()
          this.flowDeliveryDisposers.delete(resolvedPluginId)
        }

        if (hasHandler) {
          const dispose = flowBus.registerDeliveryHandler(resolvedPluginId, async (session) => {
            await tx.sendToPlugin(resolvedPluginId, FlowEvents.deliver, {
              sessionId: session.sessionId,
              payload: session.payload,
              senderId: session.senderId
            })
          })
          this.flowDeliveryDisposers.set(resolvedPluginId, dispose)
        }
        return { success: true }
      })
    )

    this.transportDisposers.push(
      tx.on(FlowEvents.nativeShare, async (payload, context) => {
        const caller = resolveCallerPlugin(
          context,
          'flow:native:share',
          undefined,
          payload?._sdkapi
        )
        const validationError = flowBus.validatePayload(payload.payload)
        if (validationError) {
          return {
            success: false,
            error: validationError.message
          }
        }
        const options = nativeShareService.payloadToShareOptions(payload.payload)
        if (payload.target) {
          options.target = nativeShareService.normalizeTarget(
            payload.target
          ) as NativeShareOptions['target']
        }
        return await nativeShareService.share(options, {
          callerPluginId: caller.isPluginCaller ? caller.pluginId : undefined,
          callerSdkApi: caller.isPluginCaller ? caller.sdkapi : undefined
        })
      })
    )
  }

  /**
   * Registers native system share targets and the 'native' delivery handler
   */
  private registerNativeShareTargets(): void {
    const targets = nativeShareService.getAvailableTargets()

    for (const target of targets) {
      flowTargetRegistry.registerTarget('native', target, {
        pluginIcon: 'ri:share-forward-line',
        isEnabled: true,
        hasFlowHandler: true, // Native share always has handler
        isNativeShare: true,
        wording: () => ({
          ...nativeShareService.describeTarget(target.id),
          pluginName: t('nativeShare.sectionTitle')
        })
      })
    }

    const existingNativeDisposer = this.flowDeliveryDisposers.get('native')
    if (existingNativeDisposer) {
      existingNativeDisposer()
      this.flowDeliveryDisposers.delete('native')
    }
    const disposeNative = flowBus.registerDeliveryHandler('native', async (session) => {
      const options = nativeShareService.payloadToShareOptions(session.payload)
      options.target = nativeShareService.normalizeTarget(session.targetId)
      const isPluginSender =
        Boolean(session.senderId) && session.senderId !== 'corebox' && session.senderId !== 'system'
      const callerPluginId = isPluginSender ? session.senderId : undefined
      const callerSdkApi = callerPluginId
        ? pluginModule.pluginManager?.plugins.get(callerPluginId)?.sdkapi
        : undefined
      const result = await nativeShareService.share(options, {
        callerPluginId,
        callerSdkApi
      })
      if (!result.success) {
        throw new Error(result.error || 'Native share delivery failed')
      }
    })
    this.flowDeliveryDisposers.set('native', disposeNative)

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

    flowBus.dispose()
    void nativeShareService.cleanupTempFiles()

    // Clear all targets
    flowTargetRegistry.clear()

    flowBusModuleLog.info('Module destroyed')
  }
}

export const flowBusModule = new FlowBusModule()
