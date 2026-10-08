import type { H3Event } from 'h3'
import type { SqliteD1Database, SqliteD1Statement } from '../../test/helpers/d1-sqlite'
import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../../test/helpers/d1-sqlite'
import { DEFAULT_CREDIT_PRICING, selectCreditPricingRule } from './creditPricingStore'

/**
 * The request record's state machine against real SQLite: which transitions a row accepts, what each
 * returns, and the round trips they cost.
 */

let store: typeof import('./asrTranscriptionStore')
let d1: SqliteD1Database

const LEDGER_ID = '11111111-2222-4333-8444-555555555555'
const OTHER_LEDGER_ID = '66666666-7777-4888-9999-aaaaaaaaaaaa'

function eventFor(db: unknown = d1): H3Event {
  return { context: { cloudflare: { env: { DB: db } } } } as unknown as H3Event
}

/** Counts round trips: one per statement run on its own, one per batch. */
function countingD1(inner: SqliteD1Database) {
  let roundTrips = 0
  const wrap = (statement: SqliteD1Statement): SqliteD1Statement => new Proxy(statement, {
    get(target, property, receiver) {
      if (property === 'bind')
        return (...values: unknown[]) => wrap(target.bind(...values))
      if (property === 'first' || property === 'all' || property === 'run') {
        return (...args: unknown[]) => {
          roundTrips += 1
          return (target as any)[property](...args)
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
  const db = {
    prepare: (sql: string) => wrap(inner.prepare(sql)),
    batch: async (statements: SqliteD1Statement[]) => {
      roundTrips += 1
      return inner.batch(statements)
    },
  }
  return { db, roundTrips: () => roundTrips }
}

function input(overrides: { idempotencyKey?: string, audio?: Buffer } = {}) {
  return {
    userId: 'user_1',
    idempotencyKey: overrides.idempotencyKey ?? 'asr-request-0001',
    audio: overrides.audio ?? Buffer.from('RIFF-audio-bytes'),
    contentType: 'audio/wav',
    providerId: 'dashscope-asr',
    durationSeconds: 12,
    pricing: selectCreditPricingRule('audio.transcribe', DEFAULT_CREDIT_PRICING),
    storeHandoff: false,
  }
}

beforeEach(async () => {
  vi.resetModules()
  store = await import('./asrTranscriptionStore')
  d1 = createSqliteD1()
})

afterEach(() => {
  d1.close()
})

describe('createAsrRequest', () => {
  it('creates a request, and answers a replay of the same audio with it', async () => {
    const created = await store.createAsrRequest(eventFor(), input())
    const replayed = await store.createAsrRequest(eventFor(), input())

    expect(created).toMatchObject({ created: true, request: { status: 'pending', userId: 'user_1' } })
    expect(created.deliveryToken).toEqual(expect.any(String))
    expect(replayed).toEqual({ created: false, deliveryToken: null, request: created.request })
  })

  it('refuses the same key for different audio', async () => {
    await store.createAsrRequest(eventFor(), input())

    await expect(store.createAsrRequest(eventFor(), input({ audio: Buffer.from('other audio') })))
      .rejects.toMatchObject({ statusCode: 409 })
  })

  it('creates a new request in one round trip', async () => {
    await store.createAsrRequest(eventFor(), input({ idempotencyKey: 'asr-request-warm' }))
    const counting = countingD1(d1)
    await store.getAsrRequest(eventFor(counting.db), 'asr_00000000-0000-4000-8000-000000000000') // reads the schema record
    const before = counting.roundTrips()

    await store.createAsrRequest(eventFor(counting.db), input())

    expect(counting.roundTrips() - before).toBe(1)
  })
})

describe('request transitions', () => {
  async function pendingRequest() {
    return (await store.createAsrRequest(eventFor(), input())).request
  }

  it('moves through reserved and settled, answering each with the row it wrote, in one round trip each', async () => {
    const pending = await pendingRequest()
    const counting = countingD1(d1)
    await store.getAsrRequest(eventFor(counting.db), pending.id) // reads the schema record
    const before = counting.roundTrips()

    const reserved = await store.markAsrReserved(eventFor(counting.db), pending.id, LEDGER_ID)
    const settled = await store.markAsrSettledFromReserved(eventFor(counting.db), pending.id, 5, 12, 0.5)

    expect(counting.roundTrips() - before).toBe(2)
    expect(reserved).toMatchObject({ id: pending.id, status: 'reserved', reservationLedgerId: LEDGER_ID })
    expect(settled).toMatchObject({ status: 'settled', chargedCredits: 5, billedSeconds: 12, providerCostCny: 0.5, reservationLedgerId: LEDGER_ID })
    expect(await store.getAsrRequest(eventFor(), pending.id)).toEqual(settled)
  })

  it('refuses a transition from a state it does not leave from', async () => {
    const pending = await pendingRequest()

    await expect(store.markAsrSettledFromReserved(eventFor(), pending.id, 5, 12, 0.5)).rejects.toThrow('ASR_REQUEST_STATE_CONFLICT')
    await expect(store.markAsrFailed(eventFor(), pending.id, 'ASR_PROVIDER_FAILED')).rejects.toThrow('ASR_REQUEST_STATE_CONFLICT')
    expect(await store.getAsrRequest(eventFor(), pending.id)).toMatchObject({ status: 'pending', failureCode: null })
  })

  it('marks credits released once, answers a repeat with the row, and refuses an unsettled request', async () => {
    const pending = await pendingRequest()
    await expect(store.markAsrCreditsReleased(eventFor(), pending.id)).rejects.toThrow('ASR_REQUEST_STATE_CONFLICT')
    await store.markAsrReserved(eventFor(), pending.id, LEDGER_ID)
    await store.markAsrSettledFromReserved(eventFor(), pending.id, 5, 12, 0.5)

    const first = await store.markAsrCreditsReleased(eventFor(), pending.id)
    const again = await store.markAsrCreditsReleased(eventFor(), pending.id)

    expect(first.creditsReleasedAt).toEqual(expect.any(String))
    expect(again).toEqual(first)
  })

  it('records a reservation ledger once, accepts the same one again, and refuses another', async () => {
    const pending = await pendingRequest()
    // A request reserved before ledger ids were recorded.
    d1.sqlite.prepare(`UPDATE asr_transcription_requests SET status = 'reserved' WHERE id = ?`).run(pending.id)

    const set = await store.setAsrReservationLedgerId(eventFor(), pending.id, LEDGER_ID)
    const again = await store.setAsrReservationLedgerId(eventFor(), pending.id, LEDGER_ID)

    expect(set).toMatchObject({ status: 'reserved', reservationLedgerId: LEDGER_ID })
    expect(again).toEqual(set)
    await expect(store.setAsrReservationLedgerId(eventFor(), pending.id, OTHER_LEDGER_ID)).rejects.toThrow('ASR_REQUEST_STATE_CONFLICT')
  })
})
