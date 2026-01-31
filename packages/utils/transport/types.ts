/**
 * @fileoverview Core SDK types for TuffTransport
 * @module @talex-touch/utils/transport/types
 */

import type { TuffEvent } from './event/types'
import type { TransportPortUpgradeRequest, TransportPortUpgradeResponse } from './events/types/transport'

// Electron types - import from electron package if available
// This allows the package to work in both Electron and non-Electron contexts
type ElectronWebContents = import('electron').WebContents

// ============================================================================
// Send Options
// ============================================================================

/**
 * Options for sending a transport message.
 */
export interface SendOptions {
  /**
   * Skip batching and send immediately.
   * Use this for time-critical requests.
   * @defaultValue false
   */
  immediate?: boolean

  /**
   * Request timeout in milliseconds.
   * @defaultValue 10000
   */
  timeout?: number

  /**
   * Optional cache control for transport responses.
   * Only used when explicitly enabled.
   */
  cache?: boolean | {
    /**
     * Custom cache key override.
     */
    key?: string

    /**
     * Cache mode.
     * - prefer: return cached value when available, otherwise fetch
     * - only: return cached value or throw if missing
     * @defaultValue prefer
     */
    mode?: 'prefer' | 'only'

    /**
     * Cache time-to-live in milliseconds.
     */
    ttlMs?: number
  }

  /**
   * Target window ID for main process.
   * If not specified, sends to the default window.
   * @remarks Only applicable in main process context.
   */
  targetWindowId?: number

  /**
   * Target WebContents ID for precise targeting.
   * @remarks Only applicable in main process context.
   */
  targetWebContentsId?: number
}

// ============================================================================
// Stream Types
// ============================================================================

/**
 * Message types for stream communication.
 */
export type StreamMessageType = 'data' | 'error' | 'end'

/**
 * Message structure for stream communication via MessagePort.
 *
 * @typeParam T - Type of the data payload
 */
export interface StreamMessage<T = unknown> {
  /**
   * Type of stream message.
   */
  type: StreamMessageType

  /**
   * Data payload (only for 'data' type).
   */
  chunk?: T

  /**
   * Error message (only for 'error' type).
   */
  error?: string

  /**
   * Stream identifier.
   */
  streamId: string
}

/**
 * Options for stream consumption.
 *
 * @typeParam TChunk - Type of each data chunk
 */
export interface StreamOptions<TChunk> {
  /**
   * Callback invoked for each data chunk.
   * @param chunk - The data chunk
   */
  onData: (chunk: TChunk) => void

  /**
   * Callback invoked when an error occurs.
   * @param error - The error that occurred
   */
  onError?: (error: Error) => void

  /**
   * Callback invoked when the stream ends.
   */
  onEnd?: () => void

  /**
   * Optional port upgrade settings for stream transport.
   * Set to false to disable MessagePort and use channel fallback.
   */
  port?: TransportPortOpenOptions | false
}

export interface TransportPortHandle {
  portId: string
  channel: string
  port: MessagePort
  close: (reason?: string) => Promise<void>
}

export interface TransportPortOpenOptions extends TransportPortUpgradeRequest {
  force?: boolean
  timeoutMs?: number
}

/**
 * Controller for managing an active stream.
 */
export interface StreamController {
  /**
   * Cancels the stream.
   * After cancellation, no more data/error/end callbacks will be invoked.
   */
  cancel: () => void

  /**
   * Whether the stream has been cancelled.
   */
  readonly cancelled: boolean

  /**
   * Unique identifier for this stream.
   */
  readonly streamId: string
}

/**
 * Server-side context for emitting stream data.
 *
 * @typeParam TChunk - Type of data chunks to emit
 */
export interface StreamContext<TChunk> {
  /**
   * Emits a data chunk to the client.
   * @param chunk - The data to send
   */
  emit: (chunk: TChunk) => void

  /**
   * Emits an error and closes the stream.
   * @param err - The error to send
   */
  error: (err: Error) => void

  /**
   * Signals successful completion of the stream.
   */
  end: () => void

  /**
   * Checks if the client has cancelled the stream.
   * @returns `true` if cancelled
   */
  isCancelled: () => boolean

  /**
   * Unique identifier for this stream.
   */
  readonly streamId: string
}

// ============================================================================
// Batch Types
// ============================================================================

/**
 * Payload for a batched request.
 */
export interface BatchPayload {
  /**
   * Event name.
   */
  event: string

  /**
   * Array of individual requests.
   */
  requests: Array<{
    /**
     * Unique request ID for response correlation.
     */
    id: string

    /**
     * Request payload.
     */
    payload: unknown
  }>
}

/**
 * Result for a single request in a batch.
 */
export interface BatchResult {
  /**
   * Request ID (correlates to BatchPayload.requests[].id).
   */
  id: string

  /**
   * Response data (if successful).
   */
  data?: unknown

  /**
   * Error message (if failed).
   */
  error?: string
}

/**
 * Response for a batched request.
 */
export interface BatchResponse {
  /**
   * Event name.
   */
  event: string

  /**
   * Array of results matching the request order.
   */
  results: BatchResult[]
}

// ============================================================================
// Handler Context
// ============================================================================

/**
 * Context provided to event handlers in the main process.
 */
export interface HandlerContext {
  /**
   * The WebContents that sent this request.
   */
  sender: ElectronWebContents

  /**
   * The event name being handled.
   */
  eventName: string

  /**
   * Plugin context if this is a plugin request.
   */
  plugin?: PluginSecurityContext
}

// ============================================================================
// Plugin Security
// ============================================================================

/**
 * Security context for plugin communication.
 *
 * @remarks
 * This maintains compatibility with the existing plugin key mechanism.
 * Each plugin is assigned a unique key that must be included in messages.
 */
export interface PluginSecurityContext {
  /**
   * Plugin name.
   */
  name: string

  /**
   * Encrypted unique key for this plugin session.
   * This key is generated when the plugin UI view is attached.
   */
  uniqueKey: string

  /**
   * Whether this is a verified plugin context.
   */
  verified: boolean
}

/**
 * Manager for plugin security keys.
 *
 * @remarks
 * This interface maintains compatibility with the existing requestKey/revokeKey mechanism.
 */
export interface PluginKeyManager {
  /**
   * Requests a new encrypted key for a plugin.
   *
   * @param pluginName - Name of the plugin
   * @returns The encrypted key
   */
  requestKey: (pluginName: string) => string

  /**
   * Revokes a previously issued key.
   *
   * @param key - The key to revoke
   * @returns `true` if successfully revoked
   */
  revokeKey: (key: string) => boolean

  /**
   * Resolves a key to its plugin name.
   *
   * @param key - The encrypted key
   * @returns Plugin name or `undefined` if invalid
   */
  resolveKey: (key: string) => string | undefined

  /**
   * Checks if a key is valid.
   *
   * @param key - The key to validate
   * @returns `true` if valid
   */
  isValidKey: (key: string) => boolean
}

// ============================================================================
// Transport Interfaces
// ============================================================================

/**
 * Renderer-side transport interface.
 *
 * @remarks
 * This is the primary interface for renderer processes and plugins
 * to communicate with the main process.
 */
export interface ITuffTransport {
  /**
   * Sends a request and waits for response.
   *
   * @typeParam TReq - Request payload type
   * @typeParam TRes - Response payload type
   * @param event - The TuffEvent to send
   * @param payload - Request payload
   * @param options - Send options
   * @returns Promise resolving to the response
   *
   * @example
   * ```typescript
   * const result = await transport.send(
   *   CoreBoxEvents.search.query,
   *   { text: 'hello' }
   * )
   * ```
   */
  send: (<TReq, TRes>(
    event: TuffEvent<TReq, TRes>,
    payload: TReq,
    options?: SendOptions,
  ) => Promise<TRes>) & (<TRes>(
    event: TuffEvent<void, TRes>,
    payload?: void,
    options?: SendOptions,
  ) => Promise<TRes>)

  /**
   * Requests a MessagePort upgrade for a given channel.
   * Returns a response indicating whether the upgrade was accepted.
   */
  upgrade: (options: TransportPortUpgradeRequest) => Promise<TransportPortUpgradeResponse>

  /**
   * Opens (or reuses) a MessagePort transport channel.
   * Returns null when MessagePort is not available.
   */
  openPort: (options: TransportPortOpenOptions) => Promise<TransportPortHandle | null>

  /**
   * Initiates a stream request.
   *
   * @typeParam TReq - Request payload type
   * @typeParam TChunk - Stream chunk type
   * @param event - The stream TuffEvent
   * @param payload - Request payload
   * @param options - Stream callbacks
   * @returns Promise resolving to a StreamController
   *
   * @example
   * ```typescript
   * const controller = await transport.stream(
   *   CoreBoxEvents.search.stream,
   *   { text: 'hello' },
   *   {
   *     onData: (result) => console.log(result),
   *     onEnd: () => console.log('done')
   *   }
   * )
   *
   * // Later: cancel if needed
   * controller.cancel()
   * ```
   */
  stream: <TReq, TChunk>(
    event: TuffEvent<TReq, AsyncIterable<TChunk>>,
    payload: TReq,
    options: StreamOptions<TChunk>,
  ) => Promise<StreamController>

  /**
   * Registers an event handler (for receiving messages from main process).
   *
   * @typeParam TReq - Request payload type
   * @typeParam TRes - Response payload type
   * @param event - The TuffEvent to handle
   * @param handler - Handler function
   * @returns Cleanup function to unregister
   */
  on: <TReq, TRes>(
    event: TuffEvent<TReq, TRes>,
    handler: (payload: TReq) => TRes | Promise<TRes>,
  ) => () => void

  /**
   * Forces immediate flush of all pending batch requests.
   * @returns Promise that resolves when all batches are flushed
   */
  flush: () => Promise<void>

  /**
   * Destroys the transport instance and cleans up resources.
   */
  destroy: () => void
}

/**
 * Main process transport interface.
 *
 * @remarks
 * This interface is used in the main process to handle incoming
 * requests and send messages to renderer processes.
 */
export interface ITuffTransportMain {
  /**
   * Registers an event handler.
   *
   * @typeParam TReq - Request payload type
   * @typeParam TRes - Response payload type
   * @param event - The TuffEvent to handle
   * @param handler - Handler function
   * @returns Cleanup function to unregister
   */
  on: <TReq, TRes>(
    event: TuffEvent<TReq, TRes>,
    handler: (payload: TReq, context: HandlerContext) => TRes | Promise<TRes>,
  ) => () => void

  /**
   * Registers a stream handler.
   *
   * @typeParam TReq - Request payload type
   * @typeParam TChunk - Stream chunk type
   * @param event - The stream TuffEvent
   * @param handler - Handler function
   * @returns Cleanup function to unregister
   */
  onStream: <TReq, TChunk>(
    event: TuffEvent<TReq, AsyncIterable<TChunk>>,
    handler: (payload: TReq, context: StreamContext<TChunk>) => void | Promise<void>,
  ) => () => void

  /**
   * Sends a message to a specific window.
   *
   * @typeParam TReq - Request payload type
   * @typeParam TRes - Response payload type
   * @param windowId - Target window ID
   * @param event - The TuffEvent to send
   * @param payload - Request payload
   * @returns Promise resolving to the response
   */
  sendToWindow: <TReq, TRes>(
    windowId: number,
    event: TuffEvent<TReq, TRes>,
    payload: TReq,
  ) => Promise<TRes>

  /**
   * Broadcasts a message to a specific window (fire-and-forget).
   *
   * @typeParam TReq - Request payload type
   * @param windowId - Target window ID
   * @param event - The TuffEvent to send
   * @param payload - Request payload
   */
  broadcastToWindow: <TReq>(
    windowId: number,
    event: TuffEvent<TReq, void>,
    payload: TReq,
  ) => void

  /**
   * Sends a message to a specific WebContents.
   *
   * @typeParam TReq - Request payload type
   * @typeParam TRes - Response payload type
   * @param webContents - Target WebContents
   * @param event - The TuffEvent to send
   * @param payload - Request payload
   * @returns Promise resolving to the response
   */
  sendTo: <TReq, TRes>(
    webContents: ElectronWebContents,
    event: TuffEvent<TReq, TRes>,
    payload: TReq,
  ) => Promise<TRes>

  /**
   * Sends a message to a plugin's renderer.
   *
   * @typeParam TReq - Request payload type
   * @typeParam TRes - Response payload type
   * @param pluginName - Target plugin name
   * @param event - The TuffEvent to send
   * @param payload - Request payload
   * @returns Promise resolving to the response
   */
  sendToPlugin: <TReq, TRes>(
    pluginName: string,
    event: TuffEvent<TReq, TRes>,
    payload: TReq,
  ) => Promise<TRes>

  /**
   * Broadcasts a message to all windows.
   *
   * @typeParam TReq - Request payload type
   * @param event - The TuffEvent to broadcast
   * @param payload - Request payload
   */
  broadcast: <TReq>(
    event: TuffEvent<TReq, void>,
    payload: TReq,
  ) => void

  /**
   * Plugin key manager for security.
   */
  readonly keyManager: PluginKeyManager
}

/**
 * Plugin-specific transport interface.
 *
 * @remarks
 * Extends the base transport with plugin-specific functionality
 * and automatic plugin context injection.
 */
export interface IPluginTuffTransport extends ITuffTransport {
  /**
   * The plugin name this transport belongs to.
   */
  readonly pluginName: string

  /**
   * The plugin's unique security key.
   */
  readonly pluginKey: string
}
