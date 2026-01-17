/**
 * @fileoverview TuffEvent Builder - Type-safe event definition system
 * @module @talex-touch/utils/transport/event/builder
 */

import type { TuffEvent, EventOptions } from './types'

// ============================================================================
// Builder Classes
// ============================================================================

/**
 * Namespace builder - Entry point for event definition.
 *
 * @typeParam TNamespace - The namespace string type
 *
 * @example
 * ```typescript
 * const builder = TuffEventBuilder.namespace('core-box')
 * // or use the shorthand:
 * const builder = defineEvent('core-box')
 * ```
 */
export class TuffEventBuilder<TNamespace extends string> {
  private readonly _namespace: TNamespace

  private constructor(namespace: TNamespace) {
    this._namespace = namespace
  }

  /**
   * Creates a new event builder with the specified namespace.
   *
   * @param ns - The namespace string (e.g., 'core-box', 'storage')
   * @returns A new TuffEventBuilder instance
   * @throws {Error} If namespace is empty or not a string
   *
   * @example
   * ```typescript
   * const builder = TuffEventBuilder.namespace('my-plugin')
   * ```
   */
  static namespace<T extends string>(ns: T): TuffEventBuilder<T> {
    if (!ns || typeof ns !== 'string') {
      throw new Error('[TuffEvent] Namespace must be a non-empty string')
    }
    return new TuffEventBuilder(ns)
  }

  /**
   * Defines the module for this event.
   *
   * @param module - The module string (e.g., 'search', 'ui')
   * @returns A TuffModuleBuilder instance
   * @throws {Error} If module is empty or not a string
   *
   * @example
   * ```typescript
   * defineEvent('core-box').module('search')
   * ```
   */
  module<TModule extends string>(module: TModule): TuffModuleBuilder<TNamespace, TModule> {
    if (!module || typeof module !== 'string') {
      throw new Error('[TuffEvent] Module must be a non-empty string')
    }
    return new TuffModuleBuilder(this._namespace, module)
  }
}

/**
 * Module builder - Second stage of event definition.
 *
 * @typeParam TNamespace - The namespace string type
 * @typeParam TModule - The module string type
 */
export class TuffModuleBuilder<
  TNamespace extends string,
  TModule extends string
> {
  /**
   * @internal
   */
  constructor(
    private readonly _namespace: TNamespace,
    private readonly _module: TModule
  ) {}

  /**
   * Defines the action for this event.
   *
   * @param action - The action string (e.g., 'query', 'hide')
   * @returns A TuffActionBuilder instance
   * @throws {Error} If action is empty or not a string
   *
   * @example
   * ```typescript
   * defineEvent('core-box').module('search').event('query')
   * ```
   */
  event<TAction extends string>(action: TAction): TuffActionBuilder<TNamespace, TModule, TAction> {
    if (!action || typeof action !== 'string') {
      throw new Error('[TuffEvent] Action must be a non-empty string')
    }
    return new TuffActionBuilder(this._namespace, this._module, action)
  }
}

/**
 * Action builder - Final stage of event definition.
 *
 * @typeParam TNamespace - The namespace string type
 * @typeParam TModule - The module string type
 * @typeParam TAction - The action string type
 */
export class TuffActionBuilder<
  TNamespace extends string,
  TModule extends string,
  TAction extends string
> {
  /**
   * @internal
   */
  constructor(
    private readonly _namespace: TNamespace,
    private readonly _module: TModule,
    private readonly _action: TAction
  ) {}

  /**
   * Finalizes the event definition with request/response types.
   *
   * @typeParam TRequest - Type of the request payload (default: void)
   * @typeParam TResponse - Type of the response payload (default: void)
   * @param options - Optional batch/stream configuration
   * @returns An immutable TuffEvent instance
   *
   * @example
   * ```typescript
   * // Simple event with no payload
   * const hideEvent = defineEvent('core-box')
   *   .module('ui')
   *   .event('hide')
   *   .define()
   *
   * // Event with typed request/response
   * const queryEvent = defineEvent('core-box')
   *   .module('search')
   *   .event('query')
   *   .define<{ text: string }, SearchResult[]>()
   *
   * // Event with batch configuration
   * const getEvent = defineEvent('storage')
   *   .module('app')
   *   .event('get')
   *   .define<{ key: string }, unknown>({
   *     batch: { enabled: true, windowMs: 50 }
   *   })
   *
   * // Stream event
   * const streamEvent = defineEvent('core-box')
   *   .module('search')
   *   .event('stream')
   *   .define<{ text: string }, AsyncIterable<SearchResult>>({
   *     stream: { enabled: true }
   *   })
   * ```
   */
  define<TRequest = void, TResponse = void>(
    options?: EventOptions
  ): TuffEvent<TRequest, TResponse, TNamespace, TModule, TAction> {
    const namespace = this._namespace
    const module = this._module
    const action = this._action
    const eventName = `${namespace}:${module}:${action}`

    // Create immutable event object
    const event: TuffEvent<TRequest, TResponse, TNamespace, TModule, TAction> = Object.freeze({
      __brand: 'TuffEvent' as const,
      namespace,
      module,
      action,
      _batch: options?.batch,
      _stream: options?.stream,
      _request: undefined as unknown as TRequest,
      _response: undefined as unknown as TResponse,

      toString(): string {
        return eventName
      },

      toEventName(): string {
        return eventName
      },
    })

    return event
  }
}

// ============================================================================
// Shorthand Functions
// ============================================================================

/**
 * Creates a new event definition builder.
 *
 * @remarks
 * This is the primary entry point for defining TuffEvents.
 * All events MUST be created using this builder to ensure type safety.
 *
 * @param namespace - The event namespace (e.g., 'core-box', 'storage', 'plugin')
 * @returns A TuffEventBuilder instance
 *
 * @example
 * ```typescript
 * // Define a simple event
 * const hideEvent = defineEvent('core-box')
 *   .module('ui')
 *   .event('hide')
 *   .define()
 *
 * // Define an event with typed payloads
 * const queryEvent = defineEvent('core-box')
 *   .module('search')
 *   .event('query')
 *   .define<QueryRequest, QueryResponse>()
 *
 * // Define a batch-enabled event
 * const getEvent = defineEvent('storage')
 *   .module('app')
 *   .event('get')
 *   .define<{ key: string }, unknown>({
 *     batch: { enabled: true, windowMs: 50, maxSize: 20 }
 *   })
 * ```
 */
export const defineEvent = TuffEventBuilder.namespace

/**
 * Defines a TuffEvent using a raw event name string.
 *
 * @remarks
 * This is intended for incremental migrations from legacy IPC event names that
 * don't follow the `namespace:module:action` convention yet.
 *
 * Prefer `defineEvent(namespace).module(module).event(action)` for new code.
 */
export function defineRawEvent<TRequest = void, TResponse = void>(
  eventName: string,
  options?: EventOptions,
): TuffEvent<TRequest, TResponse, string, string, string> {
  if (!eventName || typeof eventName !== 'string') {
    throw new Error('[TuffEvent] Raw event name must be a non-empty string')
  }

  const parts = eventName.split(':')
  const namespace = parts[0] || 'raw'
  const module = parts.length >= 2 ? (parts[1] || 'raw') : 'raw'
  const action = parts.length >= 3 ? (parts.slice(2).join(':') || 'raw') : 'raw'

  const event: TuffEvent<TRequest, TResponse, string, string, string> = Object.freeze({
    __brand: 'TuffEvent' as const,
    namespace,
    module,
    action,
    _batch: options?.batch,
    _stream: options?.stream,
    _request: undefined as unknown as TRequest,
    _response: undefined as unknown as TResponse,

    toString(): string {
      return eventName
    },

    toEventName(): string {
      return eventName
    },
  })

  return event
}

// ============================================================================
// Type Guards and Assertions
// ============================================================================

/**
 * Runtime type guard to check if a value is a valid TuffEvent.
 *
 * @param value - The value to check
 * @returns `true` if the value is a TuffEvent, `false` otherwise
 *
 * @example
 * ```typescript
 * if (isTuffEvent(maybeEvent)) {
 *   // TypeScript now knows maybeEvent is a TuffEvent
 *   console.log(maybeEvent.toString())
 * }
 * ```
 */
export function isTuffEvent(value: unknown): value is TuffEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).__brand === 'TuffEvent' &&
    typeof (value as Record<string, unknown>).toString === 'function' &&
    typeof (value as Record<string, unknown>).namespace === 'string' &&
    typeof (value as Record<string, unknown>).module === 'string' &&
    typeof (value as Record<string, unknown>).action === 'string'
  )
}

/**
 * Asserts that a value is a valid TuffEvent, throwing if not.
 *
 * @param value - The value to assert
 * @param context - Optional context string for error messages
 * @throws {TypeError} If the value is not a TuffEvent
 *
 * @example
 * ```typescript
 * function sendEvent(event: unknown, payload: unknown) {
 *   assertTuffEvent(event, 'sendEvent')
 *   // TypeScript now knows event is a TuffEvent
 *   console.log(`Sending: ${event.toString()}`)
 * }
 * ```
 */
export function assertTuffEvent(
  value: unknown,
  context?: string
): asserts value is TuffEvent {
  if (!isTuffEvent(value)) {
    const prefix = context ? `[${context}] ` : ''
    throw new TypeError(
      `${prefix}Invalid event. Expected TuffEvent created via defineEvent(), ` +
      `got ${value === null ? 'null' : typeof value}. ` +
      `String event names are not allowed - use the event builder.`
    )
  }
}

/**
 * Extracts the event name string from a TuffEvent.
 *
 * @param event - The TuffEvent to extract from
 * @returns The event name string
 *
 * @example
 * ```typescript
 * const name = getEventName(CoreBoxEvents.ui.hide)
 * // name = 'core-box:ui:hide'
 * ```
 */
export function getEventName(event: TuffEvent): string {
  assertTuffEvent(event, 'getEventName')
  return event.toString()
}

/**
 * Checks if an event has batch configuration enabled.
 *
 * @param event - The TuffEvent to check
 * @returns `true` if batch is enabled
 */
export function isBatchEnabled(event: TuffEvent): boolean {
  return event._batch?.enabled === true
}

/**
 * Checks if an event has stream configuration enabled.
 *
 * @param event - The TuffEvent to check
 * @returns `true` if stream is enabled
 */
export function isStreamEnabled(event: TuffEvent): boolean {
  return event._stream?.enabled === true
}
