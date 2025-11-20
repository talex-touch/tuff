/**
 * DivisionBox IPC Communication Interface
 * 
 * Registers IPC handlers for DivisionBox operations and manages
 * communication between main process and renderer processes.
 */

import { BrowserWindow } from 'electron'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import type { ITouchChannel, StandardChannelData } from '@talex-touch/utils/channel'
import {
  DivisionBoxError,
  DivisionBoxErrorCode,
  DivisionBoxIPCChannel,
  type DivisionBoxConfig,
  type CloseOptions,
  type IPCResponse,
  type SessionInfo,
  type StateChangeEvent
} from '@talex-touch/utils'
import { DivisionBoxManager } from './manager'

/**
 * Validates DivisionBoxConfig format
 * 
 * @param config - Configuration to validate
 * @returns Validation result with error message if invalid
 */
function validateConfig(config: any): { valid: boolean; error?: string } {
  if (!config || typeof config !== 'object') {
    return { valid: false, error: 'Configuration must be an object' }
  }

  if (!config.url || typeof config.url !== 'string') {
    return { valid: false, error: 'Missing or invalid "url" field' }
  }

  if (!config.title || typeof config.title !== 'string') {
    return { valid: false, error: 'Missing or invalid "title" field' }
  }

  // Validate optional fields if present
  if (config.size && !['compact', 'medium', 'expanded'].includes(config.size)) {
    return { valid: false, error: 'Invalid "size" field. Must be compact, medium, or expanded' }
  }

  if (config.keepAlive !== undefined && typeof config.keepAlive !== 'boolean') {
    return { valid: false, error: 'Invalid "keepAlive" field. Must be a boolean' }
  }

  return { valid: true }
}

/**
 * Validates sessionId format
 * 
 * @param sessionId - Session ID to validate
 * @returns Validation result with error message if invalid
 */
function validateSessionId(sessionId: any): { valid: boolean; error?: string } {
  if (!sessionId || typeof sessionId !== 'string') {
    return { valid: false, error: 'Invalid or missing sessionId' }
  }

  return { valid: true }
}

/**
 * Creates a success IPC response
 * 
 * @param data - Response data
 * @returns IPCResponse object
 */
function createSuccessResponse<T>(data: T): IPCResponse<T> {
  return {
    success: true,
    data
  }
}

/**
 * Creates an error IPC response
 * 
 * @param error - Error object or message
 * @returns IPCResponse object
 */
function createErrorResponse(error: DivisionBoxError | Error | string): IPCResponse {
  if (error instanceof DivisionBoxError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message
      }
    }
  }

  if (error instanceof Error) {
    return {
      success: false,
      error: {
        code: DivisionBoxErrorCode.IPC_ERROR,
        message: error.message
      }
    }
  }

  return {
    success: false,
    error: {
      code: DivisionBoxErrorCode.IPC_ERROR,
      message: String(error)
    }
  }
}

/**
 * DivisionBoxIPC class
 * 
 * Manages IPC communication for DivisionBox operations.
 * Registers handlers and broadcasts events to renderer processes.
 */
export class DivisionBoxIPC {
  private manager: DivisionBoxManager
  private channel: ITouchChannel
  private unregisterFunctions: Array<() => void> = []

  /**
   * Creates a new DivisionBoxIPC instance
   * 
   * @param channel - Touch channel for IPC communication
   */
  constructor(channel: ITouchChannel) {
    this.channel = channel
    this.manager = DivisionBoxManager.getInstance()
  }

  /**
   * Registers all IPC handlers
   * 
   * Sets up handlers for:
   * - division-box:open
   * - division-box:close
   * - division-box:get-state
   * - division-box:update-state
   * - division-box:get-active-sessions
   */
  registerHandlers(): void {
    // Register division-box:open handler
    const unregOpen = this.channel.regChannel(
      ChannelType.MAIN,
      DivisionBoxIPCChannel.OPEN,
      this.handleOpen.bind(this)
    )
    this.unregisterFunctions.push(unregOpen)

    // Register division-box:close handler
    const unregClose = this.channel.regChannel(
      ChannelType.MAIN,
      DivisionBoxIPCChannel.CLOSE,
      this.handleClose.bind(this)
    )
    this.unregisterFunctions.push(unregClose)

    // Register division-box:get-state handler
    const unregGetState = this.channel.regChannel(
      ChannelType.MAIN,
      DivisionBoxIPCChannel.GET_STATE,
      this.handleGetState.bind(this)
    )
    this.unregisterFunctions.push(unregGetState)

    // Register division-box:update-state handler
    const unregUpdateState = this.channel.regChannel(
      ChannelType.MAIN,
      DivisionBoxIPCChannel.UPDATE_STATE,
      this.handleUpdateState.bind(this)
    )
    this.unregisterFunctions.push(unregUpdateState)

    // Register division-box:get-active-sessions handler
    const unregGetActiveSessions = this.channel.regChannel(
      ChannelType.MAIN,
      DivisionBoxIPCChannel.GET_ACTIVE_SESSIONS,
      this.handleGetActiveSessions.bind(this)
    )
    this.unregisterFunctions.push(unregGetActiveSessions)

    console.log('[DivisionBoxIPC] All IPC handlers registered')
  }

  /**
   * Unregisters all IPC handlers
   */
  unregisterHandlers(): void {
    this.unregisterFunctions.forEach(unregister => unregister())
    this.unregisterFunctions = []
    console.log('[DivisionBoxIPC] All IPC handlers unregistered')
  }

  /**
   * Handles division-box:open IPC message
   * 
   * Creates a new DivisionBox session with the provided configuration.
   * 
   * @param data - Channel data containing config
   */
  private async handleOpen(data: StandardChannelData): Promise<void> {
    try {
      const config = data.data as DivisionBoxConfig

      // Validate configuration
      const validation = validateConfig(config)
      if (!validation.valid) {
        data.reply(DataCode.ERROR, createErrorResponse(validation.error!))
        return
      }

      // Create session with state change broadcast callback
      const session = await this.manager.createSession(config, (event) => {
        this.broadcastStateChanged(event)
      })

      // Prepare response
      const sessionInfo: SessionInfo = {
        sessionId: session.sessionId,
        state: session.getState(),
        meta: session.meta
      }

      data.reply(DataCode.SUCCESS, createSuccessResponse(sessionInfo))
    } catch (error) {
      console.error('[DivisionBoxIPC] Error in handleOpen:', error)
      data.reply(DataCode.ERROR, createErrorResponse(error as Error))
    }
  }

  /**
   * Handles division-box:close IPC message
   * 
   * Closes and destroys a DivisionBox session.
   * 
   * @param data - Channel data containing sessionId and options
   */
  private async handleClose(data: StandardChannelData): Promise<void> {
    try {
      const { sessionId, options } = data.data as { sessionId: string; options?: CloseOptions }

      // Validate sessionId
      const validation = validateSessionId(sessionId)
      if (!validation.valid) {
        data.reply(DataCode.ERROR, createErrorResponse(validation.error!))
        return
      }

      // Destroy session
      await this.manager.destroySession(sessionId, options)

      // Broadcast session destroyed event
      this.broadcastSessionDestroyed(sessionId)

      data.reply(DataCode.SUCCESS, createSuccessResponse({ success: true }))
    } catch (error) {
      console.error('[DivisionBoxIPC] Error in handleClose:', error)
      data.reply(DataCode.ERROR, createErrorResponse(error as Error))
    }
  }

  /**
   * Handles division-box:get-state IPC message
   * 
   * Retrieves the current state of a DivisionBox session.
   * 
   * @param data - Channel data containing sessionId
   */
  private async handleGetState(data: StandardChannelData): Promise<void> {
    try {
      const { sessionId } = data.data as { sessionId: string }

      // Validate sessionId
      const validation = validateSessionId(sessionId)
      if (!validation.valid) {
        data.reply(DataCode.ERROR, createErrorResponse(validation.error!))
        return
      }

      // Get session
      const session = this.manager.getSession(sessionId)
      if (!session) {
        data.reply(
          DataCode.ERROR,
          createErrorResponse(
            new DivisionBoxError(
              DivisionBoxErrorCode.SESSION_NOT_FOUND,
              `Session not found: ${sessionId}`,
              sessionId
            )
          )
        )
        return
      }

      // Return state
      const state = session.getState()
      data.reply(DataCode.SUCCESS, createSuccessResponse({ state }))
    } catch (error) {
      console.error('[DivisionBoxIPC] Error in handleGetState:', error)
      data.reply(DataCode.ERROR, createErrorResponse(error as Error))
    }
  }

  /**
   * Handles division-box:update-state IPC message
   * 
   * Updates the sessionState of a DivisionBox session.
   * 
   * @param data - Channel data containing sessionId, key, and value
   */
  private async handleUpdateState(data: StandardChannelData): Promise<void> {
    try {
      const { sessionId, key, value } = data.data as {
        sessionId: string
        key: string
        value: any
      }

      // Validate sessionId
      const validation = validateSessionId(sessionId)
      if (!validation.valid) {
        data.reply(DataCode.ERROR, createErrorResponse(validation.error!))
        return
      }

      // Validate key
      if (!key || typeof key !== 'string') {
        data.reply(DataCode.ERROR, createErrorResponse('Invalid or missing key'))
        return
      }

      // Get session
      const session = this.manager.getSession(sessionId)
      if (!session) {
        data.reply(
          DataCode.ERROR,
          createErrorResponse(
            new DivisionBoxError(
              DivisionBoxErrorCode.SESSION_NOT_FOUND,
              `Session not found: ${sessionId}`,
              sessionId
            )
          )
        )
        return
      }

      // Update session state
      session.setSessionState(key, value)

      data.reply(DataCode.SUCCESS, createSuccessResponse({ success: true }))
    } catch (error) {
      console.error('[DivisionBoxIPC] Error in handleUpdateState:', error)
      data.reply(DataCode.ERROR, createErrorResponse(error as Error))
    }
  }

  /**
   * Handles division-box:get-active-sessions IPC message
   * 
   * Retrieves information about all active DivisionBox sessions.
   * 
   * @param data - Channel data
   */
  private async handleGetActiveSessions(data: StandardChannelData): Promise<void> {
    try {
      const sessions = this.manager.getActiveSessionsInfo()
      data.reply(DataCode.SUCCESS, createSuccessResponse(sessions))
    } catch (error) {
      console.error('[DivisionBoxIPC] Error in handleGetActiveSessions:', error)
      data.reply(DataCode.ERROR, createErrorResponse(error as Error))
    }
  }

  /**
   * Broadcasts a state change event to all renderer processes
   * 
   * @param event - State change event data
   */
  private broadcastStateChanged(event: StateChangeEvent): void {
    // Get all browser windows
    const windows = BrowserWindow.getAllWindows()

    // Send event to each window
    windows.forEach(window => {
      try {
        this.channel.sendToMain(window, DivisionBoxIPCChannel.STATE_CHANGED, event)
      } catch (error) {
        console.error('[DivisionBoxIPC] Error broadcasting state change:', error)
      }
    })
  }

  /**
   * Broadcasts a session destroyed event to all renderer processes
   * 
   * @param sessionId - ID of the destroyed session
   */
  private broadcastSessionDestroyed(sessionId: string): void {
    // Get all browser windows
    const windows = BrowserWindow.getAllWindows()

    // Send event to each window
    windows.forEach(window => {
      try {
        this.channel.sendToMain(window, DivisionBoxIPCChannel.SESSION_DESTROYED, { sessionId })
      } catch (error) {
        console.error('[DivisionBoxIPC] Error broadcasting session destroyed:', error)
      }
    })
  }
}

/**
 * Initializes the DivisionBox IPC system
 * 
 * @param channel - Touch channel for IPC communication
 * @returns DivisionBoxIPC instance
 */
export function initializeDivisionBoxIPC(channel: ITouchChannel): DivisionBoxIPC {
  const ipc = new DivisionBoxIPC(channel)
  ipc.registerHandlers()
  return ipc
}
