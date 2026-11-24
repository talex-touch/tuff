import { Buffer } from 'node:buffer'

export const HERDR_FRAME_HEADER_BYTES = 9
export const HERDR_MAX_FRAME_PAYLOAD_BYTES = 16 * 1024 * 1024

export const HerdrFrameKind = {
  DATA: 0,
  CREDIT: 1,
  CLOSE: 2,
  RESIZE: 3,
  FOCUS: 4,
  FACTS: 5,
  AUTOMATIC_INPUT: 6
} as const

export type HerdrFrameKindValue = (typeof HerdrFrameKind)[keyof typeof HerdrFrameKind]

export type HerdrFrameCodecErrorCode =
  | 'FRAME_PAYLOAD_TOO_LARGE'
  | 'FRAME_CHANNEL_INVALID'
  | 'FRAME_KIND_INVALID'
  | 'FRAME_PAYLOAD_INVALID'

export class HerdrFrameCodecError extends Error {
  readonly code: HerdrFrameCodecErrorCode

  constructor(code: HerdrFrameCodecErrorCode, message: string) {
    super(message)
    this.name = 'HerdrFrameCodecError'
    this.code = code
  }
}

export interface HerdrFrame {
  channel: number
  kind: HerdrFrameKindValue
  payload: Buffer
}

export interface HerdrResizePayload {
  cols: number
  rows: number
}

const MAX_UINT32 = 0xffffffff
const MAX_UINT16 = 0xffff

export function isHerdrFrameKind(value: number): value is HerdrFrameKindValue {
  return (
    Number.isInteger(value) &&
    value >= HerdrFrameKind.DATA &&
    value <= HerdrFrameKind.AUTOMATIC_INPUT
  )
}

function assertValidChannel(channel: number): void {
  if (!Number.isInteger(channel) || channel < 0 || channel > MAX_UINT32) {
    throw new HerdrFrameCodecError(
      'FRAME_CHANNEL_INVALID',
      `Invalid herdr frame channel: ${String(channel)}`
    )
  }
}

function assertValidKind(kind: number): asserts kind is HerdrFrameKindValue {
  if (!isHerdrFrameKind(kind)) {
    throw new HerdrFrameCodecError(
      'FRAME_KIND_INVALID',
      `Invalid herdr frame kind: ${String(kind)}`
    )
  }
}

function assertValidPayloadLength(length: number): void {
  if (!Number.isInteger(length) || length < 0 || length > HERDR_MAX_FRAME_PAYLOAD_BYTES) {
    throw new HerdrFrameCodecError(
      'FRAME_PAYLOAD_TOO_LARGE',
      `Frame payload size ${length} exceeds 16 MiB cap (${HERDR_MAX_FRAME_PAYLOAD_BYTES} bytes)`
    )
  }
}

function toPayloadBuffer(data: Buffer | Uint8Array | string | undefined): Buffer {
  if (data === undefined) return Buffer.alloc(0)
  if (Buffer.isBuffer(data)) return data
  if (typeof data === 'string') return Buffer.from(data, 'utf8')
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

export function encodeFrame(
  channel: number,
  kind: HerdrFrameKindValue,
  payload?: Buffer | Uint8Array | string
): Buffer {
  assertValidChannel(channel)
  assertValidKind(kind)
  const body = toPayloadBuffer(payload)
  assertValidPayloadLength(body.length)

  const frame = Buffer.allocUnsafe(HERDR_FRAME_HEADER_BYTES + body.length)
  frame.writeUInt32LE(channel, 0)
  frame.writeUInt8(kind, 4)
  frame.writeUInt32LE(body.length, 5)
  if (body.length > 0) {
    body.copy(frame, HERDR_FRAME_HEADER_BYTES)
  }
  return frame
}

export function encodeDataFrame(channel: number, data: Buffer | Uint8Array | string): Buffer {
  return encodeFrame(channel, HerdrFrameKind.DATA, data)
}

export function encodeCreditFrame(channel: number, bytes: number): Buffer {
  if (!Number.isInteger(bytes) || bytes < 0 || bytes > MAX_UINT32) {
    throw new HerdrFrameCodecError(
      'FRAME_PAYLOAD_INVALID',
      `Invalid CREDIT byte count: ${String(bytes)}`
    )
  }
  const payload = Buffer.allocUnsafe(4)
  payload.writeUInt32LE(bytes, 0)
  return encodeFrame(channel, HerdrFrameKind.CREDIT, payload)
}

export function encodeCloseFrame(channel: number): Buffer {
  return encodeFrame(channel, HerdrFrameKind.CLOSE)
}

export function encodeResizeFrame(channel: number, cols: number, rows: number): Buffer {
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < 1 ||
    rows < 1 ||
    cols > MAX_UINT16 ||
    rows > MAX_UINT16
  ) {
    throw new HerdrFrameCodecError(
      'FRAME_PAYLOAD_INVALID',
      `Invalid RESIZE dimensions: cols=${String(cols)}, rows=${String(rows)}`
    )
  }
  const payload = Buffer.allocUnsafe(4)
  payload.writeUInt16LE(cols, 0)
  payload.writeUInt16LE(rows, 2)
  return encodeFrame(channel, HerdrFrameKind.RESIZE, payload)
}

export function encodeFocusFrame(channel: number, focused: boolean): Buffer {
  if (typeof focused !== 'boolean') {
    throw new HerdrFrameCodecError(
      'FRAME_PAYLOAD_INVALID',
      `Invalid FOCUS payload: ${String(focused)}`
    )
  }
  const payload = Buffer.from([focused ? 1 : 0])
  return encodeFrame(channel, HerdrFrameKind.FOCUS, payload)
}

export function encodeFactsFrame(channel: number, facts: unknown): Buffer {
  let encoded: string
  try {
    encoded = JSON.stringify(facts)
  } catch (error) {
    throw new HerdrFrameCodecError(
      'FRAME_PAYLOAD_INVALID',
      `Failed to serialize FACTS payload: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (typeof encoded !== 'string') {
    throw new HerdrFrameCodecError(
      'FRAME_PAYLOAD_INVALID',
      'FACTS payload must be JSON-serializable'
    )
  }
  return encodeFrame(channel, HerdrFrameKind.FACTS, Buffer.from(encoded, 'utf8'))
}

export function encodeAutomaticInputFrame(
  channel: number,
  data: Buffer | Uint8Array | string
): Buffer {
  return encodeFrame(channel, HerdrFrameKind.AUTOMATIC_INPUT, data)
}

export function decodeCreditPayload(payload: Buffer): number {
  if (payload.length !== 4) {
    throw new HerdrFrameCodecError(
      'FRAME_PAYLOAD_INVALID',
      `Expected 4-byte CREDIT payload, got ${payload.length} bytes`
    )
  }
  return payload.readUInt32LE(0)
}

export function decodeResizePayload(payload: Buffer): HerdrResizePayload {
  if (payload.length !== 4) {
    throw new HerdrFrameCodecError(
      'FRAME_PAYLOAD_INVALID',
      `Expected 4-byte RESIZE payload, got ${payload.length} bytes`
    )
  }
  return {
    cols: payload.readUInt16LE(0),
    rows: payload.readUInt16LE(2)
  }
}

export function decodeFocusPayload(payload: Buffer): boolean {
  if (payload.length !== 1 || (payload[0] !== 0 && payload[0] !== 1)) {
    throw new HerdrFrameCodecError(
      'FRAME_PAYLOAD_INVALID',
      `Expected 1-byte FOCUS payload (0|1), got ${payload.length} bytes`
    )
  }
  return payload[0] === 1
}

export function decodeFactsPayload<T = Record<string, unknown>>(payload: Buffer): T {
  try {
    return JSON.parse(payload.toString('utf8')) as T
  } catch (error) {
    throw new HerdrFrameCodecError(
      'FRAME_PAYLOAD_INVALID',
      `Invalid JSON in FACTS payload: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Streaming binary frame decoder for herdr-core's 9-byte framed protocol.
 * Handles arbitrary chunk splits, coalesced multi-frame packets, and rejects
 * headers claiming payloads over 16 MiB before buffering them.
 */
export class HerdrFrameDecoder {
  private readonly maxPayloadBytes: number
  private chunks: Buffer[] = []
  private totalBytes = 0

  constructor(maxPayloadBytes = HERDR_MAX_FRAME_PAYLOAD_BYTES) {
    this.maxPayloadBytes = maxPayloadBytes
  }

  get pendingBytes(): number {
    return this.totalBytes
  }

  reset(): void {
    this.chunks = []
    this.totalBytes = 0
  }

  push(input: Buffer | Uint8Array): HerdrFrame[] {
    const chunk = Buffer.isBuffer(input)
      ? input
      : Buffer.from(input.buffer, input.byteOffset, input.byteLength)
    if (chunk.length === 0) return []

    this.chunks.push(chunk)
    this.totalBytes += chunk.length

    if (this.totalBytes < HERDR_FRAME_HEADER_BYTES) {
      return []
    }

    const buffer =
      this.chunks.length === 1 ? this.chunks[0]! : Buffer.concat(this.chunks, this.totalBytes)
    const frames: HerdrFrame[] = []
    let offset = 0

    while (buffer.length - offset >= HERDR_FRAME_HEADER_BYTES) {
      const channel = buffer.readUInt32LE(offset)
      const rawKind = buffer.readUInt8(offset + 4)
      const length = buffer.readUInt32LE(offset + 5)

      if (!isHerdrFrameKind(rawKind)) {
        this.reset()
        throw new HerdrFrameCodecError(
          'FRAME_KIND_INVALID',
          `Unknown herdr frame kind ${rawKind} on channel ${channel}`
        )
      }

      if (length > this.maxPayloadBytes) {
        this.reset()
        throw new HerdrFrameCodecError(
          'FRAME_PAYLOAD_TOO_LARGE',
          `Incoming herdr frame length ${length} exceeds ${this.maxPayloadBytes} bytes on channel ${channel}`
        )
      }

      const frameSize = HERDR_FRAME_HEADER_BYTES + length
      if (buffer.length - offset < frameSize) {
        break
      }

      // Copy payload out so callers do not retain references to large coalesced chunks.
      const payload =
        length === 0
          ? Buffer.alloc(0)
          : Buffer.from(buffer.subarray(offset + HERDR_FRAME_HEADER_BYTES, offset + frameSize))

      frames.push({
        channel,
        kind: rawKind,
        payload
      })
      offset += frameSize
    }

    if (offset === buffer.length) {
      this.chunks = []
      this.totalBytes = 0
    } else if (offset > 0) {
      const remaining = Buffer.from(buffer.subarray(offset))
      this.chunks = [remaining]
      this.totalBytes = remaining.length
    } else if (this.chunks.length > 1) {
      this.chunks = [buffer]
    }

    return frames
  }
}
