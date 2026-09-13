import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  pollAsrTranscription,
  reconcileExpiredAsrSettlements,
  startAsrTranscription,
} from './asrTranscriptionService'
import { DEFAULT_CREDIT_PRICING, selectCreditPricingRule } from './creditPricingStore'
import {
  DashScopeAsrError,
  QWEN_AUDIO_ASR_MAX_DURATION_SECONDS,
  QWEN_AUDIO_ASR_MAX_RAW_BYTES,
  type DashScopeFiletransAdapter,
  type DashScopeFiletransTask,
  type DashScopeQwenAudioAsrAdapter,
} from './dashscopeAsrProvider'
import { calculateFiletransCredits, calculateFiletransProviderCost } from './asrTranscriptionStore'
import type { AsrRequestRecord, ParsedWavMetadata } from './asrTranscriptionStore'
import type * as AsrTranscriptionStoreModule from './asrTranscriptionStore'
import type * as CreditPricingStoreModule from './creditPricingStore'
import type { ProviderRegistryRecord } from './providerRegistryStore'

const runtimeConfig = vi.hoisted(() => ({
  auth: { origin: 'https://nexus.example.com' },
}))

const creditsMocks = vi.hoisted(() => ({
  consumeCredits: vi.fn(),
  findCreditReservationLedgerId: vi.fn(),
  releaseConsumedCredits: vi.fn(),
}))

const registryMocks = vi.hoisted(() => ({
  getProviderRegistryEntry: vi.fn(),
  listProviderRegistryEntries: vi.fn(),
}))

const pricingMocks = vi.hoisted(() => ({
  resolveCreditPricingRule: vi.fn(),
}))

const storeMocks = vi.hoisted(() => ({
  ASR_AUDIO_MAX_BYTES: 20 * 1024 * 1024,
  createAsrRequest: vi.fn(),
  deleteAsrHandoffObject: vi.fn(),
  deleteAsrResultObject: vi.fn(),
  getAsrRequest: vi.fn(),
  getAsrRequestByIdempotency: vi.fn(),
  getAsrResultObject: vi.fn(),
  listAsrSettlementMaintenanceRequests: vi.fn(),
  markAsrDispatching: vi.fn(),
  markAsrFailed: vi.fn(),
  markAsrCreditsReleased: vi.fn(),
  markAsrReleased: vi.fn(),
  markAsrReserved: vi.fn(),
  markAsrSettled: vi.fn(),
  markAsrSettledFromReserved: vi.fn(),
  putAsrResultObject: vi.fn(),
  setAsrReservationLedgerId: vi.fn(),
  normalizeAsrContentType: vi.fn(() => 'audio/wav'),
  normalizeAsrIdempotencyKey: vi.fn(() => 'idempotency-key'),
  parseWavMetadata: vi.fn(),
  toAsrSafeStatus: vi.fn((request: AsrRequestRecord) => ({
    requestId: request.id,
    status: request.status,
    creditsCharged: request.chargedCredits,
    billedSeconds: request.billedSeconds,
    failureCode: request.failureCode,
  })),
}))

vi.mock('#imports', () => ({
  useRuntimeConfig: () => runtimeConfig,
}))
vi.mock('./creditsStore', () => creditsMocks)
vi.mock('./providerRegistryStore', () => registryMocks)
// Only the stored price list needs a database; the pricing math stays real so the
// settled credits are the shipped ASR price rather than a fixture.
vi.mock('./creditPricingStore', async importOriginal => {
  const actual = await importOriginal<typeof CreditPricingStoreModule>()
  return {
    ...actual,
    resolveCreditPricingRule: pricingMocks.resolveCreditPricingRule,
    // Admission charges through the sellable lookup; "the row is disabled" is refused by
    // the store itself, so here it resolves to the same stubbed rule.
    resolveSellableCreditPricingRule: pricingMocks.resolveCreditPricingRule,
  }
})
vi.mock('./asrTranscriptionStore', async importOriginal => {
  const actual = await importOriginal<typeof AsrTranscriptionStoreModule>()
  return {
    ...storeMocks,
    calculateFiletransCredits: actual.calculateFiletransCredits,
    calculateFiletransProviderCost: actual.calculateFiletransProviderCost,
  }
})

const provider: ProviderRegistryRecord = {
  id: 'dashscope-provider',
  name: 'dashscope-provider',
  displayName: 'DashScope',
  vendor: 'dashscope',
  status: 'enabled',
  authType: 'api_key',
  authRef: 'secure://dashscope',
  ownerScope: 'system',
  ownerId: null,
  description: null,
  endpoint: 'https://dashscope.example.com/api/v1',
  region: null,
  metadata: null,
  capabilities: [
    {
      id: 'audio-transcribe',
      providerId: 'dashscope-provider',
      capability: 'audio.transcribe',
      schemaRef: null,
      metering: null,
      constraints: null,
      metadata: null,
      createdAt: '2026-09-08T00:00:00.000Z',
      updatedAt: '2026-09-08T00:00:00.000Z',
    },
  ],
  createdBy: 'test',
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
}

/** The team-scoped ledger entry `consumeCredits` writes for this request's hold. */
const RESERVATION_LEDGER_ID = '11111111-2222-4333-8444-555555555555'

function request(overrides: Partial<AsrRequestRecord> = {}): AsrRequestRecord {
  return {
    id: 'asr-request-1',
    userId: 'user-1',
    providerId: provider.id,
    capability: 'audio.transcribe',
    idempotencyKey: 'idempotency-key',
    requestHash: 'request-hash',
    objectKey: 'private/asr-request-1.wav',
    contentType: 'audio/wav',
    byteSize: 48,
    durationSeconds: 1,
    deliveryTokenHash: 'delivery-token-hash',
    deliveryExpiresAt: '2026-09-08T00:15:00.000Z',
    providerTaskId: 'task-1',
    status: 'dispatching',
    reservedCredits: 10,
    reservationLedgerId: null,
    chargedCredits: null,
    creditsReleasedAt: null,
    billedSeconds: null,
    providerCostCny: null,
    failureCode: null,
    // Every admitted request carries the price it was quoted, so the fixture does too.
    pricing: selectCreditPricingRule('audio.transcribe', DEFAULT_CREDIT_PRICING),
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  }
}

function adapter(task: DashScopeFiletransTask | Error): DashScopeFiletransAdapter {
  return {
    submit: vi.fn(async () => ({ taskId: 'task-1' })),
    getTask: vi.fn(async () => {
      if (task instanceof Error) throw task
      return task
    }),
  } as unknown as DashScopeFiletransAdapter
}

const QWEN_METADATA = {
  adapter: 'dashscope-qwen-audio-asr',
  transport: 'qwen-audio-sync',
  defaultModel: 'qwen-audio-3.0-asr-flash',
  models: ['qwen-audio-3.0-asr-flash'],
}

function qwenProvider(metadata: Record<string, unknown> | null = QWEN_METADATA): ProviderRegistryRecord {
  return { ...provider, metadata }
}

function qwenAdapter(
  result: { transcript: string; billedSeconds: number; requestId?: string } | Error,
): DashScopeQwenAudioAsrAdapter {
  return {
    transcribe: vi.fn(async () => {
      if (result instanceof Error) throw result
      return result
    }),
  } as unknown as DashScopeQwenAudioAsrAdapter
}

/** A canonical 16 kHz mono PCM16 clip: the only shape the synchronous Qwen route admits. */
function wavMetadata(overrides: Partial<ParsedWavMetadata> = {}): ParsedWavMetadata {
  return {
    durationSeconds: 1,
    encoding: 1,
    channels: 1,
    sampleRate: 16_000,
    byteRate: 32_000,
    blockAlign: 2,
    bits: 16,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  pricingMocks.resolveCreditPricingRule.mockImplementation(async (_event, capability: string) =>
    selectCreditPricingRule(capability, DEFAULT_CREDIT_PRICING),
  )
  registryMocks.listProviderRegistryEntries.mockResolvedValue([provider])
  registryMocks.getProviderRegistryEntry.mockResolvedValue(provider)
  // `consumeCredits` returns the team ledger row the hold was written to; the service persists
  // its id on the request and releases against it later.
  creditsMocks.consumeCredits.mockResolvedValue({ ledgerId: RESERVATION_LEDGER_ID })
  // A request reserved before the ledger id was persisted has to recover it from the hold itself;
  // by default the hold written by `consumeCredits` is the one found.
  creditsMocks.findCreditReservationLedgerId.mockResolvedValue(RESERVATION_LEDGER_ID)
  storeMocks.setAsrReservationLedgerId.mockImplementation(
    async (_event, requestId: string, reservationLedgerId: string) =>
      request({ id: requestId, status: 'reserved', providerTaskId: null, reservationLedgerId }),
  )
  storeMocks.getAsrRequestByIdempotency.mockResolvedValue(null)
  storeMocks.listAsrSettlementMaintenanceRequests.mockResolvedValue([])
  storeMocks.markAsrCreditsReleased.mockResolvedValue(undefined)
  storeMocks.parseWavMetadata.mockReturnValue(wavMetadata())
  storeMocks.createAsrRequest.mockResolvedValue({
    created: true,
    deliveryToken: 'opaque-delivery-token',
    request: request({ status: 'pending', providerTaskId: null }),
  })
  storeMocks.markAsrReserved.mockImplementation(
    async (_event, _requestId: string, reservationLedgerId: string) =>
      request({ status: 'reserved', providerTaskId: null, reservationLedgerId }),
  )
  storeMocks.markAsrDispatching.mockResolvedValue(request())
  storeMocks.markAsrReleased.mockImplementation(async (_event, requestId: string, failureCode: string) =>
    request({
      id: requestId,
      status: 'released',
      failureCode,
    }),
  )
  storeMocks.markAsrFailed.mockImplementation(async (_event, requestId: string, failureCode: string) =>
    request({
      id: requestId,
      status: 'failed',
      failureCode,
    }),
  )
  storeMocks.markAsrSettled.mockImplementation(
    async (_event, requestId: string, chargedCredits: number, billedSeconds: number) =>
      request({
        id: requestId,
        status: 'settled',
        chargedCredits,
        billedSeconds,
        reservationLedgerId: RESERVATION_LEDGER_ID,
      }),
  )
  storeMocks.markAsrSettledFromReserved.mockImplementation(
    async (_event, requestId: string, chargedCredits: number, billedSeconds: number) =>
      request({
        id: requestId,
        status: 'settled',
        providerTaskId: null,
        chargedCredits,
        billedSeconds,
        reservationLedgerId: RESERVATION_LEDGER_ID,
      }),
  )
  // The store deletes resolve to promises; the service chains `.catch` on them.
  storeMocks.deleteAsrHandoffObject.mockResolvedValue(undefined)
  storeMocks.deleteAsrResultObject.mockResolvedValue(undefined)
  storeMocks.putAsrResultObject.mockResolvedValue(undefined)
  storeMocks.getAsrResultObject.mockResolvedValue(null)
  storeMocks.getAsrRequest.mockResolvedValue(request())
})

describe('ASR terminal accounting', () => {
  it('marks an accepted provider task failure as failed without releasing its reservation', async () => {
    const result = await pollAsrTranscription({} as never, 'user-1', 'asr-request-1', {
      adapter: adapter({ status: 'failed' }),
    })

    expect(result).toMatchObject({
      requestId: 'asr-request-1',
      status: 'failed',
      failureCode: 'ASR_PROVIDER_FAILED',
    })
    expect(storeMocks.markAsrFailed).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_PROVIDER_FAILED')
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrReleased).not.toHaveBeenCalled()
  })

  it.each(['ASR_PROVIDER_UNAVAILABLE', 'ASR_PROVIDER_RESPONSE_INVALID'] as const)(
    'turns accepted DashScope polling error %s into a stable failed request',
    async code => {
      const result = await pollAsrTranscription({} as never, 'user-1', 'asr-request-1', {
        adapter: adapter(new DashScopeAsrError(code, true)),
      })

      expect(result).toMatchObject({
        requestId: 'asr-request-1',
        status: 'failed',
        failureCode: code,
      })
      expect(storeMocks.markAsrFailed).toHaveBeenCalledWith({}, 'asr-request-1', code)
      expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
      expect(storeMocks.markAsrReleased).not.toHaveBeenCalled()
    },
  )

  it('fails without refunding when task acceptance is followed by dispatch-state persistence conflict', async () => {
    const persistenceConflict = new Error('dispatch state conflict')
    storeMocks.markAsrDispatching.mockRejectedValueOnce(persistenceConflict)

    const result = await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { adapter: adapter({ status: 'pending' }) },
    )

    expect(result).toMatchObject({
      requestId: 'asr-request-1',
      status: 'failed',
      failureCode: 'ASR_DISPATCH_STATE_UNCERTAIN',
    })
    expect(storeMocks.markAsrFailed).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_DISPATCH_STATE_UNCERTAIN')
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrReleased).not.toHaveBeenCalled()
  })
})

describe('ASR pre-acceptance rollback', () => {
  it('releases the request without refunding when the credit debit is rejected before reservation', async () => {
    const debitRejected = new Error('credit debit rejected')
    const providerAdapter = adapter({ status: 'pending' })
    creditsMocks.consumeCredits.mockRejectedValueOnce(debitRejected)

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { adapter: providerAdapter },
      ),
    ).rejects.toBe(debitRejected)

    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrReleased).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_REQUEST_FAILED')
    expect(storeMocks.deleteAsrHandoffObject).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        status: 'released',
        failureCode: 'ASR_REQUEST_FAILED',
      }),
    )
    expect(providerAdapter.submit).not.toHaveBeenCalled()
  })

  it('compensates exactly once when reserving the request fails after a successful debit', async () => {
    const reservationFailed = new Error('reserve state persistence failed')
    const providerAdapter = adapter({ status: 'pending' })
    storeMocks.markAsrReserved.mockRejectedValueOnce(reservationFailed)

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { adapter: providerAdapter },
      ),
    ).rejects.toBe(reservationFailed)

    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledTimes(1)
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      10,
      'asr-reservation-release',
      expect.objectContaining({
        requestId: 'asr-request-1',
        failureCode: 'ASR_REQUEST_FAILED',
      }),
      { idempotencyKey: 'asr-release:asr-request-1:0', reservationLedgerId: RESERVATION_LEDGER_ID },
    )
    expect(storeMocks.markAsrReleased).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_REQUEST_FAILED')
    expect(storeMocks.deleteAsrHandoffObject).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        status: 'released',
        failureCode: 'ASR_REQUEST_FAILED',
      }),
    )
    expect(providerAdapter.submit).not.toHaveBeenCalled()
  })

  it('releases the entire reservation when DashScope rejects submission before task acceptance', async () => {
    const providerRejected = new DashScopeAsrError('ASR_PROVIDER_REJECTED', false)
    const providerAdapter = adapter({ status: 'pending' })
    vi.mocked(providerAdapter.submit).mockRejectedValueOnce(providerRejected)

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { adapter: providerAdapter },
      ),
    ).rejects.toBe(providerRejected)

    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledTimes(1)
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      10,
      'asr-reservation-release',
      expect.objectContaining({
        requestId: 'asr-request-1',
        failureCode: 'ASR_PROVIDER_REJECTED',
      }),
      { idempotencyKey: 'asr-release:asr-request-1:0', reservationLedgerId: RESERVATION_LEDGER_ID },
    )
    expect(storeMocks.markAsrReleased).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_PROVIDER_REJECTED')
    expect(storeMocks.deleteAsrHandoffObject).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        status: 'released',
        failureCode: 'ASR_PROVIDER_REJECTED',
      }),
    )
  })
})

describe('ASR settlement accounting', () => {
  it('settles the larger of transcript units and billed seconds and returns the unused hold', async () => {
    const result = await pollAsrTranscription({} as never, 'user-1', 'asr-request-1', {
      adapter: adapter({ status: 'succeeded', transcript: '一二三四五六七八九', billedSeconds: 1 }),
    })

    // Nine transcript units beat the four credits a single billed second would charge;
    // the ten-credit hold covered them, so exactly one credit goes back.
    expect(storeMocks.markAsrSettled).toHaveBeenCalledWith({}, 'asr-request-1', 9, 1, expect.any(Number))
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledTimes(1)
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      1,
      'asr-reservation-release',
      expect.objectContaining({ requestId: 'asr-request-1' }),
      { idempotencyKey: 'asr-release:asr-request-1:9', reservationLedgerId: RESERVATION_LEDGER_ID },
    )
    expect(result).toMatchObject({ status: 'settled', creditsCharged: 9, billedSeconds: 1 })
  })

  it('fails a transcription whose transcript costs more than the hold instead of over-charging', async () => {
    const result = await pollAsrTranscription({} as never, 'user-1', 'asr-request-1', {
      adapter: adapter({
        status: 'succeeded',
        transcript: '一二三四五六七八九十一二三四五六七八九十',
        billedSeconds: 0.1,
      }),
    })

    expect(storeMocks.markAsrFailed).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_RESERVATION_EXCEEDED')
    expect(storeMocks.markAsrSettled).not.toHaveBeenCalled()
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'failed', failureCode: 'ASR_RESERVATION_EXCEEDED' })
  })

  it('settles at the price the request was admitted under, not a price changed mid-flight', async () => {
    const admitted = selectCreditPricingRule('audio.transcribe', DEFAULT_CREDIT_PRICING)
    // The operator raises the price while the provider is still transcribing. Re-pricing
    // finished work would fail the request as ASR_RESERVATION_EXCEEDED; the hold is a
    // quote, so the settlement has to read the price it was quoted.
    pricingMocks.resolveCreditPricingRule.mockResolvedValue({ ...admitted, creditsPerUnit: 400 })
    storeMocks.getAsrRequest.mockResolvedValue(request({ pricing: admitted }))

    const result = await pollAsrTranscription({} as never, 'user-1', 'asr-request-1', {
      adapter: adapter({ status: 'succeeded', transcript: '一二三四五六七八九', billedSeconds: 1 }),
    })

    // Nine transcript units at the admitted price; one billed second at the new price
    // would have cost 400 and overrun the hold.
    expect(storeMocks.markAsrSettled).toHaveBeenCalledWith({}, 'asr-request-1', 9, 1, expect.any(Number))
    expect(result).toMatchObject({ status: 'settled', creditsCharged: 9 })
  })

  it('falls back to the live price list only for a request admitted before the quote was stored', async () => {
    // Legacy in-flight requests carry no snapshot; they settle at the current price
    // rather than failing the transcription outright.
    storeMocks.getAsrRequest.mockResolvedValue(request({ pricing: null }))

    const result = await pollAsrTranscription({} as never, 'user-1', 'asr-request-1', {
      adapter: adapter({ status: 'succeeded', transcript: '一二三四五六七八九', billedSeconds: 1 }),
    })

    expect(result).toMatchObject({ status: 'settled', creditsCharged: 9 })
  })
})

describe('ASR Qwen Audio Flash synchronous path', () => {
  it('reserves before dispatch, settles from reserved, and exposes the transcript with its private recovery object', async () => {
    const order: string[] = []
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    creditsMocks.consumeCredits.mockImplementationOnce(async () => {
      order.push('reserve')
      return { ledgerId: RESERVATION_LEDGER_ID }
    })
    storeMocks.markAsrReserved.mockImplementationOnce(async (_event, _requestId, reservationLedgerId: string) => {
      order.push('reserved')
      return request({ status: 'reserved', providerTaskId: null, reservationLedgerId })
    })
    const qwen = qwenAdapter({ transcript: 'alpha beta', billedSeconds: 2 })
    vi.mocked(qwen.transcribe).mockImplementationOnce(async () => {
      order.push('dispatch')
      return { transcript: 'alpha beta', billedSeconds: 2 }
    })

    const result = await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { qwenAdapter: qwen },
    )

    expect(order).toEqual(['reserve', 'reserved', 'dispatch'])
    // The hold's ledger row is persisted on the request, so the later release binds to the
    // exact team/month the credits were taken from rather than whichever team is active then.
    expect(storeMocks.markAsrReserved).toHaveBeenCalledWith({}, 'asr-request-1', RESERVATION_LEDGER_ID)
    // Two audio seconds at four credits each beat the four transcript units.
    expect(storeMocks.markAsrSettledFromReserved).toHaveBeenCalledWith({}, 'asr-request-1', 8, 2, expect.any(Number))
    expect(storeMocks.markAsrSettledFromReserved.mock.invocationCallOrder[0]).toBeLessThan(
      creditsMocks.releaseConsumedCredits.mock.invocationCallOrder[0]!,
    )
    expect(storeMocks.putAsrResultObject).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ id: 'asr-request-1', status: 'reserved' }),
      { transcript: 'alpha beta', billedSeconds: 2 },
    )
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      2,
      'asr-reservation-release',
      expect.objectContaining({ requestId: 'asr-request-1' }),
      { idempotencyKey: 'asr-release:asr-request-1:8', reservationLedgerId: RESERVATION_LEDGER_ID },
    )
    expect(storeMocks.markAsrDispatching).not.toHaveBeenCalled()
    expect(result).toEqual({
      requestId: 'asr-request-1',
      status: 'settled',
      creditsCharged: 8,
      billedSeconds: 2,
      failureCode: null,
      transcript: 'alpha beta',
    })
  })

  it('answers a same-key replay from the private result object without dispatching or reserving again', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    storeMocks.createAsrRequest.mockResolvedValue({
      created: false,
      request: request({
        status: 'settled',
        providerTaskId: null,
        chargedCredits: 8,
        billedSeconds: 2,
        reservationLedgerId: RESERVATION_LEDGER_ID,
      }),
    })
    storeMocks.getAsrResultObject.mockResolvedValue({ transcript: 'alpha beta', billedSeconds: 2 })
    const qwen = qwenAdapter({ transcript: 'must not be requested', billedSeconds: 1 })

    const result = await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { qwenAdapter: qwen },
    )

    expect(result).toEqual({
      requestId: 'asr-request-1',
      status: 'settled',
      creditsCharged: 8,
      billedSeconds: 2,
      failureCode: null,
      transcript: 'alpha beta',
    })
    expect(qwen.transcribe).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrReserved).not.toHaveBeenCalled()
  })

  it('keeps a normalized result settled and resumes an interrupted credit release on replay', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    const qwen = qwenAdapter({ transcript: 'recoverable result', billedSeconds: 2 })
    creditsMocks.releaseConsumedCredits.mockRejectedValueOnce(new Error('release persistence unavailable'))

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { qwenAdapter: qwen },
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
      data: { errorCode: 'ASR_SETTLEMENT_INCOMPLETE' },
    })

    const settled = request({
      status: 'settled',
      providerTaskId: null,
      chargedCredits: 8,
      billedSeconds: 2,
      reservationLedgerId: RESERVATION_LEDGER_ID,
    })
    storeMocks.createAsrRequest.mockResolvedValueOnce({ created: false, request: settled })
    storeMocks.getAsrResultObject.mockResolvedValueOnce({ transcript: 'recoverable result', billedSeconds: 2 })

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { qwenAdapter: qwen },
      ),
    ).resolves.toMatchObject({ status: 'settled', transcript: 'recoverable result' })

    expect(qwen.transcribe).toHaveBeenCalledTimes(1)
    expect(storeMocks.markAsrFailed).not.toHaveBeenCalled()
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledTimes(2)
    expect(creditsMocks.releaseConsumedCredits.mock.calls.map(call => call[5])).toEqual([
      { idempotencyKey: 'asr-release:asr-request-1:8', reservationLedgerId: RESERVATION_LEDGER_ID },
      { idempotencyKey: 'asr-release:asr-request-1:8', reservationLedgerId: RESERVATION_LEDGER_ID },
    ])
  })

  it('settles a stored-but-unsettled result on a same-key replay without dispatching Qwen again', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    // The previous attempt stored the provider result but died before the settlement row was
    // written, so the request is still held as `reserved` with no provider task.
    storeMocks.createAsrRequest.mockResolvedValue({
      created: false,
      request: request({ status: 'reserved', providerTaskId: null, reservationLedgerId: RESERVATION_LEDGER_ID }),
    })
    storeMocks.getAsrResultObject.mockResolvedValue({ transcript: 'stored but unsettled', billedSeconds: 2 })
    const qwen = qwenAdapter({ transcript: 'must not be requested', billedSeconds: 1 })

    const result = await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { qwenAdapter: qwen },
    )

    expect(result).toMatchObject({ status: 'settled', transcript: 'stored but unsettled' })
    expect(qwen.transcribe).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
    expect(storeMocks.putAsrResultObject).not.toHaveBeenCalled()
    expect(storeMocks.markAsrSettledFromReserved).toHaveBeenCalledWith(
      {},
      'asr-request-1',
      expect.any(Number),
      2,
      expect.any(Number),
    )
    // The recovered settlement must still hand the unused part of the hold back on the ledger
    // that took it, exactly like a first-time settlement.
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      2,
      'asr-reservation-release',
      expect.objectContaining({ requestId: 'asr-request-1' }),
      { idempotencyKey: 'asr-release:asr-request-1:8', reservationLedgerId: RESERVATION_LEDGER_ID },
    )
  })

  it('serves a settled synchronous transcript from the private result object without polling the provider', async () => {
    storeMocks.getAsrRequest.mockResolvedValue(
      request({
        status: 'settled',
        providerTaskId: null,
        chargedCredits: 8,
        billedSeconds: 2,
        reservationLedgerId: RESERVATION_LEDGER_ID,
      }),
    )
    storeMocks.getAsrResultObject.mockResolvedValue({ transcript: 'alpha beta', billedSeconds: 2 })
    const filetrans = adapter({ status: 'pending' })

    const result = await pollAsrTranscription({} as never, 'user-1', 'asr-request-1', { adapter: filetrans })

    expect(result).toEqual({
      requestId: 'asr-request-1',
      status: 'settled',
      creditsCharged: 8,
      billedSeconds: 2,
      failureCode: null,
      transcript: 'alpha beta',
    })
    expect(filetrans.getTask).not.toHaveBeenCalled()
  })

  it('releases a settled reservation before returning missing-result 503', async () => {
    storeMocks.getAsrRequest.mockResolvedValue(
      request({
        status: 'settled',
        providerTaskId: null,
        chargedCredits: 8,
        billedSeconds: 2,
        reservationLedgerId: RESERVATION_LEDGER_ID,
      }),
    )
    storeMocks.getAsrResultObject.mockResolvedValue(null)

    await expect(pollAsrTranscription({} as never, 'user-1', 'asr-request-1')).rejects.toMatchObject({
      statusCode: 503,
      data: { errorCode: 'ASR_RESULT_UNAVAILABLE' },
    })

    // The unspent hold is returned even though the transcript is gone: a 503 that left the
    // credits held would charge the user for a result they can no longer read.
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      2,
      'asr-reservation-release',
      expect.objectContaining({ requestId: 'asr-request-1' }),
      { idempotencyKey: 'asr-release:asr-request-1:8', reservationLedgerId: RESERVATION_LEDGER_ID },
    )
  })

  it('rejects a same-key settled replay when its private result is unavailable', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    storeMocks.createAsrRequest.mockResolvedValue({
      created: false,
      request: request({
        status: 'settled',
        providerTaskId: null,
        chargedCredits: 8,
        billedSeconds: 2,
        reservationLedgerId: RESERVATION_LEDGER_ID,
      }),
    })
    storeMocks.getAsrResultObject.mockResolvedValue(null)
    const qwen = qwenAdapter({ transcript: 'must not be requested', billedSeconds: 1 })

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { qwenAdapter: qwen },
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
      data: { errorCode: 'ASR_RESULT_UNAVAILABLE' },
    })

    expect(qwen.transcribe).not.toHaveBeenCalled()
    // The replay returns the unused hold before reporting the missing result, so a retry
    // cannot strand it.
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      2,
      'asr-reservation-release',
      expect.objectContaining({ requestId: 'asr-request-1' }),
      { idempotencyKey: 'asr-release:asr-request-1:8', reservationLedgerId: RESERVATION_LEDGER_ID },
    )
  })

  it.each([
    { name: 'no recognisable transport', metadata: { source: 'provider-registry' } },
    {
      name: 'two candidate models without an explicit adapter',
      metadata: { models: ['qwen-audio-3.0-asr-flash', 'qwen-audio-3.0-asr-flash-filetrans'] },
    },
    {
      name: 'a default model that disagrees with the selected transport',
      metadata: { transport: 'qwen-audio-sync', defaultModel: 'qwen-audio-3.0-asr-flash-filetrans' },
    },
  ])('refuses to admit audio when registry metadata has $name', async ({ metadata }) => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider(metadata)])
    const qwen = qwenAdapter({ transcript: 'must not be requested', billedSeconds: 1 })

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { qwenAdapter: qwen },
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
      data: { errorCode: 'ASR_PROVIDER_CONFIGURATION_INVALID' },
    })

    expect(storeMocks.createAsrRequest).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
    expect(qwen.transcribe).not.toHaveBeenCalled()
  })

  it('refuses a clip longer than the synchronous cap before creating a request or holding credits', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    storeMocks.parseWavMetadata.mockReturnValue(
      wavMetadata({ durationSeconds: QWEN_AUDIO_ASR_MAX_DURATION_SECONDS + 0.1 }),
    )
    const qwen = qwenAdapter({ transcript: 'must not be requested', billedSeconds: 1 })

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { qwenAdapter: qwen },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      data: { errorCode: 'ASR_AUDIO_DURATION_UNSUPPORTED' },
    })

    expect(storeMocks.createAsrRequest).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
    expect(qwen.transcribe).not.toHaveBeenCalled()
  })

  it('admits a clip exactly at the synchronous cap', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    storeMocks.parseWavMetadata.mockReturnValue(
      wavMetadata({ durationSeconds: QWEN_AUDIO_ASR_MAX_DURATION_SECONDS }),
    )

    const result = await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { qwenAdapter: qwenAdapter({ transcript: 'ok', billedSeconds: 1 }) },
    )

    expect(storeMocks.createAsrRequest).toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'settled', transcript: 'ok' })
  })

  it('refuses audio past the admission size limit before creating a request or holding credits', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    const qwen = qwenAdapter({ transcript: 'must not be requested', billedSeconds: 1 })

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        {
          audio: Buffer.alloc(storeMocks.ASR_AUDIO_MAX_BYTES + 1),
          contentType: 'audio/wav',
          idempotencyKey: 'idempotency-key',
        },
        { qwenAdapter: qwen },
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      data: { errorCode: 'ASR_AUDIO_INVALID' },
    })

    expect(storeMocks.createAsrRequest).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
    expect(qwen.transcribe).not.toHaveBeenCalled()
  })

  it('releases the reservation when the provider rejects the synchronous request before acceptance', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    const rejected = new DashScopeAsrError('ASR_PROVIDER_REJECTED', false)

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { qwenAdapter: qwenAdapter(rejected) },
      ),
    ).rejects.toBe(rejected)

    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      10,
      'asr-reservation-release',
      expect.objectContaining({ requestId: 'asr-request-1', failureCode: 'ASR_PROVIDER_REJECTED' }),
      { idempotencyKey: 'asr-release:asr-request-1:0', reservationLedgerId: RESERVATION_LEDGER_ID },
    )
    expect(storeMocks.markAsrReleased).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_PROVIDER_REJECTED')
    expect(storeMocks.putAsrResultObject).not.toHaveBeenCalled()
    expect(storeMocks.markAsrSettledFromReserved).not.toHaveBeenCalled()
  })

  it('terminally fails an uncertain synchronous transport outcome without refunding or replaying', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    const uncertain = new DashScopeAsrError('ASR_PROVIDER_UNAVAILABLE', true)

    const result = await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { qwenAdapter: qwenAdapter(uncertain) },
    )

    // DashScope may have accepted and charged the request, so the hold is retained and
    // the request is failed terminally instead of refunded or silently retried.
    expect(result).toMatchObject({ status: 'failed', failureCode: 'ASR_DISPATCH_STATE_UNCERTAIN' })
    expect(storeMocks.markAsrFailed).toHaveBeenCalledWith({}, 'asr-request-1', 'ASR_DISPATCH_STATE_UNCERTAIN')
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrReleased).not.toHaveBeenCalled()
    expect(storeMocks.putAsrResultObject).not.toHaveBeenCalled()
  })

  /**
   * A request reserved by an older deploy carries no ledger id, so the hold can only be found by
   * the business key it was taken under. Releasing against a transient id would leave the real
   * hold stranded the next time the same request is refunded.
   */
  it('recovers and persists the original reservation ledger of a legacy reserved request before releasing it', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    storeMocks.markAsrReserved.mockResolvedValue(request({ status: 'reserved', providerTaskId: null }))
    creditsMocks.findCreditReservationLedgerId.mockResolvedValue('ledger-recovered-1')
    const rejected = new DashScopeAsrError('ASR_PROVIDER_REJECTED', false)

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { qwenAdapter: qwenAdapter(rejected) },
      ),
    ).rejects.toBe(rejected)

    expect(creditsMocks.findCreditReservationLedgerId).toHaveBeenCalledWith(
      {},
      'user-1',
      'asr-reserve:asr-request-1',
    )
    expect(storeMocks.setAsrReservationLedgerId).toHaveBeenCalledWith({}, 'asr-request-1', 'ledger-recovered-1')
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      10,
      'asr-reservation-release',
      expect.objectContaining({ requestId: 'asr-request-1', failureCode: 'ASR_PROVIDER_REJECTED' }),
      { idempotencyKey: 'asr-release:asr-request-1:0', reservationLedgerId: 'ledger-recovered-1' },
    )
    // The id must be durable before it is used to move money.
    expect(storeMocks.setAsrReservationLedgerId.mock.invocationCallOrder[0]).toBeLessThan(
      creditsMocks.releaseConsumedCredits.mock.invocationCallOrder[0]!,
    )
  })

  it('refuses to release a legacy reservation whose original hold cannot be found', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    storeMocks.markAsrReserved.mockResolvedValue(request({ status: 'reserved', providerTaskId: null }))
    creditsMocks.findCreditReservationLedgerId.mockResolvedValue(null)
    const rejected = new DashScopeAsrError('ASR_PROVIDER_REJECTED', false)

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { qwenAdapter: qwenAdapter(rejected) },
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
      data: { errorCode: 'ASR_SETTLEMENT_INCOMPLETE' },
    })

    // Releasing without a ledger would refund an unrelated bucket, so nothing may move.
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(storeMocks.setAsrReservationLedgerId).not.toHaveBeenCalled()
    expect(storeMocks.markAsrReleased).not.toHaveBeenCalled()
  })
})

describe('ASR same-key recovery precedence', () => {
  const pricing = selectCreditPricingRule('audio.transcribe', DEFAULT_CREDIT_PRICING)

  it('finishes a reserved request from its stored result without touching provider or admission gates', async () => {
    // Both gates a brand-new request would need are made to explode, so this can only pass if
    // the idempotent recovery is resolved before either is consulted.
    registryMocks.listProviderRegistryEntries.mockRejectedValue(new Error('registry unavailable'))
    pricingMocks.resolveCreditPricingRule.mockRejectedValue(new Error('pricing unavailable'))
    storeMocks.getAsrRequestByIdempotency.mockResolvedValue(
      request({ status: 'reserved', providerTaskId: null, reservationLedgerId: RESERVATION_LEDGER_ID }),
    )
    storeMocks.getAsrResultObject.mockResolvedValue({ transcript: 'recovered words', billedSeconds: 2 })
    const qwen = qwenAdapter({ transcript: 'must not be requested', billedSeconds: 1 })

    const result = await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { qwenAdapter: qwen },
    )

    expect(result).toMatchObject({ status: 'settled', transcript: 'recovered words' })
    expect(storeMocks.createAsrRequest).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
    expect(registryMocks.listProviderRegistryEntries).not.toHaveBeenCalled()
    expect(pricingMocks.resolveCreditPricingRule).not.toHaveBeenCalled()
    expect(qwen.transcribe).not.toHaveBeenCalled()
    // The stored result settles at the price quoted on the original admission.
    expect(storeMocks.markAsrSettledFromReserved).toHaveBeenCalledWith(
      {},
      'asr-request-1',
      calculateFiletransCredits(pricing, 'recovered words', 2),
      2,
      expect.any(Number),
    )
  })

  it('returns a settled replay from its private result without re-releasing a released hold', async () => {
    storeMocks.getAsrRequestByIdempotency.mockResolvedValue(
      request({
        status: 'settled',
        providerTaskId: null,
        chargedCredits: 8,
        creditsReleasedAt: '2026-09-08T00:05:00.000Z',
      }),
    )
    storeMocks.getAsrResultObject.mockResolvedValue({ transcript: 'stored transcript', billedSeconds: 2 })

    const result = await startAsrTranscription({} as never, 'user-1', {
      audio: Buffer.from('wav'),
      contentType: 'audio/wav',
      idempotencyKey: 'idempotency-key',
    })

    expect(result).toMatchObject({ status: 'settled', transcript: 'stored transcript' })
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrCreditsReleased).not.toHaveBeenCalled()
  })
})

describe('ASR synchronous admission gates', () => {
  it('rejects an encoded body past the synchronous byte cap before creating a request or holding credits', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    // A canonical WAV header on a body that clears the generic 20 MiB cap but not the
    // 14 MiB data-URI ceiling DashScope actually accepts.
    const audio = Buffer.alloc(QWEN_AUDIO_ASR_MAX_RAW_BYTES + 1)
    const qwen = qwenAdapter({ transcript: 'must not be requested', billedSeconds: 1 })

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio, contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { qwenAdapter: qwen },
      ),
    ).rejects.toMatchObject({ statusCode: 413, data: { errorCode: 'ASR_AUDIO_TOO_LARGE' } })

    expect(storeMocks.createAsrRequest).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
    expect(qwen.transcribe).not.toHaveBeenCalled()
  })

  it.each([
    { name: 'a float encoding', metadata: wavMetadata({ encoding: 3 }) },
    { name: 'stereo channels', metadata: wavMetadata({ channels: 2, byteRate: 64_000, blockAlign: 4 }) },
    { name: 'a 44.1 kHz rate', metadata: wavMetadata({ sampleRate: 44_100, byteRate: 88_200 }) },
    { name: '24-bit samples', metadata: wavMetadata({ bits: 24, byteRate: 48_000, blockAlign: 3 }) },
  ])('refuses $name on the synchronous route before creating a request', async ({ metadata }) => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    storeMocks.parseWavMetadata.mockReturnValue(metadata)
    const qwen = qwenAdapter({ transcript: 'must not be requested', billedSeconds: 1 })

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { qwenAdapter: qwen },
      ),
    ).rejects.toMatchObject({ statusCode: 400, data: { errorCode: 'ASR_AUDIO_FORMAT_UNSUPPORTED' } })

    expect(storeMocks.createAsrRequest).not.toHaveBeenCalled()
    expect(creditsMocks.consumeCredits).not.toHaveBeenCalled()
    expect(qwen.transcribe).not.toHaveBeenCalled()
  })

  it('forwards the validated sample rate and duration to the synchronous adapter', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    storeMocks.parseWavMetadata.mockReturnValue(wavMetadata({ durationSeconds: 12.5 }))
    const qwen = qwenAdapter({ transcript: 'ok', billedSeconds: 12.5 })

    await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { qwenAdapter: qwen },
    )

    expect(qwen.transcribe).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ id: provider.id }),
      expect.any(Buffer),
      { model: 'qwen-audio-3.0-asr-flash', durationSeconds: 12.5, sampleRate: 16_000 },
    )
  })

  it('asks the store to persist no source handoff on the synchronous route', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])

    await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { qwenAdapter: qwenAdapter({ transcript: 'ok', billedSeconds: 1 }) },
    )

    // The synchronous route hands the bytes straight to the provider, so a stored WAV would be
    // an unreferenced private object that only the TTL sweep could ever reclaim.
    expect(storeMocks.createAsrRequest).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ storeHandoff: false }),
    )
  })

  it('keeps the source handoff on the asynchronous Filetrans route', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([provider])

    await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { adapter: adapter({ status: 'pending' }) },
    )

    // The provider pulls the audio from a delivery URL later, so the source must exist until
    // the request reaches a terminal state.
    expect(storeMocks.createAsrRequest).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ storeHandoff: true }),
    )
  })

  it('accepts a conflicting settle when the competing winner recorded identical accounting', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    storeMocks.markAsrSettledFromReserved.mockRejectedValueOnce(new Error('ASR_REQUEST_STATE_CONFLICT'))
    const pricing = selectCreditPricingRule('audio.transcribe', DEFAULT_CREDIT_PRICING)
    const charged = calculateFiletransCredits(pricing, 'alpha beta', 2)
    storeMocks.getAsrRequest.mockResolvedValue(
      request({
        status: 'settled',
        providerTaskId: null,
        chargedCredits: charged,
        billedSeconds: 2,
        providerCostCny: calculateFiletransProviderCost(2),
        reservationLedgerId: RESERVATION_LEDGER_ID,
      }),
    )

    const result = await startAsrTranscription(
      {} as never,
      'user-1',
      { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
      { qwenAdapter: qwenAdapter({ transcript: 'alpha beta', billedSeconds: 2 }) },
    )

    // A duplicate delivery of the same result is benign: the outside writer settled to the same
    // numbers, so the response is that settled record rather than a spurious conflict.
    expect(result).toMatchObject({ status: 'settled', creditsCharged: charged, billedSeconds: 2 })
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      10 - charged,
      'asr-reservation-release',
      expect.objectContaining({ requestId: 'asr-request-1' }),
      { idempotencyKey: `asr-release:asr-request-1:${charged}`, reservationLedgerId: RESERVATION_LEDGER_ID },
    )
  })

  it('rejects a conflicting settle when the competing winner charged a different amount', async () => {
    registryMocks.listProviderRegistryEntries.mockResolvedValue([qwenProvider()])
    storeMocks.markAsrSettledFromReserved.mockRejectedValueOnce(new Error('ASR_REQUEST_STATE_CONFLICT'))
    const pricing = selectCreditPricingRule('audio.transcribe', DEFAULT_CREDIT_PRICING)
    const charged = calculateFiletransCredits(pricing, 'alpha beta', 2)
    storeMocks.getAsrRequest.mockResolvedValue(
      request({
        status: 'settled',
        providerTaskId: null,
        chargedCredits: charged + 1,
        billedSeconds: 2,
        providerCostCny: calculateFiletransProviderCost(2),
      }),
    )

    await expect(
      startAsrTranscription(
        {} as never,
        'user-1',
        { audio: Buffer.from('wav'), contentType: 'audio/wav', idempotencyKey: 'idempotency-key' },
        { qwenAdapter: qwenAdapter({ transcript: 'alpha beta', billedSeconds: 2 }) },
      ),
    ).rejects.toMatchObject({
      statusCode: 503,
      data: { errorCode: 'ASR_SETTLEMENT_INCOMPLETE' },
    })

    // Two different charges for one request is exactly the over-charge this guard exists to stop:
    // the conflict is surfaced instead of silently returning the other writer's settlement.
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
  })
})

describe('ASR settlement maintenance', () => {
  it('settles an expired reserved request from its result before the retention sweep deletes it', async () => {
    storeMocks.listAsrSettlementMaintenanceRequests.mockResolvedValue([
      request({ status: 'reserved', providerTaskId: null, reservationLedgerId: RESERVATION_LEDGER_ID }),
    ])
    storeMocks.getAsrResultObject.mockResolvedValue({ transcript: 'late result', billedSeconds: 2 })

    const summary = await reconcileExpiredAsrSettlements({} as never)

    expect(summary).toEqual({ scanned: 1, reconciled: 1, failed: 0 })
    // Reading a result whose delivery window has passed is the whole point of this maintenance
    // pass; without the override the store would hide it and the hold would stay stranded.
    expect(storeMocks.getAsrResultObject).toHaveBeenCalledWith({}, expect.anything(), {
      settlementRecovery: true,
      allowExpiredSettlement: true,
    })
    expect(storeMocks.markAsrSettledFromReserved).toHaveBeenCalled()
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalled()
  })

  it('retries the release for a settled request whose result object is already gone', async () => {
    storeMocks.listAsrSettlementMaintenanceRequests.mockResolvedValue([
      request({
        status: 'settled',
        providerTaskId: null,
        chargedCredits: 8,
        billedSeconds: 2,
        reservationLedgerId: RESERVATION_LEDGER_ID,
      }),
    ])
    storeMocks.getAsrResultObject.mockResolvedValue(null)

    const summary = await reconcileExpiredAsrSettlements({} as never)

    expect(summary).toEqual({ scanned: 1, reconciled: 1, failed: 0 })
    expect(creditsMocks.releaseConsumedCredits).toHaveBeenCalledWith(
      {},
      'user-1',
      2,
      'asr-reservation-release',
      expect.objectContaining({ requestId: 'asr-request-1' }),
      { idempotencyKey: 'asr-release:asr-request-1:8', reservationLedgerId: RESERVATION_LEDGER_ID },
    )
    expect(storeMocks.markAsrCreditsReleased).toHaveBeenCalledWith({}, 'asr-request-1')
  })

  it('leaves a settled request whose hold was already released alone', async () => {
    storeMocks.listAsrSettlementMaintenanceRequests.mockResolvedValue([
      request({
        status: 'settled',
        providerTaskId: null,
        chargedCredits: 8,
        creditsReleasedAt: '2026-09-08T00:05:00.000Z',
      }),
    ])

    const summary = await reconcileExpiredAsrSettlements({} as never)

    expect(summary).toEqual({ scanned: 1, reconciled: 1, failed: 0 })
    expect(creditsMocks.releaseConsumedCredits).not.toHaveBeenCalled()
    expect(storeMocks.markAsrCreditsReleased).not.toHaveBeenCalled()
  })

  it('keeps reconciling after one request fails', async () => {
    storeMocks.listAsrSettlementMaintenanceRequests.mockResolvedValue([
      request({
        id: 'asr-request-1',
        status: 'settled',
        providerTaskId: null,
        chargedCredits: 8,
        reservationLedgerId: RESERVATION_LEDGER_ID,
      }),
      request({
        id: 'asr-request-2',
        status: 'settled',
        providerTaskId: null,
        chargedCredits: 8,
        reservationLedgerId: RESERVATION_LEDGER_ID,
      }),
    ])
    creditsMocks.releaseConsumedCredits.mockRejectedValueOnce(new Error('ledger unavailable'))

    const summary = await reconcileExpiredAsrSettlements({} as never)

    expect(summary).toEqual({ scanned: 2, reconciled: 1, failed: 1 })
  })
})
