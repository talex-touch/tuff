/**
 * Flow Bus IPC Communication
 *
 * Registers IPC handlers for Flow operations.
 */

import {
  FlowEvents,
  type HandlerContext,
  type ITuffTransportMain
} from '@talex-touch/utils/transport/main'
import { isAuthoritativePluginContext } from '@talex-touch/utils/transport/security/plugin-identity'
import { getPermissionModule } from '../permission'
import { pluginModule } from '../plugin/plugin-module'
import { flowBus } from './flow-bus'
import { flowConsentStore, requiresFlowConsent } from './flow-consent'
import { flowBusIpcLog } from './logger'
import { flowSessionManager } from './session-manager'
import { flowTargetRegistry } from './target-registry'

function createFlowSecurityError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string }
  err.code = code
  return err
}

function isPluginRecipient(id?: string): id is string {
  return Boolean(id && id !== 'corebox' && id !== 'native' && id !== 'system')
}

/**
 * FlowBusIPC
 *
 * Manages IPC communication for Flow operations.
 */
export class FlowBusIPC {
  private unregisterFunctions: Array<() => void> = []
  private transportDisposers: Array<() => void> = []
  private transport: ITuffTransportMain | null = null

  constructor(transport: ITuffTransportMain) {
    this.transport = transport
  }

  /**
   * Registers all IPC handlers
   */
  registerHandlers(): void {
    this.registerTransportHandlers()

    // Subscribe to session updates for broadcasting
    const unsubscribe = flowSessionManager.addGlobalListener((update) => {
      this.broadcastSessionUpdate(update)
    })
    this.unregisterFunctions.push(unsubscribe)

    flowBusIpcLog.info('Transport handlers registered')
  }

  private registerTransportHandlers(): void {
    if (!this.transport) {
      return
    }

    const transport = this.transport

    const resolvePluginSdkapi = (pluginId?: string): number | undefined => {
      if (!pluginId) return undefined
      return pluginModule.pluginManager?.plugins.get(pluginId)?.sdkapi
    }

    const toPayloadRecord = (payload: unknown): Record<string, unknown> | null => {
      if (!payload || typeof payload !== 'object') {
        return null
      }
      return payload as Record<string, unknown>
    }

    const resolveNestedSourcePluginId = (
      payload: Record<string, unknown> | null
    ): string | undefined => {
      const nestedPayload = payload?.payload
      if (!nestedPayload || typeof nestedPayload !== 'object') {
        return undefined
      }
      const contextPayload = (nestedPayload as Record<string, unknown>).context
      if (!contextPayload || typeof contextPayload !== 'object') {
        return undefined
      }
      const sourcePluginId = (contextPayload as Record<string, unknown>).sourcePluginId
      return typeof sourcePluginId === 'string' ? sourcePluginId : undefined
    }

    const resolveVerifiedSdkapi = (
      pluginId: string,
      payloadRecord: Record<string, unknown> | null
    ): number | undefined => {
      const payloadSdkapi =
        typeof payloadRecord?._sdkapi === 'number' ? payloadRecord._sdkapi : undefined
      const declaredSdkapi = resolvePluginSdkapi(pluginId)
      if (
        typeof declaredSdkapi === 'number' &&
        typeof payloadSdkapi === 'number' &&
        payloadSdkapi !== declaredSdkapi
      ) {
        throw createFlowSecurityError(
          'SDKAPI_MISMATCH',
          `Plugin sdkapi mismatch: payload=${payloadSdkapi}, declared=${declaredSdkapi}`
        )
      }
      return declaredSdkapi ?? payloadSdkapi
    }

    const getAuthoritativePluginOrThrow = (context: HandlerContext) => {
      if (!context?.plugin) {
        return undefined
      }
      if (!isAuthoritativePluginContext(context.plugin)) {
        throw createFlowSecurityError(
          'PERMISSION_DENIED',
          'Flow operations require an authoritative plugin caller.'
        )
      }
      return context.plugin
    }

    const resolveActor = (context: HandlerContext, payload: unknown) => {
      const payloadRecord = toPayloadRecord(payload)
      const authoritativePlugin = getAuthoritativePluginOrThrow(context)
      if (authoritativePlugin) {
        const pluginId = authoritativePlugin.name
        return {
          pluginId,
          sdkapi: resolveVerifiedSdkapi(pluginId, payloadRecord),
          isPluginCaller: true as const
        }
      }

      const payloadSenderId = payloadRecord?.senderId
      const actorPluginId =
        (typeof payloadRecord?.actorPluginId === 'string'
          ? payloadRecord.actorPluginId
          : undefined) ??
        resolveNestedSourcePluginId(payloadRecord) ??
        (typeof payloadSenderId === 'string' && payloadSenderId !== 'corebox'
          ? payloadSenderId
          : undefined)

      if (!actorPluginId || actorPluginId === 'corebox') {
        return { isPluginCaller: false as const }
      }

      return {
        pluginId: actorPluginId,
        sdkapi: resolveVerifiedSdkapi(actorPluginId, payloadRecord),
        isPluginCaller: false as const
      }
    }

    const enforce = (context: HandlerContext, eventName: string, payload?: unknown) => {
      const actor = resolveActor(context, payload)
      if (!actor.pluginId) {
        return actor
      }
      const perm = getPermissionModule()
      if (!perm) {
        return actor
      }
      perm.enforcePermission(actor.pluginId, eventName, actor.sdkapi)
      return actor
    }

    const toFlowError = (
      error: unknown
    ): {
      message: string
      code?: string
      permissionId?: string
      showRequest?: boolean
    } => {
      const fallback = {
        message: error instanceof Error ? error.message : 'Unknown error'
      }
      if (!error || typeof error !== 'object') {
        return fallback
      }

      const candidate = error as {
        message?: unknown
        code?: unknown
        permissionId?: unknown
        showRequest?: unknown
      }
      return {
        message: typeof candidate.message === 'string' ? candidate.message : fallback.message,
        code: typeof candidate.code === 'string' ? candidate.code : undefined,
        permissionId:
          typeof candidate.permissionId === 'string' ? candidate.permissionId : undefined,
        showRequest: typeof candidate.showRequest === 'boolean' ? candidate.showRequest : undefined
      }
    }

    this.transportDisposers.push(
      transport.on(FlowEvents.dispatch, async (payload, context) => {
        try {
          const actor = enforce(context, 'flow:bus:dispatch', payload)
          let senderId: string | undefined
          if (actor.isPluginCaller) {
            if (payload.senderId && payload.senderId !== actor.pluginId) {
              throw createFlowSecurityError(
                'PERMISSION_DENIED',
                'Flow senderId does not match the calling plugin.'
              )
            }
            senderId = actor.pluginId
          } else {
            senderId = payload.senderId
          }
          if (!senderId) {
            return { success: false, error: { message: 'senderId is required' } }
          }

          const result = await flowBus.dispatch(senderId, payload.payload, payload.options)
          if (result.state === 'FAILED') {
            return {
              success: false,
              error: {
                message: result.error?.message || 'Flow dispatch failed',
                code: result.error?.code
              },
              data: result
            }
          }
          return { success: true, data: result }
        } catch (error) {
          return {
            success: false,
            error: toFlowError(error)
          }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(FlowEvents.getTargets, async (payload, context) => {
        try {
          enforce(context, 'flow:bus:get-targets', payload)
          const targets = flowBus.getAvailableTargets(payload?.payloadType)
          return { success: true, data: targets }
        } catch (error) {
          return { success: false, error: toFlowError(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(FlowEvents.cancel, async (payload, context) => {
        try {
          const actor = enforce(context, 'flow:bus:cancel', payload)
          const session = flowBus.getSession(payload.sessionId)
          if (actor.isPluginCaller) {
            if (
              !session ||
              (session.senderId !== actor.pluginId && session.targetPluginId !== actor.pluginId)
            ) {
              throw createFlowSecurityError(
                'PERMISSION_DENIED',
                'Only Flow session participants can cancel a session.'
              )
            }
          }
          const success = flowBus.cancel(payload.sessionId)
          return { success, data: { cancelled: success } }
        } catch (error) {
          return { success: false, error: toFlowError(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(FlowEvents.acknowledge, async (payload, context) => {
        try {
          const actor = enforce(context, 'flow:bus:acknowledge', payload)
          const session = flowBus.getSession(payload.sessionId)
          if (actor.isPluginCaller) {
            if (!session || session.targetPluginId !== actor.pluginId) {
              throw createFlowSecurityError(
                'PERMISSION_DENIED',
                'Only the target plugin can acknowledge a Flow session.'
              )
            }
          }
          const success = flowBus.acknowledge(payload.sessionId, payload.ackPayload)
          return { success, data: { acknowledged: success } }
        } catch (error) {
          return { success: false, error: toFlowError(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(FlowEvents.reportError, async (payload, context) => {
        try {
          const actor = enforce(context, 'flow:bus:report-error', payload)
          const session = flowBus.getSession(payload.sessionId)
          if (actor.isPluginCaller) {
            if (!session || session.targetPluginId !== actor.pluginId) {
              throw createFlowSecurityError(
                'PERMISSION_DENIED',
                'Only the target plugin can report an error for a Flow session.'
              )
            }
          }
          const success = flowBus.reportError(payload.sessionId, payload.message || 'Unknown error')
          return { success, data: { reported: success } }
        } catch (error) {
          return { success: false, error: toFlowError(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(FlowEvents.selectTarget, async (payload, context) => {
        try {
          if (context?.plugin) {
            throw createFlowSecurityError(
              'PERMISSION_DENIED',
              'Flow target selection can only be resolved by app UI.'
            )
          }
          enforce(context, 'flow:bus:select-target', payload)
          const { sessionId, targetId } = payload

          if (!sessionId) {
            return {
              success: false,
              error: { message: 'sessionId is required' }
            }
          }

          flowBus.resolveTargetSelection(sessionId, targetId)
          return {
            success: true,
            data: { resolved: true }
          }
        } catch (error) {
          return { success: false, error: toFlowError(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(FlowEvents.checkConsent, async (payload, context) => {
        try {
          const authoritativePlugin = getAuthoritativePluginOrThrow(context)
          const { targetId } = payload || {}
          let senderId = payload?.senderId
          if (authoritativePlugin) {
            if (senderId && senderId !== authoritativePlugin.name) {
              throw createFlowSecurityError(
                'PERMISSION_DENIED',
                'Plugins can only query their own Flow consent state.'
              )
            }
            senderId = authoritativePlugin.name
          }
          if (!senderId || !targetId) {
            return { success: false, error: { message: 'senderId and targetId are required' } }
          }
          const target = flowTargetRegistry.getTarget(targetId)
          if (!requiresFlowConsent(senderId, target)) {
            return {
              success: true,
              data: { allowed: true, requiresConfirmation: target?.requireConfirm === true }
            }
          }
          const allowed = flowConsentStore.hasConsent(senderId, targetId)
          return {
            success: true,
            data: { allowed, requiresConfirmation: target?.requireConfirm === true }
          }
        } catch (error) {
          return { success: false, error: toFlowError(error) }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(FlowEvents.grantConsent, async (payload, context) => {
        if (context?.plugin) {
          return {
            success: false,
            error: {
              code: 'PERMISSION_DENIED',
              message: 'Flow consent can only be granted by app UI'
            }
          }
        }
        const { senderId, targetId, mode } = payload || {}
        if (!senderId || !targetId || (mode !== 'once' && mode !== 'always')) {
          return { success: false, error: { message: 'Invalid consent payload' } }
        }
        const target = flowTargetRegistry.getTarget(targetId)
        if (!requiresFlowConsent(senderId, target)) {
          return {
            success: true,
            data:
              target?.requireConfirm === true
                ? { confirmationToken: flowConsentStore.grantConfirmationOnce(senderId, targetId) }
                : {}
          }
        }
        if (mode === 'always') {
          flowConsentStore.grantConsent(senderId, targetId)
          return {
            success: true,
            data:
              target?.requireConfirm === true
                ? { confirmationToken: flowConsentStore.grantConfirmationOnce(senderId, targetId) }
                : {}
          }
        }
        const token = flowConsentStore.grantOnce(senderId, targetId)
        return {
          success: true,
          data: {
            token,
            confirmationToken:
              target?.requireConfirm === true
                ? flowConsentStore.grantConfirmationOnce(senderId, targetId)
                : undefined
          }
        }
      })
    )
  }

  /**
   * Unregisters all IPC handlers
   */
  unregisterHandlers(): void {
    this.unregisterFunctions.forEach((unregister) => unregister())
    this.unregisterFunctions = []

    this.transportDisposers.forEach((dispose) => {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    })
    this.transportDisposers = []

    flowBusIpcLog.info('Transport handlers unregistered')
  }

  /**
   * Broadcasts session update to host UI windows and participant plugins only
   */
  private broadcastSessionUpdate(update: import('@talex-touch/utils').FlowSessionUpdate): void {
    if (!this.transport) {
      return
    }

    const session = flowBus.getSession(update.sessionId)
    const senderId = session?.senderId
    const targetPluginId = session?.targetPluginId

    // Host UI only needs updates for sessions it initiated or target selection states
    if (
      !senderId ||
      senderId === 'corebox' ||
      senderId === 'system' ||
      update.currentState === 'TARGET_SELECTING'
    ) {
      try {
        this.transport.broadcast(FlowEvents.sessionUpdate, update)
      } catch {
        // ignore
      }
    }

    if (isPluginRecipient(senderId)) {
      void this.transport
        .sendToPlugin(senderId, FlowEvents.sessionUpdate, update)
        .catch((error) => {
          flowBusIpcLog.debug('Failed to send Flow session update to sender plugin', {
            meta: { sessionId: update.sessionId, pluginId: senderId },
            error
          })
        })
    }
    if (isPluginRecipient(targetPluginId) && targetPluginId !== senderId) {
      void this.transport
        .sendToPlugin(targetPluginId, FlowEvents.sessionUpdate, update)
        .catch((error) => {
          flowBusIpcLog.debug('Failed to send Flow session update to target plugin', {
            meta: { sessionId: update.sessionId, pluginId: targetPluginId },
            error
          })
        })
    }
  }
}

/**
 * Initializes Flow Bus IPC
 */
export function initializeFlowBusIPC(transport: ITuffTransportMain): FlowBusIPC {
  const ipc = new FlowBusIPC(transport)
  ipc.registerHandlers()
  return ipc
}
