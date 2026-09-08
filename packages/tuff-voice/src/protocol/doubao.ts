import type {
  VoiceAudioSpec,
  VoiceProviderEvent,
  VoiceSegment,
  VoiceStreamRequest,
  VoiceUsage,
} from '../contracts'
import { Buffer } from 'node:buffer'
import { gunzipSync, gzipSync } from 'node:zlib'
import { VoiceProviderError } from '../contracts'

const PROTOCOL_VERSION_V1 = 0b0001
const CLIENT_FULL_REQUEST = 0b0001
const CLIENT_AUDIO_ONLY_REQUEST = 0b0010
const SERVER_FULL_RESPONSE = 0b1001
const SERVER_ERROR_RESPONSE = 0b1111
const POS_SEQUENCE = 0b0001
const NEG_WITH_SEQUENCE = 0b0011
const JSON_SERIALIZATION = 0b0001
const GZIP_COMPRESSION = 0b0001

export interface DoubaoFrame {
  code: number
  isLastPackage: boolean
  sequence: number
  payloadSize: number
  payload?: Record<string, unknown>
}

export interface DoubaoCredentials {
  apiKey?: string
  appKey?: string
  accessKey?: string
  resourceId: string
}

export interface DoubaoUploadVariant {
  kind: 'standard' | 'fast' | 'idle'
  resourceId: string
  submitUrl?: string
  queryUrl?: string
  recognizeUrl?: string
}

export interface DoubaoRequestOptions {
  model?: string
  uid?: string
  enableNonstream?: boolean
  enableDdc?: boolean
  enableItn?: boolean
  enablePunctuation?: boolean
  showUtterances?: boolean
  enableSpeakerInfo?: boolean
  hotwords?: readonly string[]
  providerOptions?: Readonly<Record<string, unknown>>
}

export function buildDoubaoHeaders(
  credentials: DoubaoCredentials,
  requestId: string,
  connectId = requestId,
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Api-Resource-Id': credentials.resourceId,
    'X-Api-Request-Id': requestId,
    'X-Api-Connect-Id': connectId,
    'X-Api-Sequence': '-1',
  }
  if (credentials.apiKey?.trim()) {
    headers['X-Api-Key'] = credentials.apiKey.trim()
    return headers
  }
  if (credentials.appKey?.trim() && credentials.accessKey?.trim()) {
    headers['X-Api-App-Key'] = credentials.appKey.trim()
    headers['X-Api-Access-Key'] = credentials.accessKey.trim()
    return headers
  }
  throw new VoiceProviderError('DOUBAO_CREDENTIALS_MISSING', 'Doubao ASR credentials are missing.')
}

export function buildDoubaoStreamPayload(
  request: VoiceStreamRequest,
  options: DoubaoRequestOptions = {},
): Record<string, unknown> {
  const audio = {
    format: request.audio.format,
    codec: request.audio.codec ?? 'raw',
    rate: request.audio.sampleRate,
    bits: request.audio.bitsPerSample,
    channel: request.audio.channels,
    ...(request.language ? { language: request.language } : {}),
  }
  const requestBody: Record<string, unknown> = {
    model_name: options.model ?? request.model,
    enable_nonstream: options.enableNonstream ?? request.enableNonstream ?? false,
    enable_itn: options.enableItn ?? request.enableItn ?? true,
    enable_punc: options.enablePunctuation ?? request.enablePunctuation ?? true,
    enable_ddc: options.enableDdc ?? request.enableDdc ?? false,
    show_utterances: options.showUtterances ?? request.showUtterances ?? true,
    ...(options.enableSpeakerInfo === undefined ? {} : { enable_speaker_info: options.enableSpeakerInfo }),
    ...(request.heartbeat === undefined ? {} : { heartbeat: request.heartbeat }),
    ...options.providerOptions,
    ...(options.hotwords || request.hotwords
      ? { hotwords: (options.hotwords ?? request.hotwords ?? []).map(word => ({ word })) }
      : {}),
  }
  return {
    user: { uid: request.uid ?? 'tuff-voice' },
    audio,
    request: requestBody,
  }
}

export function encodeDoubaoFullRequest(payload: Record<string, unknown>, sequence = 1): Uint8Array {
  return encodeFrame(CLIENT_FULL_REQUEST, POS_SEQUENCE, sequence, Buffer.from(JSON.stringify(payload), 'utf8'))
}

export function encodeDoubaoAudioRequest(
  sequence: number,
  pcm: Uint8Array,
  isLast: boolean,
): Uint8Array {
  const signedSequence = isLast ? -Math.abs(sequence) : Math.abs(sequence)
  const flags = isLast ? NEG_WITH_SEQUENCE : POS_SEQUENCE
  return encodeFrame(CLIENT_AUDIO_ONLY_REQUEST, flags, signedSequence, Buffer.from(pcm))
}

function encodeFrame(messageType: number, flags: number, sequence: number, payload: Buffer): Uint8Array {
  const compressed = gzipSync(payload)
  const frame = Buffer.alloc(12 + compressed.length)
  frame[0] = (PROTOCOL_VERSION_V1 << 4) | 1
  frame[1] = (messageType << 4) | flags
  frame[2] = (JSON_SERIALIZATION << 4) | GZIP_COMPRESSION
  frame[3] = 0
  frame.writeInt32BE(sequence, 4)
  frame.writeUInt32BE(compressed.length, 8)
  compressed.copy(frame, 12)
  return frame
}

export function decodeDoubaoFrame(input: Uint8Array): DoubaoFrame {
  const message = Buffer.from(input)
  if (message.length < 4)
    throw new VoiceProviderError('DOUBAO_FRAME_INVALID', 'Doubao response frame is too short.')
  const headerSize = (message[0]! & 0x0F) * 4
  if (headerSize < 4 || message.length < headerSize) {
    throw new VoiceProviderError('DOUBAO_FRAME_INVALID', 'Doubao response header is invalid.')
  }

  const messageType = message[1]! >> 4
  const flags = message[1]! & 0x0F
  const serialization = message[2]! >> 4
  const compression = message[2]! & 0x0F
  let offset = headerSize
  const sequence = flags & 0x01 ? readInt32(message, offset) : 0
  if (flags & 0x01)
    offset += 4
  const isLastPackage = Boolean(flags & 0x02)
  let code = 0
  let payloadSize = 0

  if (messageType === SERVER_FULL_RESPONSE) {
    payloadSize = readUInt32(message, offset)
    offset += 4
  }
  else if (messageType === SERVER_ERROR_RESPONSE) {
    code = readInt32(message, offset)
    offset += 4
    payloadSize = readUInt32(message, offset)
    offset += 4
  }

  if (offset > message.length) {
    throw new VoiceProviderError('DOUBAO_FRAME_INVALID', 'Doubao response payload is truncated.')
  }

  let payloadBytes = message.subarray(offset)
  if (compression === GZIP_COMPRESSION) {
    try {
      payloadBytes = gunzipSync(payloadBytes)
    }
    catch (error) {
      throw new VoiceProviderError('DOUBAO_FRAME_INVALID', 'Doubao response compression is invalid.', { cause: error })
    }
  }
  let payload: Record<string, unknown> | undefined
  if (serialization === JSON_SERIALIZATION && payloadBytes.length > 0) {
    try {
      const parsed: unknown = JSON.parse(payloadBytes.toString('utf8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        payload = parsed as Record<string, unknown>
      }
    }
    catch (error) {
      throw new VoiceProviderError('DOUBAO_FRAME_INVALID', 'Doubao response JSON is invalid.', { cause: error })
    }
  }
  return { code, isLastPackage, sequence, payloadSize, ...(payload ? { payload } : {}) }
}

function readInt32(buffer: Buffer, offset: number): number {
  if (offset < 0 || offset + 4 > buffer.length) {
    throw new VoiceProviderError('DOUBAO_FRAME_INVALID', 'Doubao response sequence is truncated.')
  }
  return buffer.readInt32BE(offset)
}

function readUInt32(buffer: Buffer, offset: number): number {
  if (offset < 0 || offset + 4 > buffer.length) {
    throw new VoiceProviderError('DOUBAO_FRAME_INVALID', 'Doubao response payload size is truncated.')
  }
  return buffer.readUInt32BE(offset)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readSegments(result: Record<string, unknown>): VoiceSegment[] {
  const utterances = Array.isArray(result.utterances) ? result.utterances : []
  return utterances.flatMap((item) => {
    const row = asRecord(item)
    if (!row)
      return []
    const text = readText(row.text)
    if (!text)
      return []
    return [{
      text,
      startMs: typeof row.start_time === 'number' ? row.start_time : 0,
      endMs: typeof row.end_time === 'number' ? row.end_time : 0,
      ...(typeof row.definite === 'boolean' ? { definite: row.definite } : {}),
      ...(typeof asRecord(row.additions)?.speaker_id === 'string'
        ? { speaker: String(asRecord(row.additions)?.speaker_id) }
        : {}),
    }]
  })
}

function resultRecord(payload?: Record<string, unknown>): Record<string, unknown> | null {
  const result = asRecord(payload?.result)
  if (result)
    return result
  const results = Array.isArray(payload?.result) ? payload?.result : []
  return asRecord(results[0])
}

function resultText(result: Record<string, unknown>, segments: readonly VoiceSegment[]): string {
  const direct = readText(result.text)
  if (direct)
    return direct
  return segments.map(segment => segment.text).join('')
}

export function parseDoubaoResponse(frame: DoubaoFrame): VoiceProviderEvent | null {
  if (frame.code !== 0) {
    return {
      type: 'error',
      code: `DOUBAO_${frame.code}`,
      message: 'Doubao ASR request failed.',
      retryable: frame.code >= 50000000,
      requestId: readText(asRecord(frame.payload?.result)?.additions && asRecord(asRecord(frame.payload?.result)?.additions)?.log_id),
    }
  }
  const result = resultRecord(frame.payload)
  if (!result)
    return frame.isLastPackage ? { type: 'end' } : null
  const segments = readSegments(result)
  const text = resultText(result, segments)
  if (!text && frame.isLastPackage)
    return { type: 'end' }
  if (!text)
    return null
  const definite = segments.some(segment => segment.definite === true)
  const duration = asRecord(frame.payload?.audio_info)?.duration
  const usage: VoiceUsage | undefined = typeof duration === 'number' ? { durationMs: duration } : undefined
  const requestId = readText(asRecord(result.additions)?.log_id)
  const language = readText(result.language) || undefined
  if (frame.isLastPackage || definite) {
    return {
      type: 'final',
      text,
      ...(language ? { language } : {}),
      ...(segments.length > 0 ? { segments } : {}),
      ...(requestId ? { requestId } : {}),
      ...(usage ? { usage } : {}),
    }
  }
  return {
    type: 'partial',
    text,
    ...(language ? { language } : {}),
    ...(segments.length > 0 ? { segments } : {}),
    ...(requestId ? { requestId } : {}),
  }
}

export function normalizeDoubaoUploadResult(body: unknown): {
  result: Extract<VoiceProviderEvent, { type: 'final' }>
} {
  const root = asRecord(body)
  const payload = asRecord(root?.payload_msg) ?? root
  const frame: DoubaoFrame = {
    code: Number(root?.code ?? 0),
    isLastPackage: true,
    sequence: 0,
    payloadSize: 0,
    ...(payload ? { payload } : {}),
  }
  const event = parseDoubaoResponse(frame)
  if (!event || event.type !== 'final') {
    throw new VoiceProviderError('DOUBAO_RESULT_INVALID', 'Doubao upload response has no final transcript.')
  }
  return { result: event }
}

export function doubaoAudioSpec(format: VoiceAudioSpec['format'], sampleRate = 16_000): VoiceAudioSpec {
  return { format, sampleRate, channels: 1, bitsPerSample: 16, codec: 'raw' }
}
