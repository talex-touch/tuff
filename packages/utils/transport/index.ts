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
  defineEvent,
  isTuffEvent,
  assertTuffEvent,
  TuffEventBuilder,
  TuffModuleBuilder,
  TuffActionBuilder,
} from './event/builder'

// ============================================================================
// Event Types
// ============================================================================

export type {
  TuffEvent,
  BatchConfig,
  StreamConfig,
  EventOptions,
  EventRequest,
  EventResponse,
  IsStreamEvent,
  StreamChunk,
} from './event/types'

// ============================================================================
// Predefined Events (by domain)
// ============================================================================

export * from './events'

// ============================================================================
// SDK Types
// ============================================================================

export type {
  // Transport interfaces
  ITuffTransport,
  ITuffTransportMain,
  IPluginTuffTransport,

  // Options
  SendOptions,
  StreamOptions,
  StreamController,

  // Contexts
  HandlerContext,
  StreamContext,

  // Batch types
  BatchPayload,
  BatchResponse,
  BatchResult,

  // Stream types
  StreamMessage,
  StreamMessageType,

  // Plugin security
  PluginSecurityContext,
  PluginKeyManager,
} from './types'

// ============================================================================
// Error Types
// ============================================================================

export {
  TuffTransportError,
  TuffTransportErrorCode,
} from './errors'

// ============================================================================
// SDK Functions
// ============================================================================

export {
  useTuffTransport,
  createTuffRendererTransport,
  createPluginTuffTransport,
  getTuffTransportMain,
} from './sdk'

// ============================================================================
// Legacy Compatibility (Deprecated)
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
  StandardChannelData,
  /**
   * @deprecated Use TuffTransport types instead. Will be removed in v3.0.0.
   */
  RawStandardChannelData,
} from '../channel'
