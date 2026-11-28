import type { VoiceSocket, VoiceSocketFactory, VoiceStreamRequest } from '../src/index'
import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  acquireDoubaoImeToken,
  buildDoubaoImeAudioRequest,
  buildDoubaoImeFinishTask,
  buildDoubaoImeStartTask,
  clearDoubaoImeTokenCache,
  DoubaoImeVoiceProvider,
  parseDoubaoImeResponse,
} from '../src/index'

const TEST_CREDENTIALS = {
  appKey: 'caller-app-key',
  accessKey: 'caller-access-key',
}

describe('doubao-ime protocol & provider', () => {
  beforeEach(() => {
    clearDoubaoImeTokenCache()
  })

  it('fails closed when caller credentials are missing', async () => {
    await expect(
      acquireDoubaoImeToken({ appKey: '', accessKey: '' }),
    ).rejects.toMatchObject({ code: 'DOUBAO_IME_CREDENTIALS_MISSING' })

    expect(
      () =>
        new DoubaoImeVoiceProvider({
          credentials: { appKey: '', accessKey: 'only-access' },
          socketFactory: { connect: vi.fn() },
        }),
    ).toThrowError(expect.objectContaining({ code: 'DOUBAO_IME_CREDENTIALS_MISSING' }))
  })

  it('acquires token using caller-provided credentials without hardcoded third-party keys', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Code: 0,
        Msg: '',
        Data: { sami_token: 'mock-sami-token-xyz' },
      }),
    })

    const token = await acquireDoubaoImeToken(TEST_CREDENTIALS, mockFetch as unknown as typeof fetch)
    expect(token).toBe('mock-sami-token-xyz')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://ime.oceancloudapi.com/api/v1/user/get_config',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        headers: expect.objectContaining({
          'User-Agent': 'tuff-voice',
          'X-Api-Access-Key': 'caller-access-key',
        }),
        body: JSON.stringify({ sami_app_key: 'caller-app-key' }),
      }),
    )
  })

  it('builds StartTask, TaskRequest, and FinishTask messages with caller appKey', () => {
    const startJson = buildDoubaoImeStartTask('task-1', 'sess-1', 'token-abc', TEST_CREDENTIALS.appKey, {
      enableNonstream: true,
      enableDdc: true,
    })
    const startObj = JSON.parse(startJson)
    expect(startObj.event).toBe('StartTask')
    expect(startObj.token).toBe('token-abc')
    expect(startObj.appkey).toBe('caller-app-key')
    expect(startObj.namespace).toBe('ASR')
    const innerPayload = JSON.parse(startObj.payload)
    expect(innerPayload.app_name).toBe('tuff-voice')
    expect(innerPayload.enable_asr_threepass).toBe(true)

    const chunk = Buffer.from([0x01, 0x02, 0x03])
    const audioJson = buildDoubaoImeAudioRequest('task-1', 'sess-1', 'token-abc', TEST_CREDENTIALS.appKey, 42, chunk, false)
    const audioObj = JSON.parse(audioJson)
    expect(audioObj.event).toBe('TaskRequest')
    expect(audioObj.appkey).toBe('caller-app-key')
    expect(audioObj.payload).toBe(chunk.toString('base64'))
    const audioExtra = JSON.parse(audioObj.extra)
    expect(audioExtra.seq_id).toBe(42)
    expect(audioExtra.is_last_history_audio).toBe(false)

    const finishJson = buildDoubaoImeFinishTask('task-1', 'sess-1', 'token-abc', TEST_CREDENTIALS.appKey)
    const finishObj = JSON.parse(finishJson)
    expect(finishObj.event).toBe('FinishTask')
    expect(finishObj.task_id).toBe('task-1')
    expect(finishObj.appkey).toBe('caller-app-key')
  })

  it('parses server streaming responses', () => {
    const partialRaw = JSON.stringify({
      task_id: 'task-1',
      event: 'TaskResponse',
      status_code: 20000000,
      status_text: 'OK',
      payload: JSON.stringify({
        results: [{ text: '你好世界', is_interim: true }],
      }),
    })
    expect(parseDoubaoImeResponse(partialRaw)).toEqual({
      type: 'partial',
      text: '你好世界',
      requestId: 'task-1',
    })

    const finalRaw = JSON.stringify({
      task_id: 'task-1',
      event: 'TaskResponse',
      status_code: 20000000,
      status_text: 'OK',
      payload: JSON.stringify({
        results: [{ text: '你好，世界。', is_interim: false }],
      }),
    })
    expect(parseDoubaoImeResponse(finalRaw)).toEqual({
      type: 'final',
      text: '你好，世界。',
      requestId: 'task-1',
    })

    const errorRaw = JSON.stringify({
      task_id: 'task-1',
      event: 'TaskFailed',
      status_code: 40200001,
      status_text: 'session auth, userID or appID is empty',
    })
    expect(parseDoubaoImeResponse(errorRaw)).toEqual({
      type: 'error',
      code: 'DOUBAO_IME_40200001',
      message: 'session auth, userID or appID is empty',
      retryable: true,
      requestId: 'task-1',
    })

    const finRaw = JSON.stringify({
      task_id: 'task-1',
      event: 'TaskFinished',
      status_code: 20000000,
    })
    expect(parseDoubaoImeResponse(finRaw)).toEqual({
      type: 'end',
      requestId: 'task-1',
    })
  })

  it('runs stream session through DoubaoImeVoiceProvider and rejects unsafe stream URLs', async () => {
    expect(
      () =>
        new DoubaoImeVoiceProvider({
          credentials: TEST_CREDENTIALS,
          socketFactory: { connect: vi.fn() },
          streamUrl: 'wss://127.0.0.1/ws',
        }),
    ).toThrowError(expect.objectContaining({ code: 'VOICE_PROVIDER_URL_INVALID' }))

    const sentMessages: string[] = []
    let openHandler: (() => void) | null = null
    const mockSocket: VoiceSocket = {
      readyState: 1,
      send: (data: string | Uint8Array) => {
        sentMessages.push(typeof data === 'string' ? data : Buffer.from(data).toString())
      },
      close: vi.fn(),
      onOpen: (handler) => {
        openHandler = handler
      },
      onMessage: vi.fn(),
      onError: vi.fn(),
      onClose: vi.fn(),
    }

    const mockSocketFactory: VoiceSocketFactory = {
      connect: vi.fn().mockImplementation(async () => {
        queueMicrotask(() => openHandler?.())
        return mockSocket
      }),
    }

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Code: 0,
        Msg: '',
        Data: { sami_token: 'mock-sami-token-xyz' },
      }),
    })

    const provider = new DoubaoImeVoiceProvider({
      credentials: TEST_CREDENTIALS,
      socketFactory: mockSocketFactory,
      fetchImpl: mockFetch as unknown as typeof fetch,
    })

    const req: VoiceStreamRequest = {
      model: 'bigmodel',
      audio: { format: 'pcm', sampleRate: 16000, channels: 1, bitsPerSample: 16 },
      requestId: 'req-001',
    }

    const session = await provider.createStream(req)
    expect(session).toBeDefined()
    expect(sentMessages.length).toBeGreaterThan(0)
    expect(JSON.parse(sentMessages[0]).event).toBe('StartTask')

    await session.writePcm(new Uint8Array([0x10, 0x20]))
    expect(sentMessages.length).toBe(2)
    expect(JSON.parse(sentMessages[1]).event).toBe('TaskRequest')

    await session.end()
    expect(sentMessages.length).toBe(3)
    expect(JSON.parse(sentMessages[2]).event).toBe('FinishTask')
  })
})
