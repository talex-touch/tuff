/**
 * @fileoverview Type definitions for Transport port upgrade events
 * @module @talex-touch/utils/transport/events/types/transport
 * @since v0.9.0
 */

export type TransportPortScope = 'app' | 'window' | 'plugin'

export interface TransportPortError {
  code: string
  message: string
}

export interface TransportPortUpgradeRequest {
  channel: string
  scope?: TransportPortScope
  windowId?: number
  plugin?: string
  permissions?: string[]
}

export interface TransportPortUpgradeResponse {
  accepted: boolean
  channel: string
  scope?: TransportPortScope
  permissions?: string[]
  portId?: string
  error?: TransportPortError
}

export interface TransportPortConfirmPayload {
  channel: string
  portId: string
  scope?: TransportPortScope
  permissions?: string[]
}

export interface TransportPortClosePayload {
  channel: string
  portId?: string
  scope?: TransportPortScope
  reason?: string
}

export interface TransportPortErrorPayload {
  channel: string
  portId?: string
  scope?: TransportPortScope
  error: TransportPortError
}

export interface TransportPortEnvelope<TPayload = unknown> {
  channel: string
  portId?: string
  streamId?: string
  sequence?: number
  type: 'data' | 'close' | 'error'
  payload?: TPayload
  error?: TransportPortError
}
