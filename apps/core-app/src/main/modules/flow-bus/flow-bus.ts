/**
 * Flow Bus - Core Dispatcher
 *
 * Central hub for Flow Transfer operations.
 * Handles payload validation, target resolution, and message delivery.
 */

import type {
  FlowPayload,
  FlowDispatchOptions,
  FlowDispatchResult,
  FlowTargetInfo,
  FlowSession,
  FlowError,
  FlowPayloadType
} from '@talex-touch/utils'
import { FlowErrorCode } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { flowTargetRegistry } from './target-registry'
import { flowSessionManager } from './session-manager'

/**
 * Maximum payload size in bytes (5MB)
 */
const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024

/**
 * FlowBus
 *
 * Singleton dispatcher for Flow Transfer operations.
 */
export class FlowBus {
  private static instance: FlowBus | null = null
  private readonly pollingService = PollingService.getInstance()
  private readonly cleanupTaskId = 'flow-bus.cleanup'

  /** Pending target selection callbacks */
  private pendingSelections: Map<string, {
    resolve: (targetId: string | null) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
  }> = new Map()

  /** Delivery handlers by plugin ID */
  private deliveryHandlers: Map<string, (session: FlowSession) => Promise<void>> = new Map()

  private constructor() {
    // Start periodic cleanup
    this.pollingService.register(
      this.cleanupTaskId,
      () => flowSessionManager.cleanup(),
      { interval: 60, unit: 'seconds' },
    )
    this.pollingService.start()
  }

  static getInstance(): FlowBus {
    if (!FlowBus.instance) {
      FlowBus.instance = new FlowBus()
    }
    return FlowBus.instance
  }

  /**
   * Dispatches a Flow payload
   */
  async dispatch(
    senderId: string,
    payload: FlowPayload,
    options: FlowDispatchOptions = {}
  ): Promise<FlowDispatchResult> {
    // Validate payload
    const validationError = this.validatePayload(payload)
    if (validationError) {
      return {
        sessionId: '',
        state: 'FAILED',
        error: validationError
      }
    }

    // Resolve target
    let targetInfo: FlowTargetInfo | null = null

    if (options.preferredTarget) {
      targetInfo = flowTargetRegistry.getTarget(options.preferredTarget) ?? null
      if (!targetInfo) {
        return {
          sessionId: '',
          state: 'FAILED',
          error: {
            code: FlowErrorCode.TARGET_NOT_FOUND,
            message: `Target not found: ${options.preferredTarget}`
          }
        }
      }
      if (!targetInfo.isEnabled) {
        return {
          sessionId: '',
          state: 'FAILED',
          error: {
            code: FlowErrorCode.TARGET_OFFLINE,
            message: `Target plugin is not enabled: ${options.preferredTarget}`
          }
        }
      }
    }

    // Create session
    const session = flowSessionManager.createSession(
      senderId,
      targetInfo?.pluginId ?? '',
      targetInfo?.id ?? '',
      payload
    )

    // If no target specified, need user selection
    if (!targetInfo) {
      flowSessionManager.updateState(session.sessionId, 'TARGET_SELECTING')

      if (options.skipSelector) {
        flowSessionManager.setError(session.sessionId, {
          code: FlowErrorCode.TARGET_NOT_FOUND,
          message: 'No target specified and selector skipped'
        })
        return {
          sessionId: session.sessionId,
          state: 'FAILED',
          error: session.error
        }
      }

      // Wait for user selection (will be resolved by UI)
      try {
        const selectedTargetId = await this.waitForTargetSelection(
          session.sessionId,
          options.timeout ?? flowSessionManager.getDefaultTimeout()
        )

        if (!selectedTargetId) {
          flowSessionManager.cancel(session.sessionId)
          return {
            sessionId: session.sessionId,
            state: 'CANCELLED'
          }
        }

        targetInfo = flowTargetRegistry.getTarget(selectedTargetId) ?? null
        if (!targetInfo) {
          flowSessionManager.setError(session.sessionId, {
            code: FlowErrorCode.TARGET_NOT_FOUND,
            message: `Selected target not found: ${selectedTargetId}`
          })
          return {
            sessionId: session.sessionId,
            state: 'FAILED',
            error: session.error
          }
        }
      } catch (error) {
        const flowError: FlowError = {
          code: FlowErrorCode.TIMEOUT,
          message: error instanceof Error ? error.message : 'Target selection timeout'
        }
        flowSessionManager.setError(session.sessionId, flowError)
        return {
          sessionId: session.sessionId,
          state: 'FAILED',
          error: flowError
        }
      }
    }

    // Update session with target info
    const updatedSession = flowSessionManager.getSession(session.sessionId)!
    updatedSession.targetPluginId = targetInfo.pluginId
    updatedSession.targetId = targetInfo.id
    updatedSession.fullTargetId = targetInfo.fullId

    flowSessionManager.updateState(session.sessionId, 'TARGET_SELECTED')

    // Validate target supports payload type
    if (!targetInfo.supportedTypes.includes(payload.type)) {
      flowSessionManager.setError(session.sessionId, {
        code: FlowErrorCode.TYPE_NOT_SUPPORTED,
        message: `Target does not support payload type: ${payload.type}`
      })
      return {
        sessionId: session.sessionId,
        state: 'FAILED',
        error: updatedSession.error
      }
    }

    // Check sender whitelist
    if (targetInfo.capabilities?.allowedSenders?.length) {
      if (!targetInfo.capabilities.allowedSenders.includes(senderId)) {
        flowSessionManager.setError(session.sessionId, {
          code: FlowErrorCode.PERMISSION_DENIED,
          message: `Sender not allowed: ${senderId}`
        })
        return {
          sessionId: session.sessionId,
          state: 'FAILED',
          error: updatedSession.error
        }
      }
    }

    // Deliver payload
    flowSessionManager.updateState(session.sessionId, 'DELIVERING')

    try {
      await this.deliverPayload(updatedSession, targetInfo)
      flowSessionManager.updateState(session.sessionId, 'DELIVERED')

      // Record usage
      flowTargetRegistry.recordUsage(targetInfo.fullId)

      // Wait for acknowledgment if required
      if (options.requireAck) {
        flowSessionManager.updateState(session.sessionId, 'PROCESSING')

        const finalSession = await this.waitForAcknowledgment(
          session.sessionId,
          options.timeout ?? flowSessionManager.getDefaultTimeout()
        )

        return {
          sessionId: session.sessionId,
          state: finalSession.state,
          ackPayload: finalSession.ackPayload,
          error: finalSession.error
        }
      }

      return {
        sessionId: session.sessionId,
        state: 'DELIVERED'
      }
    } catch (error) {
      const flowError: FlowError = {
        code: FlowErrorCode.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : 'Delivery failed'
      }
      flowSessionManager.setError(session.sessionId, flowError)

      // Execute fallback if specified
      if (options.fallbackAction === 'copy') {
        await this.executeFallbackCopy(payload)
      }

      return {
        sessionId: session.sessionId,
        state: 'FAILED',
        error: flowError
      }
    }
  }

  /**
   * Validates payload
   */
  private validatePayload(payload: FlowPayload): FlowError | null {
    if (!payload || typeof payload !== 'object') {
      return {
        code: FlowErrorCode.PAYLOAD_INVALID,
        message: 'Payload must be an object'
      }
    }

    if (!payload.type) {
      return {
        code: FlowErrorCode.PAYLOAD_INVALID,
        message: 'Payload type is required'
      }
    }

    if (payload.data === undefined || payload.data === null) {
      return {
        code: FlowErrorCode.PAYLOAD_INVALID,
        message: 'Payload data is required'
      }
    }

    // Check size
    const size = this.estimatePayloadSize(payload)
    if (size > MAX_PAYLOAD_SIZE) {
      return {
        code: FlowErrorCode.PAYLOAD_TOO_LARGE,
        message: `Payload too large: ${size} bytes (max: ${MAX_PAYLOAD_SIZE})`
      }
    }

    return null
  }

  /**
   * Estimates payload size in bytes
   */
  private estimatePayloadSize(payload: FlowPayload): number {
    try {
      return JSON.stringify(payload).length * 2 // UTF-16
    } catch {
      return 0
    }
  }

  /**
   * Waits for user to select a target
   */
  private waitForTargetSelection(sessionId: string, timeout: number): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingSelections.delete(sessionId)
        reject(new Error('Target selection timeout'))
      }, timeout)

      this.pendingSelections.set(sessionId, {
        resolve,
        reject,
        timeout: timeoutId
      })
    })
  }

  /**
   * Resolves a pending target selection
   */
  resolveTargetSelection(sessionId: string, targetId: string | null): void {
    const pending = this.pendingSelections.get(sessionId)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingSelections.delete(sessionId)
      pending.resolve(targetId)
    }
  }

  /**
   * Delivers payload to target
   */
  private async deliverPayload(session: FlowSession, target: FlowTargetInfo): Promise<void> {
    const handler = this.deliveryHandlers.get(target.pluginId)
    if (handler) {
      await handler(session)
    } else {
      // Default delivery via IPC (to be implemented with plugin system)
      console.log(`[FlowBus] Delivering to ${target.fullId}:`, session.payload.type)
    }
  }

  /**
   * Registers a delivery handler for a plugin
   */
  registerDeliveryHandler(
    pluginId: string,
    handler: (session: FlowSession) => Promise<void>
  ): () => void {
    this.deliveryHandlers.set(pluginId, handler)
    return () => {
      this.deliveryHandlers.delete(pluginId)
    }
  }

  /**
   * Waits for session acknowledgment
   */
  private waitForAcknowledgment(sessionId: string, timeout: number): Promise<FlowSession> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        unsubscribe()
        const session = flowSessionManager.getSession(sessionId)
        if (session && session.state === 'PROCESSING') {
          flowSessionManager.setError(sessionId, {
            code: FlowErrorCode.TIMEOUT,
            message: 'Acknowledgment timeout'
          })
        }
        resolve(flowSessionManager.getSession(sessionId)!)
      }, timeout)

      const unsubscribe = flowSessionManager.addListener(sessionId, (update) => {
        if (['ACKED', 'FAILED', 'CANCELLED'].includes(update.currentState)) {
          clearTimeout(timeoutId)
          unsubscribe()
          resolve(flowSessionManager.getSession(sessionId)!)
        }
      })
    })
  }

  /**
   * Executes fallback copy action
   */
  private async executeFallbackCopy(payload: FlowPayload): Promise<void> {
    try {
      const { clipboard } = await import('electron')
      if (payload.type === 'text' && typeof payload.data === 'string') {
        clipboard.writeText(payload.data)
      } else if (payload.type === 'html' && typeof payload.data === 'string') {
        clipboard.writeHTML(payload.data)
      } else {
        clipboard.writeText(JSON.stringify(payload.data))
      }
      console.log('[FlowBus] Fallback: copied to clipboard')
    } catch (error) {
      console.error('[FlowBus] Fallback copy failed:', error)
    }
  }

  /**
   * Gets available targets for a payload type
   */
  getAvailableTargets(payloadType?: FlowPayloadType): FlowTargetInfo[] {
    if (payloadType) {
      return flowTargetRegistry.getTargetsByPayloadType(payloadType)
        .filter(t => t.isEnabled)
    }
    return flowTargetRegistry.getEnabledTargets()
  }

  /**
   * Acknowledges a session from target
   */
  acknowledge(sessionId: string, ackPayload?: any): boolean {
    return flowSessionManager.acknowledge(sessionId, ackPayload)
  }

  /**
   * Reports error from target
   */
  reportError(sessionId: string, message: string): boolean {
    return flowSessionManager.setError(sessionId, {
      code: FlowErrorCode.INTERNAL_ERROR,
      message
    })
  }

  /**
   * Cancels a session
   */
  cancel(sessionId: string): boolean {
    // Also resolve any pending selection
    this.resolveTargetSelection(sessionId, null)
    return flowSessionManager.cancel(sessionId)
  }

  /**
   * Gets a session
   */
  getSession(sessionId: string): FlowSession | undefined {
    return flowSessionManager.getSession(sessionId)
  }
}

export const flowBus = FlowBus.getInstance()
