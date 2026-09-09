import type {
  VoiceHttpClient,
  VoiceProviderAdapter,
  VoiceProviderCapabilities,
  VoiceRecognitionResult,
  VoiceSocketFactory,
  VoiceStreamConnection,
  VoiceStreamRequest,
  VoiceUploadRequest,
} from '../contracts'
import type { DoubaoCredentials, DoubaoUploadVariant } from '../protocol/doubao'
import type { VoiceUploadUrlResolver } from '../upload-source'
import { Buffer } from 'node:buffer'
import { throwIfAborted, waitWithAbort } from '../async'
import { assertVoiceProviderRequestId, VoiceProviderError } from '../contracts'
import { asRecord, assertHttpSuccess, assertProviderOptionUrl, readString } from '../http'
import {
  buildDoubaoHeaders,
  buildDoubaoStreamPayload,
  decodeDoubaoFrame,

  encodeDoubaoAudioRequest,
  encodeDoubaoFullRequest,
  normalizeDoubaoUploadResult,
  parseDoubaoResponse,
} from '../protocol/doubao'
import { VoiceSocketSession } from '../socket-session'
import { withResolvedUploadSource } from '../upload-source'

const DEFAULT_STREAM_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async'
const DEFAULT_STANDARD_SUBMIT_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit'
const DEFAULT_STANDARD_QUERY_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query'
const DEFAULT_IDLE_SUBMIT_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/idle/submit'
const DEFAULT_IDLE_QUERY_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/idle/query'
const DEFAULT_FAST_RECOGNIZE_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash'
const DEFAULT_POLL_INTERVAL_MS = 500
const DEFAULT_UPLOAD_TIMEOUT_MS = 120_000

export interface DoubaoVoiceProviderOptions {
  credentials: DoubaoCredentials
  socketFactory: VoiceSocketFactory
  httpClient: VoiceHttpClient
  streamUrl?: string
  uploadVariant?: DoubaoUploadVariant['kind']
  uploadSourceResolver?: VoiceUploadUrlResolver
  pollIntervalMs?: number
  uploadTimeoutMs?: number
  streamOptions?: Readonly<Record<string, unknown>>
}

export class DoubaoVoiceProvider implements VoiceProviderAdapter {
  readonly id = 'doubao'
  readonly kind = 'doubao' as const
  readonly capabilities: VoiceProviderCapabilities = {
    stream: true,
    upload: true,
    formats: ['pcm', 'wav', 'mp3', 'ogg', 'opus', 'speex', 'aac', 'amr', 'm4a'],
  }

  readonly defaultStreamModel = 'bigmodel'
  readonly defaultUploadModel = 'bigmodel'

  private readonly options: DoubaoVoiceProviderOptions

  constructor(options: DoubaoVoiceProviderOptions) {
    this.options = options
  }

  async createStream(request: VoiceStreamRequest): Promise<VoiceStreamConnection> {
    assertVoiceProviderRequestId(request.requestId)
    if (request.audio.format !== 'pcm') {
      throw new VoiceProviderError(
        'DOUBAO_STREAM_FORMAT_UNSUPPORTED',
        'Doubao live stream requires raw PCM input.',
      )
    }
    const headers = buildDoubaoHeaders(this.options.credentials, request.requestId)
    let sequence = 2
    let committedFinalText = ''
    const session = new VoiceSocketSession({
      socketFactory: this.options.socketFactory,
      request,
      url: this.options.streamUrl ?? DEFAULT_STREAM_URL,
      headers,
      maxPcmChunkBytes: 128 * 1024,
      encodePcm: chunk => encodeDoubaoAudioRequest(sequence++, chunk, false),
      onOpen: (socket, controls) => {
        socket.send(
          encodeDoubaoFullRequest(
            buildDoubaoStreamPayload(request, {
              model: request.model,
              providerOptions: this.options.streamOptions,
            }),
            1,
          ),
        )
        controls.ready()
      },
      onMessage: (data, controls) => {
        const frame = decodeDoubaoFrame(data instanceof Uint8Array ? data : Buffer.from(data))
        const event = parseDoubaoResponse(frame)
        if (event?.type === 'error') {
          controls.fail(
            new VoiceProviderError(event.code, event.message, {
              retryable: event.retryable,
              requestId: event.requestId,
            }),
          )
          return
        }
        if (event?.type === 'final') {
          const next = consumeFinalText(committedFinalText, event.text)
          committedFinalText = next.committed
          if (next.delta)
            controls.emit({ ...event, text: next.delta })
        }
        else if (event) {
          controls.emit(event)
        }
        if (frame.isLastPackage)
          controls.end()
      },
      onEnd: (socket) => {
        socket.send(encodeDoubaoAudioRequest(sequence++, new Uint8Array(), true))
      },
    })
    await session.ready
    return session
  }

  async transcribeUpload(request: VoiceUploadRequest): Promise<VoiceRecognitionResult> {
    assertVoiceProviderRequestId(request.requestId)
    return await withResolvedUploadSource(
      request,
      this.options.uploadSourceResolver,
      async source => await this.transcribeResolvedUpload(request, source.url),
    )
  }

  private async transcribeResolvedUpload(request: VoiceUploadRequest, url: string): Promise<VoiceRecognitionResult> {
    const variant = this.options.uploadVariant ?? 'fast'
    if (variant === 'fast') {
      const endpoint = assertProviderOptionUrl(
        (request.providerOptions?.recognizeUrl as string | undefined)
        ?? this.options.streamOptions?.recognizeUrl as string | undefined
        ?? DEFAULT_FAST_RECOGNIZE_URL,
        'Doubao recognize URL',
      )
      const response = await this.options.httpClient.request({
        method: 'POST',
        url: endpoint,
        headers: buildDoubaoHeaders(
          {
            ...this.options.credentials,
            resourceId:
              (request.providerOptions?.resourceId as string | undefined) ?? 'volc.bigasr.auc_turbo',
          },
          request.requestId,
        ),
        body: JSON.stringify(this.buildUploadPayload(request, url)),
        signal: request.signal,
      })
      const body = assertHttpSuccess(response, 'doubao')
      const normalized = normalizeDoubaoUploadResult(body).result
      return {
        text: normalized.text,
        ...(normalized.language ? { language: normalized.language } : {}),
        ...(normalized.segments ? { segments: normalized.segments } : {}),
        ...(normalized.usage ? { usage: normalized.usage } : {}),
        ...(normalized.requestId ? { requestId: normalized.requestId } : { requestId: request.requestId }),
      }
    }

    const resourceId = variant === 'idle' ? 'volc.bigasr.auc_idle' : 'volc.seedasr.auc'
    const submitUrl = assertProviderOptionUrl(
      (request.providerOptions?.submitUrl as string | undefined)
      ?? (variant === 'idle' ? DEFAULT_IDLE_SUBMIT_URL : DEFAULT_STANDARD_SUBMIT_URL),
      'Doubao upload submit URL',
    )
    const queryUrl = assertProviderOptionUrl(
      (request.providerOptions?.queryUrl as string | undefined)
      ?? (variant === 'idle' ? DEFAULT_IDLE_QUERY_URL : DEFAULT_STANDARD_QUERY_URL),
      'Doubao upload query URL',
    )
    const credentials = { ...this.options.credentials, resourceId }
    const headers = buildDoubaoHeaders(credentials, request.requestId)
    const submit = await this.options.httpClient.request({
      method: 'POST',
      url: submitUrl,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(this.buildUploadPayload(request, url)),
      signal: request.signal,
    })
    assertHttpSuccess(submit, 'doubao')

    const deadline = Date.now() + (request.timeoutMs ?? this.options.uploadTimeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS)
    for (;;) {
      throwIfAborted(request.signal)
      if (Date.now() > deadline) {
        throw new VoiceProviderError('DOUBAO_UPLOAD_TIMEOUT', 'Doubao upload transcription timed out.', {
          retryable: true,
          requestId: request.requestId,
        })
      }
      const query = await this.options.httpClient.request({
        method: 'POST',
        url: queryUrl,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: '{}',
        signal: request.signal,
      })
      const body = assertHttpSuccess(query, 'doubao')
      const statusCode = readString(query.headers['x-api-status-code']) || readString(asRecord(body)?.code)
      if (statusCode === '20000001' || statusCode === '20000002') {
        await waitWithAbort(this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, request.signal)
        continue
      }
      if (statusCode && statusCode !== '20000000') {
        throw new VoiceProviderError(`DOUBAO_UPLOAD_${statusCode}`, 'Doubao upload transcription failed.', {
          retryable: statusCode.startsWith('5'),
          requestId: request.requestId,
        })
      }
      const normalized = normalizeDoubaoUploadResult(body).result
      return {
        text: normalized.text,
        ...(normalized.language ? { language: normalized.language } : {}),
        ...(normalized.segments ? { segments: normalized.segments } : {}),
        ...(normalized.usage ? { usage: normalized.usage } : {}),
        ...(normalized.requestId ? { requestId: normalized.requestId } : { requestId: request.requestId }),
      }
    }
  }

  private buildUploadPayload(request: VoiceUploadRequest, url: string): Record<string, unknown> {
    const format = request.source.kind === 'url' ? request.source.format : request.source.format
    return {
      user: { uid: 'tuff-voice' },
      audio: {
        url,
        ...(format ? { format } : {}),
        ...(request.language ? { language: request.language } : {}),
      },
      request: {
        model_name: request.model,
        ...(request.enableTimestamps === undefined ? {} : { show_utterances: request.enableTimestamps }),
        ...(request.enableSpeakerDiarization === undefined
          ? {}
          : { enable_speaker_info: request.enableSpeakerDiarization }),
        ...(request.removeDisfluencies === undefined ? {} : { enable_ddc: request.removeDisfluencies }),
        ...request.providerOptions,
      },
    }
  }
}

function consumeFinalText(committed: string, current: string): { delta: string, committed: string } {
  const text = current.trim()
  if (!text)
    return { delta: '', committed }
  if (!committed)
    return { delta: text, committed: text }
  if (text.startsWith(committed)) {
    return { delta: text.slice(committed.length).trimStart(), committed: text }
  }
  return { delta: text, committed: `${committed}${text}` }
}
