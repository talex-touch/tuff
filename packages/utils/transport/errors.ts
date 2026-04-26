/**
 * @fileoverview Error types for TuffTransport
 * @module @talex-touch/utils/transport/errors
 */

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Error codes for TuffTransport operations.
 */
export enum TuffTransportErrorCode {
  /**
   * Event is not a valid TuffEvent instance.
   */
  INVALID_EVENT = 'INVALID_EVENT',

  /**
   * No handler registered for the event.
   */
  UNKNOWN_EVENT = 'UNKNOWN_EVENT',

  /**
   * Request timed out waiting for response.
   */
  TIMEOUT = 'TIMEOUT',

  /**
   * Stream was cancelled by the client.
   */
  STREAM_CANCELLED = 'STREAM_CANCELLED',

  /**
   * Batch request failed.
   */
  BATCH_FAILED = 'BATCH_FAILED',

  /**
   * Failed to serialize request payload.
   */
  SERIALIZE_FAILED = 'SERIALIZE_FAILED',

  /**
   * Failed to deserialize response payload.
   */
  DESERIALIZE_FAILED = 'DESERIALIZE_FAILED',

  /**
   * Target window/WebContents not found or destroyed.
   */
  TARGET_NOT_FOUND = 'TARGET_NOT_FOUND',

  /**
   * Plugin security key is invalid or expired.
   */
  INVALID_PLUGIN_KEY = 'INVALID_PLUGIN_KEY',

  /**
   * Plugin attempted unauthorized operation.
   */
  PLUGIN_UNAUTHORIZED = 'PLUGIN_UNAUTHORIZED',

  /**
   * IPC channel error (e.g., EPIPE).
   */
  IPC_ERROR = 'IPC_ERROR',

  /**
   * Transport instance has been destroyed.
   */
  TRANSPORT_DESTROYED = 'TRANSPORT_DESTROYED',

  /**
   * Generic internal error.
   */
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * Custom error class for TuffTransport operations.
 *
 * @remarks
 * Provides structured error information including error codes,
 * event context, and optional cause for error chaining.
 *
 * @example
 * ```typescript
 * try {
 *   await transport.send(event, payload)
 * } catch (err) {
 *   if (err instanceof TuffTransportError) {
 *     switch (err.code) {
 *       case TuffTransportErrorCode.TIMEOUT:
 *         // Handle timeout
 *         break
 *       case TuffTransportErrorCode.INVALID_PLUGIN_KEY:
 *         // Handle auth error
 *         break
 *     }
 *   }
 * }
 * ```
 */
export class TuffTransportError extends Error {
  /**
   * Error code for programmatic handling.
   */
  readonly code: TuffTransportErrorCode

  /**
   * Event name associated with this error (if applicable).
   */
  readonly eventName?: string

  /**
   * Plugin name associated with this error (if applicable).
   */
  readonly pluginName?: string

  /**
   * Original error that caused this error (if applicable).
   */
  readonly cause?: Error

  /**
   * Timestamp when this error occurred.
   */
  readonly timestamp: number

  /**
   * Creates a new TuffTransportError.
   *
   * @param code - Error code
   * @param message - Human-readable error message
   * @param options - Additional error context
   */
  constructor(
    code: TuffTransportErrorCode,
    message: string,
    options?: {
      eventName?: string
      pluginName?: string
      cause?: Error
    },
  ) {
    super(message)
    this.name = 'TuffTransportError'
    this.code = code
    this.eventName = options?.eventName
    this.pluginName = options?.pluginName
    this.cause = options?.cause
    this.timestamp = Date.now()

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TuffTransportError)
    }
  }

  /**
   * Creates a serializable representation of this error.
   *
   * @returns Plain object representation
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      eventName: this.eventName,
      pluginName: this.pluginName,
      timestamp: this.timestamp,
      stack: this.stack,
    }
  }

  /**
   * Creates a TuffTransportError from a plain object.
   *
   * @param obj - Plain object (e.g., from IPC)
   * @returns TuffTransportError instance
   */
  static fromJSON(obj: Record<string, unknown>): TuffTransportError {
    const error = new TuffTransportError(
      (obj.code as TuffTransportErrorCode) || TuffTransportErrorCode.INTERNAL_ERROR,
      (obj.message as string) || 'Unknown error',
      {
        eventName: obj.eventName as string | undefined,
        pluginName: obj.pluginName as string | undefined,
      },
    )
    if (obj.stack && typeof obj.stack === 'string') {
      error.stack = obj.stack
    }
    return error
  }
}

// ============================================================================
// Error Factory Functions
// ============================================================================

/**
 * Creates an INVALID_EVENT error.
 *
 * @param context - Context where the error occurred
 * @returns TuffTransportError
 */
export function createInvalidEventError(context: string): TuffTransportError {
  return new TuffTransportError(
    TuffTransportErrorCode.INVALID_EVENT,
    `[${context}] Invalid event. Expected TuffEvent created via defineEvent(), `
    + `received a string or invalid object. String event names are not allowed.`,
  )
}

/**
 * Creates a TIMEOUT error.
 *
 * @param eventName - Event that timed out
 * @param timeoutMs - Timeout duration in milliseconds
 * @returns TuffTransportError
 */
export function createTimeoutError(eventName: string, timeoutMs: number): TuffTransportError {
  return new TuffTransportError(
    TuffTransportErrorCode.TIMEOUT,
    `Request "${eventName}" timed out after ${timeoutMs}ms`,
    { eventName },
  )
}

/**
 * Creates an UNKNOWN_EVENT error.
 *
 * @param eventName - Event name that was not found
 * @returns TuffTransportError
 */
export function createUnknownEventError(eventName: string): TuffTransportError {
  return new TuffTransportError(
    TuffTransportErrorCode.UNKNOWN_EVENT,
    `No handler registered for event "${eventName}"`,
    { eventName },
  )
}

/**
 * Creates an INVALID_PLUGIN_KEY error.
 *
 * @param pluginName - Plugin name (if known)
 * @returns TuffTransportError
 */
export function createInvalidPluginKeyError(pluginName?: string): TuffTransportError {
  return new TuffTransportError(
    TuffTransportErrorCode.INVALID_PLUGIN_KEY,
    pluginName
      ? `Invalid or expired security key for plugin "${pluginName}"`
      : 'Invalid or expired plugin security key',
    { pluginName },
  )
}

/**
 * Creates a TARGET_NOT_FOUND error.
 *
 * @param target - Description of the target
 * @param eventName - Event name (if applicable)
 * @returns TuffTransportError
 */
export function createTargetNotFoundError(target: string, eventName?: string): TuffTransportError {
  return new TuffTransportError(
    TuffTransportErrorCode.TARGET_NOT_FOUND,
    `Target "${target}" not found or has been destroyed`,
    { eventName },
  )
}

/**
 * Creates a SERIALIZE_FAILED error.
 *
 * @param eventName - Event name
 * @param cause - Original error
 * @returns TuffTransportError
 */
export function createSerializeError(eventName: string, cause: Error): TuffTransportError {
  return new TuffTransportError(
    TuffTransportErrorCode.SERIALIZE_FAILED,
    `Failed to serialize payload for "${eventName}": ${cause.message}`,
    { eventName, cause },
  )
}

/**
 * Creates a STREAM_CANCELLED error.
 *
 * @param eventName - Event name
 * @param streamId - Stream identifier
 * @returns TuffTransportError
 */
export function createStreamCancelledError(eventName: string, streamId: string): TuffTransportError {
  return new TuffTransportError(
    TuffTransportErrorCode.STREAM_CANCELLED,
    `Stream "${streamId}" for event "${eventName}" was cancelled`,
    { eventName },
  )
}
