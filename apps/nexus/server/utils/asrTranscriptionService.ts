import { Buffer } from 'node:buffer'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'
import { consumeCredits, findCreditReservationLedgerId, releaseConsumedCredits } from './creditsStore'
import { resolveCreditPricingRule, resolveSellableCreditPricingRule } from './creditPricingStore'
import {
  assertDashScopeProvider,
  DashScopeAsrError,
  createDashScopeFiletransAdapter,
  createDashScopeQwenAudioAsrAdapter,
  QWEN_AUDIO_ASR_MAX_DURATION_SECONDS,
  QWEN_AUDIO_ASR_MAX_RAW_BYTES,
  QWEN_AUDIO_ASR_TRANSPORT,
  resolveDashScopeAsrModel,
  resolveDashScopeAsrTransport,
  type DashScopeFiletransAdapter,
  type DashScopeQwenAudioAsrAdapter,
  type DashScopeQwenAudioAsrTranscription,
} from './dashscopeAsrProvider'
import { getProviderRegistryEntry, listProviderRegistryEntries } from './providerRegistryStore'
import {
  ASR_AUDIO_MAX_BYTES,
  calculateFiletransCredits,
  calculateFiletransProviderCost,
  createAsrRequest,
  deleteAsrHandoffObject,
  deleteAsrResultObject,
  getAsrRequest,
  getAsrRequestByIdempotency,
  getAsrResultObject,
  listAsrSettlementMaintenanceRequests,
  markAsrDispatching,
  markAsrFailed,
  markAsrReleased,
  markAsrCreditsReleased,
  markAsrReserved,
  markAsrSettled,
  markAsrSettledFromReserved,
  normalizeAsrContentType,
  normalizeAsrIdempotencyKey,
  parseWavMetadata,
  putAsrResultObject,
  toAsrSafeStatus,
  setAsrReservationLedgerId,
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
  qwenAdapter?: DashScopeQwenAudioAsrAdapter
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
  const candidates = providers.filter(
    provider =>
      provider.authType === 'api_key' &&
      Boolean(provider.authRef) &&
      provider.capabilities.some(capability => capability.capability === 'audio.transcribe'),
  )
  const [candidate] = candidates
  if (candidates.length !== 1 || !candidate) throw createAsrServiceError('ASR_ROUTE_UNAVAILABLE', 503)
  const provider = assertDashScopeProvider(candidate)
  const transport = resolveDashScopeAsrTransport(provider)
  if (!transport) throw createAsrServiceError('ASR_PROVIDER_CONFIGURATION_INVALID', 503)
  const model = resolveDashScopeAsrModel(provider, transport)
  if (!model) throw createAsrServiceError('ASR_PROVIDER_CONFIGURATION_INVALID', 503)
  return { provider, transport, model }
}
function resolveHandoffUrl(event: H3Event, requestId: string, deliveryToken: string): string {
  const configuredOrigin = useRuntimeConfig(event).auth?.origin
  if (typeof configuredOrigin !== 'string' || !configuredOrigin.trim())
    throw createAsrServiceError('ASR_PUBLIC_ORIGIN_UNAVAILABLE', 503)

  let origin: URL
  try {
    origin = new URL(configuredOrigin)
  } catch {
    throw createAsrServiceError('ASR_PUBLIC_ORIGIN_UNAVAILABLE', 503)
  }
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')
  ) {
    throw createAsrServiceError('ASR_PUBLIC_ORIGIN_UNAVAILABLE', 503)
  }

  origin.pathname = `/api/v1/ai/audio/handoff/${encodeURIComponent(requestId)}`
  origin.searchParams.set('token', deliveryToken)
  return origin.toString()
}

async function ensureAsrReservationLedger(
  event: H3Event,
  request: AsrRequestRecord,
): Promise<AsrRequestRecord> {
  if (request.reservationLedgerId) return request
  const reservationLedgerId = await findCreditReservationLedgerId(
    event,
    request.userId,
    `asr-reserve:${request.id}`,
  )
  if (!reservationLedgerId) throw createAsrServiceError('ASR_SETTLEMENT_INCOMPLETE', 503)
  if (request.status === 'reserved' || request.status === 'dispatching')
    return await setAsrReservationLedgerId(event, request.id, reservationLedgerId)
  return { ...request, reservationLedgerId }
}

async function releaseReservation(
  event: H3Event,
  request: AsrRequestRecord,
  failureCode: string,
): Promise<AsrRequestRecord> {
  const scopedRequest = await ensureAsrReservationLedger(event, request)
  await releaseConsumedCredits(
    event,
    scopedRequest.userId,
    scopedRequest.reservedCredits,
    'asr-reservation-release',
    {
      requestId: scopedRequest.id,
      providerId: scopedRequest.providerId,
      capability: scopedRequest.capability,
      failureCode,
    },
    {
      idempotencyKey: `asr-release:${scopedRequest.id}:0`,
      reservationLedgerId: scopedRequest.reservationLedgerId!,
    },
  )
  const released = await markAsrReleased(event, scopedRequest.id, failureCode)
  try {
    await deleteAsrHandoffObject(event, released)
  } catch {
    // The terminal state invalidates the handoff token before cleanup; the object stays private.
  }
  await deleteAsrResultObject(event, released).catch(() => {})
  return released
}

async function failAcceptedRequest(
  event: H3Event,
  request: AsrRequestRecord,
  failureCode: string,
): Promise<AsrRequestRecord> {
  const failed = await markAsrFailed(event, request.id, failureCode)
  try {
    await deleteAsrHandoffObject(event, failed)
  } catch {
    // The failed terminal state invalidates the handoff even if object cleanup is delayed.
  }
  await deleteAsrResultObject(event, failed).catch(() => {})
  return failed
}

function isAsrServiceErrorCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== 'object' || !('data' in error)) return false
  const data = error.data
  return Boolean(data && typeof data === 'object' && 'errorCode' in data && data.errorCode === code)
}

/**
 * Finishes the balance side of an already-persisted settlement.
 *
 * `chargedCredits` is the durable resume marker. Repeating this operation is safe because the
 * release ledger uses the request id plus the final charge as its idempotency identity.
 */
async function releaseSettledCredits(event: H3Event, request: AsrRequestRecord): Promise<void> {
  if (request.creditsReleasedAt) return
  const chargedCredits = request.chargedCredits
  if (
    !Number.isInteger(chargedCredits) ||
    chargedCredits === null ||
    chargedCredits <= 0 ||
    chargedCredits > request.reservedCredits
  ) {
    throw createAsrServiceError('ASR_SETTLEMENT_INCOMPLETE', 503)
  }

  const releaseCredits = request.reservedCredits - chargedCredits
  try {
    let scopedRequest = request
    if (releaseCredits > 0) {
      scopedRequest = await ensureAsrReservationLedger(event, request)
      await releaseConsumedCredits(
        event,
        scopedRequest.userId,
        releaseCredits,
        'asr-reservation-release',
        {
          requestId: scopedRequest.id,
          providerId: scopedRequest.providerId,
          capability: scopedRequest.capability,
        },
        {
          idempotencyKey: `asr-release:${scopedRequest.id}:${chargedCredits}`,
          reservationLedgerId: scopedRequest.reservationLedgerId!,
        },
      )
    }
    await markAsrCreditsReleased(event, scopedRequest.id)
  } catch {
    throw createAsrServiceError('ASR_SETTLEMENT_INCOMPLETE', 503)
  }
}

async function settleSynchronousResult(
  event: H3Event,
  request: AsrRequestRecord,
  result: DashScopeQwenAudioAsrTranscription,
): Promise<AsrRequestRecord> {
  request = await ensureAsrReservationLedger(event, request)
  const pricing = request.pricing ?? (await resolveCreditPricingRule(event, request.capability))
  const chargedCredits = calculateFiletransCredits(pricing, result.transcript, result.billedSeconds)
  const providerCostCny = calculateFiletransProviderCost(result.billedSeconds)
  if (chargedCredits > request.reservedCredits) {
    let failed: AsrRequestRecord
    try {
      failed = await markAsrFailed(event, request.id, 'ASR_RESERVATION_EXCEEDED')
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'ASR_REQUEST_STATE_CONFLICT') throw error
      const current = await getAsrRequest(event, request.id)
      if (current?.status !== 'failed' || current.failureCode !== 'ASR_RESERVATION_EXCEEDED') throw error
      failed = current
    }
    await deleteAsrHandoffObject(event, failed).catch(() => {})
    await deleteAsrResultObject(event, failed).catch(() => {})
    return failed
  }

  try {
    return await markAsrSettledFromReserved(
      event,
      request.id,
      chargedCredits,
      result.billedSeconds,
      providerCostCny,
    )
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'ASR_REQUEST_STATE_CONFLICT') throw error
    const current = await getAsrRequest(event, request.id)
    if (
      current?.status !== 'settled' ||
      current.chargedCredits !== chargedCredits ||
      current.billedSeconds !== result.billedSeconds ||
      current.providerCostCny !== providerCostCny
    ) {
      throw error
    }
    return current
  }
}

async function resumeExistingAsrRequest(
  event: H3Event,
  request: AsrRequestRecord,
): Promise<AsrTranscriptionResponse> {
  if (request.status === 'settled' && !request.providerTaskId) {
    await releaseSettledCredits(event, request)
    const result = await getAsrResultObject(event, request)
    if (!result) throw createAsrServiceError('ASR_RESULT_UNAVAILABLE', 503)
    await deleteAsrHandoffObject(event, request).catch(() => {})
    return asClientResponse(request, result.transcript)
  }
  if (request.status === 'reserved' && !request.providerTaskId) {
    const result = await getAsrResultObject(event, request, { settlementRecovery: true })
    if (!result) return asClientResponse(request)
    const settled = await settleSynchronousResult(event, request, result)
    if (settled.status !== 'settled') return asClientResponse(settled)
    await releaseSettledCredits(event, settled)
    await deleteAsrHandoffObject(event, settled).catch(() => {})
    return asClientResponse(settled, result.transcript)
  }
  return asClientResponse(request)
}

/** Converges expired accounting before private result retention removes its only evidence. */
export async function reconcileExpiredAsrSettlements(event: H3Event): Promise<{
  scanned: number
  reconciled: number
  failed: number
}> {
  const requests = await listAsrSettlementMaintenanceRequests(event)
  let reconciled = 0
  let failed = 0
  for (const request of requests) {
    try {
      if (request.status === 'settled') {
        await releaseSettledCredits(event, request)
        reconciled += 1
        continue
      }

      const result = await getAsrResultObject(event, request, {
        settlementRecovery: true,
        allowExpiredSettlement: true,
      })
      if (!result) {
        const terminal = await markAsrFailed(event, request.id, 'ASR_RESULT_UNAVAILABLE')
        await deleteAsrHandoffObject(event, terminal).catch(() => {})
        await deleteAsrResultObject(event, terminal).catch(() => {})
        reconciled += 1
        continue
      }

      const terminal = await settleSynchronousResult(event, request, result)
      if (terminal.status === 'settled') await releaseSettledCredits(event, terminal)
      reconciled += 1
    } catch {
      failed += 1
    }
  }
  return { scanned: requests.length, reconciled, failed }
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
  const wav = parseWavMetadata(input.audio)
  const durationSeconds = wav.durationSeconds
  const idempotencyKey = normalizeAsrIdempotencyKey(input.idempotencyKey)
  const requestIdentity = {
    userId,
    idempotencyKey,
    audio: input.audio,
    contentType,
  }
  const existing = await getAsrRequestByIdempotency(event, requestIdentity)
  if (existing) return await resumeExistingAsrRequest(event, existing)

  const route = await resolveDashScopeAsrProvider(event)
  if (route.transport === QWEN_AUDIO_ASR_TRANSPORT) {
    if (durationSeconds > QWEN_AUDIO_ASR_MAX_DURATION_SECONDS)
      throw createAsrServiceError('ASR_AUDIO_DURATION_UNSUPPORTED', 400)
    if (wav.encoding !== 1 || wav.channels !== 1 || wav.sampleRate !== 16_000 || wav.bits !== 16)
      throw createAsrServiceError('ASR_AUDIO_FORMAT_UNSUPPORTED', 400)
    if (input.audio.byteLength > QWEN_AUDIO_ASR_MAX_RAW_BYTES)
      throw createAsrServiceError('ASR_AUDIO_TOO_LARGE', 413)
  }

  const pricing = await resolveSellableCreditPricingRule(event, 'audio.transcribe')
  const created = await createAsrRequest(event, {
    ...requestIdentity,
    providerId: route.provider.id,
    durationSeconds,
    pricing,
    storeHandoff: route.transport !== QWEN_AUDIO_ASR_TRANSPORT,
  })
  if (!created.created) return await resumeExistingAsrRequest(event, created.request)
  if (!created.deliveryToken) throw createAsrServiceError('ASR_REQUEST_INVALID', 500)

  let request = created.request
  let reservationConsumed = false
  let reservationLedgerId: string | undefined
  let providerAccepted = false
  let resultStored = false
  try {
    const reservation = await consumeCredits(
      event,
      userId,
      request.reservedCredits,
      'asr-reservation',
      {
        requestId: request.id,
        providerId: route.provider.id,
        capability: request.capability,
        reservedCredits: request.reservedCredits,
      },
      { idempotencyKey: `asr-reserve:${request.id}` },
    )
    reservationLedgerId = reservation.ledgerId
    reservationConsumed = true
    request = await markAsrReserved(event, request.id, reservation.ledgerId)

    if (route.transport === QWEN_AUDIO_ASR_TRANSPORT) {
      const qwenAdapter = options.qwenAdapter ?? createDashScopeQwenAudioAsrAdapter()
      let result: DashScopeQwenAudioAsrTranscription
      try {
        result = await qwenAdapter.transcribe(event, route.provider, input.audio, {
          model: route.model,
          durationSeconds,
          sampleRate: wav.sampleRate,
        })
      } catch (error) {
        if (error instanceof DashScopeAsrError && error.accepted) providerAccepted = true
        throw error
      }
      // A valid response means DashScope may have charged it. Never replay or refund after this point.
      providerAccepted = true
      await putAsrResultObject(event, request, {
        transcript: result.transcript,
        billedSeconds: result.billedSeconds,
      })
      resultStored = true
      request = await settleSynchronousResult(event, request, result)
      if (request.status !== 'settled') return asClientResponse(request)
      await releaseSettledCredits(event, request)
      await deleteAsrHandoffObject(event, request).catch(() => {})
      return asClientResponse(request, result.transcript)
    }

    const submission = await (options.adapter ?? createDashScopeFiletransAdapter()).submit(
      event,
      route.provider,
      resolveHandoffUrl(event, request.id, created.deliveryToken),
    )
    providerAccepted = true
    request = await markAsrDispatching(event, request.id, submission.taskId)
    return asClientResponse(request)
  } catch (error) {
    const failureCode = error instanceof DashScopeAsrError ? error.code : 'ASR_REQUEST_FAILED'
    if (providerAccepted) {
      if (request.status === 'reserved' && resultStored) {
        throw createAsrServiceError('ASR_SETTLEMENT_INCOMPLETE', 503)
      }
      if (request.status === 'reserved' || request.status === 'dispatching') {
        const failed = await failAcceptedRequest(event, request, 'ASR_DISPATCH_STATE_UNCERTAIN')
        return asClientResponse(failed)
      }
    } else if (request.status === 'pending') {
      if (reservationConsumed) {
        if (!reservationLedgerId) throw createAsrServiceError('ASR_SETTLEMENT_INCOMPLETE', 503)
        await releaseConsumedCredits(
          event,
          request.userId,
          request.reservedCredits,
          'asr-reservation-release',
          {
            requestId: request.id,
            providerId: request.providerId,
            capability: request.capability,
            failureCode,
          },
          {
            idempotencyKey: `asr-release:${request.id}:0`,
            reservationLedgerId,
          },
        )
      }
      const released = await markAsrReleased(event, request.id, failureCode)
      await deleteAsrHandoffObject(event, released).catch(() => {})
      await deleteAsrResultObject(event, released).catch(() => {})
    } else if (request.status === 'reserved') {
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
  let request = await getAsrRequest(event, requestId)
  if (!request || request.userId !== userId) throw createAsrServiceError('ASR_REQUEST_NOT_FOUND', 404)
  if (request.status === 'reserved' && !request.providerTaskId)
    return await resumeExistingAsrRequest(event, request)
  if (request.status !== 'dispatching' && request.status !== 'settled') return asClientResponse(request)
  if (request.status === 'settled') await releaseSettledCredits(event, request)

  if (request.status === 'settled' && !request.providerTaskId) {
    const result = await getAsrResultObject(event, request)
    if (!result) throw createAsrServiceError('ASR_RESULT_UNAVAILABLE', 503)
    await deleteAsrHandoffObject(event, request).catch(() => {})
    return asClientResponse(request, result.transcript)
  }
  if (!request.providerTaskId) throw createAsrServiceError('ASR_RESULT_UNAVAILABLE', 503)

  const provider = await getProviderRegistryEntry(event, request.providerId)
  const adapter = options.adapter ?? createDashScopeFiletransAdapter()
  try {
    const task = await adapter.getTask(event, assertDashScopeProvider(provider), request.providerTaskId ?? '')
    // Re-read the original task after a lost terminal response; never re-bill or persist text.
    if (request.status === 'settled') {
      if (task.status !== 'succeeded') throw createAsrServiceError('ASR_RESULT_UNAVAILABLE', 503)
      await deleteAsrHandoffObject(event, request).catch(() => {})
      return asClientResponse(request, task.transcript)
    }
    if (task.status === 'pending') return asClientResponse(request)
    if (task.status === 'failed') {
      const failed = await failAcceptedRequest(event, request, 'ASR_PROVIDER_FAILED')
      return asClientResponse(failed)
    }

    // Settle at the price this request was admitted under. Re-resolving would re-price
    // work the provider has already done: a price rise would fail a finished
    // transcription as ASR_RESERVATION_EXCEEDED, and a cut would refund the difference.
    // The fallback only covers requests admitted before the snapshot was persisted.
    const pricing = request.pricing ?? (await resolveCreditPricingRule(event, request.capability))
    const chargedCredits = calculateFiletransCredits(pricing, task.transcript, task.billedSeconds)
    if (chargedCredits > request.reservedCredits) {
      const failed = await markAsrFailed(event, request.id, 'ASR_RESERVATION_EXCEEDED')
      try {
        await deleteAsrHandoffObject(event, failed)
      } catch {
        // The failed terminal state invalidates the handoff even if object cleanup is delayed.
      }
      return asClientResponse(failed)
    }

    request = await ensureAsrReservationLedger(event, request)
    request = await markAsrSettled(
      event,
      request.id,
      chargedCredits,
      task.billedSeconds,
      calculateFiletransProviderCost(task.billedSeconds),
    )
    await releaseSettledCredits(event, request)
    await deleteAsrHandoffObject(event, request).catch(() => {})
    return asClientResponse(request, task.transcript)
  } catch (error) {
    if (request.status === 'dispatching' && error instanceof DashScopeAsrError && error.accepted) {
      const failed = await failAcceptedRequest(event, request, error.code)
      return asClientResponse(failed)
    }
    if (request.status === 'settled') {
      if (isAsrServiceErrorCode(error, 'ASR_SETTLEMENT_INCOMPLETE')) throw error
      throw createAsrServiceError('ASR_RESULT_UNAVAILABLE', 503)
    }
    throw error
  }
}
