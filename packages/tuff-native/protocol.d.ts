/// <reference types="node" />

import type { Buffer } from 'node:buffer'
import type {
  NativePacket,
  NativeRequestV1,
  NativeResponseV1,
  NativeServerHelloV1,
  NativeStreamFrameV1,
} from './protocol-contract'

export interface NativeProtocolBinding {
  nativeProtocolV1Handshake(control: string): string
  nativeProtocolV1Invoke(
    control: string,
    attachments: Buffer[],
  ): Promise<{ control: string; attachments: Buffer[] }>
  nativeProtocolV1OpenStream(
    control: string,
    attachments: Buffer[],
    onFrame: (packet: { control: string; attachments: Buffer[] }) => void,
  ): { control: string; attachments: Buffer[] }
  nativeProtocolV1Ack(control: string): void
  nativeProtocolV1Cancel(control: string): void
  nativeProtocolV1Dispose(): Promise<void>
}

export interface NativeCarrierLogger {
  info?(message: string, metadata: Record<string, unknown>): void
  warn?(message: string, metadata: Record<string, unknown>): void
}

export interface NapiCarrierOptions {
  id: string
  binding: NativeProtocolBinding
  logger?: NativeCarrierLogger
  clientName?: string
  clientVersion?: string
}

export declare const EXPECTED_EXPORTS: readonly string[]

export declare class NativeCarrierError extends Error {
  readonly code: string
  readonly category: string
  readonly retryable: boolean
  readonly carrierId?: string
  readonly requestId?: string
  readonly streamId?: string
}

export declare class NapiCarrier {
  readonly id: string
  readonly binding: NativeProtocolBinding
  readonly clientName: string
  readonly clientVersion: string
  readonly state: 'new' | 'ready' | 'disposing' | 'disposed'
  readonly snapshot: NativeServerHelloV1 | null

  constructor(options: NapiCarrierOptions)

  handshake(): NativeServerHelloV1
  invoke(
    control: NativeRequestV1,
    attachments?: Buffer[],
  ): Promise<NativePacket<NativeResponseV1>>
  openStream(
    control: NativeRequestV1,
    attachments: Buffer[] | undefined,
    onFrame: (packet: NativePacket<NativeStreamFrameV1>) => void,
  ): NativePacket<NativeResponseV1>
  acknowledge(streamId: string, ackSequence: number): boolean
  cancel(
    targetType: 'request' | 'stream',
    id: string,
    reason?: 'caller' | 'consumer_closed' | 'deadline' | 'dispose',
  ): boolean
  health(): Promise<NativeResponseV1>
  releaseStream(streamId: string): boolean
  dispose(): Promise<void>
  nextId(scope?: string): string
}
