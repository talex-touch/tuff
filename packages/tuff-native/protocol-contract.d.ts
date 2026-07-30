/// <reference types="node" />

import type { Buffer } from 'node:buffer'

export interface ProtocolVersionV1 {
  major: 1
  minor: 0
}

export interface ProtocolRangeV1 {
  major: 1
  minMinor: number
  maxMinor: number
}

export interface NativeAttachmentDescriptor {
  id: string
  index: number
  byteLength: number
  mediaType?: string
  purpose?: string
}

export interface NativeProtocolError {
  code: string
  category:
    | 'protocol'
    | 'validation'
    | 'availability'
    | 'permission'
    | 'not_found'
    | 'cancelled'
    | 'timeout'
    | 'resource'
    | 'internal'
  message: string
  retryable: boolean
  details?: Record<string, string | number | boolean>
}

export interface NativeRunMeta {
  durationMs: number
  engine?: string
  degraded?: boolean
  cancellation?: 'cooperative' | 'best-effort' | 'none'
  counters?: Record<string, number>
}

export interface NativeOperationDescriptor {
  name: string
  mode: 'unary' | 'stream'
  cancellation: 'cooperative' | 'best-effort' | 'none'
  acceptsAttachments: boolean
  emitsAttachments: boolean
}

export interface NativeCapabilityDescriptor {
  id: string
  version: string
  engine?: string
  state: 'available' | 'degraded' | 'unavailable'
  reason?: string
  features: string[]
  operations: NativeOperationDescriptor[]
}

export interface NativeProtocolLimits {
  maxControlBytes: number
  maxAttachmentCount: number
  maxAttachmentBytes: number
  maxPacketAttachmentBytes: number
  maxInFlightUnary: number
  maxOpenStreams: number
  maxStreamWindow: number
  cancelGraceMs: number
  disposeGraceMs: number
}

export interface NativeClientHelloV1 {
  kind: 'client_hello'
  protocol: ProtocolRangeV1
  client: { name: string; version: string }
  requestedFeatures: string[]
}

export interface NativeServerHelloV1 {
  kind: 'server_hello'
  protocol: ProtocolVersionV1
  runtime: {
    addonId: string
    addonVersion: string
    target: string
    platform: string
    arch: string
    buildProfile: string
  }
  carrierFeatures: string[]
  limits: NativeProtocolLimits
  capabilities: NativeCapabilityDescriptor[]
}

export interface NativeRequestV1 {
  kind: 'request'
  protocol: ProtocolVersionV1
  requestId: string
  capability: string
  operation: string
  deadlineUnixMs?: number
  payload: unknown
  attachments: NativeAttachmentDescriptor[]
}

export type NativeResponseV1 =
  | {
      kind: 'response'
      protocol: ProtocolVersionV1
      requestId: string
      ok: true
      payload: unknown
      attachments: NativeAttachmentDescriptor[]
      meta: NativeRunMeta
    }
  | {
      kind: 'response'
      protocol: ProtocolVersionV1
      requestId: string
      ok: false
      error: NativeProtocolError
      attachments: []
      meta: NativeRunMeta
    }

export type NativeStreamFrameV1 =
  | {
      kind: 'stream_data'
      protocol: ProtocolVersionV1
      streamId: string
      sequence: number
      payload: unknown
      attachments: NativeAttachmentDescriptor[]
      meta?: Record<string, unknown>
    }
  | {
      kind: 'stream_end'
      protocol: ProtocolVersionV1
      streamId: string
      sequence: number
      payload?: unknown
      attachments: NativeAttachmentDescriptor[]
    }
  | {
      kind: 'stream_error'
      protocol: ProtocolVersionV1
      streamId: string
      sequence: number
      error: NativeProtocolError
      attachments: []
    }

export interface NativeStreamAckV1 {
  kind: 'stream_ack'
  protocol: ProtocolVersionV1
  streamId: string
  ackSequence: number
}

export interface NativeCancelV1 {
  kind: 'cancel'
  protocol: ProtocolVersionV1
  target: { type: 'request' | 'stream'; id: string }
  reason: 'caller' | 'consumer_closed' | 'deadline' | 'dispose'
}

export type NativeControlV1 =
  | NativeClientHelloV1
  | NativeServerHelloV1
  | NativeRequestV1
  | NativeResponseV1
  | NativeStreamFrameV1
  | NativeStreamAckV1
  | NativeCancelV1

export interface NativePacket<TControl extends NativeControlV1 = NativeControlV1> {
  control: TControl
  attachments: Buffer[]
}

export declare const PROTOCOL_V1: Readonly<{ major: 1; minor: 0 }>
export declare const HARD_MAX_STREAM_WINDOW: 8
export declare const MAX_SAFE_SEQUENCE: number

export declare class ProtocolContractError extends Error {
  readonly code: string
  readonly category: string
  readonly retryable: boolean
  readonly details?: Record<string, unknown>
}

export declare function encodeControl(control: NativeControlV1): string
export declare function decodeControl(encoded: string): NativeControlV1
export declare function validateControl(control: unknown): NativeControlV1
export declare function validatePacket(
  encoded: string,
  attachments: Buffer[],
): NativePacket
