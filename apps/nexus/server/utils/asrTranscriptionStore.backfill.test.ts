import { DatabaseSync } from 'node:sqlite'
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it } from 'vitest'
import { getAsrRequest } from './asrTranscriptionStore'

const TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS asr_transcription_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    object_key TEXT NOT NULL,
    content_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    duration_seconds INTEGER NOT NULL,
    delivery_token_hash TEXT NOT NULL,
    delivery_expires_at TEXT NOT NULL,
    provider_task_id TEXT,
    status TEXT NOT NULL,
    reserved_credits INTEGER NOT NULL DEFAULT 0,
    reservation_ledger_id TEXT,
    charged_credits INTEGER,
    credits_released_at TEXT,
    billed_seconds INTEGER,
    provider_cost_cny REAL,
    failure_code TEXT,
    pricing_snapshot TEXT,
    result_deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, idempotency_key)
  );
`

/**
 * A D1-shaped driver over real in-memory SQLite.
 *
 * The backfill is an `UPDATE ... WHERE` whose predicate decides which historical rows are
 * considered already-settled. A hand-written fake that re-implements the predicate would agree
 * with itself no matter what the source does, so this harness runs the store's own SQL.
 */
function createD1(db: DatabaseSync) {
  function statement(sql: string) {
    const prepared = db.prepare(sql)
    const bound = (args: unknown[]) => ({
      async first<T>() {
        return (prepared.get(...(args as never[])) ?? null) as T | null
      },
      async run() {
        prepared.run(...(args as never[]))
        return { meta: { changes: 1 } }
      },
      async all<T>() {
        return { results: prepared.all(...(args as never[])) as T[] }
      },
    })
    return { ...bound([]), bind: (...args: unknown[]) => bound(args) }
  }
  return { prepare: statement }
}

let db: DatabaseSync
let d1: ReturnType<typeof createD1>

function eventFor(): H3Event {
  const event = { context: { cloudflare: { env: { DB: d1 } } } } as unknown as H3Event
  return event
}

function seedRow(input: {
  id: string
  status: string
  reservationLedgerId?: string | null
  creditsReleasedAt?: string | null
  updatedAt: string
}): void {
  db.prepare(
    `INSERT INTO asr_transcription_requests (
       id, user_id, provider_id, capability, idempotency_key, request_hash, object_key,
       content_type, byte_size, duration_seconds, delivery_token_hash, delivery_expires_at,
       status, reserved_credits, reservation_ledger_id, credits_released_at, created_at, updated_at
     ) VALUES (?, 'user-1', 'dashscope', 'asr', ?, 'hash', 'obj', 'audio/wav', 1, 1, 'token',
       '2026-01-01T00:00:00.000Z', ?, 3, ?, ?, ?, ?)`,
  ).run(
    input.id,
    `key-${input.id}`,
    input.status,
    input.reservationLedgerId ?? null,
    input.creditsReleasedAt ?? null,
    input.updatedAt,
    input.updatedAt,
  )
}

function releasedAt(id: string): string | null | undefined {
  const row = db
    .prepare('SELECT credits_released_at FROM asr_transcription_requests WHERE id = ?')
    .get(id) as { credits_released_at: string | null } | undefined
  return row?.credits_released_at
}

const LEGACY_SETTLED = 'asr_11111111-1111-4111-8111-111111111111'
const IN_FLIGHT = 'asr_22222222-2222-4222-8222-222222222222'
const LEDGER_SETTLED = 'asr_33333333-3333-4333-8333-333333333333'
const FAILED = 'asr_44444444-4444-4444-8444-444444444444'
const ALREADY_STAMPED = 'asr_55555555-5555-4555-8555-555555555555'

describe('ASR credits-release backfill', () => {
  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    db.exec(TABLE_DDL)
    d1 = createD1(db)
  })

  it('stamps only legacy settled rows with no reservation ledger, preserving existing stamps', async () => {
    seedRow({ id: LEGACY_SETTLED, status: 'settled', updatedAt: '2026-01-01T00:00:00.000Z' })
    seedRow({ id: IN_FLIGHT, status: 'dispatching', updatedAt: '2026-01-02T00:00:00.000Z' })
    seedRow({
      id: LEDGER_SETTLED,
      status: 'settled',
      reservationLedgerId: 'ledger-new',
      updatedAt: '2026-01-03T00:00:00.000Z',
    })
    seedRow({ id: FAILED, status: 'failed', updatedAt: '2026-01-04T00:00:00.000Z' })
    seedRow({
      id: ALREADY_STAMPED,
      status: 'settled',
      creditsReleasedAt: '2025-12-31T00:00:00.000Z',
      updatedAt: '2026-01-05T00:00:00.000Z',
    })

    // Any store read runs the schema maintenance, including the backfill.
    await expect(getAsrRequest(eventFor(), 'asr_99999999-9999-4999-8999-999999999999')).resolves.toBeNull()

    // Legacy settled rows predate the release marker: the settled transition itself proved release.
    expect(releasedAt(LEGACY_SETTLED)).toBe('2026-01-01T00:00:00.000Z')
    // A row still in flight has not settled, so it must not be marked released.
    expect(releasedAt(IN_FLIGHT)).toBeNull()
    // Ledger-bound rows may still owe a remainder release; stamping them would skip that money.
    expect(releasedAt(LEDGER_SETTLED)).toBeNull()
    expect(releasedAt(FAILED)).toBeNull()
    // COALESCE keeps the authoritative timestamp when one was already recorded.
    expect(releasedAt(ALREADY_STAMPED)).toBe('2025-12-31T00:00:00.000Z')
  })
})
