/**
 * Flow Bus IPC Communication
 *
 * Registers IPC handlers for Flow operations.
 */

import { BrowserWindow } from 'electron'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import type { ITouchChannel, StandardChannelData } from '@talex-touch/utils/channel'
import {
  FlowIPCChannel,
  type FlowPayload,
  type FlowDispatchOptions,
  type FlowPayloadType
} from '@talex-touch/utils'
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

  constructor(channel: ITouchChannel) {
    this.channel = channel
  }

  /**
   * Registers all IPC handlers
   */
  registerHandlers(): void {
    // flow:dispatch - Dispatch a flow payload
    const unregDispatch = this.channel.regChannel(
      ChannelType.MAIN,
      FlowIPCChannel.DISPATCH,
      this.handleDispatch.bind(this)
    )
    this.unregisterFunctions.push(unregDispatch)

    // flow:get-targets - Get available targets
    const unregGetTargets = this.channel.regChannel(
      ChannelType.MAIN,
      FlowIPCChannel.GET_TARGETS,
      this.handleGetTargets.bind(this)
    )
    this.unregisterFunctions.push(unregGetTargets)

    // flow:cancel - Cancel a session
    const unregCancel = this.channel.regChannel(
      ChannelType.MAIN,
      FlowIPCChannel.CANCEL,
      this.handleCancel.bind(this)
    )
    this.unregisterFunctions.push(unregCancel)

    // flow:acknowledge - Acknowledge a session
    const unregAcknowledge = this.channel.regChannel(
      ChannelType.MAIN,
      FlowIPCChannel.ACKNOWLEDGE,
      this.handleAcknowledge.bind(this)
    )
    this.unregisterFunctions.push(unregAcknowledge)

    // flow:report-error - Report error from target
    const unregReportError = this.channel.regChannel(
      ChannelType.MAIN,
      FlowIPCChannel.REPORT_ERROR,
      this.handleReportError.bind(this)
    )
    this.unregisterFunctions.push(unregReportError)

    // flow:select-target - User selected a target (from UI)
    const unregSelectTarget = this.channel.regChannel(
      ChannelType.MAIN,
      'flow:select-target',
      this.handleSelectTarget.bind(this)
    )
    this.unregisterFunctions.push(unregSelectTarget)

    // Subscribe to session updates for broadcasting
    const unsubscribe = flowSessionManager.addGlobalListener((update) => {
      this.broadcastSessionUpdate(update)
    })
    this.unregisterFunctions.push(unsubscribe)

    console.log('[FlowBusIPC] All IPC handlers registered')
  }

  /**
   * Unregisters all IPC handlers
   */
  unregisterHandlers(): void {
    this.unregisterFunctions.forEach(unregister => unregister())
    this.unregisterFunctions = []
    console.log('[FlowBusIPC] All IPC handlers unregistered')
  }

  /**
   * Handles flow:dispatch
   */
  private async handleDispatch(data: StandardChannelData): Promise<void> {
    try {
      const { senderId, payload, options } = data.data as {
        senderId: string
        payload: FlowPayload
        options?: FlowDispatchOptions
      }

      if (!senderId) {
        data.reply(DataCode.ERROR, {
          success: false,
          error: { message: 'senderId is required' }
        })
        return
      }

      if (!payload) {
        data.reply(DataCode.ERROR, {
          success: false,
          error: { message: 'payload is required' }
        })
        return
      }

      const result = await flowBus.dispatch(senderId, payload, options)

      data.reply(DataCode.SUCCESS, {
        success: result.state !== 'FAILED',
        data: result
      })
    } catch (error) {
      console.error('[FlowBusIPC] Error in handleDispatch:', error)
      data.reply(DataCode.ERROR, {
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      })
    }
  }

  /**
   * Handles flow:get-targets
   */
  private async handleGetTargets(data: StandardChannelData): Promise<void> {
    try {
      const { payloadType } = (data.data || {}) as { payloadType?: FlowPayloadType }

      const targets = flowBus.getAvailableTargets(payloadType)

      data.reply(DataCode.SUCCESS, {
        success: true,
        data: targets
      })
    } catch (error) {
      console.error('[FlowBusIPC] Error in handleGetTargets:', error)
      data.reply(DataCode.ERROR, {
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      })
    }
  }

  /**
   * Handles flow:cancel
   */
  private async handleCancel(data: StandardChannelData): Promise<void> {
    try {
      const { sessionId } = data.data as { sessionId: string }

      if (!sessionId) {
        data.reply(DataCode.ERROR, {
          success: false,
          error: { message: 'sessionId is required' }
        })
        return
      }

      const success = flowBus.cancel(sessionId)

      data.reply(DataCode.SUCCESS, {
        success,
        data: { cancelled: success }
      })
    } catch (error) {
      console.error('[FlowBusIPC] Error in handleCancel:', error)
      data.reply(DataCode.ERROR, {
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      })
    }
  }

  /**
   * Handles flow:acknowledge
   */
  private async handleAcknowledge(data: StandardChannelData): Promise<void> {
    try {
      const { sessionId, ackPayload } = data.data as {
        sessionId: string
        ackPayload?: any
      }

      if (!sessionId) {
        data.reply(DataCode.ERROR, {
          success: false,
          error: { message: 'sessionId is required' }
        })
        return
      }

      const success = flowBus.acknowledge(sessionId, ackPayload)

      data.reply(DataCode.SUCCESS, {
        success,
        data: { acknowledged: success }
      })
    } catch (error) {
      console.error('[FlowBusIPC] Error in handleAcknowledge:', error)
      data.reply(DataCode.ERROR, {
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      })
    }
  }

  /**
   * Handles flow:report-error
   */
  private async handleReportError(data: StandardChannelData): Promise<void> {
    try {
      const { sessionId, message } = data.data as {
        sessionId: string
        message: string
      }

      if (!sessionId) {
        data.reply(DataCode.ERROR, {
          success: false,
          error: { message: 'sessionId is required' }
        })
        return
      }

      const success = flowBus.reportError(sessionId, message || 'Unknown error')

      data.reply(DataCode.SUCCESS, {
        success,
        data: { reported: success }
      })
    } catch (error) {
      console.error('[FlowBusIPC] Error in handleReportError:', error)
      data.reply(DataCode.ERROR, {
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      })
    }
  }

  /**
   * Handles flow:select-target (from UI)
   */
  private async handleSelectTarget(data: StandardChannelData): Promise<void> {
    try {
      const { sessionId, targetId } = data.data as {
        sessionId: string
        targetId: string | null
      }

      if (!sessionId) {
        data.reply(DataCode.ERROR, {
          success: false,
          error: { message: 'sessionId is required' }
        })
        return
      }

      flowBus.resolveTargetSelection(sessionId, targetId)

      data.reply(DataCode.SUCCESS, {
        success: true,
        data: { resolved: true }
      })
    } catch (error) {
      console.error('[FlowBusIPC] Error in handleSelectTarget:', error)
      data.reply(DataCode.ERROR, {
        success: false,
        error: { message: error instanceof Error ? error.message : 'Unknown error' }
      })
    }
  }

  /**
   * Broadcasts session update to all windows
   */
  private broadcastSessionUpdate(update: import('@talex-touch/utils').FlowSessionUpdate): void {
    const windows = BrowserWindow.getAllWindows()

    for (const window of windows) {
      try {
        this.channel.sendToMain(window, FlowIPCChannel.SESSION_UPDATE, update)
      } catch (error) {
        console.error('[FlowBusIPC] Error broadcasting session update:', error)
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
