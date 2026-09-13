import type { Buffer } from 'node:buffer'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as H3 from 'h3'
import type { H3Event } from 'h3'
import { ASR_AUDIO_MAX_BYTES } from '../../../../../server/utils/asrTranscriptionStore'

const authMocks = vi.hoisted(() => ({
  requireAppAuth: vi.fn(),
}))

const rateLimitMocks = vi.hoisted(() => ({
  enforceAdminRateLimit: vi.fn(),
}))

const serviceMocks = vi.hoisted(() => ({
  startAsrTranscription: vi.fn(),
}))

const h3Mocks = vi.hoisted(() => ({
  getHeader: vi.fn(),
  getRequestWebStream: vi.fn(),
  setResponseStatus: vi.fn(),
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof H3>('h3')
  return {
    ...actual,
    getHeader: h3Mocks.getHeader,
    getRequestWebStream: h3Mocks.getRequestWebStream,
    setResponseStatus: h3Mocks.setResponseStatus,
  }
})

vi.mock('../../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../../server/utils/adminRateLimitStore', () => rateLimitMocks)
vi.mock('../../../../../server/utils/asrTranscriptionService', () => serviceMocks)

let handler: (event: H3Event) => Promise<unknown>

beforeAll(async () => {
  ;(globalThis as unknown as { defineEventHandler: (fn: unknown) => unknown }).defineEventHandler =
    (fn: unknown) => fn
  // The route registers itself through the global `defineEventHandler` at import time, so the
  // module cannot be imported statically before that global is installed.
  handler = (await import('../../../../../server/api/v1/ai/audio/transcribe.post'))
    .default as (event: H3Event) => Promise<unknown>
})

afterAll(() => {
  delete (globalThis as unknown as { defineEventHandler?: unknown }).defineEventHandler
})

/** A body whose reader must never be created: the guard under test has to reject first. */
function unreadableBody() {
  const getReader = vi.fn(() => {
    throw new Error('the request body was read before the request was admitted')
  })
  return { getReader }
}

function eventWithBody(
  body: unknown,
  headers: Record<string, string> = {},
  options: { omitWeb?: boolean } = {},
): H3Event {
  h3Mocks.getHeader.mockImplementation((_event: H3Event, name: string) => headers[name])
  // The route reads its body through H3's canonical `getRequestWebStream(event)`, not by reaching
  // into `event.web`. The mock has to route the event's stream through that same accessor.
  h3Mocks.getRequestWebStream.mockReturnValue(body as ReadableStream<Uint8Array>)
  return {
    context: { cloudflare: { env: {} } },
    node: { req: [] },
    ...(options.omitWeb ? {} : { web: { request: { body } } }),
  } as unknown as H3Event
}

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[index]
      index += 1
      if (!next) {
        controller.close()
        return
      }
      controller.enqueue(next)
    },
  })
}

describe('POST /api/v1/ai/audio/transcribe request admission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAppAuth.mockResolvedValue({ userId: 'user-1' })
    rateLimitMocks.enforceAdminRateLimit.mockResolvedValue(undefined)
    serviceMocks.startAsrTranscription.mockResolvedValue({
      requestId: 'asr-request-1',
      status: 'settled',
      creditsCharged: 4,
      billedSeconds: 1,
      failureCode: null,
      transcript: 'ok',
    })
    h3Mocks.getHeader.mockReturnValue(undefined)
  })

  it('rate-limits each authenticated user before touching the body', async () => {
    const body = unreadableBody()
    const rateLimitError = Object.assign(new Error('Rate limited'), { statusCode: 429 })
    rateLimitMocks.enforceAdminRateLimit.mockRejectedValue(rateLimitError)

    await expect(handler(eventWithBody(body, { 'content-type': 'audio/wav' }))).rejects.toBe(rateLimitError)

    // The per-user key is what stops one account from spending another's budget of 12/min.
    expect(rateLimitMocks.enforceAdminRateLimit).toHaveBeenCalledWith(expect.anything(), {
      key: 'asr-transcribe:user:user-1',
      limit: 12,
      windowMs: 60_000,
      blockMs: 60_000,
    })
    expect(authMocks.requireAppAuth.mock.invocationCallOrder[0]).toBeLessThan(
      rateLimitMocks.enforceAdminRateLimit.mock.invocationCallOrder[0]!,
    )
    // A rejected request must not have its body streamed into memory at all.
    expect(body.getReader).not.toHaveBeenCalled()
    expect(serviceMocks.startAsrTranscription).not.toHaveBeenCalled()
  })

  it('rejects an oversize content-length before reading the body', async () => {
    const body = unreadableBody()

    await expect(
      handler(
        eventWithBody(body, {
          'content-type': 'audio/wav',
          'content-length': String(ASR_AUDIO_MAX_BYTES + 1),
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 413, data: { errorCode: 'ASR_AUDIO_TOO_LARGE' } })

    expect(body.getReader).not.toHaveBeenCalled()
    expect(serviceMocks.startAsrTranscription).not.toHaveBeenCalled()
  })

  it('stops streaming once the body crosses the 20 MiB admission cap', async () => {
    // Exactly the cap is admitted; the single byte past it is what must abort the read.
    const body = streamOf([new Uint8Array(ASR_AUDIO_MAX_BYTES), new Uint8Array(1)])

    await expect(
      handler(eventWithBody(body, { 'content-type': 'audio/wav' })),
    ).rejects.toMatchObject({ statusCode: 413, data: { errorCode: 'ASR_AUDIO_TOO_LARGE' } })

    expect(serviceMocks.startAsrTranscription).not.toHaveBeenCalled()
  })

  it('rejects a body split into more transport chunks than the cap allows', async () => {
    // 4097 one-byte chunks stay far under the byte cap yet still must be refused: each chunk
    // costs a frame, so an unbounded count is its own denial-of-service vector.
    const body = streamOf(Array.from({ length: 4_097 }, () => new Uint8Array(1)))

    await expect(
      handler(eventWithBody(body, { 'content-type': 'audio/wav' })),
    ).rejects.toMatchObject({ statusCode: 413, data: { errorCode: 'ASR_AUDIO_TOO_LARGE' } })

    expect(serviceMocks.startAsrTranscription).not.toHaveBeenCalled()
  })

  it('rejects an empty body without reaching the transcription service', async () => {
    await expect(
      handler(eventWithBody(streamOf([]), { 'content-type': 'audio/wav' })),
    ).rejects.toMatchObject({ statusCode: 400, data: { errorCode: 'ASR_AUDIO_INVALID' } })

    expect(serviceMocks.startAsrTranscription).not.toHaveBeenCalled()
  })

  /**
   * Production 500ed here before any request row existed because the route reached into
   * `event.web` itself. The body must be read through H3's accessor, so an event that only
   * exposes the stream that way still has to be admitted byte-for-byte.
   */
  it('admits the exact bytes of a body reachable only through the canonical accessor', async () => {
    const result = await handler(
      eventWithBody(
        streamOf([new Uint8Array([1, 2]), new Uint8Array([3])]),
        { 'content-type': 'audio/wav', 'x-idempotency-key': 'idempotency-key' },
        { omitWeb: true },
      ),
    )

    const audio = serviceMocks.startAsrTranscription.mock.calls[0]![2].audio as Buffer
    expect([...audio]).toEqual([1, 2, 3])
    expect(h3Mocks.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 200)
    expect(result).toMatchObject({ requestId: 'asr-request-1', status: 'settled' })
  })

  it('rejects an empty body carried only by the canonical accessor', async () => {
    await expect(
      handler(eventWithBody(streamOf([]), { 'content-type': 'audio/wav' }, { omitWeb: true })),
    ).rejects.toMatchObject({ statusCode: 400, data: { errorCode: 'ASR_AUDIO_INVALID' } })

    expect(serviceMocks.startAsrTranscription).not.toHaveBeenCalled()
  })

  it('reassembles the streamed chunks and admits the exact bytes', async () => {
    const body = streamOf([new Uint8Array([1, 2]), new Uint8Array([3])])

    const result = await handler(
      eventWithBody(body, {
        'content-type': 'audio/wav',
        'x-idempotency-key': 'idempotency-key',
      }),
    )

    const audio = serviceMocks.startAsrTranscription.mock.calls[0]![2].audio as Buffer
    expect([...audio]).toEqual([1, 2, 3])
    expect(serviceMocks.startAsrTranscription).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({ contentType: 'audio/wav', idempotencyKey: 'idempotency-key' }),
    )
    expect(h3Mocks.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 200)
    expect(result).toMatchObject({ requestId: 'asr-request-1', status: 'settled' })
  })

  it('answers 202 while an asynchronous transcription is still dispatching', async () => {
    serviceMocks.startAsrTranscription.mockResolvedValue({
      requestId: 'asr-request-1',
      status: 'dispatching',
      creditsCharged: null,
      billedSeconds: null,
      failureCode: null,
    })

    await handler(eventWithBody(streamOf([new Uint8Array([1])]), { 'content-type': 'audio/wav' }))

    expect(h3Mocks.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 202)
  })
})
