import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ performNexusRequestWithAuth: vi.fn() }))

vi.mock('../auth', () => auth)
vi.mock('./runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => 'https://nexus.example.test'
}))

import type { VoiceProviderDescriptorV1 } from '@talex-touch/utils/i18n'
import { transcribeNexusAudio } from './asr-client'

const LOCAL_MAX_AUDIO_BYTES = 20 * 1024 * 1024
const LOCAL_MAX_AUDIO_SECONDS = 600
const LOCAL_MAX_POLL_DEADLINE_MS = 10 * 60 * 1000

/** Builds a valid mono 16-bit PCM WAV with exactly `dataBytes` of audio. */
function wavWithData(dataBytes: number, sampleRate = 16_000): ArrayBuffer {
  const bytes = new Uint8Array(44 + dataBytes)
  const view = new DataView(bytes.buffer)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  view.setUint32(4, 36 + dataBytes, true)
  bytes.set([0x57, 0x41, 0x56, 0x45], 8) // WAVE
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12) // fmt
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  bytes.set([0x64, 0x61, 0x74, 0x61], 36) // data
  view.setUint32(40, dataBytes, true)
  return bytes.buffer
}

/** A frozen descriptor as the catalog would hand it to the runtime. */
function descriptor(overrides: Partial<VoiceProviderDescriptorV1> = {}): VoiceProviderDescriptorV1 {
  return {
    id: 'nexus.catalog',
    displayName: { default: 'Nexus catalog ASR' },
    protocol: 'nexus-pack',
    transport: 'http-upload',
    endpoint: {
      baseUrl: 'https://catalog.example.test',
      submitPath: '/api/v2/voice/submit',
      pollPath: '/api/v2/voice/requests/:requestId'
    },
    auth: { mode: 'nexus-session' },
    request: {
      body: 'raw-bytes',
      contentTypePolicy: 'audio/*',
      headers: { 'x-catalog-route': 'cloud' },
      idempotencyHeader: 'x-idempotency-key'
    },
    models: [{ id: 'catalog.audio.transcribe' }],
    limits: {
      maxBytes: LOCAL_MAX_AUDIO_BYTES,
      maxDurationSec: LOCAL_MAX_AUDIO_SECONDS,
      timeoutMs: LOCAL_MAX_POLL_DEADLINE_MS
    },
    ...overrides
  }
}

function nexusResponse(body: Record<string, unknown>, status = 200) {
  return {
    status,
    statusText: status === 202 ? 'Accepted' : 'OK',
    headers: {},
    body: JSON.stringify(body)
  }
}

describe('transcribeNexusAudio', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    auth.performNexusRequestWithAuth.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('submits the validated WAV once, then polls the same request until its authoritative receipt settles', async () => {
    auth.performNexusRequestWithAuth
      .mockResolvedValueOnce(nexusResponse({ requestId: 'asr_123', status: 'dispatching' }, 202))
      .mockResolvedValueOnce(nexusResponse({ requestId: 'asr_123', status: 'pending' }))
      .mockResolvedValueOnce(
        nexusResponse({
          requestId: 'asr_123',
          status: 'settled',
          transcript: 'meeting notes',
          creditsCharged: 12,
          billedSeconds: 3
        })
      )

    const transcription = transcribeNexusAudio({ audio: wavWithData(4), format: 'wav' })
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(transcription).resolves.toEqual({
      text: 'meeting notes',
      billing: { requestId: 'asr_123', creditsCharged: 12, billedSeconds: 3 }
    })

    const calls = auth.performNexusRequestWithAuth.mock.calls
    expect(calls).toHaveLength(3)
    expect(calls.map(([request]) => request.method)).toEqual(['POST', 'GET', 'GET'])
    expect(calls.map(([request]) => request.path)).toEqual([
      '/api/v1/ai/audio/transcribe',
      '/api/v1/ai/audio/transcriptions/asr_123',
      '/api/v1/ai/audio/transcriptions/asr_123'
    ])
    expect(calls[0]?.[0]).toMatchObject({
      context: 'voice.asr.builtin',
      headers: {
        'Content-Type': 'audio/wav',
        'X-Idempotency-Key': expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        )
      },
      body: expect.any(Uint8Array)
    })
    expect(calls[0]?.[0]).not.toHaveProperty('url')
    expect(
      calls.every(([, options]) => options.trustedBaseUrl === 'https://nexus.example.test')
    ).toBe(true)
  })

  it('uses a caller-supplied idempotency UUID unchanged so a retry is the same server submission', async () => {
    const idempotencyKey = '11111111-2222-4333-8444-555555555555'
    auth.performNexusRequestWithAuth.mockResolvedValueOnce(
      nexusResponse({
        requestId: 'asr_keyed',
        status: 'settled',
        transcript: 'keyed',
        creditsCharged: 3,
        billedSeconds: 1
      })
    )

    await expect(
      transcribeNexusAudio({ audio: wavWithData(4) }, { idempotencyKey })
    ).resolves.toMatchObject({ text: 'keyed' })

    expect(auth.performNexusRequestWithAuth.mock.calls[0]?.[0]).toMatchObject({
      method: 'POST',
      headers: { 'X-Idempotency-Key': idempotencyKey }
    })
  })

  it.each(['buffered-request-1', '11111111-2222-6333-8444-555555555555'])(
    'generates a safe key instead of forwarding malformed idempotency input %s',
    async (idempotencyKey) => {
      auth.performNexusRequestWithAuth.mockResolvedValueOnce(
        nexusResponse({
          requestId: 'asr_fallback',
          status: 'settled',
          transcript: 'fallback',
          creditsCharged: 3,
          billedSeconds: 1
        })
      )

      await expect(
        transcribeNexusAudio({ audio: wavWithData(4) }, { idempotencyKey })
      ).resolves.toMatchObject({ text: 'fallback' })

      const header =
        auth.performNexusRequestWithAuth.mock.calls[0]?.[0]?.headers?.['X-Idempotency-Key']
      expect(header).not.toBe(idempotencyKey)
      expect(header).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    }
  )
  it('returns a synchronously settled result from the initial response without polling', async () => {
    auth.performNexusRequestWithAuth.mockResolvedValueOnce(
      nexusResponse({
        requestId: 'asr_sync',
        status: 'settled',
        transcript: 'buffered note',
        creditsCharged: 5,
        billedSeconds: 2
      })
    )

    const transcription = transcribeNexusAudio({ audio: wavWithData(4) })
    await vi.advanceTimersByTimeAsync(1_000)

    await expect(transcription).resolves.toEqual({
      text: 'buffered note',
      billing: { requestId: 'asr_sync', creditsCharged: 5, billedSeconds: 2 }
    })

    const calls = auth.performNexusRequestWithAuth.mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0]?.[0]).toMatchObject({
      method: 'POST',
      path: '/api/v1/ai/audio/transcribe'
    })
  })

  it('polls when the initial response settles without a transcript to recover', async () => {
    auth.performNexusRequestWithAuth
      .mockResolvedValueOnce(nexusResponse({ requestId: 'asr_partial', status: 'settled' }))
      .mockResolvedValueOnce(
        nexusResponse({
          requestId: 'asr_partial',
          status: 'settled',
          transcript: 'recovered',
          creditsCharged: 3,
          billedSeconds: 1
        })
      )

    const transcription = transcribeNexusAudio({ audio: wavWithData(4) })
    await vi.advanceTimersByTimeAsync(600)

    await expect(transcription).resolves.toEqual({
      text: 'recovered',
      billing: { requestId: 'asr_partial', creditsCharged: 3, billedSeconds: 1 }
    })

    expect(auth.performNexusRequestWithAuth.mock.calls.map(([request]) => request.method)).toEqual([
      'POST',
      'GET'
    ])
  })

  it('retrieves an already-settled idempotency replay through its request status without a second submission', async () => {
    auth.performNexusRequestWithAuth
      .mockResolvedValueOnce(nexusResponse({ requestId: 'asr_existing', status: 'settled' }))
      .mockResolvedValueOnce(
        nexusResponse({
          requestId: 'asr_existing',
          status: 'settled',
          transcript: 'already transcribed',
          creditsCharged: 7,
          billedSeconds: 2
        })
      )

    const transcription = transcribeNexusAudio({ audio: wavWithData(4) })
    await vi.advanceTimersByTimeAsync(500)

    await expect(transcription).resolves.toMatchObject({
      text: 'already transcribed',
      billing: { requestId: 'asr_existing', creditsCharged: 7, billedSeconds: 2 }
    })
    const calls = auth.performNexusRequestWithAuth.mock.calls
    expect(calls.filter(([request]) => request.method === 'POST')).toHaveLength(1)
    expect(
      calls.filter(([request]) => request.method === 'GET').map(([request]) => request.path)
    ).toEqual(['/api/v1/ai/audio/transcriptions/asr_existing'])
  })

  it.each([
    {
      name: 'the terminal response belongs to a different request',
      terminal: {
        requestId: 'asr_other',
        status: 'settled',
        transcript: 'wrong request',
        creditsCharged: 1,
        billedSeconds: 1
      }
    },
    {
      name: 'the terminal response omits a numeric billing receipt',
      terminal: {
        requestId: 'asr_receipt',
        status: 'settled',
        transcript: 'missing receipt',
        creditsCharged: 1
      }
    }
  ])('rejects $name instead of returning an unbillable transcript', async ({ terminal }) => {
    auth.performNexusRequestWithAuth
      .mockResolvedValueOnce(
        nexusResponse({ requestId: 'asr_receipt', status: 'dispatching' }, 202)
      )
      .mockResolvedValueOnce(nexusResponse(terminal))

    const transcription = transcribeNexusAudio({ audio: wavWithData(4) })
    const rejection = expect(transcription).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      reason: expect.stringContaining('Nexus returned an invalid')
    })

    await vi.advanceTimersByTimeAsync(500)
    await rejection
  })

  it('stops before polling when the auth owner reports no signed-in account', async () => {
    auth.performNexusRequestWithAuth.mockResolvedValueOnce(null)

    await expect(transcribeNexusAudio({ audio: wavWithData(4) })).rejects.toMatchObject({
      code: 'NEXUS_AUTH_REQUIRED',
      reason: 'Nexus requires a signed-in account.'
    })
    expect(auth.performNexusRequestWithAuth).toHaveBeenCalledOnce()
  })

  it('routes a catalog descriptor through its own absolute submit and poll URLs', async () => {
    auth.performNexusRequestWithAuth
      .mockResolvedValueOnce(nexusResponse({ requestId: 'asr_pack', status: 'dispatching' }, 202))
      .mockResolvedValueOnce(
        nexusResponse({
          requestId: 'asr_pack',
          status: 'settled',
          transcript: 'pack notes',
          creditsCharged: 4,
          billedSeconds: 2
        })
      )

    const transcription = transcribeNexusAudio(
      { audio: wavWithData(4), format: 'wav' },
      { route: descriptor() }
    )
    await vi.advanceTimersByTimeAsync(600)

    await expect(transcription).resolves.toEqual({
      text: 'pack notes',
      billing: { requestId: 'asr_pack', creditsCharged: 4, billedSeconds: 2 }
    })

    const calls = auth.performNexusRequestWithAuth.mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0]?.[0]).toMatchObject({
      method: 'POST',
      url: 'https://catalog.example.test/api/v2/voice/submit',
      context: 'voice.asr.catalog-pack',
      headers: {
        'x-catalog-route': 'cloud',
        'Content-Type': 'audio/wav',
        'x-idempotency-key': expect.stringMatching(/^[0-9a-f-]{36}$/i)
      }
    })
    expect(calls[0]?.[0]).not.toHaveProperty('path')
    expect(calls[1]?.[0]).toMatchObject({
      method: 'GET',
      url: 'https://catalog.example.test/api/v2/voice/requests/asr_pack',
      context: 'voice.asr.catalog-pack',
      headers: { 'x-catalog-route': 'cloud' }
    })
    expect(
      calls.every(([, options]) => options.trustedBaseUrl === 'https://catalog.example.test')
    ).toBe(true)
    expect(calls.every(([, options]) => options.rejectRedirects === true)).toBe(true)
  })

  it('keeps the client-owned content type and idempotency header authoritative over pack headers', async () => {
    auth.performNexusRequestWithAuth.mockResolvedValueOnce(
      nexusResponse({
        requestId: 'asr_headers',
        status: 'settled',
        transcript: 'ok',
        creditsCharged: 1,
        billedSeconds: 1
      })
    )

    await transcribeNexusAudio(
      { audio: wavWithData(4) },
      {
        route: descriptor({
          request: {
            body: 'raw-bytes',
            contentTypePolicy: 'audio/*',
            headers: { 'content-type': 'text/plain', 'x-idempotency-key': 'pack-chosen' },
            idempotencyHeader: 'x-idempotency-key'
          }
        })
      }
    )

    const [request] = auth.performNexusRequestWithAuth.mock.calls[0]!
    expect(request.headers).toMatchObject({
      'Content-Type': 'audio/wav',
      'x-idempotency-key': expect.stringMatching(/^[0-9a-f-]{36}$/i)
    })
    expect(request.headers['Content-Type']).not.toBe('text/plain')
    expect(request.headers['x-idempotency-key']).not.toBe('pack-chosen')
  })

  it.each([
    {
      name: 'a byte limit tighter than the local cap',
      limits: {
        maxBytes: 100,
        maxDurationSec: LOCAL_MAX_AUDIO_SECONDS,
        timeoutMs: LOCAL_MAX_POLL_DEADLINE_MS
      },
      audio: () => wavWithData(200),
      reason: 'exceeds the size limit'
    },
    {
      name: 'a duration limit tighter than the local cap',
      limits: {
        maxBytes: LOCAL_MAX_AUDIO_BYTES,
        maxDurationSec: 1,
        timeoutMs: LOCAL_MAX_POLL_DEADLINE_MS
      },
      audio: () => wavWithData(40_000),
      reason: 'exceeds the duration limit'
    },
    {
      name: 'a pack byte limit widened past the local cap',
      limits: {
        maxBytes: 8 * LOCAL_MAX_AUDIO_BYTES,
        maxDurationSec: LOCAL_MAX_AUDIO_SECONDS,
        timeoutMs: LOCAL_MAX_POLL_DEADLINE_MS
      },
      audio: () => new ArrayBuffer(LOCAL_MAX_AUDIO_BYTES + 1),
      reason: 'exceeds the size limit'
    },
    {
      name: 'a pack duration limit widened past the local cap',
      limits: {
        maxBytes: LOCAL_MAX_AUDIO_BYTES,
        maxDurationSec: 86_400,
        timeoutMs: LOCAL_MAX_POLL_DEADLINE_MS
      },
      audio: () => wavWithData(1_400, 1),
      reason: 'exceeds the duration limit'
    }
  ])('bounds audio by $name', async ({ limits, audio, reason }) => {
    await expect(
      transcribeNexusAudio({ audio: audio() }, { route: descriptor({ limits }) })
    ).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      reason: expect.stringContaining(reason)
    })
    expect(auth.performNexusRequestWithAuth).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'a pack deadline shorter than the local poll deadline',
      timeoutMs: 5_000,
      expected: 5_000
    },
    {
      name: 'a pack deadline widened past the local poll deadline',
      timeoutMs: 3_600_000,
      expected: LOCAL_MAX_POLL_DEADLINE_MS
    }
  ])('applies $name as the outbound request deadline', async ({ timeoutMs, expected }) => {
    auth.performNexusRequestWithAuth.mockResolvedValueOnce(
      nexusResponse({
        requestId: 'asr_deadline',
        status: 'settled',
        transcript: 'ok',
        creditsCharged: 1,
        billedSeconds: 1
      })
    )

    await transcribeNexusAudio(
      { audio: wavWithData(4) },
      {
        route: descriptor({
          limits: {
            maxBytes: LOCAL_MAX_AUDIO_BYTES,
            maxDurationSec: LOCAL_MAX_AUDIO_SECONDS,
            timeoutMs
          }
        })
      }
    )

    expect(auth.performNexusRequestWithAuth.mock.calls[0]?.[1]).toMatchObject({
      timeoutMs: expected
    })
  })
})
