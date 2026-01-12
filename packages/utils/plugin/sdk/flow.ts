/**
 * Flow SDK
 *
 * Plugin-side API for Flow Transfer operations.
 * Allows plugins to dispatch flows and receive flow data.
 */

import type {
  FlowPayload,
  FlowDispatchOptions,
  FlowDispatchResult,
  FlowTargetInfo,
  FlowSessionUpdate,
  FlowPayloadType
} from '../../types/flow'
import { FlowIPCChannel } from '../../types/flow'
import { hasWindow } from '../../env'

/**
 * Flow transfer handler function type
 */
export type FlowTransferHandler = (
  payload: FlowPayload,
  sessionId: string,
  senderInfo: { senderId: string; senderName?: string }
) => Promise<void> | void

/**
 * Flow SDK interface
 */
export interface IFlowSDK {
  /**
   * Dispatches a flow payload to another plugin
   *
   * @param payload - Data to transfer
   * @param options - Dispatch options
   * @returns Dispatch result
   *
   * @example
   * ```typescript
   * const result = await flow.dispatch(
   *   {
   *     type: 'text',
   *     data: 'Hello from plugin A',
   *     context: { sourcePluginId: 'plugin-a' }
   *   },
   *   {
   *     title: 'Share Text',
   *     preferredTarget: 'plugin-b.quick-note'
   *   }
   * )
   * ```
   */
  dispatch(payload: FlowPayload, options?: FlowDispatchOptions): Promise<FlowDispatchResult>

  /**
   * Gets available flow targets
   *
   * @param payloadType - Filter by payload type (optional)
   * @returns List of available targets
   */
  getAvailableTargets(payloadType?: FlowPayloadType): Promise<FlowTargetInfo[]>

  /**
   * Registers a handler for incoming flow transfers
   * This tells the system that your plugin can handle flow data
   *
   * @param handler - Handler function for incoming flows
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = flow.onFlowTransfer(async (payload, sessionId, sender) => {
   *   console.log(`Received ${payload.type} from ${sender.senderName}`)
   *   // Process the payload...
   *   await flow.acknowledge(sessionId, { processed: true })
   * })
   * ```
   */
  onFlowTransfer(handler: FlowTransferHandler): () => void

  /**
   * Listens for session updates
   *
   * @param sessionId - Session to listen to
   * @param handler - Update handler
   * @returns Unsubscribe function
   */
  onSessionUpdate(
    sessionId: string,
    handler: (update: FlowSessionUpdate) => void
  ): () => void

  /**
   * Cancels a flow session
   *
   * @param sessionId - Session to cancel
   */
  cancel(sessionId: string): Promise<void>

  /**
   * Acknowledges a received flow (for target plugins)
   *
   * @param sessionId - Session to acknowledge
   * @param ackPayload - Optional acknowledgment data
   */
  acknowledge(sessionId: string, ackPayload?: any): Promise<void>

  /**
   * Reports an error for a received flow (for target plugins)
   *
   * @param sessionId - Session to report error for
   * @param message - Error message
   */
  reportError(sessionId: string, message: string): Promise<void>

  /**
   * Uses native system share functionality
   *
   * @param payload - Data to share
   * @param target - Optional preferred native target (system, airdrop, mail, messages)
   */
  nativeShare(payload: FlowPayload, target?: string): Promise<{ success: boolean; target?: string; error?: string }>
}

/**
 * Creates a Flow SDK instance
 *
 * @param channel - Channel for IPC communication
 * @param pluginId - Current plugin ID
 * @returns Flow SDK instance
 */
export function createFlowSDK(
  channel: { send: (event: string, data?: any) => Promise<any> },
  pluginId: string
): IFlowSDK {
  const sessionListeners = new Map<string, Set<(update: FlowSessionUpdate) => void>>()
  const flowTransferHandlers = new Set<FlowTransferHandler>()
  let hasRegisteredHandler = false

  // Listen for session updates
  if (hasWindow()) {
    window.addEventListener('message', (event) => {
      if (event.data?.type === FlowIPCChannel.SESSION_UPDATE) {
        const update = event.data.payload as FlowSessionUpdate
        const listeners = sessionListeners.get(update.sessionId)
        if (listeners) {
          for (const listener of listeners) {
            try {
              listener(update)
            } catch (error) {
              console.error('[FlowSDK] Error in session listener:', error)
            }
          }
        }
      }
    })
  }

  return {
    async dispatch(payload: FlowPayload, options?: FlowDispatchOptions): Promise<FlowDispatchResult> {
      // Ensure context has sourcePluginId
      const enrichedPayload: FlowPayload = {
        ...payload,
        context: {
          ...payload.context,
          sourcePluginId: payload.context?.sourcePluginId || pluginId
        }
      }

      const response = await channel.send(FlowIPCChannel.DISPATCH, {
        senderId: pluginId,
        payload: enrichedPayload,
        options
      })

      if (!response?.success) {
        throw new Error(response?.error?.message || 'Flow dispatch failed')
      }

      return response.data
    },

    async getAvailableTargets(payloadType?: FlowPayloadType): Promise<FlowTargetInfo[]> {
      const response = await channel.send(FlowIPCChannel.GET_TARGETS, {
        payloadType
      })

      if (!response?.success) {
        throw new Error(response?.error?.message || 'Failed to get targets')
      }

      return response.data || []
    },

    onSessionUpdate(
      sessionId: string,
      handler: (update: FlowSessionUpdate) => void
    ): () => void {
      if (!sessionListeners.has(sessionId)) {
        sessionListeners.set(sessionId, new Set())
      }
      sessionListeners.get(sessionId)!.add(handler)

      return () => {
        const listeners = sessionListeners.get(sessionId)
        if (listeners) {
          listeners.delete(handler)
          if (listeners.size === 0) {
            sessionListeners.delete(sessionId)
          }
        }
      }
    },

    async cancel(sessionId: string): Promise<void> {
      const response = await channel.send(FlowIPCChannel.CANCEL, {
        sessionId
      })

      if (!response?.success) {
        throw new Error(response?.error?.message || 'Failed to cancel session')
      }
    },

    async acknowledge(sessionId: string, ackPayload?: any): Promise<void> {
      const response = await channel.send(FlowIPCChannel.ACKNOWLEDGE, {
        sessionId,
        ackPayload
      })

      if (!response?.success) {
        throw new Error(response?.error?.message || 'Failed to acknowledge session')
      }
    },

    async reportError(sessionId: string, message: string): Promise<void> {
      const response = await channel.send(FlowIPCChannel.REPORT_ERROR, {
        sessionId,
        message
      })

      if (!response?.success) {
        throw new Error(response?.error?.message || 'Failed to report error')
      }
    },

    onFlowTransfer(handler: FlowTransferHandler): () => void {
      flowTransferHandlers.add(handler)

      // Notify the system that this plugin has a flow handler
      if (!hasRegisteredHandler) {
        hasRegisteredHandler = true
        channel.send('flow:set-plugin-handler', {
          pluginId,
          hasHandler: true
        }).catch((err) => {
          console.warn('[FlowSDK] Failed to register flow handler:', err)
        })

        // Listen for incoming flow transfers
        if (hasWindow()) {
          window.addEventListener('message', (event) => {
            if (event.data?.type === FlowIPCChannel.DELIVER && event.data?.targetPluginId === pluginId) {
              const { payload, sessionId, senderId, senderName } = event.data
              for (const h of flowTransferHandlers) {
                try {
                  h(payload, sessionId, { senderId, senderName })
                } catch (error) {
                  console.error('[FlowSDK] Error in flow transfer handler:', error)
                }
              }
            }
          })
        }
      }

      return () => {
        flowTransferHandlers.delete(handler)
        if (flowTransferHandlers.size === 0) {
          hasRegisteredHandler = false
          channel.send('flow:set-plugin-handler', {
            pluginId,
            hasHandler: false
          }).catch(() => {})
        }
      }
    },

    async nativeShare(payload: FlowPayload, target?: string): Promise<{ success: boolean; target?: string; error?: string }> {
      const response = await channel.send('flow:native-share', {
        payload,
        target
      })

      return response?.data || { success: false, error: 'Native share failed' }
    }
  }
}

/**
 * Helper to extract flow data from TuffQuery
 *
 * When a feature is triggered via Flow, the query will contain flow information.
 *
 * @param query - TuffQuery from feature trigger
 * @returns Flow data if present, null otherwise
 */
export function extractFlowData(query: any): {
  sessionId: string
  payload: FlowPayload
  senderId: string
  senderName?: string
} | null {
  if (!query?.flow) {
    return null
  }

  return {
    sessionId: query.flow.sessionId,
    payload: query.flow.payload,
    senderId: query.flow.senderId,
    senderName: query.flow.senderName
  }
}

/**
 * Helper to check if a feature was triggered via Flow
 *
 * @param query - TuffQuery from feature trigger
 * @returns True if triggered via Flow
 */
export function isFlowTriggered(query: any): boolean {
  return !!query?.flow
}
