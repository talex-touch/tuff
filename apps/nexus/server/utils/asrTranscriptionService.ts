import { Buffer } from 'node:buffer'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { consumeCredits, releaseConsumedCredits } from './creditsStore'
import { DashScopeAsrError, createDashScopeFiletransAdapter, assertDashScopeProvider, type DashScopeFiletransAdapter } from './dashscopeAsrProvider'
import { getProviderRegistryEntry, listProviderRegistryEntries } from './providerRegistryStore'
import {
  ASR_AUDIO_MAX_BYTES,
  calculateFiletransCredits,
  calculateFiletransProviderCost,
  createAsrRequest,
  deleteAsrHandoffObject,
  getAsrRequest,
  markAsrDispatching,
  markAsrFailed,
  markAsrReleased,
  markAsrReserved,
  markAsrSettled,
  normalizeAsrContentType,
  normalizeAsrIdempotencyKey,
  parseWavDurationSeconds,
  toAsrSafeStatus,
  type AsrRequestRecord,
} from './asrTranscriptionStore'

export interface StartAsrTranscriptionInput {
  audio: Buffer
  contentType: unknown
  idempotencyKey: unknown
}

export interface AsrTranscriptionResponse {
  requestId: string
  status: 'dispatching' | 'settled' | 'released' | 'failed' | 'pending' | 'reserved'
  creditsCharged: number | null
  billedSeconds: number | null
  failureCode: string | null
  transcript?: string
}

interface AsrServiceOptions {
  adapter?: DashScopeFiletransAdapter
}

function createAsrServiceError(code: string, statusCode: number): Error {
  return createError({ statusCode, statusMessage: code, data: { errorCode: code } })
}

function asClientResponse(request: AsrRequestRecord, transcript?: string): AsrTranscriptionResponse {
  return {
    ...toAsrSafeStatus(request),
    ...(transcript ? { transcript } : {}),
  }
}

async function resolveDashScopeAsrProvider(event: H3Event) {
  const providers = await listProviderRegistryEntries(event, { vendor: 'dashscope', status: 'enabled' })
  const candidates = providers.filter(provider => provider.authType === 'api_key' && Boolean(provider.authRef) && provider.capabilities.some(capability => capability.capability === 'audio.transcribe'))
  const [candidate] = candidates
  if (candidates.length !== 1 || !candidate)
    throw createAsrServiceError('ASR_ROUTE_UNAVAILABLE', 503)
  return assertDashScopeProvider(candidate)
}

function resolveHandoffUrl(event: H3Event, requestId: string, deliveryToken: string): string {
  const configuredOrigin = useRuntimeConfig(event).auth?.origin
  if (typeof configuredOrigin !== 'string' || !configuredOrigin.trim())
    throw createAsrServiceError('ASR_PUBLIC_ORIGIN_UNAVAILABLE', 503)

  let origin: URL
  try {
    origin = new URL(configuredOrigin)
  }
  catch {
    throw createAsrServiceError('ASR_PUBLIC_ORIGIN_UNAVAILABLE', 503)
  }
  if (origin.username || origin.password || origin.search || origin.hash || (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')) {
    throw createAsrServiceError('ASR_PUBLIC_ORIGIN_UNAVAILABLE', 503)
  }

  origin.pathname = `/api/v1/ai/audio/handoff/${encodeURIComponent(requestId)}`
  origin.searchParams.set('token', deliveryToken)
  return origin.toString()
}

async function releaseReservation(event: H3Event, request: AsrRequestRecord, failureCode: string): Promise<AsrRequestRecord> {
  await releaseConsumedCredits(event, request.userId, request.reservedCredits, 'asr-reservation-release', {
    requestId: request.id,
    providerId: request.providerId,
    capability: request.capability,
    failureCode,
  }, { idempotencyKey: `asr-release:${request.id}:0` })
  const released = await markAsrReleased(event, request.id, failureCode)
  try {
    await deleteAsrHandoffObject(event, released)
  }
  catch {
    // The terminal state invalidates the handoff token before cleanup; the object stays private.
  }
  return released
}

async function failAcceptedRequest(event: H3Event, request: AsrRequestRecord, failureCode: string): Promise<AsrRequestRecord> {
  const failed = await markAsrFailed(event, request.id, failureCode)
  try {
    await deleteAsrHandoffObject(event, failed)
  }
  catch {
    // The failed terminal state invalidates the handoff even if object cleanup is delayed.
  }
  return failed
}

export async function startAsrTranscription(
  event: H3Event,
  userId: string,
  input: StartAsrTranscriptionInput,
  options: AsrServiceOptions = {},
): Promise<AsrTranscriptionResponse> {
  const contentType = normalizeAsrContentType(input.contentType)
  if (!Buffer.isBuffer(input.audio) || input.audio.byteLength === 0 || input.audio.byteLength > ASR_AUDIO_MAX_BYTES)
    throw createAsrServiceError('ASR_AUDIO_INVALID', 400)

  const durationSeconds = parseWavDurationSeconds(input.audio)
  const idempotencyKey = normalizeAsrIdempotencyKey(input.idempotencyKey)
  const provider = await resolveDashScopeAsrProvider(event)
  const created = await createAsrRequest(event, {
    userId,
    providerId: provider.id,
    idempotencyKey,
    audio: input.audio,
    contentType,
    durationSeconds,
  })
  if (!created.created)
    return asClientResponse(created.request)
  if (!created.deliveryToken)
    throw createAsrServiceError('ASR_REQUEST_INVALID', 500)

  let request = created.request
  let reservationConsumed = false
  let providerAccepted = false
  try {
    await consumeCredits(event, userId, request.reservedCredits, 'asr-reservation', {
      requestId: request.id,
      providerId: provider.id,
      capability: request.capability,
      reservedCredits: request.reservedCredits,
    }, { idempotencyKey: `asr-reserve:${request.id}` })
    reservationConsumed = true
    request = await markAsrReserved(event, request.id)

    const submission = await (options.adapter ?? createDashScopeFiletransAdapter()).submit(
      event,
      provider,
      resolveHandoffUrl(event, request.id, created.deliveryToken),
    )
    providerAccepted = true
    request = await markAsrDispatching(event, request.id, submission.taskId)
    return asClientResponse(request)
  }
  catch (error) {
    const failureCode = error instanceof DashScopeAsrError ? error.code : 'ASR_REQUEST_FAILED'
    if (providerAccepted) {
      if (request.status === 'reserved' || request.status === 'dispatching') {
        const failed = await failAcceptedRequest(event, request, 'ASR_DISPATCH_STATE_UNCERTAIN')
        return asClientResponse(failed)
      }
    }
    else if (request.status === 'pending') {
      if (reservationConsumed) {
        await releaseConsumedCredits(event, request.userId, request.reservedCredits, 'asr-reservation-release', {
          requestId: request.id,
          providerId: request.providerId,
          capability: request.capability,
          failureCode,
        }, { idempotencyKey: `asr-release:${request.id}:0` })
      }
      const released = await markAsrReleased(event, request.id, failureCode)
      try {
        await deleteAsrHandoffObject(event, released)
      }
      catch {
        // The released state prevents the handoff route from serving the object.
      }
    }
    else if (request.status === 'reserved') {
      await releaseReservation(event, request, failureCode)
    }
    throw error
  }
}

export async function pollAsrTranscription(
  event: H3Event,
  userId: string,
  requestId: string,
  options: AsrServiceOptions = {},
): Promise<AsrTranscriptionResponse> {
  const request = await getAsrRequest(event, requestId)
  if (!request || request.userId !== userId)
    throw createAsrServiceError('ASR_REQUEST_NOT_FOUND', 404)
  if (request.status !== 'dispatching' && request.status !== 'settled')
    return asClientResponse(request)

  const provider = await getProviderRegistryEntry(event, request.providerId)
  const adapter = options.adapter ?? createDashScopeFiletransAdapter()
  try {
    const task = await adapter.getTask(event, assertDashScopeProvider(provider), request.providerTaskId ?? '')
    // Re-read the original task after a lost terminal response; never re-bill or persist text.
    if (request.status === 'settled') {
      if (task.status !== 'succeeded')
        throw createAsrServiceError('ASR_RESULT_UNAVAILABLE', 503)
      return asClientResponse(request, task.transcript)
    }
    if (task.status === 'pending')
      return asClientResponse(request)
    if (task.status === 'failed') {
      const failed = await failAcceptedRequest(event, request, 'ASR_PROVIDER_FAILED')
      return asClientResponse(failed)
    }

    const chargedCredits = calculateFiletransCredits(task.transcript, task.billedSeconds)
    if (chargedCredits > request.reservedCredits) {
      const failed = await markAsrFailed(event, request.id, 'ASR_RESERVATION_EXCEEDED')
      try {
        await deleteAsrHandoffObject(event, failed)
      }
      catch {
        // The failed terminal state invalidates the handoff even if object cleanup is delayed.
      }
      return asClientResponse(failed)
    }

    const releaseCredits = request.reservedCredits - chargedCredits
    if (releaseCredits > 0) {
      await releaseConsumedCredits(event, request.userId, releaseCredits, 'asr-reservation-release', {
        requestId: request.id,
        providerId: request.providerId,
        capability: request.capability,
      }, { idempotencyKey: `asr-release:${request.id}:${chargedCredits}` })
    }
    const settled = await markAsrSettled(event, request.id, chargedCredits, task.billedSeconds, calculateFiletransProviderCost(task.billedSeconds))
    try {
      await deleteAsrHandoffObject(event, settled)
    }
    catch {
      // The settled terminal state invalidates the handoff even if object cleanup is delayed.
    }
    return asClientResponse(settled, task.transcript)
  }
  catch (error) {
    if (request.status === 'dispatching' && error instanceof DashScopeAsrError && error.accepted) {
      const failed = await failAcceptedRequest(event, request, error.code)
      return asClientResponse(failed)
    }
    if (request.status === 'settled')
      throw createAsrServiceError('ASR_RESULT_UNAVAILABLE', 503)
    throw error
  }
}
