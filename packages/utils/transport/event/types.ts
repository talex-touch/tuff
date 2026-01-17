/**
 * @fileoverview Core type definitions for TuffEvent system
 * @module @talex-touch/utils/transport/event/types
 */

// ============================================================================
// Brand Symbol for Type Safety
// ============================================================================

/**
 * Unique symbol used for branding TuffEvent instances.
 * This ensures type-level distinction from plain objects.
 * @internal
 */
declare const _TuffEventBrand: unique symbol

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Merge strategy for batch requests.
 *
 * @remarks
 * - `queue` - All requests are queued in order
 * - `dedupe` - Duplicate payloads share a single request/response
 * - `latest` - Only the latest request for a given key is kept
 */
export type BatchMergeStrategy = 'queue' | 'dedupe' | 'latest'

/**
 * Backpressure strategy for stream processing.
 *
 * @remarks
 * - `drop` - Drop new data when buffer is full
 * - `buffer` - Buffer data (may cause memory growth)
 * - `error` - Throw error when buffer is full
 */
export type StreamBackpressure = 'drop' | 'buffer' | 'error'

/**
 * Configuration for batch request merging.
 *
 * @example
 * ```typescript
 * const config: BatchConfig = {
 *   enabled: true,
 *   windowMs: 50,
 *   maxSize: 20,
 *   mergeStrategy: 'dedupe'
 * }
 * ```
 */
export interface BatchConfig {
  /**
   * Whether batch mode is enabled for this event.
   * @defaultValue false
   */
  enabled: boolean

  /**
   * Time window in milliseconds to collect requests before flushing.
   * @defaultValue 50
   */
  windowMs?: number

  /**
   * Maximum number of requests to batch before forcing a flush.
   * @defaultValue 50
   */
  maxSize?: number

  /**
   * Strategy for merging duplicate requests.
   * @defaultValue 'queue'
   */
  mergeStrategy?: BatchMergeStrategy
}

/**
 * Configuration for stream-based communication.
 *
 * @example
 * ```typescript
 * const config: StreamConfig = {
 *   enabled: true,
 *   bufferSize: 100,
 *   backpressure: 'buffer'
 * }
 * ```
 */
export interface StreamConfig {
  /**
   * Whether stream mode is enabled for this event.
   * @defaultValue false
   */
  enabled: boolean

  /**
   * Maximum number of items to buffer.
   * @defaultValue 100
   */
  bufferSize?: number

  /**
   * Strategy for handling backpressure.
   * @defaultValue 'buffer'
   */
  backpressure?: StreamBackpressure
}

/**
 * Options for event definition.
 */
export interface EventOptions {
  /**
   * Batch configuration for this event.
   */
  batch?: BatchConfig

  /**
   * Stream configuration for this event.
   */
  stream?: StreamConfig
}

// ============================================================================
// TuffEvent Core Interface
// ============================================================================

/**
 * Type-safe event definition for TuffTransport.
 *
 * @remarks
 * TuffEvent instances are immutable and created via the event builder.
 * They encode request/response types at the type level for compile-time safety.
 *
 * @typeParam TRequest - Type of the request payload
 * @typeParam TResponse - Type of the response payload
 * @typeParam TNamespace - Event namespace (e.g., 'core-box')
 * @typeParam TModule - Event module (e.g., 'search')
 * @typeParam TAction - Event action (e.g., 'query')
 *
 * @example
 * ```typescript
 * const event: TuffEvent<{ text: string }, SearchResult[]> = defineEvent('core-box')
 *   .module('search')
 *   .event('query')
 *   .define()
 *
 * // event.toString() returns 'core-box:search:query'
 * ```
 */
export interface TuffEvent<
  TRequest = void,
  TResponse = void,
  TNamespace extends string = string,
  TModule extends string = string,
  TAction extends string = string,
> {
  /**
   * Brand identifier for runtime type checking.
   * @internal
   */
  readonly __brand: 'TuffEvent'

  /**
   * Event namespace (first segment of event name).
   * @example 'core-box', 'storage', 'plugin'
   */
  readonly namespace: TNamespace

  /**
   * Event module (second segment of event name).
   * @example 'search', 'ui', 'lifecycle'
   */
  readonly module: TModule

  /**
   * Event action (third segment of event name).
   * @example 'query', 'hide', 'load'
   */
  readonly action: TAction

  /**
   * Batch configuration for this event.
   * @internal
   */
  readonly _batch?: BatchConfig

  /**
   * Stream configuration for this event.
   * @internal
   */
  readonly _stream?: StreamConfig

  /**
   * Type marker for request payload (compile-time only).
   * @internal
   */
  readonly _request: TRequest

  /**
   * Type marker for response payload (compile-time only).
   * @internal
   */
  readonly _response: TResponse

  /**
   * Converts event to its string representation.
   * @returns Event name in format 'namespace:module:action'
   */
  toString: () => string

  /**
   * Gets the full event name.
   * @returns Event name in format 'namespace:module:action'
   */
  toEventName: () => string
}

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Extracts the request type from a TuffEvent.
 *
 * @typeParam E - The TuffEvent type
 *
 * @example
 * ```typescript
 * type Req = EventRequest<typeof CoreBoxEvents.search.query>
 * // Req = { text: string }
 * ```
 */
export type EventRequest<E> = E extends TuffEvent<infer R, any, any, any, any> ? R : never

/**
 * Extracts the response type from a TuffEvent.
 *
 * @typeParam E - The TuffEvent type
 *
 * @example
 * ```typescript
 * type Res = EventResponse<typeof CoreBoxEvents.search.query>
 * // Res = TuffSearchResult
 * ```
 */
export type EventResponse<E> = E extends TuffEvent<any, infer R, any, any, any> ? R : never

/**
 * Checks if an event is a stream event (response is AsyncIterable).
 *
 * @typeParam E - The TuffEvent type
 */
export type IsStreamEvent<E> = E extends TuffEvent<any, AsyncIterable<any>, any, any, any>
  ? true
  : false

/**
 * Extracts the chunk type from a stream event.
 *
 * @typeParam E - The TuffEvent type (must be a stream event)
 *
 * @example
 * ```typescript
 * type Chunk = StreamChunk<typeof CoreBoxEvents.search.stream>
 * // Chunk = SearchResult
 * ```
 */
export type StreamChunk<E> = E extends TuffEvent<any, AsyncIterable<infer C>, any, any, any>
  ? C
  : never

/**
 * Extracts the namespace from a TuffEvent.
 * @internal
 */
export type EventNamespace<E> = E extends TuffEvent<any, any, infer N, any, any> ? N : never

/**
 * Extracts the module from a TuffEvent.
 * @internal
 */
export type EventModule<E> = E extends TuffEvent<any, any, any, infer M, any> ? M : never

/**
 * Extracts the action from a TuffEvent.
 * @internal
 */
export type EventAction<E> = E extends TuffEvent<any, any, any, any, infer A> ? A : never
