/**
 * @fileoverview TuffTransport - Next-generation IPC communication system for Tuff
 * @module @talex-touch/utils/transport
 * @version 2.0.0
 *
 * @description
 * TuffTransport provides a type-safe, high-performance IPC communication layer
 * with support for batching, streaming, and plugin isolation.
 *
 * @example
 * ```typescript
 * import { useTuffTransport, CoreBoxEvents } from '@talex-touch/utils/transport'
 *
 * const transport = useTuffTransport()
 * await transport.send(CoreBoxEvents.ui.hide)
 * ```
 */

// ============================================================================
// Event Builder
// ============================================================================

export {
  /**
   * @deprecated Use `useTuffTransport()` instead. Will be removed in v3.0.0.
   */
  ChannelType,
  /**
   * @deprecated Use `TuffTransportErrorCode` instead. Will be removed in v3.0.0.
   */
  DataCode,
} from '../channel'

// ============================================================================
// Event Types
// ============================================================================

export type {
  /**
   * @deprecated Use `ITuffTransport` instead. Will be removed in v3.0.0.
   */
  ITouchChannel,
  /**
   * @deprecated Use `ITuffTransport` instead. Will be removed in v3.0.0.
   */
  ITouchClientChannel,
  /**
   * @deprecated Use TuffTransport types instead. Will be removed in v3.0.0.
   */
  RawStandardChannelData,
  /**
   * @deprecated Use TuffTransport types instead. Will be removed in v3.0.0.
   */
  StandardChannelData,
} from '../channel'

// ============================================================================
// Predefined Events (by domain)
// ============================================================================

export {
  TuffTransportError,
  TuffTransportErrorCode,
} from './errors'

// ============================================================================
// SDK Types
// ============================================================================

export {
  assertTuffEvent,
  defineEvent,
  isTuffEvent,
  TuffActionBuilder,
  TuffEventBuilder,
  TuffModuleBuilder,
} from './event/builder'

// ============================================================================
// Error Types
// ============================================================================

export type {
  BatchConfig,
  EventOptions,
  EventRequest,
  EventResponse,
  IsStreamEvent,
  StreamChunk,
  StreamConfig,
  TuffEvent,
} from './event/types'

// ============================================================================
// SDK Functions
// ============================================================================

export * from './events'

// ============================================================================
// Legacy Compatibility (Deprecated)
// ============================================================================

export {
  createPluginTuffTransport,
  createTuffRendererTransport,
  getTuffTransportMain,
  useTuffTransport,
} from './sdk'

export type {
  // Batch types
  BatchPayload,
  BatchResponse,
  BatchResult,

  // Contexts
  HandlerContext,
  IPluginTuffTransport,
  // Transport interfaces
  ITuffTransport,

  ITuffTransportMain,
  PluginKeyManager,

  // Plugin security
  PluginSecurityContext,
  // Options
  SendOptions,
  StreamContext,

  StreamController,
  // Stream types
  StreamMessage,

  StreamMessageType,
  StreamOptions,
} from './types'
