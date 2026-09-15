import type { VoiceProviderDescriptorV1 } from '@talex-touch/utils/i18n'
import type { IntelligenceSTTPayload, IntelligenceSTTResult } from '@talex-touch/tuff-intelligence'
import type { IntelligenceSTTBilling } from '@talex-touch/utils/types/intelligence'
import {
  isIntelligenceErrorCode,
  type IntelligenceErrorCode
} from '@talex-touch/utils/transport/events/types'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { performNexusRequestWithAuth } from '../auth'
import { getRuntimeNexusBaseUrl } from './runtime-base'

const MAX_AUDIO_BYTES = 20 * 1024 * 1024
const MAX_AUDIO_SECONDS = 600
const MAX_POLL_DEADLINE_MS = 10 * 60 * 1000
const POLL_INTERVAL_MS = 500
const MAX_TRANSCRIPT_LENGTH = 1_000_000
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/
const IDEMPOTENCY_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface TranscribeNexusAudioOptions {
  readonly signal?: AbortSignal
  readonly timeout?: number
  readonly idempotencyKey?: string
  /** Frozen, normalized route from the active signed voice-provider catalog. */
  readonly route?: VoiceProviderDescriptorV1
}

interface ResolvedNexusAudioRoute {
  readonly baseUrl: string
  readonly submitPath: string
  readonly pollPath: string
  readonly headers: Readonly<Record<string, string>>
  readonly idempotencyHeader: string
  readonly maxAudioBytes: number
  readonly maxAudioSeconds: number
  readonly timeoutMs: number
  readonly absoluteUrl: boolean
}
const SUPPORTED_STATES = new Set([
  'pending',
  'reserved',
  'dispatching',
  'settled',
  'released',
  'failed'
])

type NexusAudioResponse = {
  requestId?: unknown
  status?: unknown
  creditsCharged?: unknown
  billedSeconds?: unknown
  failureCode?: unknown
  transcript?: unknown
}

type NexusError = Error & {
  code?: IntelligenceErrorCode
  reason?: string
}

function createError(code: IntelligenceErrorCode, reason: string): NexusError {
  const error = new Error(reason) as NexusError
  error.code = code
  error.reason = reason
  return error
}

function isNexusError(value: unknown): value is NexusError {
  return (
    value instanceof Error &&
    typeof (value as NexusError).code === 'string' &&
    isIntelligenceErrorCode((value as NexusError).code)
  )
}

function resolveIdempotencyKey(value: unknown): string {
  return typeof value === 'string' && IDEMPOTENCY_KEY_PATTERN.test(value) ? value : randomUUID()
}

function mapHttpError(status: number): NexusError {
  if (status === 401)
    return createError('NEXUS_AUTH_REQUIRED', 'Nexus requires a signed-in account.')
  if (status === 402 || status === 429)
    return createError('QUOTA_EXHAUSTED', 'Nexus credits are insufficient or unavailable.')
  if (status === 403)
    return createError('PERMISSION_DENIED', 'This Nexus capability is not permitted.')
  if (status === 404)
    return createError('PROVIDER_UNAVAILABLE', 'Nexus transcription capability is unavailable.')
  if (status === 409)
    return createError('INVALID_REQUEST', 'Nexus rejected the transcription request as a conflict.')
  if (status >= 400 && status < 500)
    return createError('INVALID_REQUEST', 'Nexus rejected the transcription request.')
  return createError(
    'NETWORK_FAILURE',
    'Nexus transcription request failed before a valid response.'
  )
}

function resolveAudioRoute(descriptor?: VoiceProviderDescriptorV1): ResolvedNexusAudioRoute {
  if (!descriptor) {
    return {
      baseUrl: getRuntimeNexusBaseUrl(),
      submitPath: '/api/v1/ai/audio/transcribe',
      pollPath: '/api/v1/ai/audio/transcriptions/:requestId',
      headers: {},
      idempotencyHeader: 'X-Idempotency-Key',
      maxAudioBytes: MAX_AUDIO_BYTES,
      maxAudioSeconds: MAX_AUDIO_SECONDS,
      timeoutMs: MAX_POLL_DEADLINE_MS,
      absoluteUrl: false
    }
  }

  if (
    descriptor.protocol !== 'nexus-pack' ||
    descriptor.transport !== 'http-upload' ||
    descriptor.auth.mode !== 'nexus-session' ||
    descriptor.request.body !== 'raw-bytes' ||
    descriptor.request.contentTypePolicy !== 'audio/*' ||
    descriptor.request.idempotencyHeader !== 'x-idempotency-key' ||
    !descriptor.endpoint.pollPath
  ) {
    throw createError('INVALID_REQUEST', 'The active voice catalog route is unsupported.')
  }

  let baseUrl: URL
  try {
    baseUrl = new URL(descriptor.endpoint.baseUrl)
  } catch {
    throw createError('INVALID_REQUEST', 'The active voice catalog endpoint is invalid.')
  }
  if (
    baseUrl.protocol !== 'https:' ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw createError('INVALID_REQUEST', 'The active voice catalog endpoint is invalid.')
  }

  const limits = descriptor.limits
  if (
    !Number.isSafeInteger(limits.maxBytes) ||
    limits.maxBytes <= 0 ||
    !Number.isSafeInteger(limits.maxDurationSec) ||
    limits.maxDurationSec <= 0 ||
    !Number.isSafeInteger(limits.timeoutMs) ||
    limits.timeoutMs <= 0
  ) {
    throw createError('INVALID_REQUEST', 'The active voice catalog limits are invalid.')
  }

  return {
    baseUrl: descriptor.endpoint.baseUrl,
    submitPath: descriptor.endpoint.submitPath,
    pollPath: descriptor.endpoint.pollPath,
    headers: descriptor.request.headers ?? {},
    idempotencyHeader: descriptor.request.idempotencyHeader,
    maxAudioBytes: Math.min(limits.maxBytes, MAX_AUDIO_BYTES),
    maxAudioSeconds: Math.min(limits.maxDurationSec, MAX_AUDIO_SECONDS),
    timeoutMs: Math.min(limits.timeoutMs, MAX_POLL_DEADLINE_MS),
    absoluteUrl: true
  }
}

function requestTarget(
  route: ResolvedNexusAudioRoute,
  path: string
): { readonly path: string } | { readonly url: string } {
  return route.absoluteUrl ? { url: new URL(path, route.baseUrl).toString() } : { path }
}

function submitHeaders(route: ResolvedNexusAudioRoute, idempotencyKey: string) {
  const headers: Record<string, string> = { ...route.headers }
  delete headers['content-type']
  delete headers[route.idempotencyHeader.toLowerCase()]
  headers['Content-Type'] = 'audio/wav'
  headers[route.idempotencyHeader] = idempotencyKey
  return headers
}

function pollHeaders(route: ResolvedNexusAudioRoute): Readonly<Record<string, string>> | undefined {
  const headers: Record<string, string> = { ...route.headers }
  delete headers['content-type']
  delete headers[route.idempotencyHeader.toLowerCase()]
  return Object.keys(headers).length ? headers : undefined
}

function parseResponse(text: string): NexusAudioResponse {
  if (typeof text !== 'string' || text.length > 2_000_000) {
    throw createError('INVALID_REQUEST', 'Nexus returned an invalid transcription response.')
  }
  try {
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error()
    }
    return value as NexusAudioResponse
  } catch {
    throw createError('INVALID_REQUEST', 'Nexus returned an invalid transcription response.')
  }
}

function normalizeRequestId(value: unknown): string {
  if (typeof value !== 'string' || !REQUEST_ID_PATTERN.test(value)) {
    throw createError('INVALID_REQUEST', 'Nexus returned an invalid transcription request id.')
  }
  return value
}

function normalizeState(value: unknown): string {
  if (typeof value !== 'string' || !SUPPORTED_STATES.has(value)) {
    throw createError('INVALID_REQUEST', 'Nexus returned an invalid transcription state.')
  }
  return value
}

function decodeAudio(audio: IntelligenceSTTPayload['audio'], maxAudioBytes: number): Uint8Array {
  if (audio instanceof ArrayBuffer) return new Uint8Array(audio)
  if (typeof audio !== 'string') {
    throw createError('INVALID_REQUEST', 'Only a WAV body or audio/wav data URL is supported.')
  }
  if (audio.length > Math.ceil((maxAudioBytes * 4) / 3) + 64) {
    throw createError('INVALID_REQUEST', 'WAV audio exceeds the size limit.')
  }
  const match = /^data:audio\/wav;base64,([A-Za-z0-9+/]+={0,2})$/.exec(audio.trim())
  if (!match)
    throw createError('INVALID_REQUEST', 'Only a WAV body or audio/wav data URL is supported.')
  try {
    const decoded = Buffer.from(match[1], 'base64')
    if (
      !decoded.length ||
      decoded.toString('base64').replace(/=+$/, '') !== match[1].replace(/=+$/, '')
    ) {
      throw new Error()
    }
    return new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength)
  } catch {
    throw createError('INVALID_REQUEST', 'The WAV data URL is invalid.')
  }
}

function validateWav(payload: IntelligenceSTTPayload, route: ResolvedNexusAudioRoute): Uint8Array {
  if (!payload || typeof payload !== 'object') {
    throw createError('INVALID_REQUEST', 'A WAV transcription payload is required.')
  }
  if (
    payload.format !== undefined &&
    (typeof payload.format !== 'string' || payload.format.toLowerCase() !== 'wav')
  ) {
    throw createError('INVALID_REQUEST', 'Only WAV audio is supported.')
  }
  if (payload.enableTimestamps || payload.enableSpeakerDiarization) {
    throw createError('INVALID_REQUEST', 'Requested transcription options are unsupported.')
  }
  const bytes = decodeAudio(payload.audio, route.maxAudioBytes)
  if (bytes.byteLength === 0 || bytes.byteLength > route.maxAudioBytes || bytes.byteLength < 44) {
    throw createError('INVALID_REQUEST', 'WAV audio is empty or exceeds the size limit.')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
    throw createError('INVALID_REQUEST', 'The audio body is not a RIFF WAV file.')
  }
  let offset = 12
  let format: {
    channels: number
    sampleRate: number
    bits: number
    encoding: number
    byteRate: number
    blockAlign: number
  } | null = null
  let dataBytes = 0
  let chunks = 0
  while (offset + 8 <= bytes.byteLength && chunks++ < 64) {
    const id = view.getUint32(offset, false)
    const size = view.getUint32(offset + 4, true)
    offset += 8
    if (size > bytes.byteLength - offset)
      throw createError('INVALID_REQUEST', 'The WAV envelope is malformed.')
    if (id === 0x666d7420 && size >= 16 && !format) {
      format = {
        encoding: view.getUint16(offset, true),
        channels: view.getUint16(offset + 2, true),
        sampleRate: view.getUint32(offset + 4, true),
        byteRate: view.getUint32(offset + 8, true),
        blockAlign: view.getUint16(offset + 12, true),
        bits: view.getUint16(offset + 14, true)
      }
    } else if (id === 0x64617461) {
      dataBytes = size
    }
    offset += size + (size & 1)
  }
  if (
    !format ||
    dataBytes <= 0 ||
    (format.encoding !== 1 && format.encoding !== 3) ||
    format.channels < 1 ||
    format.channels > 2 ||
    format.sampleRate < 1 ||
    format.sampleRate > 192000 ||
    ![8, 16, 24, 32].includes(format.bits) ||
    format.blockAlign !== format.channels * (format.bits / 8) ||
    format.byteRate !== format.sampleRate * format.blockAlign
  ) {
    throw createError('INVALID_REQUEST', 'The WAV envelope is unsupported.')
  }
  const bytesPerSample = format.bits / 8
  const duration = dataBytes / (format.sampleRate * format.channels * bytesPerSample)
  if (!Number.isFinite(duration) || duration <= 0 || duration > route.maxAudioSeconds) {
    throw createError('INVALID_REQUEST', 'WAV audio exceeds the duration limit.')
  }
  return bytes
}

function readBilling(
  response: NexusAudioResponse,
  requestId: string,
  maxAudioSeconds: number
): IntelligenceSTTBilling {
  if (
    response.requestId !== requestId ||
    typeof response.creditsCharged !== 'number' ||
    !Number.isSafeInteger(response.creditsCharged) ||
    response.creditsCharged <= 0 ||
    typeof response.billedSeconds !== 'number' ||
    !Number.isFinite(response.billedSeconds) ||
    response.billedSeconds <= 0 ||
    response.billedSeconds > maxAudioSeconds
  ) {
    throw createError('INVALID_REQUEST', 'Nexus returned an invalid settled billing receipt.')
  }
  return {
    requestId,
    creditsCharged: response.creditsCharged,
    billedSeconds: response.billedSeconds
  }
}

function settledResult(
  response: NexusAudioResponse,
  requestId: string,
  maxAudioSeconds: number
): IntelligenceSTTResult {
  if (
    typeof response.transcript !== 'string' ||
    response.transcript.trim().length === 0 ||
    response.transcript.length > MAX_TRANSCRIPT_LENGTH
  ) {
    throw createError('INVALID_REQUEST', 'Nexus settled without a valid transcript.')
  }
  return { text: response.transcript, billing: readBilling(response, requestId, maxAudioSeconds) }
}

function terminalFailure(response: NexusAudioResponse, status: string): never {
  const failureCode =
    typeof response.failureCode === 'string' && /^[A-Za-z0-9_.:-]{1,96}$/.test(response.failureCode)
      ? response.failureCode
      : ''
  if (isIntelligenceErrorCode(failureCode)) {
    throw createError(failureCode, `Nexus transcription reached terminal state ${status}.`)
  }
  throw createError(
    'UNKNOWN',
    `Nexus transcription reached terminal state ${status}${failureCode ? ` (${failureCode})` : ''}.`
  )
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw createError(
      'NETWORK_FAILURE',
      'Nexus transcription was cancelled or exceeded its deadline.'
    )
}

async function waitForPoll(signal: AbortSignal, ms: number): Promise<void> {
  throwIfAborted(signal)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(
        createError(
          'NETWORK_FAILURE',
          'Nexus transcription was cancelled or exceeded its deadline.'
        )
      )
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export async function transcribeNexusAudio(
  payload: IntelligenceSTTPayload,
  options: TranscribeNexusAudioOptions = {}
): Promise<IntelligenceSTTResult> {
  const route = resolveAudioRoute(options.route)
  const bytes = validateWav(payload, route)
  const configuredTimeout =
    typeof options.timeout === 'number' && Number.isFinite(options.timeout) && options.timeout > 0
      ? Math.floor(options.timeout)
      : route.timeoutMs
  const deadlineMs = Math.min(configuredTimeout, route.timeoutMs, MAX_POLL_DEADLINE_MS)
  const deadlineController = new AbortController()
  const timer = setTimeout(() => deadlineController.abort(), deadlineMs)
  const signal = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    deadlineController.signal
  ])
  const key = resolveIdempotencyKey(options.idempotencyKey)
  try {
    throwIfAborted(signal)
    const submit = await performNexusRequestWithAuth(
      {
        ...requestTarget(route, route.submitPath),
        method: 'POST',
        headers: submitHeaders(route, key),
        body: bytes,
        context: options.route ? 'voice.asr.catalog-pack' : 'voice.asr.builtin'
      },
      {
        signal,
        timeoutMs: deadlineMs,
        trustedBaseUrl: route.baseUrl,
        rejectRedirects: true
      }
    )
    throwIfAborted(signal)
    if (!submit) throw createError('NEXUS_AUTH_REQUIRED', 'Nexus requires a signed-in account.')
    if (submit.status < 200 || submit.status >= 300) throw mapHttpError(submit.status)
    const initial = parseResponse(submit.body)
    const requestId = normalizeRequestId(initial.requestId)
    let state = normalizeState(initial.status)
    if (
      state === 'settled' &&
      typeof initial.transcript === 'string' &&
      initial.transcript.trim()
    ) {
      return settledResult(initial, requestId, route.maxAudioSeconds)
    }
    if (state === 'released' || state === 'failed') terminalFailure(initial, state)
    while (true) {
      await waitForPoll(signal, POLL_INTERVAL_MS)
      const pollPath = route.pollPath.replaceAll(':requestId', encodeURIComponent(requestId))
      const headers = pollHeaders(route)
      const response = await performNexusRequestWithAuth(
        {
          ...requestTarget(route, pollPath),
          method: 'GET',
          ...(headers ? { headers } : {}),
          context: options.route ? 'voice.asr.catalog-pack' : 'voice.asr.builtin'
        },
        {
          signal,
          timeoutMs: Math.max(100, deadlineMs),
          trustedBaseUrl: route.baseUrl,
          rejectRedirects: true
        }
      )
      throwIfAborted(signal)
      if (!response) throw createError('NEXUS_AUTH_REQUIRED', 'Nexus requires a signed-in account.')
      if (response.status < 200 || response.status >= 300) throw mapHttpError(response.status)
      const parsed = parseResponse(response.body)
      if (normalizeRequestId(parsed.requestId) !== requestId) {
        throw createError('INVALID_REQUEST', 'Nexus returned an invalid transcription request.')
      }
      state = normalizeState(parsed.status)
      if (state === 'settled') {
        return settledResult(parsed, requestId, route.maxAudioSeconds)
      }
      if (state === 'released' || state === 'failed') terminalFailure(parsed, state)
    }
  } catch (error) {
    if (isNexusError(error)) throw error
    if (signal.aborted) {
      throw createError(
        'NETWORK_FAILURE',
        'Nexus transcription was cancelled or exceeded its deadline.'
      )
    }
    throw createError(
      'NETWORK_FAILURE',
      'Nexus transcription request failed before a valid response.'
    )
  } finally {
    clearTimeout(timer)
  }
}
