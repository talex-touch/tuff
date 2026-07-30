import type { Buffer } from 'node:buffer'
import type {
  NativeCapabilityDescriptor,
  NativePacket,
  NativeRequestV1,
  NativeResponseV1,
  NativeServerHelloV1,
  NativeStreamFrameV1
} from '@talex-touch/tuff-native/protocol-contract'
import type { NativeCarrierLike } from './native-transport'

export interface Deferred<T> {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })
  return { promise, resolve, reject }
}

export function capability(
  id: string,
  state: NativeCapabilityDescriptor['state'] = 'available',
  modes: Array<'unary' | 'stream'> = ['unary']
): NativeCapabilityDescriptor {
  return {
    id,
    version: '1.0.0',
    engine: 'fixture',
    state,
    ...(state === 'degraded' ? { reason: 'fixture-degraded' } : {}),
    features: [],
    operations: modes.map((mode) => ({
      name: mode === 'unary' ? 'echo' : 'count',
      mode,
      cancellation: 'cooperative',
      acceptsAttachments: mode === 'unary',
      emitsAttachments: mode === 'unary'
    }))
  }
}

export function hello(
  addonId: string,
  capabilities: NativeCapabilityDescriptor[]
): NativeServerHelloV1 {
  return {
    kind: 'server_hello',
    protocol: { major: 1, minor: 0 },
    runtime: {
      addonId,
      addonVersion: '0.1.0',
      target: 'test-target',
      platform: 'test',
      arch: 'test',
      buildProfile: 'debug'
    },
    carrierFeatures: ['attachments', 'stream-credit-v1'],
    limits: {
      maxControlBytes: 1024 * 1024,
      maxAttachmentCount: 8,
      maxAttachmentBytes: 64 * 1024 * 1024,
      maxPacketAttachmentBytes: 128 * 1024 * 1024,
      maxInFlightUnary: 64,
      maxOpenStreams: 16,
      maxStreamWindow: 8,
      cancelGraceMs: 1000,
      disposeGraceMs: 3000
    },
    capabilities
  }
}

export function successResponse(
  request: NativeRequestV1,
  payload: unknown,
  attachments: Buffer[] = []
): NativePacket<NativeResponseV1> {
  return {
    control: {
      kind: 'response',
      protocol: { major: 1, minor: 0 },
      requestId: request.requestId,
      ok: true,
      payload,
      attachments: attachments.map((buffer, index) => ({
        id: `output-${index}`,
        index,
        byteLength: buffer.byteLength
      })),
      meta: { durationMs: 1, engine: 'fixture', cancellation: 'cooperative' }
    },
    attachments
  }
}

export function errorResponse(
  request: NativeRequestV1,
  code: string
): NativePacket<NativeResponseV1> {
  return {
    control: {
      kind: 'response',
      protocol: { major: 1, minor: 0 },
      requestId: request.requestId,
      ok: false,
      error: {
        code,
        category: 'internal',
        message: 'Native fixture failed',
        retryable: false
      },
      attachments: [],
      meta: { durationMs: 1 }
    },
    attachments: []
  }
}

export class FakeNativeCarrier implements NativeCarrierLike {
  readonly id: string
  readonly snapshot: NativeServerHelloV1
  readonly invocations: NativeRequestV1[] = []
  readonly opened: NativeRequestV1[] = []
  readonly acknowledgements: Array<{ streamId: string; sequence: number }> = []
  readonly cancellations: Array<{
    targetType: 'request' | 'stream'
    id: string
    reason: 'caller' | 'consumer_closed' | 'deadline' | 'dispose'
  }> = []
  readonly released: string[] = []
  handshakeCalls = 0
  disposeCalls = 0
  handshakeImpl: () => NativeServerHelloV1 | Promise<NativeServerHelloV1>
  invokeImpl: (
    control: NativeRequestV1,
    attachments: Buffer[]
  ) => Promise<NativePacket<NativeResponseV1>>
  openStreamImpl: (
    control: NativeRequestV1,
    attachments: Buffer[],
    onFrame: (packet: NativePacket<NativeStreamFrameV1>) => void
  ) => NativePacket<NativeResponseV1>
  healthImpl: () => Promise<NativeResponseV1>
  disposeImpl: () => Promise<void>

  constructor(id: string, capabilities: NativeCapabilityDescriptor[]) {
    this.id = id
    this.snapshot = hello(id, capabilities)
    this.handshakeImpl = () => this.snapshot
    this.invokeImpl = async (control, attachments) =>
      successResponse(control, control.payload, attachments)
    this.openStreamImpl = (control) =>
      successResponse(control, {
        streamId: (control.payload as { streamId: string }).streamId,
        effectiveWindow: (control.payload as { initialWindow: number }).initialWindow,
        cancellation: 'cooperative'
      })
    this.healthImpl = async () => ({
      kind: 'response',
      protocol: { major: 1, minor: 0 },
      requestId: `health-${id}`,
      ok: true,
      payload: { healthy: true },
      attachments: [],
      meta: { durationMs: 0 }
    })
    this.disposeImpl = async () => undefined
  }

  handshake(): NativeServerHelloV1 | Promise<NativeServerHelloV1> {
    this.handshakeCalls += 1
    return this.handshakeImpl()
  }

  invoke(
    control: NativeRequestV1,
    attachments: Buffer[] = []
  ): Promise<NativePacket<NativeResponseV1>> {
    this.invocations.push(control)
    return this.invokeImpl(control, attachments)
  }

  openStream(
    control: NativeRequestV1,
    attachments: Buffer[] = [],
    onFrame: (packet: NativePacket<NativeStreamFrameV1>) => void
  ): NativePacket<NativeResponseV1> {
    this.opened.push(control)
    return this.openStreamImpl(control, attachments, onFrame)
  }

  acknowledge(streamId: string, ackSequence: number): boolean {
    this.acknowledgements.push({ streamId, sequence: ackSequence })
    return true
  }

  cancel(
    targetType: 'request' | 'stream',
    id: string,
    reason: 'caller' | 'consumer_closed' | 'deadline' | 'dispose' = 'caller'
  ): boolean {
    this.cancellations.push({ targetType, id, reason })
    return true
  }

  health(): Promise<NativeResponseV1> {
    return this.healthImpl()
  }

  releaseStream(streamId: string): boolean {
    this.released.push(streamId)
    return true
  }

  async dispose(): Promise<void> {
    this.disposeCalls += 1
    await this.disposeImpl()
  }
}

export function streamData<T>(
  streamId: string,
  sequence: number,
  payload: T
): NativePacket<NativeStreamFrameV1> {
  return {
    control: {
      kind: 'stream_data',
      protocol: { major: 1, minor: 0 },
      streamId,
      sequence,
      payload,
      attachments: []
    },
    attachments: []
  }
}

export function streamEnd(
  streamId: string,
  sequence: number,
  payload: unknown = null
): NativePacket<NativeStreamFrameV1> {
  return {
    control: {
      kind: 'stream_end',
      protocol: { major: 1, minor: 0 },
      streamId,
      sequence,
      payload,
      attachments: []
    },
    attachments: []
  }
}

export function streamError(
  streamId: string,
  sequence: number,
  code = 'FIXTURE_STREAM_FAILED'
): NativePacket<NativeStreamFrameV1> {
  return {
    control: {
      kind: 'stream_error',
      protocol: { major: 1, minor: 0 },
      streamId,
      sequence,
      error: {
        code,
        category: code === 'CANCELLED' ? 'cancelled' : 'internal',
        message: 'Native fixture stream failed',
        retryable: false
      },
      attachments: []
    },
    attachments: []
  }
}
