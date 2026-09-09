import type { Buffer } from 'node:buffer'

export type VoiceProviderKind = 'doubao' | 'bailian'
export type VoiceRecognitionMode = 'realtime' | 'stream' | 'upload'
export type VoiceAudioFormat = 'pcm' | 'wav' | 'mp3' | 'ogg' | 'opus' | 'speex' | 'aac' | 'amr' | 'm4a'

export interface VoiceAudioSpec {
  format: VoiceAudioFormat
  sampleRate: number
  channels: 1 | 2
  bitsPerSample: 16 | 24 | 32
  codec?: 'raw' | 'opus'
}

export interface VoiceProviderCredentials {
  apiKey?: string
  appKey?: string
  accessKey?: string
  resourceId?: string
  workspaceId?: string
}

export interface VoiceStreamRequest {
  model: string
  audio: VoiceAudioSpec
  language?: string
  requestId: string
  uid?: string
  enableDdc?: boolean
  enableItn?: boolean
  enablePunctuation?: boolean
  enableNonstream?: boolean
  showUtterances?: boolean
  heartbeat?: boolean
  hotwords?: readonly string[]
  providerOptions?: Readonly<Record<string, unknown>>
  signal?: AbortSignal
  timeoutMs?: number
}

export interface VoiceSegment {
  text: string
  startMs: number
  endMs: number
  speaker?: string
  definite?: boolean
  words?: readonly VoiceWord[]
}

export interface VoiceWord {
  text: string
  startMs: number
  endMs: number
}

export interface VoiceUsage {
  durationMs?: number
  inputBytes?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export type VoiceProviderEvent =
  | {
      type: 'partial'
      text: string
      language?: string
      segments?: readonly VoiceSegment[]
      requestId?: string
    }
  | {
      type: 'final'
      text: string
      language?: string
      segments?: readonly VoiceSegment[]
      requestId?: string
      usage?: VoiceUsage
    }
  | { type: 'metadata'; requestId?: string; usage?: VoiceUsage }
  | { type: 'end'; requestId?: string; usage?: VoiceUsage }
  | {
      type: 'error'
      code: string
      message: string
      retryable: boolean
      requestId?: string
    }

export interface VoiceStreamConnection {
  readonly ready: Promise<void>
  readonly events: AsyncIterable<VoiceProviderEvent>
  writePcm: (chunk: Buffer | Uint8Array) => Promise<void>
  end: () => Promise<void>
  abort: (reason?: string) => Promise<void>
}

export type VoiceUploadSource =
  | { kind: 'url'; url: string; format?: VoiceAudioFormat }
  | { kind: 'bytes'; bytes: Buffer | Uint8Array; format: VoiceAudioFormat; fileName?: string }

export interface VoiceUploadRequest {
  model: string
  source: VoiceUploadSource
  language?: string
  enableTimestamps?: boolean
  enableSpeakerDiarization?: boolean
  removeDisfluencies?: boolean
  requestId: string
  signal?: AbortSignal
  timeoutMs?: number
  providerOptions?: Readonly<Record<string, unknown>>
}

export interface VoiceRecognitionResult {
  text: string
  language?: string
  durationMs?: number
  segments?: readonly VoiceSegment[]
  requestId?: string
  usage?: VoiceUsage
}

export interface VoiceResolvedUploadSource {
  url: string
  release?: () => Promise<void> | void
}

export interface VoiceHttpResponse {
  status: number
  headers: Readonly<Record<string, string | undefined>>
  body: unknown
}

export interface VoiceHttpClient {
  request: (request: {
    method: 'GET' | 'POST'
    url: string
    headers?: Readonly<Record<string, string>>
    body?: string | Uint8Array
    signal?: AbortSignal
  }) => Promise<VoiceHttpResponse>
}

export interface VoiceSocket {
  readonly readyState: number
  send: (data: string | Uint8Array) => void
  close: (code?: number, reason?: string) => void
  onOpen: (handler: () => void) => void
  onMessage: (handler: (data: string | Uint8Array) => void) => void
  onError: (handler: (error: Error) => void) => void
  onClose: (handler: (code?: number, reason?: string) => void) => void
}

export interface VoiceSocketFactory {
  connect: (request: {
    url: string
    headers: Readonly<Record<string, string>>
    signal?: AbortSignal
  }) => Promise<VoiceSocket>
}

export interface VoiceProviderCapabilities {
  readonly stream: boolean
  readonly upload: boolean
  readonly formats: readonly VoiceAudioFormat[]
}

export interface VoiceProviderAdapter {
  readonly id: string
  readonly defaultStreamModel?: string
  readonly defaultUploadModel?: string
  readonly capabilities: VoiceProviderCapabilities
  createStream: (request: VoiceStreamRequest) => Promise<VoiceStreamConnection>
  transcribeUpload: (request: VoiceUploadRequest) => Promise<VoiceRecognitionResult>
}

export interface VoiceProviderRegistry {
  register: (provider: VoiceProviderAdapter) => void
  get: (id: string) => VoiceProviderAdapter | undefined
  list: () => readonly VoiceProviderAdapter[]
  resolve: (mode: VoiceRecognitionMode, preferredId?: string) => VoiceProviderAdapter
}

export class VoiceProviderError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly requestId?: string

  constructor(
    code: string,
    message: string,
    options: { retryable?: boolean; requestId?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'VoiceProviderError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.requestId = options.requestId
  }
}

export function assertVoiceProviderRequestId(requestId: string): string {
  const value = requestId.trim()
  if (!value || value.length > 128 || /[\r\n]/.test(value)) {
    throw new VoiceProviderError('VOICE_REQUEST_ID_INVALID', 'Voice request id is invalid.')
  }
  return value
}

export function assertVoiceUploadUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new VoiceProviderError('VOICE_UPLOAD_URL_INVALID', 'Voice upload URL is invalid.')
  }
  if (parsed.protocol !== 'https:') {
    throw new VoiceProviderError('VOICE_UPLOAD_URL_INVALID', 'Voice upload URL must use HTTPS.')
  }
  return parsed.toString()
}
