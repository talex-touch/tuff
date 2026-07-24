import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { VoiceAsrStreamEvent } from '@talex-touch/utils/transport/sdk/domains/voice'
import { createAsrStream, getStreamingAsrConfig, parseAsrMessage } from './streaming-asr-client'

describe('parseAsrMessage', () => {
  it('parses partial and final shapes', () => {
    expect(parseAsrMessage(JSON.stringify({ type: 'partial', text: 'hi' }))).toEqual({
      type: 'partial',
      text: 'hi'
    })
    expect(parseAsrMessage(JSON.stringify({ type: 'final', text: 'hi there' }))).toEqual({
      type: 'final',
      text: 'hi there'
    })
    expect(parseAsrMessage(JSON.stringify({ is_final: true, transcript: 'done' }))).toEqual({
      type: 'final',
      text: 'done'
    })
    expect(parseAsrMessage(JSON.stringify({ partial: 'typing' }))).toEqual({
      type: 'partial',
      text: 'typing'
    })
  })

  it('ignores invalid or textless messages', () => {
    expect(parseAsrMessage('not json')).toBeNull()
    expect(parseAsrMessage(JSON.stringify({ type: 'final' }))).toBeNull()
    expect(parseAsrMessage(123)).toBeNull()
    expect(parseAsrMessage(Buffer.from([1, 2]))).toBeNull()
  })
})

describe('getStreamingAsrConfig', () => {
  const original = process.env.TUFF_VOICE_ASR_WS_URL
  const originalRate = process.env.TUFF_VOICE_ASR_WS_SAMPLE_RATE

  afterEach(() => {
    if (original === undefined) delete process.env.TUFF_VOICE_ASR_WS_URL
    else process.env.TUFF_VOICE_ASR_WS_URL = original
    if (originalRate === undefined) delete process.env.TUFF_VOICE_ASR_WS_SAMPLE_RATE
    else process.env.TUFF_VOICE_ASR_WS_SAMPLE_RATE = originalRate
  })

  it('returns null when the endpoint is unset', () => {
    delete process.env.TUFF_VOICE_ASR_WS_URL
    expect(getStreamingAsrConfig()).toBeNull()
  })

  it('reads url and sample rate', () => {
    process.env.TUFF_VOICE_ASR_WS_URL = 'wss://host/asr'
    process.env.TUFF_VOICE_ASR_WS_SAMPLE_RATE = '8000'
    expect(getStreamingAsrConfig()).toEqual({ url: 'wss://host/asr', sampleRate: 8000 })
  })

  it('defaults the sample rate to 16000', () => {
    process.env.TUFF_VOICE_ASR_WS_URL = 'wss://host/asr'
    delete process.env.TUFF_VOICE_ASR_WS_SAMPLE_RATE
    expect(getStreamingAsrConfig()).toEqual({ url: 'wss://host/asr', sampleRate: 16000 })
  })
})

class FakeSocket {
  static instances: FakeSocket[] = []
  readyState = 0
  binaryType = ''
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onclose: (() => void) | null = null
  sent: unknown[] = []

  constructor(public url: string) {
    FakeSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = 1
      this.onopen?.()
    })
  }

  send(data: unknown): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = 3
    this.onclose?.()
  }

  emit(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

describe('createAsrStream', () => {
  beforeEach(() => {
    FakeSocket.instances = []
    ;(globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket
  })

  afterEach(() => {
    delete (globalThis as unknown as { WebSocket?: unknown }).WebSocket
  })

  it('sends a start frame and yields partial then final events', async () => {
    const gen = createAsrStream({
      url: 'wss://host/asr',
      sampleRate: 16000,
      language: 'en',
      drainFrames: () => Buffer.alloc(0),
      isCapturing: () => false
    })

    const events: VoiceAsrStreamEvent[] = []
    const collect = (async () => {
      for await (const event of gen) events.push(event)
    })()

    // Let the socket open (microtask) + the generator start.
    await new Promise((resolve) => setTimeout(resolve, 0))
    const socket = FakeSocket.instances[0]
    expect(socket).toBeDefined()

    socket.emit({ type: 'partial', text: 'he' })
    socket.emit({ type: 'final', text: 'hello' })

    await collect

    expect(events).toContainEqual({ type: 'partial', text: 'he' })
    expect(events).toContainEqual({ type: 'final', text: 'hello' })
    expect(socket.sent.some((s) => typeof s === 'string' && s.includes('"type":"start"'))).toBe(
      true
    )
  })
})
