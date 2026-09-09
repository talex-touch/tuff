import type { VoiceAudioSpec, VoiceProviderEvent, VoiceSegment, VoiceStreamRequest, VoiceUsage } from '../contracts'
import { Buffer } from 'node:buffer'
import { VoiceProviderError } from '../contracts'

export const DASHSCOPE_QWEN_ASR_REALTIME_DEFAULT_MODEL = 'qwen3-asr-flash-realtime'
export const DASHSCOPE_QWEN_ASR_REALTIME_DEFAULT_REGION = 'cn-beijing'

export interface DashscopeCredentials {
  apiKey: string
  workspaceId?: string
}

export interface DashscopeQwenAsrRealtimeVadOptions {
  threshold?: number
  silenceDurationMs?: number
  prefixPaddingMs?: number
}

export interface DashscopeQwenAsrRealtimeRequestOptions {
  model?: string
  language?: string
  vad?: DashscopeQwenAsrRealtimeVadOptions
  providerOptions?: Readonly<Record<string, unknown>>
}

export type DashscopeQwenAsrRealtimeSessionOptions = DashscopeQwenAsrRealtimeRequestOptions

export interface DashscopeQwenAsrRealtimeSessionUpdateMessage {
  type: 'session.update'
  event_id: string
  session: Readonly<Record<string, unknown>>
}

export interface DashscopeQwenAsrRealtimeAudioAppendMessage {
  type: 'input_audio_buffer.append'
  event_id: string
  audio: string
}

export interface DashscopeQwenAsrRealtimeFinishMessage {
  type: 'session.finish'
  event_id: string
}

export interface DashscopeQwenAsrRealtimeAudioAppendOptions {
  eventId: string
}

export interface DashscopeQwenAsrRealtimeFinishOptions {
  eventId: string
}

type EventIdInput = string | DashscopeQwenAsrRealtimeAudioAppendOptions | DashscopeQwenAsrRealtimeFinishOptions

export function buildDashscopeQwenAsrRealtimeWebSocketUrl(
  workspaceId: string | undefined,
  model: string,
  region = DASHSCOPE_QWEN_ASR_REALTIME_DEFAULT_REGION,
): string {
  const safeModel = assertSafeId(model, 'DASHSCOPE_QWEN_ASR_REALTIME_MODEL_INVALID')
  const workspace = workspaceId?.trim()
  if (workspace && !/^[\w-]+$/.test(workspace)) {
    throw new VoiceProviderError('DASHSCOPE_WORKSPACE_INVALID', 'DashScope workspace id is invalid.')
  }
  if (!/^[\w-]+$/.test(region)) {
    throw new VoiceProviderError('DASHSCOPE_REGION_INVALID', 'DashScope region is invalid.')
  }
  const host = workspace ? `${workspace}.${region}.maas.aliyuncs.com` : 'dashscope.aliyuncs.com'
  return `wss://${host}/api-ws/v1/realtime?model=${encodeURIComponent(safeModel)}`
}

/** Alias with the shorter protocol name used by consumers configuring a model. */
export const buildQwenAsrRealtimeWebSocketUrl = buildDashscopeQwenAsrRealtimeWebSocketUrl

export function buildDashscopeQwenAsrRealtimeHeaders(
  credentials: DashscopeCredentials,
  userAgent = 'tuff-voice',
): Record<string, string> {
  const apiKey = credentials.apiKey.trim()
  if (!apiKey || /[\r\n]/.test(apiKey)) {
    throw new VoiceProviderError('DASHSCOPE_CREDENTIALS_MISSING', 'DashScope API key is missing or invalid.')
  }
  const safeUserAgent = userAgent.trim()
  if (!safeUserAgent || /[\r\n]/.test(safeUserAgent)) {
    throw new VoiceProviderError('DASHSCOPE_USER_AGENT_INVALID', 'DashScope user-agent is invalid.')
  }
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'user-agent': safeUserAgent,
  }
  const workspace = credentials.workspaceId?.trim()
  if (workspace) {
    if (!/^[\w-]+$/.test(workspace)) {
      throw new VoiceProviderError('DASHSCOPE_WORKSPACE_INVALID', 'DashScope workspace id is invalid.')
    }
    headers['X-DashScope-WorkSpace'] = workspace
  }
  return headers
}

export const buildQwenAsrRealtimeHeaders = buildDashscopeQwenAsrRealtimeHeaders

export function buildDashscopeQwenAsrRealtimeSessionUpdate(
  request: VoiceStreamRequest,
  options: DashscopeQwenAsrRealtimeSessionOptions = {},
): DashscopeQwenAsrRealtimeSessionUpdateMessage {
  const eventId = assertSafeId(request.requestId, 'VOICE_REQUEST_ID_INVALID')
  const language = toDashscopeLanguage(options.language ?? request.language)
  const vad = options.vad ?? {}
  const providerOptions = options.providerOptions ?? request.providerOptions
  const session: Record<string, unknown> = {
    ...(providerOptions ?? {}),
    modalities: ['text'],
    input_audio_format: 'pcm',
    sample_rate: request.audio.sampleRate,
    ...(language ? { input_audio_transcription: { language } } : { input_audio_transcription: {} }),
    turn_detection: {
      type: 'server_vad',
      threshold: vad.threshold ?? 0.0,
      silence_duration_ms: vad.silenceDurationMs ?? 400,
      prefix_padding_ms: vad.prefixPaddingMs ?? 300,
    },
  }
  return { type: 'session.update', event_id: eventId, session }
}

export function buildQwenAsrRealtimeSessionUpdate(
  request: VoiceStreamRequest,
  options: DashscopeQwenAsrRealtimeSessionOptions = {},
): DashscopeQwenAsrRealtimeSessionUpdateMessage {
  return buildDashscopeQwenAsrRealtimeSessionUpdate(request, options)
}

export function buildDashscopeQwenAsrRealtimeAudioAppend(
  pcm: Uint8Array,
  options: EventIdInput,
): DashscopeQwenAsrRealtimeAudioAppendMessage {
  if (pcm.byteLength === 0)
    throw new VoiceProviderError('DASHSCOPE_PCM_EMPTY', 'DashScope PCM chunk must not be empty.')
  return {
    type: 'input_audio_buffer.append',
    event_id: assertSafeId(readEventId(options), 'DASHSCOPE_EVENT_ID_INVALID'),
    audio: Buffer.from(pcm).toString('base64'),
  }
}

export const buildQwenAsrRealtimeAudioAppend = buildDashscopeQwenAsrRealtimeAudioAppend

export function buildDashscopeQwenAsrRealtimeFinish(options: EventIdInput): DashscopeQwenAsrRealtimeFinishMessage {
  return {
    type: 'session.finish',
    event_id: assertSafeId(readEventId(options), 'DASHSCOPE_EVENT_ID_INVALID'),
  }
}

export const buildQwenAsrRealtimeFinish = buildDashscopeQwenAsrRealtimeFinish

export function parseDashscopeQwenAsrRealtimeEvent(data: string | Uint8Array): VoiceProviderEvent | null {
  const raw = typeof data === 'string' ? data : Buffer.from(data).toString('utf8')
  let message: unknown
  try {
    message = JSON.parse(raw)
  }
  catch {
    return null
  }
  const root = asRecord(message)
  if (!root)
    return null
  const type = readText(root.type)
  const requestId = readRequestId(root)
  if (type === 'conversation.item.input_audio_transcription.text') {
    const text = readText(root.text)
    const stash = readText(root.stash)
    const visible = `${text}${stash}`.trim()
    if (!visible)
      return null
    return {
      type: 'partial',
      text: visible,
      ...(readText(root.language) ? { language: readText(root.language) } : {}),
      ...(requestId ? { requestId } : {}),
    }
  }
  if (type === 'conversation.item.input_audio_transcription.completed') {
    const transcript = readText(root.transcript) || readText(asRecord(root.input_audio_transcription)?.transcript)
    if (!transcript)
      return null
    const segments = parseSegments(root.segments ?? root.utterances)
    const language = readText(root.language) || readText(asRecord(root.input_audio_transcription)?.language)
    const usage = parseUsage(root.usage)
    return {
      type: 'final',
      text: transcript,
      ...(language ? { language } : {}),
      ...(segments.length > 0 ? { segments } : {}),
      ...(requestId ? { requestId } : {}),
      ...(usage ? { usage } : {}),
    }
  }
  if (type === 'session.finished') {
    const usage = parseUsage(root.usage)
    return { type: 'end', ...(requestId ? { requestId } : {}), ...(usage ? { usage } : {}) }
  }
  if (type === 'conversation.item.input_audio_transcription.failed' || type === 'error') {
    const error = asRecord(root.error)
    const code = readText(root.code) || readText(error?.code) || 'DASHSCOPE_QWEN_ASR_REALTIME_ERROR'
    const messageText
      = readText(root.message) || readText(error?.message) || 'DashScope Qwen ASR realtime request failed.'
    return {
      type: 'error',
      code,
      message: messageText,
      retryable: isRetryableError(code),
      ...(requestId ? { requestId } : {}),
    }
  }
  return null
}

export const parseQwenAsrRealtimeEvent = parseDashscopeQwenAsrRealtimeEvent

export function isDashscopeQwenAsrRealtimeReadyEvent(data: string | Uint8Array): boolean {
  const raw = typeof data === 'string' ? data : Buffer.from(data).toString('utf8')
  try {
    const root = asRecord(JSON.parse(raw))
    const type = readText(root?.type)
    return type === 'session.created' || type === 'session.updated'
  }
  catch {
    return false
  }
}

function toDashscopeLanguage(language: string | undefined): string | undefined {
  if (!language)
    return undefined
  const normalized = language.trim().toLowerCase()
  if (!normalized)
    return undefined
  return (
    (
      {
        'zh-cn': 'zh',
        'zh-hans': 'zh',
        'en-us': 'en',
        'ja-jp': 'ja',
        'ko-kr': 'ko',
        'yue-cn': 'yue',
      } as Record<string, string>
    )[normalized] ?? normalized
  )
}

function parseSegments(value: unknown): VoiceSegment[] {
  if (!Array.isArray(value))
    return []
  return value.flatMap((item) => {
    const row = asRecord(item)
    const text = readText(row?.text) || readText(row?.transcript)
    if (!text)
      return []
    const startMs = readFiniteNumber(row?.start_ms) ?? readFiniteNumber(row?.start_time) ?? 0
    const endMs = readFiniteNumber(row?.end_ms) ?? readFiniteNumber(row?.end_time) ?? startMs
    return [{ text, startMs, endMs }]
  })
}

function parseUsage(value: unknown): VoiceUsage | undefined {
  const usage = asRecord(value)
  if (!usage)
    return undefined
  const durationMs
    = readFiniteNumber(usage.duration_ms)
      ?? (readFiniteNumber(usage.duration_seconds) === undefined
        ? undefined
        : readFiniteNumber(usage.duration_seconds)! * 1000)
  const inputBytes = readFiniteNumber(usage.input_bytes)
  const inputTokens = readFiniteNumber(usage.input_tokens) ?? readFiniteNumber(usage.inputTokens)
  const outputTokens = readFiniteNumber(usage.output_tokens) ?? readFiniteNumber(usage.outputTokens)
  const totalTokens = readFiniteNumber(usage.total_tokens) ?? readFiniteNumber(usage.totalTokens)
  if (
    durationMs === undefined
    && inputBytes === undefined
    && inputTokens === undefined
    && outputTokens === undefined
    && totalTokens === undefined
  ) {
    return undefined
  }
  return {
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(inputBytes === undefined ? {} : { inputBytes }),
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  }
}

function readEventId(value: EventIdInput): string {
  return typeof value === 'string' ? value : value.eventId
}
function readRequestId(root: Record<string, unknown>): string | undefined {
  const error = asRecord(root.error)
  const value
    = readText(root.request_id) || readText(root.requestId) || readText(error?.request_id) || readText(error?.requestId)
  return value || undefined
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function assertSafeId(value: string, code: string): string {
  const normalized = value.trim()
  if (!normalized || normalized.length > 128 || /[\r\n]/.test(normalized))
    throw new VoiceProviderError(code, 'DashScope event identifier is invalid.')
  return normalized
}

function isRetryableError(code: string): boolean {
  return /429|5\d\d|rate[_-]?limit|thrott|timeout|temporar|unavailable/i.test(code)
}

export function dashscopeQwenAsrRealtimeAudioSpec(sampleRate = 16_000): VoiceAudioSpec {
  return { format: 'pcm', sampleRate, channels: 1, bitsPerSample: 16, codec: 'raw' }
}

export type DashscopeQwenAsrRealtimeEvent = VoiceProviderEvent
export type DashscopeQwenAsrRealtimeUsage = VoiceUsage
