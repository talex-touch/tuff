import type { H3Event } from 'h3'
import { createError } from 'h3'
import type { ProviderRegistryRecord } from './providerRegistryStore'
import { getProviderCredential } from './providerCredentialStore'

const FILETRANS_MODEL = 'qwen-audio-3.0-asr-flash-filetrans'

export class DashScopeAsrError extends Error {
  constructor(
    readonly code: 'ASR_PROVIDER_CONFIGURATION_INVALID' | 'ASR_PROVIDER_REJECTED' | 'ASR_PROVIDER_RESPONSE_INVALID' | 'ASR_PROVIDER_UNAVAILABLE',
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
  | { status: 'succeeded', transcript: string, billedSeconds: number }

function asRecord(value: unknown): RecordValue | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null)
    return null
  const record: RecordValue = {}
  for (const [key, item] of Object.entries(value))
    record[key] = item
  return record
}

function readString(value: unknown, maxLength = 16_384): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
    ? value.trim()
    : null
}

function readProviderApiKey(value: Awaited<ReturnType<typeof getProviderCredential>>): string {
  if (!value || !('apiKey' in value) || typeof value.apiKey !== 'string' || !value.apiKey.trim())
    throw new DashScopeAsrError('ASR_PROVIDER_CONFIGURATION_INVALID', false)
  return value.apiKey.trim()
}

function resolveDashScopeBaseUrl(provider: ProviderRegistryRecord): URL {
  if (provider.vendor !== 'dashscope' || provider.status !== 'enabled' || provider.authType !== 'api_key' || !provider.authRef) {
    throw new DashScopeAsrError('ASR_PROVIDER_CONFIGURATION_INVALID', false)
  }
  try {
    const endpoint = new URL(provider.endpoint ?? '')
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      throw new Error('invalid endpoint')
    }
    endpoint.pathname = endpoint.pathname.replace(/\/+$/, '') || '/api/v1'
    if (!endpoint.pathname.endsWith('/api/v1'))
      throw new Error('invalid endpoint')
    return endpoint
  }
  catch {
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
  }
  catch {
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
  if (!value)
    return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  }
  catch {
    return null
  }
}

function extractTranscript(body: RecordValue | null): { transcript: string, billedSeconds: number } | null {
  const properties = asRecord(body?.properties)
  const durationMs = Number(properties?.original_duration_in_milliseconds)
  if (!Number.isFinite(durationMs) || durationMs <= 0)
    return null

  const transcripts = Array.isArray(body?.transcripts) ? body.transcripts : []
  const text = transcripts
    .map(item => readString(asRecord(item)?.text))
    .filter((item): item is string => Boolean(item))
    .join('\n')
  if (!text)
    return null

  return {
    transcript: text,
    billedSeconds: durationMs / 1000,
  }
}

export class DashScopeFiletransAdapter {
  private readonly fetcher: typeof fetch

  constructor(options: DashScopeFiletransAdapterOptions = {}) {
    this.fetcher = options.fetch ?? fetch
  }

  async submit(event: H3Event, provider: ProviderRegistryRecord, sourceUrl: string): Promise<DashScopeFiletransSubmission> {
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
    if (!response.ok)
      throw new DashScopeAsrError('ASR_PROVIDER_REJECTED', false)
    const taskId = extractTaskId(body)
    if (!taskId)
      throw new DashScopeAsrError('ASR_PROVIDER_RESPONSE_INVALID', false)
    return { taskId }
  }

  async getTask(event: H3Event, provider: ProviderRegistryRecord, taskId: string): Promise<DashScopeFiletransTask> {
    if (!/^[A-Za-z0-9._:-]{1,255}$/.test(taskId))
      throw new DashScopeAsrError('ASR_PROVIDER_RESPONSE_INVALID', true)
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
    if (!taskResponse.ok)
      throw new DashScopeAsrError('ASR_PROVIDER_UNAVAILABLE', true)

    const status = extractTaskStatus(taskBody)
    if (status === 'PENDING' || status === 'RUNNING')
      return { status: 'pending' }
    if (status === 'FAILED')
      return { status: 'failed' }
    if (status !== 'SUCCEEDED')
      throw new DashScopeAsrError('ASR_PROVIDER_RESPONSE_INVALID', true)

    const transcriptionUrl = extractResultUrl(taskBody)
    if (!transcriptionUrl)
      throw new DashScopeAsrError('ASR_PROVIDER_RESPONSE_INVALID', true)
    const transcriptionResponse = await this.fetcher(transcriptionUrl).catch(() => {
      throw new DashScopeAsrError('ASR_PROVIDER_UNAVAILABLE', true)
    })
    const transcriptionBody = await readJson(transcriptionResponse)
    if (!transcriptionResponse.ok)
      throw new DashScopeAsrError('ASR_PROVIDER_UNAVAILABLE', true)
    const result = extractTranscript(transcriptionBody)
    if (!result)
      throw new DashScopeAsrError('ASR_PROVIDER_RESPONSE_INVALID', true)
    return { status: 'succeeded', ...result }
  }
}

export function createDashScopeFiletransAdapter(options: DashScopeFiletransAdapterOptions = {}): DashScopeFiletransAdapter {
  return new DashScopeFiletransAdapter(options)
}

export function assertDashScopeProvider(provider: ProviderRegistryRecord | null): ProviderRegistryRecord {
  if (!provider || provider.vendor !== 'dashscope' || provider.status !== 'enabled' || provider.authType !== 'api_key' || !provider.authRef) {
    throw createError({ statusCode: 503, statusMessage: 'DashScope ASR is unavailable.' })
  }
  if (!provider.capabilities.some(capability => capability.capability === 'audio.transcribe')) {
    throw createError({ statusCode: 503, statusMessage: 'DashScope ASR capability is unavailable.' })
  }
  return provider
}
