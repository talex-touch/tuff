/**
 * DivisionBox IPC Communication Interface
 * 
 * Registers IPC handlers for DivisionBox operations and manages
 * communication between main process and renderer processes.
 */

import type { ITouchChannel } from '@talex-touch/utils/channel'
import {
  DivisionBoxError,
  DivisionBoxErrorCode,
  type DivisionBoxConfig,
  type CloseOptions,
  type IPCResponse,
  type SessionInfo,
  type StateChangeEvent
} from '@talex-touch/utils'
import { DivisionBoxEvents, getTuffTransportMain } from '@talex-touch/utils/transport'
import { getPermissionModule } from '../permission'
import { DivisionBoxManager } from './manager'
import { flowTriggerManager, type FlowPayload } from './flow-trigger'

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
  private transportDisposers: Array<() => void> = []
  private transport: ReturnType<typeof getTuffTransportMain> | null = null

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
    this.registerTransportHandlers()

    console.log('[DivisionBoxIPC] All transport handlers registered')
  }

  private registerTransportHandlers(): void {
    if (this.transport) {
      return
    }

    const channel = this.channel as any
    this.transport = getTuffTransportMain(
      channel,
      channel?.keyManager ?? channel,
    )

    const transport = this.transport

    const enforce = (context: any, apiName: string, sdkapi?: number) => {
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
      transport.on(DivisionBoxEvents.open, async (payload: any, context: any) => {
        enforce(context, 'division-box:session:open', payload?._sdkapi)
        const config = payload as DivisionBoxConfig
        const validation = validateConfig(config)
        if (!validation.valid) {
          return createErrorResponse(validation.error!)
        }

        const session = await this.manager.createSession(config, (event) => {
          this.broadcastStateChanged(event)
        })

        const sessionInfo: SessionInfo = {
          sessionId: session.sessionId,
          state: session.getState(),
          meta: session.meta,
        }

        return createSuccessResponse(sessionInfo)
      }),
    )

    this.transportDisposers.push(
      transport.on(DivisionBoxEvents.close, async (payload: any, context: any) => {
        enforce(context, 'division-box:session:close', payload?._sdkapi)
        const { sessionId, options } = payload as { sessionId: string; options?: CloseOptions }
        const validation = validateSessionId(sessionId)
        if (!validation.valid) {
          return createErrorResponse(validation.error!)
        }

        await this.manager.destroySession(sessionId, options)
        this.broadcastSessionDestroyed(sessionId)
        return createSuccessResponse({ success: true })
      }),
    )

    this.transportDisposers.push(
      transport.on(DivisionBoxEvents.getState, async (payload: any, context: any) => {
        enforce(context, 'division-box:session:get-state', payload?._sdkapi)
        const { sessionId, key } = payload as { sessionId: string; key?: string }
        const validation = validateSessionId(sessionId)
        if (!validation.valid) {
          return createErrorResponse(validation.error!)
        }

        const session = this.manager.getSession(sessionId)
        if (!session) {
          return createErrorResponse(
            new DivisionBoxError(
              DivisionBoxErrorCode.SESSION_NOT_FOUND,
              `Session not found: ${sessionId}`,
              sessionId,
            ),
          )
        }

        if (key && typeof key === 'string') {
          return createSuccessResponse(session.getSessionState(key))
        }

        return createSuccessResponse({ state: session.getState() })
      }),
    )

    this.transportDisposers.push(
      transport.on(DivisionBoxEvents.updateState, async (payload: any, context: any) => {
        enforce(context, 'division-box:session:update-state', payload?._sdkapi)
        const { sessionId, key, value } = payload as { sessionId: string; key: string; value: any }
        const validation = validateSessionId(sessionId)
        if (!validation.valid) {
          return createErrorResponse(validation.error!)
        }

        if (!key || typeof key !== 'string') {
          return createErrorResponse('Invalid or missing key')
        }

        const session = this.manager.getSession(sessionId)
        if (!session) {
          return createErrorResponse(
            new DivisionBoxError(
              DivisionBoxErrorCode.SESSION_NOT_FOUND,
              `Session not found: ${sessionId}`,
              sessionId,
            ),
          )
        }

        session.setSessionState(key, value)
        return createSuccessResponse({ success: true })
      }),
    )

    this.transportDisposers.push(
      transport.on(DivisionBoxEvents.getActiveSessions, async (payload: any, context: any) => {
        enforce(context, 'division-box:session:get-active-sessions', payload?._sdkapi)
        const sessions = this.manager.getActiveSessionsInfo()
        return createSuccessResponse(sessions)
      }),
    )

    this.transportDisposers.push(
      transport.on(DivisionBoxEvents.flowTrigger, async (payload: any, context: any) => {
        enforce(context, 'division-box:flow:trigger', payload?._sdkapi)
        const { targetId, payload: flowPayload } = payload as { targetId: string; payload: FlowPayload }

        if (!targetId || typeof targetId !== 'string') {
          return createErrorResponse('Invalid or missing targetId')
        }

        if (!flowPayload || typeof flowPayload !== 'object' || !flowPayload.type || !flowPayload.data) {
          return createErrorResponse('Invalid or missing payload')
        }

        const sessionId = await flowTriggerManager.handleFlow(targetId, flowPayload)
        return createSuccessResponse({ sessionId })
      }),
    )

    this.transportDisposers.push(
      transport.on(DivisionBoxEvents.togglePin, async (payload: any, context: any) => {
        enforce(context, 'division-box:window:toggle-pin', payload?._sdkapi)
        const { sessionId } = payload as { sessionId: string }
        const validation = validateSessionId(sessionId)
        if (!validation.valid) {
          return createErrorResponse(validation.error!)
        }

        const session = this.manager.getSession(sessionId)
        if (!session) {
          return createErrorResponse('Session not found')
        }

        const isPinned = session.toggleAlwaysOnTop()
        return createSuccessResponse({ isPinned })
      }),
    )

    this.transportDisposers.push(
      transport.on(DivisionBoxEvents.setOpacity, async (payload: any, context: any) => {
        enforce(context, 'division-box:window:set-opacity', payload?._sdkapi)
        const { sessionId, opacity } = payload as { sessionId: string; opacity: number }
        const validation = validateSessionId(sessionId)
        if (!validation.valid) {
          return createErrorResponse(validation.error!)
        }

        const session = this.manager.getSession(sessionId)
        if (!session) {
          return createErrorResponse('Session not found')
        }

        session.setOpacity(opacity)
        return createSuccessResponse({ opacity: session.getOpacity() })
      }),
    )

    this.transportDisposers.push(
      transport.on(DivisionBoxEvents.toggleDevTools, async (payload: any, context: any) => {
        enforce(context, 'division-box:window:toggle-devtools', payload?._sdkapi)
        const { sessionId } = payload as { sessionId: string }
        const validation = validateSessionId(sessionId)
        if (!validation.valid) {
          return createErrorResponse(validation.error!)
        }

        const session = this.manager.getSession(sessionId)
        if (!session) {
          return createErrorResponse('Session not found')
        }

        if (session.isDevToolsOpen()) {
          session.closeDevTools()
        } else {
          session.openDevTools()
        }

        return createSuccessResponse({ isOpen: session.isDevToolsOpen() })
      }),
    )

    this.transportDisposers.push(
      transport.on(DivisionBoxEvents.getWindowState, async (payload: any, context: any) => {
        enforce(context, 'division-box:window:get-window-state', payload?._sdkapi)
        const { sessionId } = payload as { sessionId: string }
        const validation = validateSessionId(sessionId)
        if (!validation.valid) {
          return createErrorResponse(validation.error!)
        }

        const session = this.manager.getSession(sessionId)
        if (!session) {
          return createErrorResponse('Session not found')
        }

        return createSuccessResponse({
          isPinned: session.isAlwaysOnTop(),
          opacity: session.getOpacity(),
          isDevToolsOpen: session.isDevToolsOpen(),
        })
      }),
    )

    this.transportDisposers.push(
      transport.on(DivisionBoxEvents.inputChange, async (payload: any, context: any) => {
        enforce(context, 'division-box:ui:input-change', payload?._sdkapi)
        const { sessionId, input, query } = payload as { sessionId: string; input: string; query: any }
        const validation = validateSessionId(sessionId)
        if (!validation.valid) {
          return createErrorResponse(validation.error!)
        }

        const session = this.manager.getSession(sessionId)
        if (!session) {
          return createErrorResponse('Session not found')
        }

        const plugin = session.getAttachedPlugin()
        if (plugin) {
          this.channel.sendToPlugin(plugin.name, 'core-box:input-change', {
            input,
            query,
            source: 'division-box',
          })
        }

        return createSuccessResponse({ received: true })
      }),
    )
  }

  /**
   * Unregisters all IPC handlers
   */
  unregisterHandlers(): void {
    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.transportDisposers = []
    this.transport = null

    console.log('[DivisionBoxIPC] All IPC handlers unregistered')
  }

  /**
   * Broadcasts a state change event to all renderer processes
   * 
   * @param event - State change event data
   */
  private broadcastStateChanged(event: StateChangeEvent): void {
    if (this.transport) {
      try {
        this.transport.broadcast(DivisionBoxEvents.stateChanged, event)
      } catch {
        // ignore
      }
    }
  }

  /**
   * Broadcasts a session destroyed event to all renderer processes
   * 
   * @param sessionId - ID of the destroyed session
   */
  private broadcastSessionDestroyed(sessionId: string): void {
    if (this.transport) {
      try {
        this.transport.broadcast(DivisionBoxEvents.sessionDestroyed, { sessionId })
      } catch {
        // ignore
      }
    }
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
