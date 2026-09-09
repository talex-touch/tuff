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

function decodeAudio(audio: IntelligenceSTTPayload['audio']): Uint8Array {
  if (audio instanceof ArrayBuffer) return new Uint8Array(audio)
  if (typeof audio !== 'string') {
    throw createError('INVALID_REQUEST', 'Only a WAV body or audio/wav data URL is supported.')
  }
  if (audio.length > Math.ceil((MAX_AUDIO_BYTES * 4) / 3) + 64) {
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

function validateWav(payload: IntelligenceSTTPayload): Uint8Array {
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
  const bytes = decodeAudio(payload.audio)
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AUDIO_BYTES || bytes.byteLength < 44) {
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
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_AUDIO_SECONDS) {
    throw createError('INVALID_REQUEST', 'WAV audio exceeds the duration limit.')
  }
  return bytes
}
function readBilling(response: NexusAudioResponse, requestId: string): IntelligenceSTTBilling {
  if (
    response.requestId !== requestId ||
    typeof response.creditsCharged !== 'number' ||
    !Number.isSafeInteger(response.creditsCharged) ||
    response.creditsCharged <= 0 ||
    typeof response.billedSeconds !== 'number' ||
    !Number.isFinite(response.billedSeconds) ||
    response.billedSeconds <= 0 ||
    response.billedSeconds > MAX_AUDIO_SECONDS
  ) {
    throw createError('INVALID_REQUEST', 'Nexus returned an invalid settled billing receipt.')
  }
  return {
    requestId,
    creditsCharged: response.creditsCharged,
    billedSeconds: response.billedSeconds
  }
}

function settledResult(response: NexusAudioResponse, requestId: string): IntelligenceSTTResult {
  if (
    typeof response.transcript !== 'string' ||
    response.transcript.trim().length === 0 ||
    response.transcript.length > MAX_TRANSCRIPT_LENGTH
  ) {
    throw createError('INVALID_REQUEST', 'Nexus settled without a valid transcript.')
  }
  return { text: response.transcript, billing: readBilling(response, requestId) }
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
  options: { signal?: AbortSignal; timeout?: number } = {}
): Promise<IntelligenceSTTResult> {
  const bytes = validateWav(payload)
  const configuredTimeout =
    typeof options.timeout === 'number' && Number.isFinite(options.timeout) && options.timeout > 0
      ? Math.floor(options.timeout)
      : MAX_POLL_DEADLINE_MS
  const deadlineMs = Math.min(configuredTimeout, MAX_POLL_DEADLINE_MS)
  const deadlineController = new AbortController()
  const timer = setTimeout(() => deadlineController.abort(), deadlineMs)
  const signal = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    deadlineController.signal
  ])
  const baseUrl = getRuntimeNexusBaseUrl()
  const key = randomUUID()
  try {
    throwIfAborted(signal)
    const submit = await performNexusRequestWithAuth(
      {
        path: '/api/v1/ai/audio/transcribe',
        method: 'POST',
        headers: { 'Content-Type': 'audio/wav', 'X-Idempotency-Key': key },
        body: bytes
      },
      { signal, timeoutMs: deadlineMs, trustedBaseUrl: baseUrl, rejectRedirects: true }
    )
    throwIfAborted(signal)
    if (!submit) throw createError('NEXUS_AUTH_REQUIRED', 'Nexus requires a signed-in account.')
    if (submit.status < 200 || submit.status >= 300) throw mapHttpError(submit.status)
    const initial = parseResponse(submit.body)
    const requestId = normalizeRequestId(initial.requestId)
    let state = normalizeState(initial.status)
    if (state === 'released' || state === 'failed') terminalFailure(initial, state)
    while (true) {
      await waitForPoll(signal, POLL_INTERVAL_MS)
      const response = await performNexusRequestWithAuth(
        {
          path: `/api/v1/ai/audio/transcriptions/${encodeURIComponent(requestId)}`,
          method: 'GET'
        },
        {
          signal,
          timeoutMs: Math.max(100, deadlineMs),
          trustedBaseUrl: baseUrl,
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
      if (state === 'settled') return settledResult(parsed, requestId)
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
