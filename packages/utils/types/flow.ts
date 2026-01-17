/**
 * Flow Transfer Type Definitions
 *
 * Core types for the plugin-to-plugin data flow transfer system.
 * Enables plugins to share structured data with other plugins' features.
 */

import type { TuffQuery } from '../core-box/tuff/tuff-dsl'

/**
 * Flow payload types
 */
export type FlowPayloadType = 'text' | 'image' | 'files' | 'json' | 'html' | 'custom'

/**
 * Flow session states
 */
export type FlowSessionState
  = | 'INIT'
    | 'TARGET_SELECTING'
    | 'TARGET_SELECTED'
    | 'DELIVERING'
    | 'DELIVERED'
    | 'PROCESSING'
    | 'ACKED'
    | 'FAILED'
    | 'CANCELLED'

/**
 * Flow error codes
 */
export enum FlowErrorCode {
  SENDER_NOT_ALLOWED = 'SENDER_NOT_ALLOWED',
  TARGET_NOT_FOUND = 'TARGET_NOT_FOUND',
  TARGET_OFFLINE = 'TARGET_OFFLINE',
  PAYLOAD_INVALID = 'PAYLOAD_INVALID',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  TYPE_NOT_SUPPORTED = 'TYPE_NOT_SUPPORTED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  TIMEOUT = 'TIMEOUT',
  CANCELLED = 'CANCELLED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Flow error
 */
export interface FlowError {
  code: FlowErrorCode
  message: string
  details?: Record<string, any>
}

/**
 * Flow payload context
 */
export interface FlowPayloadContext {
  /** Source plugin ID */
  sourcePluginId: string

  /** Source feature ID (optional) */
  sourceFeatureId?: string

  /** Original query (if triggered from CoreBox) */
  originalQuery?: TuffQuery

  /** Custom metadata */
  metadata?: Record<string, any>
}

/**
 * Flow payload - data being transferred
 */
export interface FlowPayload {
  /** Payload type */
  type: FlowPayloadType

  /** Main data content */
  data: string | object

  /** MIME type (optional) */
  mimeType?: string

  /** Context information */
  context?: FlowPayloadContext
}

/**
 * Flow target capabilities
 */
export interface FlowTargetCapabilities {
  /** Whether authentication is required */
  requiresAuth?: boolean

  /** Allowed sender plugin IDs (whitelist) */
  allowedSenders?: string[]

  /** Maximum payload size in bytes */
  maxPayloadSize?: number
}

/**
 * Flow target - declared in plugin manifest
 */
export interface FlowTarget {
  /** Target unique ID (unique within plugin) */
  id: string

  /** Display name */
  name: string

  /** Description */
  description?: string

  /** Supported payload types */
  supportedTypes: FlowPayloadType[]

  /** Icon (iconify format) */
  icon?: string

  /** Associated feature ID (optional) */
  featureId?: string

  /** Associated action ID (optional) */
  actionId?: string

  /** Whether user confirmation is required */
  requireConfirm?: boolean

  /** Capability requirements */
  capabilities?: FlowTargetCapabilities
}

/**
 * Flow target info - runtime information
 */
export interface FlowTargetInfo extends FlowTarget {
  /** Full target ID (pluginId.targetId) */
  fullId: string

  /** Plugin ID */
  pluginId: string

  /** Plugin name */
  pluginName?: string

  /** Plugin icon */
  pluginIcon?: string

  /** Whether the plugin is currently enabled */
  isEnabled: boolean

  /** Whether plugin has registered onFlowTransfer handler */
  hasFlowHandler: boolean

  /** Whether this is a native system share target */
  isNativeShare?: boolean

  /** Adaptation status message (for unhandled plugins) */
  adaptationHint?: string

  /** Recent usage count */
  usageCount?: number

  /** Last used timestamp */
  lastUsed?: number
}

/**
 * Flow session - a complete flow operation
 */
export interface FlowSession {
  /** Session unique ID */
  sessionId: string

  /** Session state */
  state: FlowSessionState

  /** Sender plugin ID */
  senderId: string

  /** Target plugin ID */
  targetPluginId: string

  /** Target endpoint ID */
  targetId: string

  /** Full target ID (pluginId.targetId) */
  fullTargetId: string

  /** Payload data */
  payload: FlowPayload

  /** Creation timestamp */
  createdAt: number

  /** Update timestamp */
  updatedAt: number

  /** Acknowledgment payload (if any) */
  ackPayload?: any

  /** Error information (if failed) */
  error?: FlowError
}

/**
 * Flow dispatch options
 */
export interface FlowDispatchOptions {
  /** Display title (for selector panel) */
  title?: string

  /** Display description */
  description?: string

  /** Preferred target (bundleId.targetId or tuffItemId) */
  preferredTarget?: string

  /** Skip selector panel (requires preferredTarget) */
  skipSelector?: boolean

  /** Timeout in milliseconds (default: 30000) */
  timeout?: number

  /** Fallback action on failure */
  fallbackAction?: 'copy' | 'none'

  /** Whether acknowledgment is required */
  requireAck?: boolean
}

/**
 * Flow dispatch result
 */
export interface FlowDispatchResult {
  /** Session ID */
  sessionId: string

  /** Final state */
  state: FlowSessionState

  /** Acknowledgment payload */
  ackPayload?: any

  /** Error (if failed) */
  error?: FlowError
}

/**
 * Flow session update event
 */
export interface FlowSessionUpdate {
  /** Session ID */
  sessionId: string

  /** Previous state */
  previousState: FlowSessionState

  /** Current state */
  currentState: FlowSessionState

  /** Timestamp */
  timestamp: number

  /** Additional data */
  data?: any
}

/**
 * IPC channels for Flow operations
 */
export enum FlowIPCChannel {
  DISPATCH = 'flow:dispatch',
  GET_TARGETS = 'flow:get-targets',
  CANCEL = 'flow:cancel',
  ACKNOWLEDGE = 'flow:acknowledge',
  REPORT_ERROR = 'flow:report-error',
  SESSION_UPDATE = 'flow:session-update',
  DELIVER = 'flow:deliver',
}

/**
 * Flow manifest configuration (in plugin manifest.json)
 */
export interface FlowManifestConfig {
  /** Whether this plugin can send flows */
  flowSender?: boolean

  /** Flow targets this plugin can receive */
  flowTargets?: FlowTarget[]
}

/**
 * Native share target types
 */
export type NativeShareTarget = 'system' | 'airdrop' | 'mail' | 'messages'

/**
 * Native share options
 */
export interface NativeShareOptions {
  /** Share title */
  title?: string

  /** Share text content */
  text?: string

  /** Share URL */
  url?: string

  /** File paths to share */
  files?: string[]

  /** Preferred native target (optional) */
  target?: NativeShareTarget
}

/**
 * Native share result
 */
export interface NativeShareResult {
  /** Whether share was successful */
  success: boolean

  /** Target used (if known) */
  target?: string

  /** Error message if failed */
  error?: string
}
