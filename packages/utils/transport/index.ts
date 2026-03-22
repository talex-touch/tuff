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

export {
  ChannelType,
  DataCode,
} from './channel-types'

export type {
  ITouchChannel,
  ITouchClientChannel,
  RawChannelSyncData,
  RawStandardChannelData,
  StandardChannelData,
} from './channel-types'

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
  useTuffTransport,
} from './sdk'

export type {
  // Batch types
  BatchPayload,
  BatchResponse,
  BatchResult,

  // Contexts
  HandlerContext,
  MainInvokeContext,
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
  TransportPortHandle,
  TransportPortOpenOptions,
} from './types'

export * from './prelude'
