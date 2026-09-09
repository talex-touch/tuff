import type { VoiceAudioSpec, VoiceProviderEvent, VoiceSegment, VoiceStreamRequest, VoiceUsage } from '../contracts'
import { Buffer } from 'node:buffer'
import { VoiceProviderError } from '../contracts'

export const BAILIAN_PARAFORMER_DEFAULT_MODEL = 'paraformer-realtime-v2'
export const BAILIAN_PARAFORMER_DEFAULT_REGION = 'cn-beijing'

export interface BailianCredentials {
  apiKey: string
  workspaceId?: string
}

export interface BailianRequestOptions {
  model?: string
  enableTimestamps?: boolean
  removeDisfluencies?: boolean
  semanticPunctuationEnabled?: boolean
  maxSentenceSilence?: number
  heartbeat?: boolean
  punctuationPredictionEnabled?: boolean
  inverseTextNormalizationEnabled?: boolean
  vocabularyId?: string
  providerOptions?: Readonly<Record<string, unknown>>
}

export function buildBailianWebSocketUrl(workspaceId?: string, region = BAILIAN_PARAFORMER_DEFAULT_REGION): string {
  const workspace = workspaceId?.trim()
  if (!workspace)
    return 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'
  if (!/^[\w-]+$/.test(workspace)) {
    throw new VoiceProviderError('BAILIAN_WORKSPACE_INVALID', 'Bailian workspace id is invalid.')
  }
  return `wss://${workspace}.${region}.maas.aliyuncs.com/api-ws/v1/inference`
}

export function buildBailianHeaders(credentials: BailianCredentials, userAgent = 'tuff-voice'): Record<string, string> {
  const apiKey = credentials.apiKey.trim()
  if (!apiKey)
    throw new VoiceProviderError('BAILIAN_CREDENTIALS_MISSING', 'Bailian API key is missing.')
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'user-agent': userAgent,
  }
  if (credentials.workspaceId?.trim())
    headers['X-DashScope-WorkSpace'] = credentials.workspaceId.trim()
  return headers
}

export function buildBailianRunTask(
  request: VoiceStreamRequest,
  options: BailianRequestOptions = {},
): Record<string, unknown> {
  const parameters: Record<string, unknown> = {
    format: request.audio.format,
    sample_rate: request.audio.sampleRate,
    ...(request.language ? { language_hints: [toBailianLanguage(request.language)] } : {}),
    ...(options.enableTimestamps === undefined ? {} : { timestamp_alignment_enabled: options.enableTimestamps }),
    ...(options.removeDisfluencies === undefined ? {} : { disfluency_removal_enabled: options.removeDisfluencies }),
    ...(options.semanticPunctuationEnabled === undefined
      ? {}
      : { semantic_punctuation_enabled: options.semanticPunctuationEnabled }),
    ...(options.maxSentenceSilence === undefined ? {} : { max_sentence_silence: options.maxSentenceSilence }),
    ...(options.heartbeat === undefined ? {} : { heartbeat: options.heartbeat }),
    ...(options.punctuationPredictionEnabled === undefined
      ? {}
      : { punctuation_prediction_enabled: options.punctuationPredictionEnabled }),
    ...(options.inverseTextNormalizationEnabled === undefined
      ? {}
      : { inverse_text_normalization_enabled: options.inverseTextNormalizationEnabled }),
    ...(options.vocabularyId ? { vocabulary_id: options.vocabularyId } : {}),
    ...options.providerOptions,
  }
  return {
    header: {
      action: 'run-task',
      task_id: request.requestId,
      streaming: 'duplex',
    },
    payload: {
      task_group: 'audio',
      task: 'asr',
      function: 'recognition',
      model: options.model ?? request.model,
      input: {},
      parameters,
    },
  }
}

export function buildBailianFinishTask(requestId: string): Record<string, unknown> {
  return {
    header: { action: 'finish-task', task_id: requestId, streaming: 'duplex' },
    payload: { input: {} },
  }
}

function toBailianLanguage(language: string): string {
  const normalized = language.trim().toLowerCase()
  const aliases: Record<string, string> = {
    'zh-cn': 'zh',
    'zh': 'zh',
    'en-us': 'en',
    'en': 'en',
    'ja-jp': 'ja',
    'ja': 'ja',
    'yue-cn': 'yue',
    'yue': 'yue',
    'ko-kr': 'ko',
    'ko': 'ko',
    'de-de': 'de',
    'de': 'de',
    'fr-fr': 'fr',
    'fr': 'fr',
    'ru': 'ru',
  }
  return aliases[normalized] ?? normalized
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function isBailianTaskStarted(data: string | Uint8Array): boolean {
  const raw = typeof data === 'string' ? data : Buffer.from(data).toString('utf8')
  try {
    const root = asRecord(JSON.parse(raw))
    return readText(asRecord(root?.header)?.event) === 'task-started'
  }
  catch {
    return false
  }
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseWords(value: unknown) {
  if (!Array.isArray(value))
    return undefined
  const words = value.flatMap((item) => {
    const row = asRecord(item)

    const text = readText(row?.text)
    const startMs = readNumber(row?.start_time)
    const endMs = readNumber(row?.end_time)
    if (!text || startMs === undefined || endMs === undefined)
      return []
    return [{ text, startMs, endMs }]
  })
  return words.length > 0 ? words : undefined
}

function parseSentence(value: unknown): VoiceSegment | undefined {
  const sentence = asRecord(value)
  if (!sentence)
    return undefined
  const text = readText(sentence.text)
  if (!text)
    return undefined
  const startMs = readNumber(sentence.begin_time) ?? 0
  const endMs = readNumber(sentence.end_time) ?? startMs
  const words = parseWords(sentence.words)
  const speaker = sentence.speaker_id
  return {
    text,
    startMs,
    endMs,
    ...(typeof sentence.sentence_end === 'boolean' ? { definite: sentence.sentence_end } : {}),
    ...(typeof speaker === 'string' || typeof speaker === 'number' ? { speaker: String(speaker) } : {}),
    ...(words ? { words } : {}),
  }
}

export function parseBailianEvent(data: string | Uint8Array): VoiceProviderEvent | null {
  const raw = typeof data === 'string' ? data : Buffer.from(data).toString('utf8')
  let message: unknown
  try {
    message = JSON.parse(raw)
  }
  catch {
    return null
  }
  const root = asRecord(message)
  const header = asRecord(root?.header)
  const payload = asRecord(root?.payload)
  const event = readText(header?.event)
  const requestId = readText(header?.task_id) || undefined
  if (event === 'task-started')
    return null
  if (event === 'task-failed') {
    return {
      type: 'error',
      code: readText(header?.error_code) || 'BAILIAN_TASK_FAILED',
      message: readText(header?.error_message) || 'Bailian ASR task failed.',
      retryable: false,
      ...(requestId ? { requestId } : {}),
    }
  }
  if (event === 'task-finished')
    return { type: 'end', ...(requestId ? { requestId } : {}) }
  if (event !== 'result-generated')
    return null

  const output = asRecord(payload?.output)
  const sentence = parseSentence(output?.sentence)
  if (!sentence)
    return null
  const sentenceEnd = sentence.definite === true
  const usageRecord = asRecord(output?.usage)
  const duration = readNumber(usageRecord?.duration)
  const usage: VoiceUsage | undefined = duration === undefined ? undefined : { durationMs: duration * 1000 }
  const language = readText(output?.language) || undefined
  if (sentenceEnd) {
    return {
      type: 'final',
      text: sentence.text,
      ...(language ? { language } : {}),
      segments: [sentence],
      ...(requestId ? { requestId } : {}),
      ...(usage ? { usage } : {}),
    }
  }
  return {
    type: 'partial',
    text: sentence.text,
    ...(language ? { language } : {}),
    segments: [sentence],
    ...(requestId ? { requestId } : {}),
  }
}

export function normalizeBailianUploadResult(body: unknown): VoiceRecognitionResultLike {
  const root = asRecord(body)
  const output = asRecord(root?.output) ?? root
  const results = Array.isArray(output?.results) ? output.results : []
  const first = asRecord(results[0]) ?? output
  const text = readText(first?.text) || readText(first?.transcript) || readText(first?.transcription)
  const language = readText(first?.language) || undefined
  const durationSeconds = readNumber(first?.duration)
  const durationMs
    = durationSeconds === undefined
      ? (readNumber(first?.content_duration) ?? readNumber(first?.original_duration))
      : durationSeconds * 1000
  const segments = parseUploadSegments(first?.sentences ?? first?.segments ?? first?.utterances)
  if (!text && segments.length === 0) {
    throw new VoiceProviderError('BAILIAN_RESULT_INVALID', 'Bailian upload response has no transcript.')
  }
  return {
    text: text || segments.map(segment => segment.text).join(''),
    ...(language ? { language } : {}),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(segments.length > 0 ? { segments } : {}),
    ...(typeof output?.task_id === 'string' ? { requestId: output.task_id } : {}),
  }
}

function parseUploadSegments(value: unknown): VoiceSegment[] {
  if (!Array.isArray(value))
    return []
  return value.flatMap((item) => {
    const row = asRecord(item)
    const text = readText(row?.text)
    if (!text)
      return []
    return [
      {
        text,
        startMs: readNumber(row?.begin_time) ?? readNumber(row?.start_time) ?? 0,
        endMs: readNumber(row?.end_time) ?? 0,
        ...(typeof row?.speaker_id === 'string' || typeof row?.speaker_id === 'number'
          ? { speaker: String(row.speaker_id) }
          : {}),
      },
    ]
  })
}

export interface VoiceRecognitionResultLike {
  text: string
  language?: string
  durationMs?: number
  segments?: readonly VoiceSegment[]
  requestId?: string
  usage?: VoiceUsage
}

export function bailianAudioSpec(format: VoiceAudioSpec['format'], sampleRate = 16_000): VoiceAudioSpec {
  return { format, sampleRate, channels: 1, bitsPerSample: 16 }
}
