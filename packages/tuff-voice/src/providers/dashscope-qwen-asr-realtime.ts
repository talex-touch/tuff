import type {
  VoiceProviderAdapter,
  VoiceProviderCapabilities,
  VoiceRecognitionResult,
  VoiceSocketFactory,
  VoiceStreamConnection,
  VoiceStreamRequest,
  VoiceUploadRequest,
} from '../contracts'
import type { DashscopeCredentials, DashscopeQwenAsrRealtimeRequestOptions } from '../protocol/qwen-asr-realtime'
import { Buffer } from 'node:buffer'
import { assertVoiceProviderRequestId, VoiceProviderError } from '../contracts'
import { VoiceSocketSession } from '../socket-session'
import {
  DASHSCOPE_QWEN_ASR_REALTIME_DEFAULT_MODEL,
  buildDashscopeQwenAsrRealtimeAudioAppend,
  buildDashscopeQwenAsrRealtimeFinish,
  buildDashscopeQwenAsrRealtimeHeaders,
  buildDashscopeQwenAsrRealtimeSessionUpdate,
  buildDashscopeQwenAsrRealtimeWebSocketUrl,
  isDashscopeQwenAsrRealtimeReadyEvent,
  parseDashscopeQwenAsrRealtimeEvent,
} from '../protocol/qwen-asr-realtime'

export interface DashscopeQwenAsrRealtimeVoiceProviderOptions {
  credentials: DashscopeCredentials
  socketFactory: VoiceSocketFactory
  region?: string
  userAgent?: string
  /** Optional controlled WebSocket endpoint override, useful for an approved gateway. */
  endpoint?: string
  streamOptions?: DashscopeQwenAsrRealtimeRequestOptions
}

/** Compatibility name for callers that omit "VoiceProvider" from option types. */
export type DashscopeQwenAsrRealtimeProviderOptions = DashscopeQwenAsrRealtimeVoiceProviderOptions

export class DashscopeQwenAsrRealtimeVoiceProvider implements VoiceProviderAdapter {
  readonly id = 'dashscope-qwen-asr-realtime'
  readonly kind = 'bailian' as const
  readonly defaultStreamModel = DASHSCOPE_QWEN_ASR_REALTIME_DEFAULT_MODEL
  readonly capabilities: VoiceProviderCapabilities = {
    stream: true,
    upload: false,
    formats: ['pcm'],
  }

  private readonly options: DashscopeQwenAsrRealtimeVoiceProviderOptions

  constructor(options: DashscopeQwenAsrRealtimeVoiceProviderOptions) {
    this.options = options
  }

  async createStream(request: VoiceStreamRequest): Promise<VoiceStreamConnection> {
    const requestId = assertVoiceProviderRequestId(request.requestId)
    this.assertPcmAudio(request)
    const model = request.model.trim() || this.options.streamOptions?.model || this.defaultStreamModel
    const url = this.options.endpoint
      ? withModelQuery(this.options.endpoint, model)
      : buildDashscopeQwenAsrRealtimeWebSocketUrl(this.options.credentials.workspaceId, model, this.options.region)
    const headers = buildDashscopeQwenAsrRealtimeHeaders(this.options.credentials, this.options.userAgent)
    let audioSequence = 0
    const session = new VoiceSocketSession({
      socketFactory: this.options.socketFactory,
      request,
      url,
      headers,
      maxPcmChunkBytes: 16 * 1024,
      encodePcm: chunk =>
        Buffer.from(
          JSON.stringify(
            buildDashscopeQwenAsrRealtimeAudioAppend(chunk, {
              eventId: `audio-${++audioSequence}`,
            }),
          ),
          'utf8',
        ),
      onOpen: socket => {
        socket.send(
          JSON.stringify(
            buildDashscopeQwenAsrRealtimeSessionUpdate(request, {
              ...this.options.streamOptions,
              model,
            }),
          ),
        )
        // Readiness is acknowledged by session.created/session.updated below;
        // audio writes therefore cannot race the provider's session setup.
      },
      onMessage: (data, controls) => {
        if (isDashscopeQwenAsrRealtimeReadyEvent(data)) {
          controls.ready()
          return
        }
        const event = parseDashscopeQwenAsrRealtimeEvent(data instanceof Uint8Array ? data : Buffer.from(data))
        if (!event) return
        const normalized = event.requestId ? event : { ...event, requestId }
        if (normalized.type === 'error') {
          controls.fail(
            new VoiceProviderError(normalized.code, normalized.message, {
              retryable: normalized.retryable,
              requestId: normalized.requestId,
            }),
          )
          return
        }
        if (normalized.type === 'end') {
          controls.emit(normalized)
          controls.end()
          return
        }
        controls.emit(normalized)
      },
      onEnd: socket => {
        socket.send(JSON.stringify(buildDashscopeQwenAsrRealtimeFinish({ eventId: requestId })))
      },
    })
    await session.ready
    return session
  }

  async transcribeUpload(request: VoiceUploadRequest): Promise<VoiceRecognitionResult> {
    const requestId = assertVoiceProviderRequestId(request.requestId)
    throw new VoiceProviderError(
      'DASHSCOPE_QWEN_ASR_REALTIME_UPLOAD_UNSUPPORTED',
      'DashScope Qwen ASR realtime supports streaming recognition only.',
      { requestId },
    )
  }

  private assertPcmAudio(request: VoiceStreamRequest): void {
    if (request.audio.format !== 'pcm') {
      throw new VoiceProviderError(
        'DASHSCOPE_QWEN_ASR_REALTIME_FORMAT_UNSUPPORTED',
        'DashScope Qwen ASR realtime requires raw PCM input.',
      )
    }
    if (request.audio.channels !== 1) {
      throw new VoiceProviderError(
        'DASHSCOPE_QWEN_ASR_REALTIME_CHANNELS_UNSUPPORTED',
        'DashScope Qwen ASR realtime requires mono audio.',
      )
    }
    if (request.audio.bitsPerSample !== 16 || (request.audio.codec !== undefined && request.audio.codec !== 'raw')) {
      throw new VoiceProviderError(
        'DASHSCOPE_QWEN_ASR_REALTIME_PCM_UNSUPPORTED',
        'DashScope Qwen ASR realtime requires signed 16-bit raw PCM audio.',
      )
    }
    if (!Number.isFinite(request.audio.sampleRate) || request.audio.sampleRate <= 0) {
      throw new VoiceProviderError(
        'DASHSCOPE_QWEN_ASR_REALTIME_SAMPLE_RATE_INVALID',
        'DashScope Qwen ASR realtime sample rate is invalid.',
      )
    }
  }
}

function withModelQuery(endpoint: string, model: string): string {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch (error) {
    throw new VoiceProviderError('DASHSCOPE_ENDPOINT_INVALID', 'DashScope WebSocket endpoint is invalid.', {
      cause: error,
    })
  }
  if (url.protocol !== 'wss:') {
    throw new VoiceProviderError('DASHSCOPE_ENDPOINT_INVALID', 'DashScope WebSocket endpoint must use WSS.')
  }
  if (/[\r\n]/.test(model) || !model.trim() || model.length > 128) {
    throw new VoiceProviderError('DASHSCOPE_QWEN_ASR_REALTIME_MODEL_INVALID', 'DashScope ASR model is invalid.')
  }
  url.searchParams.set('model', model.trim())
  return url.toString()
}
