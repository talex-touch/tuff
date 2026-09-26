import { describe, expect, it, vi } from 'vitest'
import {
  createVoiceSdk,
  isVoiceSpeechCatalogErrorCode,
  type VoiceSdkTransport,
  VoiceApiError,
  voiceApiEvents,
} from '../transport/sdk/domains/voice'

function createTransportMock(sendImpl?: (...args: any[]) => Promise<any>) {
  return {
    send: vi.fn<(...args: any[]) => Promise<any>>(
      sendImpl ??
        (async () => ({
          ok: true,
          result: {
            text: 'hello world',
            raw: 'hello world',
            source: 'native-cpal',
            polished: true,
          },
        })),
    ),
    on: vi.fn<(...args: any[]) => any>(() => vi.fn()),
    stream: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
      cancel: vi.fn(),
      cancelled: false,
      streamId: 'mock-stream',
    })),
  }
}

describe('voice domain sdk', () => {
  it('dictate sends the dictate event and unwraps the envelope', async () => {
    const transport = createTransportMock()
    const sdk = createVoiceSdk(transport as any)

    const result = await sdk.dictate({ cleanup: true, language: 'zh-CN' })

    expect(transport.send).toHaveBeenCalledWith(voiceApiEvents.dictate, {
      cleanup: true,
      language: 'zh-CN',
    })
    expect(result).toEqual({
      text: 'hello world',
      raw: 'hello world',
      source: 'native-cpal',
      polished: true,
    })
  })

  it('dictate defaults to an empty payload', async () => {
    const transport = createTransportMock()
    const sdk = createVoiceSdk(transport as any)

    await sdk.dictate()

    expect(transport.send).toHaveBeenCalledWith(voiceApiEvents.dictate, {})
  })

  it('dictate throws with the error from a failed envelope', async () => {
    const transport = createTransportMock(async () => ({
      ok: false,
      error: 'microphone unavailable',
    }))
    const sdk = createVoiceSdk(transport as any)

    await expect(sdk.dictate()).rejects.toThrow('microphone unavailable')
  })

  it('speak sends the speak event and unwraps the result', async () => {
    const transport = createTransportMock(async () => ({
      ok: true,
      result: { audio: 'data:audio/wav;base64,AA', format: 'wav', played: true },
    }))
    const sdk = createVoiceSdk(transport as any)

    const result = await sdk.speak({ text: 'hello' })

    expect(transport.send).toHaveBeenCalledWith(voiceApiEvents.speak, {
      text: 'hello',
    })
    expect(result).toEqual({
      audio: 'data:audio/wav;base64,AA',
      format: 'wav',
      played: true,
    })
  })
  it('transcribeUpload sends the upload event and unwraps the result', async () => {
    const transport = createTransportMock(async () => ({
      ok: true,
      result: {
        text: '你好，世界',
        language: 'zh-CN',
        durationMs: 1_234,
        requestId: 'request-upload-1',
        segments: [{ text: '你好，世界', startMs: 0, endMs: 1_234, speaker: 'A' }],
      },
    }))
    const sdk = createVoiceSdk(transport as unknown as VoiceSdkTransport)
    const payload = {
      sourceUrl: 'https://example.test/audio.wav',
      language: 'zh-CN',
      enableTimestamps: true,
      enableSpeakerDiarization: true,
      removeDisfluencies: true,
    }

    const result = await sdk.transcribeUpload(payload)

    expect(transport.send).toHaveBeenCalledWith(voiceApiEvents.transcribeUpload, payload)
    expect(result).toEqual({
      text: '你好，世界',
      language: 'zh-CN',
      durationMs: 1_234,
      requestId: 'request-upload-1',
      segments: [{ text: '你好，世界', startMs: 0, endMs: 1_234, speaker: 'A' }],
    })
  })

  it('reads the main-owned ASR and STT capability readiness snapshot', async () => {
    const transport = createTransportMock(async () => ({
      ok: true,
      result: {
        asr: { ready: false, reason: 'VOICE_ASR_CREDENTIAL_UNAVAILABLE' },
        stt: { ready: true },
      },
    }))
    const sdk = createVoiceSdk(transport as unknown as VoiceSdkTransport)

    await expect(sdk.getRecognitionStatus()).resolves.toEqual({
      asr: { ready: false, reason: 'VOICE_ASR_CREDENTIAL_UNAVAILABLE' },
      stt: { ready: true },
    })
    expect(transport.send).toHaveBeenCalledWith(voiceApiEvents.getRecognitionStatus, undefined)
  })

  it('transcribeUpload throws with the error from a failed envelope', async () => {
    const transport = createTransportMock(async () => ({
      ok: false,
      error: 'audio source unavailable',
    }))
    const sdk = createVoiceSdk(transport as unknown as VoiceSdkTransport)

    await expect(sdk.transcribeUpload({ sourceUrl: 'https://example.test/audio.wav' })).rejects.toThrow(
      'audio source unavailable',
    )
  })

  it('throws VoiceApiError preserving the projected speech-catalog code and retryable flag', async () => {
    const transport = createTransportMock(async () => ({
      ok: false,
      error: 'The speech model catalog request timed out.',
      code: 'SPEECH_CATALOG_TIMEOUT',
      retryable: true,
    }))
    const sdk = createVoiceSdk(transport as unknown as VoiceSdkTransport)

    const call = sdk.getSpeechModelCatalog()

    await expect(call).rejects.toBeInstanceOf(VoiceApiError)
    await expect(call).rejects.toMatchObject({
      name: 'VoiceApiError',
      message: 'The speech model catalog request timed out.',
      code: 'SPEECH_CATALOG_TIMEOUT',
      retryable: true,
    })
  })

  it('still throws VoiceApiError for a legacy message-only failure without inventing a code', async () => {
    const transport = createTransportMock(async () => ({
      ok: false,
      error: 'microphone unavailable',
    }))
    const sdk = createVoiceSdk(transport as unknown as VoiceSdkTransport)

    const call = sdk.dictate()

    await expect(call).rejects.toBeInstanceOf(VoiceApiError)
    await expect(call).rejects.toMatchObject({ message: 'microphone unavailable' })
    await expect(call).rejects.toHaveProperty('code', undefined)
    await expect(call).rejects.toHaveProperty('retryable', undefined)
  })

  it('keeps the fallback message while preserving the projected code', async () => {
    const transport = createTransportMock(async () => ({
      ok: false,
      error: '',
      code: 'SPEECH_CATALOG_UPSTREAM_UNAVAILABLE',
      retryable: true,
    }))
    const sdk = createVoiceSdk(transport as unknown as VoiceSdkTransport)

    await expect(sdk.getSpeechModelCatalog()).rejects.toMatchObject({
      message: 'Speech model catalog read failed',
      code: 'SPEECH_CATALOG_UPSTREAM_UNAVAILABLE',
      retryable: true,
    })
  })

  it('only recognizes the published speech-catalog wire codes', () => {
    for (const code of [
      'SPEECH_CATALOG_AUTH_REQUIRED',
      'SPEECH_CATALOG_TIMEOUT',
      'SPEECH_CATALOG_UPSTREAM_UNAVAILABLE',
      'SPEECH_CATALOG_INVALID',
      'SPEECH_CATALOG_UNAVAILABLE',
    ]) {
      expect(isVoiceSpeechCatalogErrorCode(code)).toBe(true)
    }
    // The raw transport/digest vocabulary must not read as a public code.
    expect(isVoiceSpeechCatalogErrorCode('SPEECH_CATALOG_DIGEST_MISMATCH')).toBe(false)
    expect(isVoiceSpeechCatalogErrorCode('SPEECH_CATALOG_AUTH_REQUIRED ')).toBe(false)
    expect(isVoiceSpeechCatalogErrorCode(undefined)).toBe(false)
  })

  it('asrStream requires a stream-capable transport', async () => {
    const sdk = createVoiceSdk({
      send: vi.fn(async () => undefined),
    } as any)

    await expect(sdk.asrStream({}, { onData: () => {} })).rejects.toThrow(/stream-capable/)
  })

  it('asrStream preserves the requested main-owned delivery mode', async () => {
    const transport = createTransportMock()
    // The mock does not express ITuffTransport's generic send signature.
    const voiceTransport = transport as unknown as VoiceSdkTransport
    const sdk = createVoiceSdk(voiceTransport)
    const options = { onData: vi.fn() }

    await sdk.asrStream({ cleanup: true, delivery: 'active-app' }, options)

    expect(transport.stream).toHaveBeenCalledWith(
      voiceApiEvents.asrStream,
      {
        cleanup: true,
        delivery: 'active-app',
      },
      options,
    )
  })

  it('gives retryLastFailure a long transport deadline while sibling calls keep the default', async () => {
    const transport = createTransportMock(async () => ({
      ok: true,
      result: { text: 'retried words' },
    }))
    const sdk = createVoiceSdk(transport as unknown as VoiceSdkTransport)

    await sdk.retryLastFailure({ delivery: 'none' })
    await sdk.recoveryStatus()

    // A buffered provider legitimately holds one request for its whole 150s deadline; the
    // transport must outlast it or the retry is cancelled while the provider still works.
    expect(transport.send).toHaveBeenCalledWith(
      voiceApiEvents.retryLastFailure,
      { delivery: 'none' },
      { timeout: 180_000 },
    )
    // Every other voice call is short: a shared long deadline would make a hung status read
    // wait three minutes instead of failing fast.
    expect(transport.send).toHaveBeenCalledWith(voiceApiEvents.recoveryStatus, undefined)
  })

  it('gives installSpeechModel a deadline that outlasts the download it starts', async () => {
    const transport = createTransportMock(async () => ({
      ok: true,
      result: {
        id: 'sense-voice-small',
        version: '1.0.0',
        bytes: 228_000_000,
        reused: 0,
        downloaded: 228_000_000,
      },
    }))
    const sdk = createVoiceSdk(transport as unknown as VoiceSdkTransport)

    await sdk.installSpeechModel({ id: 'sense-voice-small', version: '1.0.0' })
    await sdk.listInstalledSpeechModels()

    // A renderer channel abandons its request after 60s, but the main process keeps provisioning
    // the engine runtime and pulling the 228MB weights well past that, and the bundle lands on
    // disk anyway — inheriting the channel default reports channel_timeout for work that finished.
    expect(transport.send).toHaveBeenCalledWith(
      voiceApiEvents.installSpeechModel,
      { id: 'sense-voice-small', version: '1.0.0' },
      { timeout: 1_800_000 },
    )
    // Stated against the value the SDK actually sent, so lowering the deadline back to the
    // channel default (or below it) reddens here as well as at the call above.
    const installDeadline = transport.send.mock.calls.find(
      ([event]) => event === voiceApiEvents.installSpeechModel,
    )?.[2]?.timeout as number
    expect(installDeadline).toBeGreaterThan(60_000)
    // Sibling reads stay short: borrowing the install deadline would make a hung catalogue read
    // wait half an hour instead of failing fast.
    expect(transport.send).toHaveBeenCalledWith(voiceApiEvents.listInstalledSpeechModels, undefined)
  })

  it('voice event names resolve to voice:api:<action>', () => {
    expect(voiceApiEvents.dictate.toEventName()).toBe('voice:api:dictate')
    expect(voiceApiEvents.speak.toEventName()).toBe('voice:api:speak')
    expect(voiceApiEvents.transcribeUpload.toEventName()).toBe('voice:api:transcribe-upload')
    expect(voiceApiEvents.asrStream.toEventName()).toBe('voice:api:asr-stream')
    expect(voiceApiEvents.getRecognitionStatus.toEventName()).toBe('voice:api:get-recognition-status')
  })
})
