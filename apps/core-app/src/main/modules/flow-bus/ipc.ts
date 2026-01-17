/**
 * Flow Bus IPC Communication
 *
 * Registers IPC handlers for Flow operations.
 */

import type { ITouchChannel } from '@talex-touch/utils/channel'
import { FlowEvents, getTuffTransportMain } from '@talex-touch/utils/transport'
import { getPermissionModule } from '../permission'
import { flowBus } from './flow-bus'
import { flowSessionManager } from './session-manager'

/**
 * FlowBusIPC
 *
 * Manages IPC communication for Flow operations.
 */
export class FlowBusIPC {
  private channel: ITouchChannel
  private unregisterFunctions: Array<() => void> = []
  private transportDisposers: Array<() => void> = []
  private transport: ReturnType<typeof getTuffTransportMain> | null = null

  constructor(channel: ITouchChannel) {
    this.channel = channel
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

    console.log('[FlowBusIPC] All transport handlers registered')
  }

  private registerTransportHandlers(): void {
    const channel = this.channel as any
    const transport = getTuffTransportMain(channel, channel?.keyManager ?? channel)

    this.transport = transport

    const enforce = (context: any, eventName: string, sdkapi?: number) => {
      const pluginId = context?.plugin?.name
      if (!pluginId) {
        return
      }
      const perm = getPermissionModule()
      if (!perm) {
        return
      }
      perm.enforcePermission(pluginId, eventName, sdkapi)
    }

    this.transportDisposers.push(
      transport.on(FlowEvents.dispatch, async (payload: any, context: any) => {
        enforce(context, 'flow:bus:dispatch', payload?._sdkapi)
        return await flowBus
          .dispatch(payload.senderId, payload.payload, payload.options)
          .then((result) => ({ success: result.state !== 'FAILED', data: result }))
          .catch((error: any) => ({
            success: false,
            error: { message: error instanceof Error ? error.message : 'Unknown error' }
          }))
      })
    )

    this.transportDisposers.push(
      transport.on(FlowEvents.getTargets, async (payload: any, context: any) => {
        enforce(context, 'flow:bus:get-targets', payload?._sdkapi)
        const targets = flowBus.getAvailableTargets(payload?.payloadType)
        return { success: true, data: targets }
      })
    )

    this.transportDisposers.push(
      transport.on(FlowEvents.cancel, async (payload: any, context: any) => {
        enforce(context, 'flow:bus:cancel', payload?._sdkapi)
        const success = flowBus.cancel(payload.sessionId)
        return { success, data: { cancelled: success } }
      })
    )

    this.transportDisposers.push(
      transport.on(FlowEvents.acknowledge, async (payload: any, context: any) => {
        enforce(context, 'flow:bus:acknowledge', payload?._sdkapi)
        const success = flowBus.acknowledge(payload.sessionId, payload.ackPayload)
        return { success, data: { acknowledged: success } }
      })
    )

    this.transportDisposers.push(
      transport.on(FlowEvents.reportError, async (payload: any, context: any) => {
        enforce(context, 'flow:bus:report-error', payload?._sdkapi)
        const success = flowBus.reportError(payload.sessionId, payload.message || 'Unknown error')
        return { success, data: { reported: success } }
      })
    )

    this.transportDisposers.push(
      transport.on(FlowEvents.selectTarget, async (payload: any, context: any) => {
        enforce(context, 'flow:bus:select-target', payload?._sdkapi)
        const { sessionId, targetId } = payload as { sessionId: string; targetId: string | null }

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

    console.log('[FlowBusIPC] All IPC handlers unregistered')
  }

  /**
   * Broadcasts session update to all windows
   */
  private broadcastSessionUpdate(update: import('@talex-touch/utils').FlowSessionUpdate): void {
    if (this.transport) {
      try {
        this.transport.broadcast(FlowEvents.sessionUpdate, update)
      } catch {
        // ignore
      }

      const session = flowBus.getSession(update.sessionId)
      const senderId = session?.senderId
      const targetPluginId = session?.targetPluginId

      if (senderId) {
        this.transport.sendToPlugin(senderId, FlowEvents.sessionUpdate, update).catch(() => {})
      }
      if (targetPluginId) {
        this.transport
          .sendToPlugin(targetPluginId, FlowEvents.sessionUpdate, update)
          .catch(() => {})
      }
    }
  }
}

/**
 * Initializes Flow Bus IPC
 */
export function initializeFlowBusIPC(channel: ITouchChannel): FlowBusIPC {
  const ipc = new FlowBusIPC(channel)
  ipc.registerHandlers()
  return ipc
}
