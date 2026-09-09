import type { VoiceHttpClient, VoiceProviderAdapter, VoiceSocket, VoiceSocketFactory, VoiceStreamRequest, VoiceUploadSource } from '../src/index'
import { Buffer } from 'node:buffer'
import { gunzipSync, gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  assertHttpSuccess,
  BAILIAN_PARAFORMER_DEFAULT_MODEL,
  DASHSCOPE_QWEN_ASR_REALTIME_DEFAULT_MODEL,
  bailianAudioSpec,
  BailianParaformerVoiceProvider,
  buildBailianFinishTask,
  buildBailianHeaders,
  buildBailianRunTask,
  buildBailianWebSocketUrl,
  buildDashscopeQwenAsrRealtimeAudioAppend,
  buildDashscopeQwenAsrRealtimeHeaders,
  buildDashscopeQwenAsrRealtimeSessionUpdate,
  buildDashscopeQwenAsrRealtimeWebSocketUrl,
  buildDoubaoHeaders,
  buildDoubaoStreamPayload,
  createVoiceProviderRegistry,
  decodeDoubaoFrame,
  doubaoAudioSpec,
  DoubaoVoiceProvider,
  encodeDoubaoAudioRequest,
  encodeDoubaoFullRequest,
  normalizeBailianUploadResult,
  normalizeDoubaoUploadResult,
  parseBailianEvent,
  parseDashscopeQwenAsrRealtimeEvent,
  parseDoubaoResponse,
  resolveUploadSource,

  VoiceSocketSession,

  withResolvedUploadSource,
} from '../src/index'

const request: VoiceStreamRequest = {
  model: 'paraformer-realtime-v2',
  audio: { format: 'pcm', sampleRate: 16_000, channels: 1, bitsPerSample: 16 },
  language: 'zh-CN',
  requestId: 'request-1',
  uid: 'user-1',
  enableDdc: true,
  enableItn: false,
  enablePunctuation: false,
  showUtterances: true,
  heartbeat: true,
  hotwords: ['Tuff'],
}

function doubaoServerFrame(
  payload: Record<string, unknown> | Uint8Array,
  options: { last?: boolean, sequence?: number, code?: number, gzip?: boolean } = {},
): Uint8Array {
  const messageType = options.code === undefined ? 0b1001 : 0b1111
  const encoded = payload instanceof Uint8Array ? Buffer.from(payload) : Buffer.from(JSON.stringify(payload), 'utf8')
  const compressed = options.gzip === false ? encoded : gzipSync(encoded)
  const frame = Buffer.alloc((messageType === 0b1111 ? 16 : 12) + compressed.length)
  frame[0] = 0x11
  frame[1] = (messageType << 4) | 0b0001 | (options.last ? 0b0010 : 0)
  frame[2] = options.gzip === false ? 0x10 : 0x11
  frame.writeInt32BE(options.sequence ?? 3, 4)
  if (messageType === 0b1111) {
    frame.writeInt32BE(options.code ?? 0, 8)
    frame.writeUInt32BE(compressed.length, 12)
    compressed.copy(frame, 16)
  }
  else {
    frame.writeUInt32BE(compressed.length, 8)
    compressed.copy(frame, 12)
  }
  return frame
}

class FakeSocket implements VoiceSocket {
  readonly readyState = 1
  readonly sent: Array<string | Uint8Array> = []
  closed: { code?: number, reason?: string } | undefined
  private messageHandler: ((data: string | Uint8Array) => void) | undefined
  private errorHandler: ((error: Error) => void) | undefined
  private closeHandler: ((code?: number, reason?: string) => void) | undefined
  private readonly pendingMessages: Array<string | Uint8Array> = []

  send(data: string | Uint8Array): void { this.sent.push(data) }
  close(code?: number, reason?: string): void {
    this.closed = { code, reason }
    this.closeHandler?.(code, reason)
  }

  onOpen(_handler: () => void): void {}
  onMessage(handler: (data: string | Uint8Array) => void): void {
    this.messageHandler = handler
    for (const message of this.pendingMessages.splice(0)) handler(message)
  }

  onError(handler: (error: Error) => void): void { this.errorHandler = handler }
  onClose(handler: (code?: number, reason?: string) => void): void { this.closeHandler = handler }
  emitMessage(data: string | Uint8Array): void {
    if (this.messageHandler)
      this.messageHandler(data)
    else this.pendingMessages.push(data)
  }

  emitError(error: Error): void { this.errorHandler?.(error) }
}

function fakeSocketFactory(socket: FakeSocket): VoiceSocketFactory {
  return { connect: async () => socket }
}

function fakeHttp(responses: VoiceHttpResponse[]): VoiceHttpClient & { requests: Array<{ method: string, url: string }> } {
  const requests: Array<{ method: string, url: string }> = []
  return {
    requests,
    request: async (request) => {
      requests.push({ method: request.method, url: request.url })
      const response = responses.shift()
      if (!response)
        throw new Error('fixture response exhausted')
      return response
    },
  }
}

function providerAdapter(id: string, stream: boolean, upload: boolean): VoiceProviderAdapter {
  return {
    id,
    kind: 'doubao',
    capabilities: { stream, upload, formats: ['pcm'] },
    createStream: async () => { throw new Error('not exercised') },
    transcribeUpload: async () => ({ text: 'ok' }),
  }
}

describe('tuff-voice provider protocol contracts', () => {
  it('encodes Doubao full and audio frames with v1 gzip headers and signed sequences', () => {
    const payload = { request: { model_name: 'bigmodel' }, text: '你好' }
    const full = Buffer.from(encodeDoubaoFullRequest(payload, 7))
    expect(full[0]).toBe(0x11)
    expect(full[1]).toBe(0x11)
    expect(full[2]).toBe(0x11)
    expect(full.readInt32BE(4)).toBe(7)
    expect(JSON.parse(gunzipSync(full.subarray(12)).toString('utf8'))).toEqual(payload)

    const audio = Buffer.from(encodeDoubaoAudioRequest(8, Uint8Array.from([1, 2, 3]), false))
    expect(audio[1]).toBe(0x21)
    expect(audio.readInt32BE(4)).toBe(8)
    expect(gunzipSync(audio.subarray(12))).toEqual(Buffer.from([1, 2, 3]))

    const last = Buffer.from(encodeDoubaoAudioRequest(9, new Uint8Array(), true))
    expect(last[1]).toBe(0x23)
    expect(last.readInt32BE(4)).toBe(-9)
    expect(gunzipSync(last.subarray(12))).toHaveLength(0)
  })

  it('decodes and normalizes Doubao partial, definite final, usage, and error frames', () => {
    const partial = decodeDoubaoFrame(doubaoServerFrame({ result: { text: '你好' } }))
    expect(partial).toMatchObject({ code: 0, sequence: 3, isLastPackage: false, payloadSize: expect.any(Number) })
    expect(parseDoubaoResponse(partial)).toEqual({ type: 'partial', text: '你好' })

    const finalFrame = decodeDoubaoFrame(doubaoServerFrame({
      result: {
        text: '你好。',
        language: 'zh',
        additions: { log_id: 'req-log' },
        utterances: [{ text: '你好。', start_time: 2, end_time: 80, definite: true, additions: { speaker_id: 'spk-1' } }],
      },
      audio_info: { duration: 80 },
    }, { last: true }))
    expect(parseDoubaoResponse(finalFrame)).toEqual({
      type: 'final',
      text: '你好。',
      language: 'zh',
      requestId: 'req-log',
      segments: [{ text: '你好。', startMs: 2, endMs: 80, definite: true, speaker: 'spk-1' }],
      usage: { durationMs: 80 },
    })

    const error = parseDoubaoResponse(decodeDoubaoFrame(
      doubaoServerFrame({ result: { additions: { log_id: 'server-log' } } }, { code: 50000001, last: true }),
    ))
    expect(error).toMatchObject({ type: 'error', code: 'DOUBAO_50000001', retryable: true, requestId: 'server-log' })
    expect(error?.type === 'error' ? error.message : '').not.toContain('server-log')
  })

  it('rejects malformed Doubao frames and upload responses without leaking payloads', () => {
    for (const malformed of [new Uint8Array(), Uint8Array.from([0x11, 0x91, 0x11]), doubaoServerFrame({ ok: true }).slice(0, 11)]) {
      expect(() => decodeDoubaoFrame(malformed)).toThrowError(expect.objectContaining({ code: 'DOUBAO_FRAME_INVALID' }))
    }
    const badGzip = doubaoServerFrame({ ok: true })
    badGzip[badGzip.length - 1] ^= 0xFF
    expect(() => decodeDoubaoFrame(badGzip)).toThrowError(expect.objectContaining({ code: 'DOUBAO_FRAME_INVALID' }))
    expect(() => normalizeDoubaoUploadResult({ payload_msg: { result: {} } })).toThrowError(
      expect.objectContaining({ code: 'DOUBAO_RESULT_INVALID' }),
    )
    const sensitive = 'fixture-secret-not-for-logs'
    expect(() => assertHttpSuccess({ status: 401, headers: {}, body: { token: sensitive } }, 'doubao'))
      .toThrowError(new RegExp(`^(?!.*${sensitive}).*HTTP 401`))
  })

  it('builds Doubao stream headers and payload with provider-neutral request options', () => {
    expect(buildDoubaoHeaders({ apiKey: ' fixture-key ', resourceId: 'resource' }, 'req')).toMatchObject({
      'X-Api-Key': 'fixture-key',
      'X-Api-Resource-Id': 'resource',
      'X-Api-Sequence': '-1',
    })
    expect(buildDoubaoStreamPayload(request, { model: 'override', providerOptions: { custom: true } })).toEqual({
      user: { uid: 'user-1' },
      audio: { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1, language: 'zh-CN' },
      request: {
        model_name: 'override',
        enable_nonstream: false,
        enable_itn: false,
        enable_punc: false,
        enable_ddc: true,
        show_utterances: true,
        heartbeat: true,
        custom: true,
        hotwords: [{ word: 'Tuff' }],
      },
    })
    expect(doubaoAudioSpec('wav', 8000)).toEqual({ format: 'wav', sampleRate: 8000, channels: 1, bitsPerSample: 16, codec: 'raw' })
  })

  it('builds Bailian run/finish tasks and normalizes stream events and upload segments', () => {
    const run = buildBailianRunTask(request, {
      model: BAILIAN_PARAFORMER_DEFAULT_MODEL,
      enableTimestamps: true,
      removeDisfluencies: true,
      semanticPunctuationEnabled: true,
      maxSentenceSilence: 400,
      heartbeat: true,
      punctuationPredictionEnabled: true,
      inverseTextNormalizationEnabled: true,
      vocabularyId: 'vocab-1',
    })
    expect(run).toMatchObject({
      header: { action: 'run-task', task_id: 'request-1', streaming: 'duplex' },
      payload: { task_group: 'audio', task: 'asr', function: 'recognition', model: BAILIAN_PARAFORMER_DEFAULT_MODEL, input: {}, parameters: { format: 'pcm', sample_rate: 16000, language_hints: ['zh'], timestamp_alignment_enabled: true, disfluency_removal_enabled: true, semantic_punctuation_enabled: true, max_sentence_silence: 400, heartbeat: true, punctuation_prediction_enabled: true, inverse_text_normalization_enabled: true, vocabulary_id: 'vocab-1' } },
    })
    expect(buildBailianFinishTask('request-1')).toEqual({
      header: { action: 'finish-task', task_id: 'request-1', streaming: 'duplex' },
      payload: { input: {} },
    })
    expect(buildBailianWebSocketUrl('workspace_1')).toBe('wss://workspace_1.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference')
    expect(buildBailianHeaders({ apiKey: 'fixture-key', workspaceId: 'workspace_1' })).toMatchObject({
      'Authorization': 'Bearer fixture-key',
      'X-DashScope-WorkSpace': 'workspace_1',
    })

    const partial = parseBailianEvent(JSON.stringify({ header: { event: 'result-generated', task_id: 'task-1' }, payload: { output: {
      language: 'zh',
      sentence: { text: '你好', begin_time: 0, end_time: 120, sentence_end: false, words: [{ text: '你', start_time: 0, end_time: 50 }] },
      usage: { duration: 0.12 },
    } } }))
    expect(partial).toEqual({ type: 'partial', text: '你好', language: 'zh', requestId: 'task-1', segments: [{
      text: '你好',
      startMs: 0,
      endMs: 120,
      definite: false,
      words: [{ text: '你', startMs: 0, endMs: 50 }],
    }] })
    const final = parseBailianEvent(JSON.stringify({ header: { event: 'result-generated', task_id: 'task-1' }, payload: { output: {
      sentence: { text: '世界', begin_time: 120, end_time: 240, sentence_end: true, speaker_id: 'spk' },
      usage: { duration: 0.24 },
    } } }))
    expect(final).toEqual({ type: 'final', text: '世界', requestId: 'task-1', segments: [{ text: '世界', startMs: 120, endMs: 240, definite: true, speaker: 'spk' }], usage: { durationMs: 240 } })
    expect(parseBailianEvent('{malformed')).toBeNull()
    expect(parseBailianEvent(JSON.stringify({ header: { event: 'task-started' } }))).toBeNull()
    expect(parseBailianEvent(JSON.stringify({ header: { event: 'task-finished', task_id: 'task-1' } }))).toEqual({ type: 'end', requestId: 'task-1' })
    expect(parseBailianEvent(JSON.stringify({ header: { event: 'task-failed', task_id: 'task-1', error_code: 'E_FAIL', error_message: 'provider detail' } }))).toEqual({ type: 'error', code: 'E_FAIL', message: 'provider detail', retryable: false, requestId: 'task-1' })

    expect(normalizeBailianUploadResult({ output: { task_id: 'upload-1', results: [{ transcript: '上传完成', language: 'zh', duration: 1.5, sentences: [{ text: '上传完成', begin_time: 0, end_time: 1500 }] }] } })).toEqual({
      text: '上传完成',
      language: 'zh',
      durationMs: 1500,
      requestId: 'upload-1',
      segments: [{ text: '上传完成', startMs: 0, endMs: 1500 }],
    })
    expect(() => normalizeBailianUploadResult({ output: {} })).toThrowError(expect.objectContaining({ code: 'BAILIAN_RESULT_INVALID' }))
    expect(bailianAudioSpec('pcm')).toEqual({ format: 'pcm', sampleRate: 16000, channels: 1, bitsPerSample: 16 })
  })
  it('builds and normalizes the DashScope Qwen realtime wire protocol', () => {
    const qwenRequest: VoiceStreamRequest = {
      ...request,
      model: DASHSCOPE_QWEN_ASR_REALTIME_DEFAULT_MODEL,
      language: 'zh-CN',
    }
    expect(buildDashscopeQwenAsrRealtimeWebSocketUrl('workspace_1', qwenRequest.model)).toBe(
      'wss://workspace_1.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime',
    )
    expect(buildDashscopeQwenAsrRealtimeHeaders({ apiKey: ' fixture-key ', workspaceId: 'workspace_1' }, 'fixture-agent')).toEqual({
      Authorization: 'Bearer fixture-key',
      'user-agent': 'fixture-agent',
      'X-DashScope-WorkSpace': 'workspace_1',
    })
    expect(buildDashscopeQwenAsrRealtimeSessionUpdate(qwenRequest, {
      language: 'zh-CN',
      vad: { threshold: 0.35, silenceDurationMs: 500, prefixPaddingMs: 250 },
    })).toEqual({
      type: 'session.update',
      event_id: 'request-1',
      session: {
        modalities: ['text'],
        input_audio_format: 'pcm',
        sample_rate: 16_000,
        input_audio_transcription: { language: 'zh' },
        turn_detection: { type: 'server_vad', threshold: 0.35, silence_duration_ms: 500, prefix_padding_ms: 250 },
      },
    })
    expect(buildDashscopeQwenAsrRealtimeAudioAppend(Uint8Array.from([0, 1, 2, 255]), 'audio-1')).toEqual({
      type: 'input_audio_buffer.append',
      event_id: 'audio-1',
      audio: 'AAEC/w==',
    })

    expect(parseDashscopeQwenAsrRealtimeEvent(JSON.stringify({
      type: 'conversation.item.input_audio_transcription.text',
      request_id: 'request-1',
      text: '  你好',
      stash: '，世界  ',
    }))).toEqual({ type: 'partial', text: '你好，世界', requestId: 'request-1' })
    expect(parseDashscopeQwenAsrRealtimeEvent(JSON.stringify({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: '你好，世界',
      language: 'zh',
      segments: [{ text: '你好', start_ms: 0, end_ms: 500 }],
      usage: { duration_ms: 500, input_bytes: 3200 },
    }))).toEqual({
      type: 'final',
      text: '你好，世界',
      language: 'zh',
      segments: [{ text: '你好', startMs: 0, endMs: 500 }],
      usage: { durationMs: 500, inputBytes: 3200 },
    })
    expect(parseDashscopeQwenAsrRealtimeEvent(JSON.stringify({ type: 'session.finished', request_id: 'request-1' }))).toEqual({
      type: 'end',
      requestId: 'request-1',
    })
    expect(parseDashscopeQwenAsrRealtimeEvent(JSON.stringify({
      type: 'error',
      request_id: 'request-1',
      error: { code: '429_RATE_LIMIT', message: 'try again later' },
    }))).toEqual({
      type: 'error',
      code: '429_RATE_LIMIT',
      message: 'try again later',
      retryable: true,
      requestId: 'request-1',
    })
  })


  it('resolves HTTPS URLs and byte sources, and always releases resolver-owned sources', async () => {
    const url = await resolveUploadSource({ model: 'm', source: { kind: 'url', url: 'https://example.test/audio.wav' }, requestId: 'u1' })
    expect(url).toEqual({ url: 'https://example.test/audio.wav' })
    const released: string[] = []
    const resolver = async (source: VoiceUploadSource) => {
      if (source.kind !== 'bytes')
        throw new Error('expected bytes fixture')
      expect(source.bytes).toEqual(Uint8Array.from([1, 2]))
      return {
        url: 'https://upload.test/source',
        release: () => {
          released.push('released')
        },
      }
    }
    const result = await withResolvedUploadSource({ model: 'm', source: { kind: 'bytes', bytes: Uint8Array.from([1, 2]), format: 'pcm' }, requestId: 'u2' }, resolver, async (source) => {
      expect(source.url).toBe('https://upload.test/source')
      throw new Error('operation failed')
    }).catch((error: Error) => error)
    expect(result).toMatchObject({ message: 'operation failed' })
    expect(released).toEqual(['released'])
    await expect(resolveUploadSource({ model: 'm', source: { kind: 'url', url: 'http://insecure.test/a' }, requestId: 'u3' })).rejects.toThrowError(expect.objectContaining({ code: 'VOICE_UPLOAD_URL_INVALID' }))
  })

  it('enforces registry duplicate and resolution semantics', () => {
    const first = providerAdapter('first', true, false)
    const registry = createVoiceProviderRegistry([first])
    expect(registry.resolve('stream')).toBe(first)
    expect(() => registry.resolve('upload', 'first')).toThrowError(expect.objectContaining({ code: 'VOICE_PROVIDER_UNAVAILABLE' }))
    expect(() => registry.register(first)).toThrowError(expect.objectContaining({ code: 'VOICE_PROVIDER_DUPLICATE' }))
    expect(() => registry.resolve('upload', 'missing')).toThrowError(expect.objectContaining({ code: 'VOICE_PROVIDER_NOT_FOUND' }))
    expect(() => registry.resolve('upload')).toThrowError(expect.objectContaining({ code: 'VOICE_PROVIDER_UNAVAILABLE' }))
    expect(() => createVoiceProviderRegistry([first, first])).toThrowError(expect.objectContaining({ code: 'VOICE_PROVIDER_DUPLICATE' }))
  })

  it('splits PCM chunks, waits for ready, and closes only once on terminal session paths', async () => {
    const socket = new FakeSocket()
    const sentChunks: Uint8Array[] = []
    const session = new VoiceSocketSession({
      socketFactory: fakeSocketFactory(socket),
      request,
      url: 'wss://provider.test/stream',
      headers: {},
      maxPcmChunkBytes: 2,
      onOpen: (_socket, controls) => controls.ready(),
      onMessage: (_data, controls) => controls.emit({ type: 'partial', text: 'chunk' }),
      onEnd: (_socket, controls) => controls.end(),
      encodePcm: (chunk) => {
        sentChunks.push(chunk)
        return chunk
      },
    })
    await session.ready
    await session.writePcm(Uint8Array.from([1, 2, 3, 4, 5]))
    expect(sentChunks).toEqual([Uint8Array.from([1, 2]), Uint8Array.from([3, 4]), Uint8Array.from([5])])
    socket.emitMessage('ignored')
    expect((await session.events[Symbol.asyncIterator]().next()).value).toEqual({ type: 'partial', text: 'chunk' })
    await session.end()
    expect(socket.closed).toMatchObject({ code: 1000, reason: 'complete' })
    await session.end()
    expect(socket.sent).toHaveLength(3)
  })

  it('aborts a pending socket without allowing late connection or events to escape', async () => {
    let resolveSocket!: (socket: FakeSocket) => void
    const socketPromise = new Promise<FakeSocket>((resolve) => {
      resolveSocket = resolve
    })
    const factory: VoiceSocketFactory = { connect: async () => socketPromise }
    const session = new VoiceSocketSession({
      socketFactory: factory,
      request,
      url: 'wss://provider.test/stream',
      headers: {},
      onOpen: (_socket, controls) => controls.ready(),
      onMessage: (_data, controls) => controls.emit({ type: 'partial', text: 'late' }),
      onEnd: async () => {},
    })
    const pendingReady = session.ready.catch((error: unknown) => error)
    await session.abort('caller-cancelled')
    expect(await pendingReady).toMatchObject({ code: 'VOICE_STREAM_ABORTED', message: 'caller-cancelled' })
    resolveSocket(new FakeSocket())
    await Promise.resolve()
    await expect(session.writePcm(Uint8Array.from([1]))).rejects.toMatchObject({ code: 'VOICE_STREAM_ABORTED' })
  })

  it('routes provider streams through fake sockets and preserves protocol terminal events', async () => {
    const doubaoSocket = new FakeSocket()
    const doubao = new DoubaoVoiceProvider({ credentials: { apiKey: 'fixture-key', resourceId: 'resource' }, socketFactory: fakeSocketFactory(doubaoSocket), httpClient: fakeHttp([]), streamUrl: 'wss://provider.test/doubao' })
    const doubaoSession = await doubao.createStream({ ...request, model: 'bigmodel' })
    const firstSent = doubaoSocket.sent[0]
    if (!(firstSent instanceof Uint8Array))
      throw new Error('Doubao full request fixture was not binary')
    expect(JSON.parse(gunzipSync(Buffer.from(firstSent).subarray(12)).toString('utf8')).request.model_name).toBe('bigmodel')
    const doubaoEvents = doubaoSession.events[Symbol.asyncIterator]()
    doubaoSocket.emitMessage(doubaoServerFrame({ result: { text: '完成' } }, { last: true }))
    expect((await doubaoEvents.next()).value).toMatchObject({ type: 'final', text: '完成' })
    expect((await doubaoEvents.next()).done).toBe(true)
    await expect(doubaoSession.writePcm(Uint8Array.from([1]))).rejects.toMatchObject({ code: 'VOICE_STREAM_ABORTED' })

    const bailianSocket = new FakeSocket()
    const bailian = new BailianParaformerVoiceProvider({ credentials: { apiKey: 'fixture-key', workspaceId: 'workspace' }, socketFactory: fakeSocketFactory(bailianSocket), httpClient: fakeHttp([]) })
    const bailianPromise = bailian.createStream(request)
    await Promise.resolve()
    await Promise.resolve()
    bailianSocket.emitMessage(JSON.stringify({ header: { event: 'task-started', task_id: 'request-1' } }))
    const bailianSession = await bailianPromise
    expect(JSON.parse(String(bailianSocket.sent[0]))).toMatchObject({ header: { action: 'run-task', task_id: 'request-1' } })
    const bailianEvents = bailianSession.events[Symbol.asyncIterator]()
    bailianSocket.emitMessage(JSON.stringify({ header: { event: 'task-finished', task_id: 'request-1' } }))
    expect((await bailianEvents.next()).value).toEqual({ type: 'end', requestId: 'request-1' })
    expect((await bailianEvents.next()).done).toBe(true)
  })

  it('uses submit-poll-result upload flow and releases byte sources for both providers', async () => {
    const doubaoHttp = fakeHttp([{ status: 200, headers: {}, body: { result: { text: '快速上传', language: 'zh' } } }])
    let doubaoReleased = false
    const doubao = new DoubaoVoiceProvider({
      credentials: { apiKey: 'fixture-key', resourceId: 'resource' },
      socketFactory: fakeSocketFactory(new FakeSocket()),
      httpClient: doubaoHttp,
      uploadSourceResolver: async () => ({
        url: 'https://upload.test/doubao',
        release: () => {
          doubaoReleased = true
        },
      }),
    })
    await expect(doubao.transcribeUpload({ model: 'bigmodel', source: { kind: 'bytes', bytes: Uint8Array.from([1]), format: 'pcm' }, requestId: 'upload-d' })).resolves.toMatchObject({ text: '快速上传', language: 'zh', requestId: 'upload-d' })
    expect(doubaoReleased).toBe(true)
    expect(doubaoHttp.requests).toHaveLength(1)

    const bailianHttp = fakeHttp([
      { status: 200, headers: {}, body: { output: { task_id: 'task-b' } } },
      { status: 200, headers: {}, body: { output: { task_status: 'SUCCEEDED', results: [{ transcription_url: 'https://result.test/transcript' }] } } },
      { status: 200, headers: {}, body: { output: { results: [{ transcript: '异步上传', duration: 2 }] } } },
    ])
    let bailianReleased = false
    const bailian = new BailianParaformerVoiceProvider({
      credentials: { apiKey: 'fixture-key', workspaceId: 'workspace' },
      socketFactory: fakeSocketFactory(new FakeSocket()),
      httpClient: bailianHttp,
      uploadSourceResolver: async () => ({
        url: 'https://upload.test/bailian',
        release: () => {
          bailianReleased = true
        },
      }),
      pollIntervalMs: 1,
    })
    await expect(bailian.transcribeUpload({ model: 'paraformer-v2', source: { kind: 'bytes', bytes: Uint8Array.from([2]), format: 'wav' }, requestId: 'upload-b' })).resolves.toMatchObject({ text: '异步上传', durationMs: 2000, requestId: 'task-b' })
    expect(bailianReleased).toBe(true)
    expect(bailianHttp.requests.map(entry => entry.method)).toEqual(['POST', 'POST', 'GET'])
  })
})
