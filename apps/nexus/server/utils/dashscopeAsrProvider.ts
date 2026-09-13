import type { H3Event } from 'h3'
import { createError } from 'h3'
import type { ProviderRegistryRecord } from './providerRegistryStore'
import { getProviderCredential } from './providerCredentialStore'
import { Buffer } from 'node:buffer'

const FILETRANS_MODEL = 'qwen-audio-3.0-asr-flash-filetrans'
export const QWEN_AUDIO_ASR_MODEL = 'qwen-audio-3.0-asr-flash'
export const QWEN_AUDIO_ASR_TRANSPORT = 'qwen-audio-sync'
const QWEN_AUDIO_ASR_MAX_DATA_URI_BYTES = 14 * 1024 * 1024
const QWEN_AUDIO_ASR_DATA_URI_PREFIX = 'data:audio/wav;base64,'
export const QWEN_AUDIO_ASR_MAX_RAW_BYTES =
  Math.floor((QWEN_AUDIO_ASR_MAX_DATA_URI_BYTES - Buffer.byteLength(QWEN_AUDIO_ASR_DATA_URI_PREFIX)) / 4) * 3
export const QWEN_AUDIO_ASR_MAX_DURATION_SECONDS = 5 * 60
const QWEN_AUDIO_ASR_DEFAULT_TIMEOUT_MS = 120_000
const QWEN_AUDIO_ASR_MAX_TIMEOUT_MS = 5 * 60 * 1000

export type DashScopeAsrTransport = 'filetrans' | typeof QWEN_AUDIO_ASR_TRANSPORT

export class DashScopeAsrError extends Error {
  constructor(
    readonly code:
      | 'ASR_AUDIO_TOO_LARGE'
      | 'ASR_PROVIDER_CONFIGURATION_INVALID'
      | 'ASR_PROVIDER_REJECTED'
      | 'ASR_PROVIDER_RESPONSE_INVALID'
      | 'ASR_PROVIDER_UNAVAILABLE',
    readonly accepted: boolean,
  ) {
    super(code)
  }
}

interface RecordValue {
  [key: string]: unknown
}

export interface DashScopeFiletransAdapterOptions {
  fetch?: typeof fetch
}

export interface DashScopeFiletransSubmission {
  taskId: string
}

export type DashScopeFiletransTask =
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'succeeded'; transcript: string; billedSeconds: number }

export interface DashScopeQwenAudioAsrAdapterOptions {
  fetch?: typeof fetch
  maxDataUriBytes?: number
  requestTimeoutMs?: number
}

export interface DashScopeQwenAudioAsrTranscription {
  transcript: string
  billedSeconds: number
  requestId?: string
}

function asRecord(value: unknown): RecordValue | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return null
  const record: RecordValue = {}
  for (const [key, item] of Object.entries(value)) record[key] = item
  return record
}

function readString(value: unknown, maxLength = 16_384): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength ? value.trim() : null
}

function readDeclaredMetadataString(
  metadata: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!(key in metadata)) return undefined
  const value = metadata[key]
  if (typeof value !== 'string') return null
  return readString(value, 256)
}

function transportForAdapter(value: string): DashScopeAsrTransport | null {
  if (value === 'dashscope-qwen-audio-asr') return QWEN_AUDIO_ASR_TRANSPORT
  if (value === 'dashscope-filetrans-asr') return 'filetrans'
  return null
}

function transportForModel(value: string): DashScopeAsrTransport | null {
  if (value === QWEN_AUDIO_ASR_MODEL) return QWEN_AUDIO_ASR_TRANSPORT
  if (value === FILETRANS_MODEL) return 'filetrans'
  return null
}

/** Reads every route declaration and rejects an internally inconsistent provider shape. */
function resolveDeclaredDashScopeAsrTransport(
  metadata: Record<string, unknown>,
): DashScopeAsrTransport | null {
  const declarations: DashScopeAsrTransport[] = []
  const addDeclaration = (value: DashScopeAsrTransport | null): void => {
    if (value) declarations.push(value)
  }
  const adapter = readDeclaredMetadataString(metadata, 'adapter')
  if (adapter === null) return null
  if (adapter !== undefined) {
    const resolved = transportForAdapter(adapter)
    if (!resolved) return null
    addDeclaration(resolved)
  }

  const transport = readDeclaredMetadataString(metadata, 'transport')
  if (transport === null) return null
  if (transport !== undefined) {
    if (transport !== QWEN_AUDIO_ASR_TRANSPORT && transport !== 'filetrans') return null
    addDeclaration(transport)
  }

  const defaultModel = readDeclaredMetadataString(metadata, 'defaultModel')
  if (defaultModel === null) return null
  if (defaultModel !== undefined) {
    const resolved = transportForModel(defaultModel)
    if (!resolved) return null
    addDeclaration(resolved)
  }
  if ('models' in metadata) {
    const rawModels = metadata.models
    if (!Array.isArray(rawModels) || rawModels.length === 0) return null
    const models = rawModels.map(model => (typeof model === 'string' ? model.trim() : ''))
    if (models.some(model => !model)) return null
    const modelTransports = new Set(models.map(transportForModel))
    if (modelTransports.has(null) || modelTransports.size !== 1) return null
    addDeclaration(transportForModel(models[0]!))
  }

  const unique = new Set(declarations)
  return unique.size === 1 ? declarations[0]! : null
}

/** Resolves the explicitly registered DashScope ASR transport; unknown shapes fail closed. */
export function resolveDashScopeAsrTransport(provider: ProviderRegistryRecord): DashScopeAsrTransport | null {
  if (!provider.metadata) return 'filetrans'
  return resolveDeclaredDashScopeAsrTransport(provider.metadata)
}

/** Returns the one model allowed by a resolved DashScope ASR transport. */
export function resolveDashScopeAsrModel(
  provider: ProviderRegistryRecord,
  transport: DashScopeAsrTransport,
): string | null {
  const expected = transport === QWEN_AUDIO_ASR_TRANSPORT ? QWEN_AUDIO_ASR_MODEL : FILETRANS_MODEL
  if (!provider.metadata) return expected
  if (resolveDeclaredDashScopeAsrTransport(provider.metadata) !== transport) return null
  return expected
}

function readProviderApiKey(value: Awaited<ReturnType<typeof getProviderCredential>>): string {
  if (!value || !('apiKey' in value) || typeof value.apiKey !== 'string' || !value.apiKey.trim())
    throw new DashScopeAsrError('ASR_PROVIDER_CONFIGURATION_INVALID', false)
  return value.apiKey.trim()
}

function resolveDashScopeBaseUrl(provider: ProviderRegistryRecord): URL {
  if (
    provider.vendor !== 'dashscope' ||
    provider.status !== 'enabled' ||
    provider.authType !== 'api_key' ||
    !provider.authRef
  ) {
    throw new DashScopeAsrError('ASR_PROVIDER_CONFIGURATION_INVALID', false)
  }
  try {
    const endpoint = new URL(provider.endpoint ?? '')
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw new Error('invalid endpoint')
    }
    endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') || '/api/v1'
    if (!endpoint.pathname.endsWith('/api/v1')) throw new Error('invalid endpoint')
    return endpoint
  } catch {
    throw new DashScopeAsrError('ASR_PROVIDER_CONFIGURATION_INVALID', false)
  }
}

function resolveTaskUrl(baseUrl: URL, path: string): string {
  const url = new URL(baseUrl.toString())
  url.pathname = `${baseUrl.pathname.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
  return url.toString()
}

async function readJson(response: Response): Promise<RecordValue | null> {
  try {
    return asRecord(await response.json())
  } catch {
    return null
  }
}

function extractTaskId(body: RecordValue | null): string | null {
  const output = asRecord(body?.output)
  const taskId = readString(output?.task_id, 255)
  return taskId && /^[A-Za-z0-9._:-]{1,255}$/.test(taskId) ? taskId : null
}

function extractTaskStatus(body: RecordValue | null): string | null {
  return readString(asRecord(body?.output)?.task_status, 64)?.toUpperCase() ?? null
}

function extractResultUrl(body: RecordValue | null): string | null {
  const output = asRecord(body?.output)
  const results = Array.isArray(output?.results) ? output.results : []
  const first = asRecord(results[0])
  const value = readString(first?.transcription_url, 2048)
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function extractTranscript(body: RecordValue | null): { transcript: string; billedSeconds: number } | null {
  const properties = asRecord(body?.properties)
  const durationMs = Number(properties?.original_duration_in_milliseconds)
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null

  const transcripts = Array.isArray(body?.transcripts) ? body.transcripts : []
  const text = transcripts
    .map(item => readString(asRecord(item)?.text))
    .filter((item): item is string => Boolean(item))
    .join('\n')
  if (!text) return null

  return {
    transcript: text,
    billedSeconds: durationMs / 1000,
  }
}

function normalizeQwenLanguageHint(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const language = value.trim().toLowerCase().split(/[-_]/, 1)[0] ?? ''
  if (!/^[a-z]{2,3}$/.test(language)) return undefined
  return language
}

function extractQwenAudioTranscript(body: RecordValue | null): string | null {
  const output = asRecord(body?.output)
  const nestedOutput = asRecord(output?.output)
  const directSentence = asRecord(output?.sentence)
  const nestedSentence = asRecord(nestedOutput?.sentence)
  return (
    readString(output?.text, 1_000_000) ??
    readString(directSentence?.text, 1_000_000) ??
    readString(nestedSentence?.text, 1_000_000) ??
    readString(nestedOutput?.text, 1_000_000)
  )
}

function extractQwenAudioRequestId(body: RecordValue | null): string | undefined {
  const value = readString(body?.request_id, 255)
  return value && /^[A-Za-z0-9._:-]{1,255}$/.test(value) ? value : undefined
}

function extractQwenAudioDuration(body: RecordValue | null, fallbackSeconds: number): number | null {
  const usage = asRecord(body?.usage)
  const duration = usage?.duration
  if (duration === undefined) return fallbackSeconds
  return typeof duration === 'number'
    && Number.isFinite(duration)
    && duration > 0
    && duration <= QWEN_AUDIO_ASR_MAX_DURATION_SECONDS
    ? duration
    : null
}

export interface DashScopeQwenAudioAsrTranscribeOptions {
  model?: string
  language?: string
  sampleRate?: number
  durationSeconds: number
  signal?: AbortSignal
}

/** DashScope's synchronous Qwen-Audio ASR endpoint used by Nexus-owned audio.stt. */
export class DashScopeQwenAudioAsrAdapter {
  private readonly fetcher: typeof fetch
  private readonly maxDataUriBytes: number
  private readonly requestTimeoutMs: number

  constructor(options: DashScopeQwenAudioAsrAdapterOptions = {}) {
    this.fetcher = options.fetch ?? fetch
    this.maxDataUriBytes =
      Number.isFinite(options.maxDataUriBytes) && (options.maxDataUriBytes ?? 0) > 0
        ? Math.floor(options.maxDataUriBytes!)
        : QWEN_AUDIO_ASR_MAX_DATA_URI_BYTES
    this.requestTimeoutMs =
      Number.isFinite(options.requestTimeoutMs) && (options.requestTimeoutMs ?? 0) > 0
        ? Math.min(Math.floor(options.requestTimeoutMs!), QWEN_AUDIO_ASR_MAX_TIMEOUT_MS)
        : QWEN_AUDIO_ASR_DEFAULT_TIMEOUT_MS
  }

  async transcribe(
    event: H3Event,
    provider: ProviderRegistryRecord,
    audio: Buffer,
    options: DashScopeQwenAudioAsrTranscribeOptions,
  ): Promise<DashScopeQwenAudioAsrTranscription> {
    const model = options.model?.trim() || QWEN_AUDIO_ASR_MODEL
    if (model !== QWEN_AUDIO_ASR_MODEL) {
      throw new DashScopeAsrError('ASR_PROVIDER_CONFIGURATION_INVALID', false)
    }
    if (!Buffer.isBuffer(audio) || audio.byteLength === 0) {
      throw new DashScopeAsrError('ASR_PROVIDER_CONFIGURATION_INVALID', false)
    }
    if (
      !Number.isFinite(options.durationSeconds) ||
      options.durationSeconds <= 0 ||
      options.durationSeconds > QWEN_AUDIO_ASR_MAX_DURATION_SECONDS
    ) {
      throw new DashScopeAsrError('ASR_PROVIDER_CONFIGURATION_INVALID', false)
    }

    const dataPrefix = QWEN_AUDIO_ASR_DATA_URI_PREFIX
    const maxRawBytes =
      Math.floor((this.maxDataUriBytes - Buffer.byteLength(dataPrefix)) / 4) * 3
    if (maxRawBytes <= 0 || audio.byteLength > maxRawBytes) {
      throw new DashScopeAsrError('ASR_AUDIO_TOO_LARGE', false)
    }
    const data = `${dataPrefix}${audio.toString('base64')}`
    if (Buffer.byteLength(data) > this.maxDataUriBytes) {
      throw new DashScopeAsrError('ASR_AUDIO_TOO_LARGE', false)
    }

    const baseUrl = resolveDashScopeBaseUrl(provider)
    const credential = await getProviderCredential(event, provider.authRef!)
    const apiKey = readProviderApiKey(credential)
    const language = normalizeQwenLanguageHint(options.language)
    const requestController = new AbortController()
    const callerSignal = options.signal
    const abortFromCaller = (): void => requestController.abort()
    if (callerSignal) {
      callerSignal.addEventListener('abort', abortFromCaller, { once: true })
      if (callerSignal.aborted) abortFromCaller()
    }
    const deadlineTimer = setTimeout(() => requestController.abort(), this.requestTimeoutMs)
    let response: Response
    let body: RecordValue | null
    try {
      response = await this.fetcher(resolveTaskUrl(baseUrl, 'services/aigc/multimodal-generation/generation'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-SSE': 'disable',
        },
        body: JSON.stringify({
          model,
          input: {
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'input_audio',
                    input_audio: { data },
                  },
                ],
              },
            ],
          },
          parameters: {
            format: 'wav',
            sample_rate: options.sampleRate ?? 16_000,
            ...(language ? { language_hints: [language] } : {}),
          },
        }),
        signal: requestController.signal,
      })
      body = await readJson(response)
    }
    catch {
      // A missing response may still mean DashScope accepted the request. The caller must not
      // replay it automatically, so this is marked accepted for the request state machine.
      throw new DashScopeAsrError('ASR_PROVIDER_UNAVAILABLE', true)
    }
    finally {
      clearTimeout(deadlineTimer)
      callerSignal?.removeEventListener('abort', abortFromCaller)
    }
    if (!response.ok) {
      const accepted = response.status === 408 || response.status >= 500
      throw new DashScopeAsrError(
        accepted ? 'ASR_PROVIDER_UNAVAILABLE' : 'ASR_PROVIDER_REJECTED',
        accepted,
      )
    }
    const transcript = extractQwenAudioTranscript(body)
    if (!transcript) throw new DashScopeAsrError('ASR_PROVIDER_RESPONSE_INVALID', true)

    const qwenRequestId = extractQwenAudioRequestId(body)
    const billedSeconds = extractQwenAudioDuration(body, options.durationSeconds)
    if (billedSeconds === null) {
      throw new DashScopeAsrError('ASR_PROVIDER_RESPONSE_INVALID', true)
    }
    return {
      transcript,
      billedSeconds,
      ...(qwenRequestId ? { requestId: qwenRequestId } : {}),
    }
  }
}

export function createDashScopeQwenAudioAsrAdapter(
  options: DashScopeQwenAudioAsrAdapterOptions = {},
): DashScopeQwenAudioAsrAdapter {
  return new DashScopeQwenAudioAsrAdapter(options)
}

export class DashScopeFiletransAdapter {
  private readonly fetcher: typeof fetch

  constructor(options: DashScopeFiletransAdapterOptions = {}) {
    this.fetcher = options.fetch ?? fetch
  }

  async submit(
    event: H3Event,
    provider: ProviderRegistryRecord,
    sourceUrl: string,
  ): Promise<DashScopeFiletransSubmission> {
    const baseUrl = resolveDashScopeBaseUrl(provider)
    const credential = await getProviderCredential(event, provider.authRef!)
    const apiKey = readProviderApiKey(credential)
    const response = await this.fetcher(resolveTaskUrl(baseUrl, 'services/audio/asr/transcription'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify({
        model: FILETRANS_MODEL,
        input: { file_urls: [sourceUrl] },
        parameters: { channel_id: [0] },
      }),
    }).catch(() => {
      throw new DashScopeAsrError('ASR_PROVIDER_UNAVAILABLE', false)
    })

    const body = await readJson(response)
    if (!response.ok) throw new DashScopeAsrError('ASR_PROVIDER_REJECTED', false)
    const taskId = extractTaskId(body)
    if (!taskId) throw new DashScopeAsrError('ASR_PROVIDER_RESPONSE_INVALID', false)
    return { taskId }
  }

  async getTask(event: H3Event, provider: ProviderRegistryRecord, taskId: string): Promise<DashScopeFiletransTask> {
    if (!/^[A-Za-z0-9._:-]{1,255}$/.test(taskId)) throw new DashScopeAsrError('ASR_PROVIDER_RESPONSE_INVALID', true)
    const baseUrl = resolveDashScopeBaseUrl(provider)
    const credential = await getProviderCredential(event, provider.authRef!)
    const apiKey = readProviderApiKey(credential)
    const taskResponse = await this.fetcher(resolveTaskUrl(baseUrl, `tasks/${encodeURIComponent(taskId)}`), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }).catch(() => {
      throw new DashScopeAsrError('ASR_PROVIDER_UNAVAILABLE', true)
    })
    const taskBody = await readJson(taskResponse)
    if (!taskResponse.ok) throw new DashScopeAsrError('ASR_PROVIDER_UNAVAILABLE', true)

    const status = extractTaskStatus(taskBody)
    if (status === 'PENDING' || status === 'RUNNING') return { status: 'pending' }
    if (status === 'FAILED') return { status: 'failed' }
    if (status !== 'SUCCEEDED') throw new DashScopeAsrError('ASR_PROVIDER_RESPONSE_INVALID', true)

    const transcriptionUrl = extractResultUrl(taskBody)
    if (!transcriptionUrl) throw new DashScopeAsrError('ASR_PROVIDER_RESPONSE_INVALID', true)
    const transcriptionResponse = await this.fetcher(transcriptionUrl).catch(() => {
      throw new DashScopeAsrError('ASR_PROVIDER_UNAVAILABLE', true)
    })
    const transcriptionBody = await readJson(transcriptionResponse)
    if (!transcriptionResponse.ok) throw new DashScopeAsrError('ASR_PROVIDER_UNAVAILABLE', true)
    const result = extractTranscript(transcriptionBody)
    if (!result) throw new DashScopeAsrError('ASR_PROVIDER_RESPONSE_INVALID', true)
    return { status: 'succeeded', ...result }
  }
}

export function createDashScopeFiletransAdapter(
  options: DashScopeFiletransAdapterOptions = {},
): DashScopeFiletransAdapter {
  return new DashScopeFiletransAdapter(options)
}

export function assertDashScopeProvider(provider: ProviderRegistryRecord | null): ProviderRegistryRecord {
  if (
    !provider ||
    provider.vendor !== 'dashscope' ||
    provider.status !== 'enabled' ||
    provider.authType !== 'api_key' ||
    !provider.authRef
  ) {
    throw createError({ statusCode: 503, statusMessage: 'DashScope ASR is unavailable.' })
  }
  if (!provider.capabilities.some(capability => capability.capability === 'audio.transcribe')) {
    throw createError({ statusCode: 503, statusMessage: 'DashScope ASR capability is unavailable.' })
  }
  return provider
}
