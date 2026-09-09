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
import type { BailianCredentials, BailianRequestOptions } from '../protocol/bailian-paraformer'
import type { VoiceUploadUrlResolver } from '../upload-source'
import { Buffer } from 'node:buffer'
import { throwIfAborted, waitWithAbort } from '../async'
import { assertVoiceProviderRequestId, VoiceProviderError } from '../contracts'
import { asRecord, assertHttpSuccess, assertProviderOptionUrl, readString } from '../http'
import {
  BAILIAN_PARAFORMER_DEFAULT_MODEL,
  buildBailianFinishTask,
  buildBailianHeaders,
  buildBailianRunTask,
  buildBailianWebSocketUrl,
  isBailianTaskStarted,
  normalizeBailianUploadResult,
  parseBailianEvent,
} from '../protocol/bailian-paraformer'
import { VoiceSocketSession } from '../socket-session'
import { withResolvedUploadSource } from '../upload-source'

const DEFAULT_TRANSCRIPTION_URL
  = 'https://{workspace}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/asr/transcription'
const DEFAULT_POLL_INTERVAL_MS = 500
const DEFAULT_UPLOAD_TIMEOUT_MS = 120_000

export interface BailianParaformerProviderOptions {
  credentials: BailianCredentials
  socketFactory: VoiceSocketFactory
  httpClient: VoiceHttpClient
  region?: string
  userAgent?: string
  uploadSourceResolver?: VoiceUploadUrlResolver
  pollIntervalMs?: number
  uploadTimeoutMs?: number
  streamOptions?: BailianRequestOptions
}

export class BailianParaformerVoiceProvider implements VoiceProviderAdapter {
  readonly id = 'bailian-paraformer'
  readonly kind = 'bailian' as const
  readonly defaultStreamModel = BAILIAN_PARAFORMER_DEFAULT_MODEL
  readonly defaultUploadModel = 'paraformer-v2'
  readonly capabilities: VoiceProviderCapabilities = {
    stream: true,
    upload: true,
    formats: ['pcm', 'wav', 'mp3', 'opus', 'speex', 'aac', 'amr'],
  }

  private readonly options: BailianParaformerProviderOptions

  constructor(options: BailianParaformerProviderOptions) {
    this.options = options
  }

  async createStream(request: VoiceStreamRequest): Promise<VoiceStreamConnection> {
    assertVoiceProviderRequestId(request.requestId)
    if (request.audio.channels !== 1) {
      throw new VoiceProviderError(
        'BAILIAN_STREAM_CHANNELS_UNSUPPORTED',
        'Bailian Paraformer stream requires mono audio.',
      )
    }
    if (request.audio.format !== 'pcm') {
      throw new VoiceProviderError(
        'BAILIAN_STREAM_FORMAT_UNSUPPORTED',
        'Bailian Paraformer live stream requires raw PCM input.',
      )
    }
    const session = new VoiceSocketSession({
      socketFactory: this.options.socketFactory,
      request,
      url: buildBailianWebSocketUrl(this.options.credentials.workspaceId, this.options.region),
      headers: buildBailianHeaders(this.options.credentials, this.options.userAgent),
      maxPcmChunkBytes: 16 * 1024,
      onOpen: (socket) => {
        socket.send(
          JSON.stringify(
            buildBailianRunTask(request, {
              model: request.model || BAILIAN_PARAFORMER_DEFAULT_MODEL,
              heartbeat: request.heartbeat,
              removeDisfluencies: request.enableDdc,
              ...this.options.streamOptions,
            }),
          ),
        )
      },
      onMessage: (data, controls) => {
        const raw = typeof data === 'string' ? data : Buffer.from(data).toString('utf8')
        const event = parseBailianEvent(raw)
        if (isBailianTaskStarted(raw)) {
          controls.ready()
          return
        }
        if (event?.type === 'error') {
          controls.fail(
            new VoiceProviderError(event.code, event.message, {
              retryable: event.retryable,
              requestId: event.requestId,
            }),
          )
          return
        }
        if (event?.type === 'end') {
          controls.emit(event)
          controls.end()
          return
        }
        if (event)
          controls.emit(event)
      },
      onEnd: (socket) => {
        socket.send(JSON.stringify(buildBailianFinishTask(request.requestId)))
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

  private async transcribeResolvedUpload(
    request: VoiceUploadRequest,
    fileUrl: string,
  ): Promise<VoiceRecognitionResult> {
    const workspace = this.options.credentials.workspaceId?.trim()
    if (!workspace) {
      throw new VoiceProviderError(
        'BAILIAN_WORKSPACE_REQUIRED_FOR_UPLOAD',
        'Bailian file transcription requires a workspace.',
      )
    }
    const endpoint = assertProviderOptionUrl(
      (request.providerOptions?.submitUrl as string | undefined)
      ?? DEFAULT_TRANSCRIPTION_URL.replace('{workspace}', workspace),
      'Bailian transcription URL',
    )
    const headers = {
      ...buildBailianHeaders(this.options.credentials, this.options.userAgent),
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    }
    const body = {
      model: request.model || 'paraformer-v2',
      input: { file_urls: [fileUrl] },
      parameters: {
        ...(request.language ? { language_hints: [toBailianLanguage(request.language)] } : {}),
        ...(request.enableSpeakerDiarization === undefined
          ? {}
          : { diarization_enabled: request.enableSpeakerDiarization }),
        ...(request.enableTimestamps === undefined ? {} : { timestamp_alignment_enabled: request.enableTimestamps }),
        ...(request.removeDisfluencies === undefined ? {} : { disfluency_removal_enabled: request.removeDisfluencies }),
        ...request.providerOptions,
      },
    }
    const submit = await this.options.httpClient.request({
      method: 'POST',
      url: endpoint,
      headers,
      body: JSON.stringify(body),
      signal: request.signal,
    })
    const submitBody = asRecord(assertHttpSuccess(submit, 'bailian'))
    const taskId = readString(asRecord(submitBody?.output)?.task_id)
    if (!taskId) {
      throw new VoiceProviderError('BAILIAN_TASK_ID_MISSING', 'Bailian did not return an upload task id.')
    }

    const deadline = Date.now() + (request.timeoutMs ?? this.options.uploadTimeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS)
    const queryUrl = assertProviderOptionUrl(
      (request.providerOptions?.queryUrl as string | undefined)
      ?? `${new URL(endpoint).origin}/api/v1/tasks/${encodeURIComponent(taskId)}`,
      'Bailian task query URL',
    )
    for (;;) {
      throwIfAborted(request.signal)
      if (Date.now() > deadline) {
        throw new VoiceProviderError('BAILIAN_UPLOAD_TIMEOUT', 'Bailian upload transcription timed out.', {
          retryable: true,
          requestId: taskId,
        })
      }
      const query = await this.options.httpClient.request({
        method: 'POST',
        url: queryUrl,
        headers,
        signal: request.signal,
      })
      const queryBody = asRecord(assertHttpSuccess(query, 'bailian'))
      const output = asRecord(queryBody?.output)
      const status = readString(output?.task_status)
      if (status === 'PENDING' || status === 'RUNNING') {
        await waitWithAbort(this.options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS, request.signal)
        continue
      }
      if (status === 'FAILED') {
        throw new VoiceProviderError('BAILIAN_UPLOAD_FAILED', 'Bailian upload transcription failed.', {
          requestId: taskId,
        })
      }
      if (status !== 'SUCCEEDED') {
        throw new VoiceProviderError('BAILIAN_TASK_STATUS_INVALID', 'Bailian returned an unknown task status.', {
          requestId: taskId,
        })
      }
      const results = Array.isArray(output?.results) ? output.results : []
      const firstResult = asRecord(results[0])
      const transcriptionUrl = readString(firstResult?.transcription_url)
      if (transcriptionUrl) {
        const resultResponse = await this.options.httpClient.request({
          method: 'GET',
          url: assertProviderOptionUrl(transcriptionUrl, 'Bailian transcription result URL'),
          headers: buildBailianHeaders(this.options.credentials, this.options.userAgent),
          signal: request.signal,
        })
        return toVoiceResult(normalizeBailianUploadResult(assertHttpSuccess(resultResponse, 'bailian')), taskId)
      }
      return toVoiceResult(normalizeBailianUploadResult(queryBody), taskId)
    }
  }
}

function toBailianLanguage(language: string): string {
  const normalized = language.trim().toLowerCase()
  return (
    (
      {
        'zh-cn': 'zh',
        'en-us': 'en',
        'ja-jp': 'ja',
        'yue-cn': 'yue',
        'ko-kr': 'ko',
        'de-de': 'de',
        'fr-fr': 'fr',
      } as Record<string, string>
    )[normalized] ?? normalized
  )
}

function toVoiceResult(result: VoiceRecognitionResult, requestId: string): VoiceRecognitionResult {
  return { ...result, requestId: result.requestId ?? requestId }
}
