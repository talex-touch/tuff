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
 * The end-to-end privacy claim of the polish telemetry: a dictation goes through the real
 * service, the real store and a real migrated database, and what lands on disk is the size of
 * what was said — never the words. The row is read back the way a support engineer would (every
 * text column), so a future field that carries the transcript, the polished text or the app it
 * was aimed at reddens this file rather than shipping quietly.
 *
 * `db-write` is the only thing mocked on the storage side: it is the boundary the store
 * deliberately resolves through, and the in-memory lane it hands back is the real table.
 */
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 })

const aux = vi.hoisted(() => ({ resolution: null as { db: unknown; isAux: boolean } | null }))

vi.mock('../../db/db-write', () => ({
  resolveCurrentAuxDb: () => aux.resolution,
  scheduleAuxWrite: async (_label: string, op: (db: unknown) => Promise<unknown>) => {
    if (!aux.resolution) throw new Error('the aux database has not been initialised')
    return await op(aux.resolution.db)
  }
}))

const nativeAudioMock = vi.hoisted(() => ({
  getNativeAudioSupport: vi.fn(),
  startCapture: vi.fn(),
  pollCapture: vi.fn(),
  snapshotCapture: vi.fn(),
  stopCapture: vi.fn(),
  cancelCapture: vi.fn(),
  playAudio: vi.fn(),
  drainCapture: vi.fn(),
  typeText: vi.fn(),
  isAccessibilityTrusted: vi.fn()
}))

vi.mock('@talex-touch/tuff-native/audio', () => nativeAudioMock)
vi.mock('../clipboard', () => ({ clipboardModule: { applyVoiceText: vi.fn() } }))
vi.mock('../system/active-app', () => ({ activeAppService: { getActiveApp: vi.fn() } }))
vi.mock('../storage', () => ({ getMainConfig: () => ({}) }))
vi.mock('./voice-provider-runtime', () => ({ getConfiguredAsrProvider: vi.fn() }))
vi.mock('./polish-prompt', () => ({
  getVoicePolishPrompt: (strength: string) => strength,
  wrapTranscription: (transcript: string) => JSON.stringify({ transcription: transcript })
}))
vi.mock('../ai/intelligence-sdk', () => ({
  tuffIntelligence: {
    audio: { stt: vi.fn() },
    invoke: vi.fn()
  }
}))
vi.mock('../ai/intelligence-tts-service', () => ({
  intelligenceTtsService: { speak: vi.fn() }
}))

import { tuffIntelligence } from '../ai/intelligence-sdk'
import { VoiceService } from './voice-service'

const MIGRATIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../resources/db/migrations'
)
/** Distinctive, 14 units (the `light` band) and 82 characters, so a pass runs and is measured. */
const TRANSCRIPT =
  'SENTINEL please keep every word of this dictated sentence out of the telemetry row'
/** 73 characters: the size of the result is recorded, the result itself is not. */
const POLISHED = 'POLISHED-SENTINEL: a cleaned up version that must not be persisted either'
const TELEMETRY_COLUMNS = [
  'captured_at',
  'characters',
  'day',
  'generation',
  'id',
  'latency_ms',
  'outcome',
  'polished_characters',
  'requested_strength',
  'strength',
  'tier',
  'units'
]

const stt = tuffIntelligence.audio.stt as unknown as ReturnType<typeof vi.fn>
const invoke = tuffIntelligence.invoke as unknown as ReturnType<typeof vi.fn>
const support = nativeAudioMock.getNativeAudioSupport
const startCapture = nativeAudioMock.startCapture
const stopCapture = nativeAudioMock.stopCapture

let directory: string
let client: Client

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tuff-voice-polish-privacy-'))
  client = createClient({ url: `file:${join(directory, 'aux.db')}` })
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS })
  aux.resolution = { db: drizzle(client, { schema }), isAux: true }
})

beforeEach(async () => {
  vi.clearAllMocks()
  await client.execute('DELETE FROM voice_polish_telemetry')
  await client.execute('DELETE FROM voice_insights_state')
  support.mockReturnValue({ supported: true, platform: 'darwin' })
  startCapture.mockResolvedValue({ sessionId: 's1' })
  nativeAudioMock.pollCapture.mockReturnValue({
    active: false,
    durationMs: 1200,
    stoppedReason: 'silence'
  })
  stopCapture.mockReturnValue({
    audio: Buffer.alloc(200),
    format: 'wav',
    sampleRate: 16000,
    channels: 1,
    durationMs: 1200,
    stoppedReason: 'silence'
  })
})

afterAll(async () => {
  client?.close()
  await rm(directory, { recursive: true, force: true })
})

async function telemetryRows(): Promise<Array<Record<string, unknown>>> {
  const result = await client.execute('SELECT * FROM voice_polish_telemetry')
  return result.rows as unknown as Array<Record<string, unknown>>
}

describe('polish telemetry privacy', () => {
  it('records the size of a polished transcript and none of its words', async () => {
    stt.mockResolvedValue({ result: { text: TRANSCRIPT, language: 'en' } })
    invoke.mockResolvedValue({ result: POLISHED })

    const result = await new VoiceService().dictate({ cleanup: true, polishStrength: 'deep' })

    expect(result.text).toBe(POLISHED)
    const rows = await telemetryRows()
    expect(rows).toHaveLength(1)
    const [row] = rows

    // The columns a row can hold are exactly the counters, the tier and the outcome: there is
    // no field a transcript, a polished sentence or an app name could even be written into.
    expect(Object.keys(row).sort()).toEqual(TELEMETRY_COLUMNS)
    expect(row).toMatchObject({
      tier: 'light',
      units: 14,
      characters: 82,
      outcome: 'applied',
      // The pass ran in the natural scope the gate imposes, not the `deep` that was requested.
      strength: 'natural',
      requested_strength: 'deep',
      polished_characters: 73
    })

    for (const [column, value] of Object.entries(row)) {
      expect(String(value), `column ${column} must not carry the transcript`).not.toContain(
        'SENTINEL'
      )
    }
  })

  it('records a below-gate decision as a size with no scope, no latency and no result', async () => {
    stt.mockResolvedValue({ result: { text: 'yes please' } })

    const result = await new VoiceService().dictate({ cleanup: true, polishStrength: 'deep' })

    expect(result.text).toBe('yes please')
    expect(result.polished).toBe(false)
    expect(invoke).not.toHaveBeenCalled()
    const rows = await telemetryRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tier: 'short',
      units: 2,
      characters: 10,
      outcome: 'skipped-short',
      strength: null,
      requested_strength: 'deep',
      latency_ms: 0,
      polished_characters: 0
    })
  })
})
