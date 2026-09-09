import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ performNexusRequestWithAuth: vi.fn() }))

vi.mock('../auth', () => auth)
vi.mock('./runtime-base', () => ({
  getRuntimeNexusBaseUrl: () => 'https://nexus.example.test'
}))

import { transcribeNexusAudio } from './asr-client'

function wavBytes(): ArrayBuffer {
  const bytes = new Uint8Array(48)
  const view = new DataView(bytes.buffer)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  view.setUint32(4, 40, true)
  bytes.set([0x57, 0x41, 0x56, 0x45], 8) // WAVE
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12) // fmt
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, 16_000, true)
  view.setUint32(28, 32_000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  bytes.set([0x64, 0x61, 0x74, 0x61], 36) // data
  view.setUint32(40, 4, true)
  return bytes.buffer
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

    const transcription = transcribeNexusAudio({ audio: wavBytes(), format: 'wav' })
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
      headers: {
        'Content-Type': 'audio/wav',
        'X-Idempotency-Key': expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        )
      },
      body: expect.any(Uint8Array)
    })
    expect(
      calls.every(([, options]) => options.trustedBaseUrl === 'https://nexus.example.test')
    ).toBe(true)
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

    const transcription = transcribeNexusAudio({ audio: wavBytes() })
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

    const transcription = transcribeNexusAudio({ audio: wavBytes() })
    const rejection = expect(transcription).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      reason: expect.stringContaining('Nexus returned an invalid')
    })

    await vi.advanceTimersByTimeAsync(500)
    await rejection
  })

  it('stops before polling when the auth owner reports no signed-in account', async () => {
    auth.performNexusRequestWithAuth.mockResolvedValueOnce(null)

    await expect(transcribeNexusAudio({ audio: wavBytes() })).rejects.toMatchObject({
      code: 'NEXUS_AUTH_REQUIRED',
      reason: 'Nexus requires a signed-in account.'
    })
    expect(auth.performNexusRequestWithAuth).toHaveBeenCalledOnce()
  })
})
