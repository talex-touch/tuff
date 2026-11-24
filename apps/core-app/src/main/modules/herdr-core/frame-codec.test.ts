import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  decodeCreditPayload,
  decodeFactsPayload,
  decodeFocusPayload,
  decodeResizePayload,
  encodeAutomaticInputFrame,
  encodeCloseFrame,
  encodeCreditFrame,
  encodeDataFrame,
  encodeFactsFrame,
  encodeFocusFrame,
  encodeFrame,
  encodeResizeFrame,
  HERDR_FRAME_HEADER_BYTES,
  HERDR_MAX_FRAME_PAYLOAD_BYTES,
  HerdrFrameCodecError,
  HerdrFrameDecoder,
  HerdrFrameKind
} from './frame-codec'

describe('herdr-core frame-codec', () => {
  it('encodes and decodes all 7 frame kinds with exact 9-byte little-endian headers', () => {
    const decoder = new HerdrFrameDecoder()
    const combined = Buffer.concat([
      encodeDataFrame(0, '{"jsonrpc":"2.0"}\n'),
      encodeCreditFrame(1, 65_536),
      encodeCloseFrame(2),
      encodeResizeFrame(3, 120, 42),
      encodeFocusFrame(4, true),
      encodeFocusFrame(4, false),
      encodeFactsFrame(5, { fg: '#ffffff', cell: [9, 18] }),
      encodeAutomaticInputFrame(6, '\u001b[?1;2c')
    ])

    const frames = decoder.push(combined)
    expect(decoder.pendingBytes).toBe(0)
    expect(frames).toHaveLength(8)

    expect(frames[0]).toMatchObject({ channel: 0, kind: HerdrFrameKind.DATA })
    expect(frames[0]!.payload.toString('utf8')).toBe('{"jsonrpc":"2.0"}\n')

    expect(frames[1]).toMatchObject({ channel: 1, kind: HerdrFrameKind.CREDIT })
    expect(decodeCreditPayload(frames[1]!.payload)).toBe(65_536)

    expect(frames[2]).toMatchObject({ channel: 2, kind: HerdrFrameKind.CLOSE })
    expect(frames[2]!.payload.length).toBe(0)

    expect(frames[3]).toMatchObject({ channel: 3, kind: HerdrFrameKind.RESIZE })
    expect(decodeResizePayload(frames[3]!.payload)).toEqual({ cols: 120, rows: 42 })

    expect(frames[4]).toMatchObject({ channel: 4, kind: HerdrFrameKind.FOCUS })
    expect(decodeFocusPayload(frames[4]!.payload)).toBe(true)

    expect(frames[5]).toMatchObject({ channel: 4, kind: HerdrFrameKind.FOCUS })
    expect(decodeFocusPayload(frames[5]!.payload)).toBe(false)

    expect(frames[6]).toMatchObject({ channel: 5, kind: HerdrFrameKind.FACTS })
    expect(decodeFactsPayload(frames[6]!.payload)).toEqual({ fg: '#ffffff', cell: [9, 18] })

    expect(frames[7]).toMatchObject({ channel: 6, kind: HerdrFrameKind.AUTOMATIC_INPUT })
    expect(frames[7]!.payload.toString('utf8')).toBe('\u001b[?1;2c')
  })

  it('handles byte-by-byte partial chunks across header and payload boundaries', () => {
    const decoder = new HerdrFrameDecoder()
    const raw = Buffer.concat([
      encodeDataFrame(7, 'hello 世界'),
      encodeCloseFrame(7),
      encodeResizeFrame(0x12345678, 200, 50)
    ])

    const decoded = []
    for (let i = 0; i < raw.length; i += 1) {
      decoded.push(...decoder.push(raw.subarray(i, i + 1)))
    }

    expect(decoder.pendingBytes).toBe(0)
    expect(decoded).toHaveLength(3)
    expect(decoded[0]!.channel).toBe(7)
    expect(decoded[0]!.payload.toString('utf8')).toBe('hello 世界')
    expect(decoded[1]!.kind).toBe(HerdrFrameKind.CLOSE)
    expect(decoded[2]!.channel).toBe(0x12345678)
    expect(decodeResizePayload(decoded[2]!.payload)).toEqual({ cols: 200, rows: 50 })
  })

  it('enforces the strict 16 MiB payload cap on encode and immediately on decode headers', () => {
    const exactCap = Buffer.alloc(HERDR_MAX_FRAME_PAYLOAD_BYTES)
    const encodedCap = encodeFrame(1, HerdrFrameKind.DATA, exactCap)
    expect(encodedCap.length).toBe(HERDR_FRAME_HEADER_BYTES + HERDR_MAX_FRAME_PAYLOAD_BYTES)

    const overCap = Buffer.alloc(HERDR_MAX_FRAME_PAYLOAD_BYTES + 1)
    expect(() => encodeFrame(1, HerdrFrameKind.DATA, overCap)).toThrowError(HerdrFrameCodecError)
    expect(() => encodeFrame(1, HerdrFrameKind.DATA, overCap)).toThrow(/16 MiB/)

    // Decoder rejects oversized length as soon as the 9-byte header arrives without waiting for body.
    const decoder = new HerdrFrameDecoder()
    const badHeader = Buffer.alloc(HERDR_FRAME_HEADER_BYTES)
    badHeader.writeUInt32LE(2, 0)
    badHeader.writeUInt8(HerdrFrameKind.DATA, 4)
    badHeader.writeUInt32LE(HERDR_MAX_FRAME_PAYLOAD_BYTES + 1, 5)

    try {
      decoder.push(badHeader)
      expect.unreachable('should reject oversized header')
    } catch (error) {
      expect(error).toBeInstanceOf(HerdrFrameCodecError)
      expect((error as HerdrFrameCodecError).code).toBe('FRAME_PAYLOAD_TOO_LARGE')
    }
    expect(decoder.pendingBytes).toBe(0)
  })

  it('rejects invalid channels, kinds, and malformed control payloads', () => {
    expect(() => encodeDataFrame(-1, 'x')).toThrow(/channel/i)
    expect(() => encodeDataFrame(0x1_0000_0000, 'x')).toThrow(/channel/i)
    expect(() => encodeFrame(0, 99 as never, 'x')).toThrow(/kind/i)
    expect(() => encodeResizeFrame(1, 0, 24)).toThrow(/RESIZE/)
    expect(() => encodeCreditFrame(1, -5)).toThrow(/CREDIT/)
    expect(() => decodeCreditPayload(Buffer.alloc(3))).toThrow(/CREDIT/)
    expect(() => decodeResizePayload(Buffer.alloc(2))).toThrow(/RESIZE/)
    expect(() => decodeFocusPayload(Buffer.from([2]))).toThrow(/FOCUS/)
    expect(() => decodeFactsPayload(Buffer.from('{not-json'))).toThrow(/FACTS/)

    const decoder = new HerdrFrameDecoder()
    const badKindHeader = Buffer.alloc(9)
    badKindHeader.writeUInt32LE(0, 0)
    badKindHeader.writeUInt8(7, 4)
    badKindHeader.writeUInt32LE(0, 5)
    expect(() => decoder.push(badKindHeader)).toThrow(/Unknown herdr frame kind/)
  })
})
