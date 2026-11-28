import type {
  VoiceProviderAdapter,
  VoiceProviderCapabilities,
  VoiceRecognitionResult,
  VoiceSocketFactory,
  VoiceStreamConnection,
  VoiceStreamRequest,
  VoiceUploadRequest,
} from '../contracts'
import type { DoubaoImeCredentials } from '../protocol/doubao-ime'
import { Buffer } from 'node:buffer'
import { assertVoiceProviderRequestId, VoiceProviderError } from '../contracts'
import { isSafeRemoteUrl } from '../http'
import {
  acquireDoubaoImeToken,
  buildDoubaoImeAudioRequest,
  buildDoubaoImeFinishTask,
  buildDoubaoImeStartTask,
  DEFAULT_DOUBAO_IME_STREAM_URL,
  parseDoubaoImeResponse,
} from '../protocol/doubao-ime'
import { VoiceSocketSession } from '../socket-session'

export interface DoubaoImeVoiceProviderOptions {
  credentials: DoubaoImeCredentials
  socketFactory: VoiceSocketFactory
  streamUrl?: string
  fetchImpl?: typeof fetch
}

export class DoubaoImeVoiceProvider implements VoiceProviderAdapter {
  readonly id = 'doubao-ime'
  readonly kind = 'doubao' as const
  readonly capabilities: VoiceProviderCapabilities = {
    stream: true,
    upload: false,
    formats: ['pcm', 'wav', 'opus'],
  }

  readonly defaultStreamModel = 'bigmodel'
  readonly defaultUploadModel = 'bigmodel'

  private readonly options: DoubaoImeVoiceProviderOptions
  private readonly credentials: DoubaoImeCredentials
  private readonly streamUrl: string

  constructor(options: DoubaoImeVoiceProviderOptions) {
    const appKey = options.credentials?.appKey?.trim() ?? ''
    const accessKey = options.credentials?.accessKey?.trim() ?? ''
    if (!appKey || !accessKey) {
      throw new VoiceProviderError(
        'DOUBAO_IME_CREDENTIALS_MISSING',
        'Doubao IME provider requires explicit caller-provided appKey and accessKey credentials.',
      )
    }
    const streamUrl = options.streamUrl ?? DEFAULT_DOUBAO_IME_STREAM_URL
    if (!isSafeRemoteUrl(streamUrl, ['wss:'])) {
      throw new VoiceProviderError(
        'VOICE_PROVIDER_URL_INVALID',
        'Doubao IME stream URL must be a safe remote WSS URL.',
      )
    }
    this.options = options
    this.credentials = { appKey, accessKey }
    this.streamUrl = streamUrl
  }

  async createStream(request: VoiceStreamRequest): Promise<VoiceStreamConnection> {
    assertVoiceProviderRequestId(request.requestId)

    const token = await acquireDoubaoImeToken(this.credentials, this.options.fetchImpl)
    const appKey = this.credentials.appKey
    const taskId = request.requestId
    const sessionId = crypto.randomUUID()
    let sequence = 1

    const session = new VoiceSocketSession({
      socketFactory: this.options.socketFactory,
      request,
      url: this.streamUrl,
      headers: { 'User-Agent': 'tuff-voice' },
      maxPcmChunkBytes: 3200, // 100ms at 16kHz 16-bit mono
      encodePcm: chunk =>
        Buffer.from(
          buildDoubaoImeAudioRequest(taskId, sessionId, token, appKey, sequence++, chunk, false),
        ),
      onOpen: (socket, controls) => {
        socket.send(buildDoubaoImeStartTask(taskId, sessionId, token, appKey, request))
        // Ready after connection + task handshake
        controls.ready()
      },
      onMessage: (data, controls) => {
        const text = typeof data === 'string' ? data : Buffer.from(data).toString('utf-8')
        const event = parseDoubaoImeResponse(text)
        if (!event)
          return

        if (event.type === 'error') {
          controls.fail(
            new VoiceProviderError(event.code, event.message, {
              retryable: event.retryable,
              requestId: event.requestId,
            }),
          )
          return
        }

        controls.emit(event)

        if (event.type === 'end') {
          controls.end()
        }
      },
      onEnd: (socket) => {
        socket.send(buildDoubaoImeFinishTask(taskId, sessionId, token, appKey))
      },
    })

    await session.ready
    return session
  }

  async transcribeUpload(_request: VoiceUploadRequest): Promise<VoiceRecognitionResult> {
    throw new VoiceProviderError(
      'DOUBAO_IME_UPLOAD_UNSUPPORTED',
      'Doubao IME direct provider only supports real-time streaming recognition.',
    )
  }
}
