import { Buffer } from 'node:buffer'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { H3Event, type H3Event as H3EventType } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculateFiletransCredits,
  countTranscriptUnits,
  parseWavDurationSeconds,
} from './asrTranscriptionStore'
import {
  createDashScopeFiletransAdapter,
  DashScopeAsrError,
} from './dashscopeAsrProvider'
import type { ProviderCredentialPayload } from './providerCredentialStore'
import type { ProviderRegistryRecord } from './providerRegistryStore'

const testApiKey = 'test-dashscope-api-key-must-not-escape'

const credentialMocks = vi.hoisted(() => ({
  getProviderCredential: vi.fn<(event: H3EventType, authRef: string) => Promise<ProviderCredentialPayload | null>>(),
}))

vi.mock('./providerCredentialStore', () => credentialMocks)

function createEvent(): H3EventType {
  const request = new IncomingMessage(new Socket())
  const response = new ServerResponse(request)
  return new H3Event(request, response)
}

function dashScopeProvider(): ProviderRegistryRecord {
  return {
    id: 'dashscope-asr',
    name: 'dashscope-asr',
    displayName: 'DashScope ASR',
    vendor: 'dashscope',
    status: 'enabled',
    authType: 'api_key',
    authRef: 'secure://providers/dashscope-asr',
    ownerScope: 'system',
    ownerId: null,
    description: null,
    endpoint: 'https://dashscope.example.com/api/v1',
    region: null,
    metadata: null,
    capabilities: [],
    createdBy: 'test',
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
  }
}

function pcmWav(dataBytes: number): Buffer {
  const audio = Buffer.alloc(44 + dataBytes)
  audio.write('RIFF', 0, 'ascii')
  audio.writeUInt32LE(36 + dataBytes, 4)
  audio.write('WAVE', 8, 'ascii')
  audio.write('fmt ', 12, 'ascii')
  audio.writeUInt32LE(16, 16)
  audio.writeUInt16LE(1, 20)
  audio.writeUInt16LE(1, 22)
  audio.writeUInt32LE(8_000, 24)
  audio.writeUInt32LE(16_000, 28)
  audio.writeUInt16LE(2, 32)
  audio.writeUInt16LE(16, 34)
  audio.write('data', 36, 'ascii')
  audio.writeUInt32LE(dataBytes, 40)
  return audio
}

async function expectDashScopeError(
  operation: () => Promise<unknown>,
  expected: Pick<DashScopeAsrError, 'code' | 'accepted'>,
) {
  await operation().then(
    () => {
      throw new Error('Expected the DashScope adapter to reject.')
    },
    (error: unknown) => {
      expect(error).toBeInstanceOf(DashScopeAsrError)
      if (!(error instanceof DashScopeAsrError))
        return
      expect(error.code).toBe(expected.code)
      expect(error.accepted).toBe(expected.accepted)
      expect(error.message).toBe(expected.code)
      expect(error.stack ?? '').not.toContain(testApiKey)
    },
  )
}

describe('Filetrans transcript and WAV boundaries', () => {
  it.each([
    { name: 'counts each CJK character', transcript: '你好世界', units: 4 },
    { name: 'counts a contiguous Latin and digit word once', transcript: 'Filetrans2026', units: 2 },
    { name: 'uses punctuation to separate Latin and digit words', transcript: 'hello, 42!world', units: 6 },
    { name: 'normalizes full-width Latin and digits before counting', transcript: 'ＡＳＲ１２３', units: 2 },
  ])('normalizes $name', ({ transcript, units }) => {
    expect(countTranscriptUnits(transcript)).toBe(units)
  })

  it.each([
    { name: 'charges the audio-duration floor for a short transcript', transcript: '好', billedSeconds: 1.01, credits: 5 },
    { name: 'charges the larger transcript-unit value when speech is dense', transcript: '一二三四五六七八九', billedSeconds: 1, credits: 9 },
  ])('calculates Filetrans credits from the $name', ({ transcript, billedSeconds, credits }) => {
    expect(calculateFiletransCredits(transcript, billedSeconds)).toBe(credits)
  })

  it('parses duration from a canonical PCM WAV data chunk', () => {
    expect(parseWavDurationSeconds(pcmWav(32_000))).toBe(2)
  })

  it.each([
    {
      name: 'non-RIFF input',
      audio: Buffer.alloc(44),
      statusMessage: 'Audio must be a valid WAV container.',
    },
    {
      name: 'compressed WAV input',
      audio: (() => {
        const audio = pcmWav(16_000)
        audio.writeUInt16LE(6, 20)
        return audio
      })(),
      statusMessage: 'Audio WAV format is unsupported.',
    },
  ])('rejects $name before accepting audio', ({ audio, statusMessage }) => {
    expect(() => parseWavDurationSeconds(audio)).toThrowError(expect.objectContaining({
      statusCode: 400,
      statusMessage,
    }))
  })
})

describe('DashScope Filetrans adapter', () => {
  beforeEach(() => {
    credentialMocks.getProviderCredential.mockReset()
    credentialMocks.getProviderCredential.mockResolvedValue({ apiKey: testApiKey })
  })

  it('submits the Filetrans task and returns only the provider task identifier', async () => {
    const requests: Array<{ method: string, url: string, authorization: string | null, body: string | null }> = []
    const fetcher: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers)
      requests.push({
        method: init?.method ?? 'GET',
        url: String(input),
        authorization: headers.get('authorization'),
        body: typeof init?.body === 'string' ? init.body : null,
      })
      return new Response(JSON.stringify({ output: { task_id: 'task-123' } }), { status: 200 })
    }

    const submission = await createDashScopeFiletransAdapter({ fetch: fetcher }).submit(
      createEvent(),
      dashScopeProvider(),
      'https://controlled.example.com/handoff.wav',
    )

    expect(submission).toEqual({ taskId: 'task-123' })
    expect(JSON.stringify(submission)).not.toContain(testApiKey)
    expect(requests).toEqual([{
      method: 'POST',
      url: 'https://dashscope.example.com/api/v1/services/audio/asr/transcription',
      authorization: `Bearer ${testApiKey}`,
      body: JSON.stringify({
        model: 'qwen-audio-3.0-asr-flash-filetrans',
        input: { file_urls: ['https://controlled.example.com/handoff.wav'] },
        parameters: { channel_id: [0] },
      }),
    }])
  })

  it('normalizes a successful poll and transcript document into the Filetrans task result', async () => {
    const requests: Array<{ method: string, url: string }> = []
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input)
      requests.push({ method: init?.method ?? 'GET', url })
      if (url.endsWith('/tasks/task-123')) {
        return new Response(JSON.stringify({
          output: {
            task_status: 'SUCCEEDED',
            results: [{ transcription_url: 'https://results.example.com/task-123.json' }],
          },
        }), { status: 200 })
      }
      return new Response(JSON.stringify({
        properties: { original_duration_in_milliseconds: 2_500 },
        transcripts: [{ text: ' 第一行 ' }, { text: '第二行' }],
      }), { status: 200 })
    }

    const result = await createDashScopeFiletransAdapter({ fetch: fetcher }).getTask(
      createEvent(),
      dashScopeProvider(),
      'task-123',
    )

    expect(result).toEqual({
      status: 'succeeded',
      transcript: '第一行\n第二行',
      billedSeconds: 2.5,
    })
    expect(JSON.stringify(result)).not.toContain(testApiKey)
    expect(requests).toEqual([
      { method: 'GET', url: 'https://dashscope.example.com/api/v1/tasks/task-123' },
      { method: 'GET', url: 'https://results.example.com/task-123.json' },
    ])
  })

  it('reports a terminal failed task without fetching a transcript document', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify({ output: { task_status: 'FAILED' } }), { status: 200 })
    })

    await expect(createDashScopeFiletransAdapter({ fetch: fetcher }).getTask(
      createEvent(),
      dashScopeProvider(),
      'task-123',
    )).resolves.toEqual({ status: 'failed' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('maps malformed submission payloads to a safe stable provider error', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({ output: { task_id: 'not a valid task id' } }), { status: 200 })

    await expectDashScopeError(
      () => createDashScopeFiletransAdapter({ fetch: fetcher }).submit(
        createEvent(),
        dashScopeProvider(),
        'https://controlled.example.com/handoff.wav',
      ),
      { code: 'ASR_PROVIDER_RESPONSE_INVALID', accepted: false },
    )
  })

  it('maps failed task polls to a safe stable unavailable error', async () => {
    const fetcher: typeof fetch = async () => new Response('provider upstream failure', { status: 503 })

    await expectDashScopeError(
      () => createDashScopeFiletransAdapter({ fetch: fetcher }).getTask(
        createEvent(),
        dashScopeProvider(),
        'task-123',
      ),
      { code: 'ASR_PROVIDER_UNAVAILABLE', accepted: true },
    )
  })
})
