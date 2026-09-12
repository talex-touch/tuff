import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../db/schema'

/**
 * Polish telemetry is aggregate-only by construction: the row a decision leaves behind is the
 * gate's tier, the transcript's size and the pass' outcome — never the transcript. The store is
 * exercised against a real migrated database rather than a fake lane, because the two rules that
 * can silently lose or resurrect data (the id primary key, and the generation fence shared with
 * `recordSuccess`) are properties of the SQL, not of the JavaScript above it.
 *
 * `summarizePolishTelemetry` is the only reader, so it is also where the window, the percentiles
 * and the capped-scope count are asserted.
 */
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 })

const aux = vi.hoisted(() => ({
  resolution: null as { db: unknown; isAux: boolean } | null,
  /** Held by a test that needs a write to land after something else has already happened. */
  hold: null as Promise<void> | null
}))

vi.mock('../../db/db-write', () => ({
  resolveCurrentAuxDb: () => aux.resolution,
  scheduleAuxWrite: async (_label: string, op: (db: unknown) => Promise<unknown>) => {
    const hold = aux.hold
    if (hold) {
      aux.hold = null
      await hold
    }
    if (!aux.resolution) throw new Error('the aux database has not been initialised')
    return await op(aux.resolution.db)
  }
}))

import { VoiceInsightsStore, type VoicePolishPass } from './voice-insights-store'

const MIGRATIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../resources/db/migrations'
)
const DAY_MS = 24 * 60 * 60 * 1_000
/** Fixed, so the window and the percentiles never depend on when the suite runs. */
const NOW = Date.UTC(2026, 0, 15, 12)

let directory: string
let client: Client

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tuff-voice-polish-'))
  client = createClient({ url: `file:${join(directory, 'aux.db')}` })
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS })
  aux.resolution = { db: drizzle(client, { schema }), isAux: true }
})

beforeEach(async () => {
  aux.hold = null
  await client.execute('DELETE FROM voice_polish_telemetry')
  await client.execute('DELETE FROM voice_insights_state')
})

afterAll(async () => {
  client?.close()
  await rm(directory, { recursive: true, force: true })
})

function pass(overrides: Partial<VoicePolishPass> & Pick<VoicePolishPass, 'id'>): VoicePolishPass {
  return {
    capturedAt: NOW,
    tier: 'light',
    units: 30,
    characters: 40,
    outcome: 'applied',
    strength: 'natural',
    requestedStrength: 'deep',
    latencyMs: 700,
    polishedCharacters: 44,
    ...overrides
  }
}

async function storedRows(): Promise<Array<Record<string, unknown>>> {
  const result = await client.execute('SELECT * FROM voice_polish_telemetry ORDER BY captured_at')
  return result.rows as unknown as Array<Record<string, unknown>>
}

describe('VoiceInsightsStore polish telemetry', () => {
  it('summarizes tiers, outcomes, capped scopes, sizes and latencies', async () => {
    const store = new VoiceInsightsStore()
    await store.recordPolishPass(
      pass({
        id: 'p1',
        tier: 'short',
        units: 5,
        characters: 20,
        outcome: 'skipped-short',
        strength: null,
        latencyMs: 0,
        polishedCharacters: 0
      })
    )
    await store.recordPolishPass(pass({ id: 'p2', capturedAt: NOW + 1 }))
    await store.recordPolishPass(
      pass({
        id: 'p3',
        capturedAt: NOW + 2,
        tier: 'full',
        units: 80,
        characters: 120,
        outcome: 'unchanged',
        strength: 'deep',
        latencyMs: 900,
        polishedCharacters: 120
      })
    )

    const summary = await store.summarizePolishTelemetry(30, NOW + 10)

    expect(summary.sessions).toBe(3)
    expect(summary.tiers).toEqual({ short: 1, light: 1, full: 1 })
    expect(summary.outcomes).toEqual({
      'skipped-short': 1,
      applied: 1,
      unchanged: 1,
      empty: 0,
      timeout: 0,
      failed: 0
    })
    // A cap is only a cap when both scopes are known and differ: the skipped row ran no pass,
    // and the full row got exactly what it asked for.
    expect(summary.cappedSessions).toBe(1)
    expect(summary.charactersPerSession).toEqual({ p50: 40, p90: 120, max: 120 })
    // The skipped row contributes its size but no provider latency.
    expect(summary.latencyMs).toEqual({ ran: 2, avg: 800, p95: 900, max: 900 })
  })

  it('keeps one row per decision id when a decision is written twice', async () => {
    const store = new VoiceInsightsStore()
    await store.recordPolishPass(pass({ id: 'replayed' }))
    await store.recordPolishPass(pass({ id: 'replayed', characters: 999, latencyMs: 5 }))

    expect(await storedRows()).toHaveLength(1)
    const summary = await store.summarizePolishTelemetry(30, NOW + 1)
    expect(summary.sessions).toBe(1)
    expect(summary.tiers).toEqual({ short: 0, light: 1, full: 0 })
  })

  it('clears polish rows with the rest of the insights, and keeps recording after', async () => {
    const store = new VoiceInsightsStore()
    await store.recordPolishPass(pass({ id: 'before-clear' }))

    await store.clearInsights(NOW + 1)

    expect(await storedRows()).toHaveLength(0)
    expect(await store.summarizePolishTelemetry(30, NOW + 2)).toMatchObject({
      sessions: 0,
      tiers: { short: 0, light: 0, full: 0 }
    })

    // The fence advances a generation; it must not swallow what the user does next.
    await store.recordPolishPass(pass({ id: 'after-clear', capturedAt: NOW + 3 }))
    expect((await store.summarizePolishTelemetry(30, NOW + 4)).sessions).toBe(1)
  })

  it('drops a write that reaches the database after the user cleared their insights', async () => {
    const store = new VoiceInsightsStore()
    const release = Promise.withResolvers<void>()
    aux.hold = release.promise

    // In flight when the clear happens: this is the race the in-memory generation guards,
    // and a deleted row coming back is the one failure a user would notice and never forgive.
    const delayed = store.recordPolishPass(pass({ id: 'in-flight' }))
    await store.clearInsights(NOW + 1)
    release.resolve()
    await delayed

    expect(await storedRows()).toHaveLength(0)
    expect((await store.summarizePolishTelemetry(30, NOW + 2)).sessions).toBe(0)
  })

  it('excludes decisions outside the requested window', async () => {
    const store = new VoiceInsightsStore()
    await store.recordPolishPass(pass({ id: 'recent', capturedAt: NOW - DAY_MS }))
    await store.recordPolishPass(pass({ id: 'boundary', capturedAt: NOW - 30 * DAY_MS }))
    await store.recordPolishPass(
      pass({ id: 'old', capturedAt: NOW - 40 * DAY_MS, tier: 'full', strength: 'deep' })
    )

    // The window is inclusive of its oldest day: "the last 30 days" that silently dropped
    // day 30 would under-count the very edge the gate is tuned from.
    expect((await store.summarizePolishTelemetry(30, NOW)).sessions).toBe(2)
    expect((await store.summarizePolishTelemetry(60, NOW)).sessions).toBe(3)
  })

  it('excludes decisions whose generation is not the durable one', async () => {
    const store = new VoiceInsightsStore()
    await store.recordPolishPass(pass({ id: 'stale' }))

    // Positive control: with the ledger where the write left it, the decision counts.
    expect((await store.summarizePolishTelemetry(30, NOW + 1)).sessions).toBe(1)

    // A clear that advanced the durable ledger while this row was already written — the
    // backstop for a delayed writer the in-memory generation never saw.
    await client.execute(
      `INSERT INTO voice_insights_state (id, generation, started_at, updated_at, timezone, total_characters, total_duration_ms, session_count, polished_session_count, estimated_saved_ms)
       VALUES (1, 4, NULL, ${NOW}, 'UTC', 0, 0, 0, 0, 0)`
    )

    const summary = await store.summarizePolishTelemetry(30, NOW + 2)
    expect(summary.sessions).toBe(0)
    expect(summary.latencyMs).toEqual({ ran: 0, avg: 0, p95: 0, max: 0 })
  })
})
