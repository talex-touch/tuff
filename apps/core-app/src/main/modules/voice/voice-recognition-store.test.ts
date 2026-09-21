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
 * The history row is rewritten in place: a capture that failed and was then recovered keeps its
 * id, and the second write is an upsert. Which columns that upsert leaves alone is therefore the
 * whole question — a field the caller omits must survive, and the one field that says why the
 * first attempt failed has to be clearable.
 *
 * A real migrated database rather than a fake lane, because the behaviour under test is the SQL:
 * `undefined` has no representation in a drizzle `set` clause and column absence is exactly what
 * "leave it alone" means. Only the read-back path (`list()`) is asked what it stored.
 *
 * `errorCode` is the column under test. It is the one field where "not mentioned" and "clear it"
 * are different instructions, and a recovered attempt needs the second: a success that still
 * reports the failure it replaced is worse than no detail at all.
 */
vi.setConfig({ testTimeout: 20_000, hookTimeout: 60_000 })

const aux = vi.hoisted(() => ({ resolution: null as { db: unknown; isAux: boolean } | null }))

vi.mock('../../db/db-write', () => ({
  resolveCurrentAuxDb: () => aux.resolution,
  scheduleAuxWrite: async (_label: string, op: (db: unknown) => Promise<unknown>) => {
    if (!aux.resolution) throw new Error('the aux database has not been initialised')
    return await op(aux.resolution.db)
  }
}))

/**
 * Audio retention belongs to the temp-file service and this suite writes no audio; the namespace
 * check is the only thing the store asks of it on the way to the database.
 */
vi.mock('../../service/temp-file.service', () => ({
  tempFileService: {
    getNamespaceConfig: vi.fn(() => ({ namespace: 'voice/recordings' })),
    registerNamespace: vi.fn(),
    createFile: vi.fn(),
    deleteFileFromNamespaces: vi.fn()
  }
}))

import { VoiceRecognitionStore } from './voice-recognition-store'

const MIGRATIONS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../resources/db/migrations'
)
/** Fixed, so nothing here depends on when the suite runs. */
const NOW = Date.UTC(2026, 0, 15, 12)
const FAIL_CODE = 'VOICE_ASR_PROVIDER_FAILED'

let directory: string
let client: Client

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tuff-voice-records-'))
  client = createClient({ url: `file:${join(directory, 'aux.db')}` })
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS })
  aux.resolution = { db: drizzle(client, { schema }), isAux: true }
})

beforeEach(async () => {
  await client.execute('DELETE FROM voice_recognition_records')
})

afterAll(async () => {
  client?.close()
  await rm(directory, { recursive: true, force: true })
})

describe('VoiceRecognitionStore error code writes', () => {
  it('stops reporting a failure once the same capture is written back as a success', async () => {
    const store = new VoiceRecognitionStore()
    await store.record({
      id: 'capture-1',
      capturedAt: NOW,
      source: 'microphone',
      status: 'failed',
      errorCode: FAIL_CODE
    })
    // The precondition the clear is measured against: the code really is on the row.
    const [failed] = await store.list()
    expect(failed).toMatchObject({ id: 'capture-1', status: 'failed', errorCode: FAIL_CODE })

    // The retry that succeeded rewrites the same capture. Its detail has to say "there is no
    // error on this row", which is not the same instruction as saying nothing at all.
    await store.record({
      id: 'capture-1',
      capturedAt: NOW + 1_000,
      source: 'microphone',
      status: 'success',
      rawText: 'buffered words',
      text: 'buffered words',
      errorCode: null
    })

    const rows = await store.list()
    expect(rows).toHaveLength(1)
    const [recovered] = rows
    expect(recovered).toMatchObject({
      id: 'capture-1',
      status: 'success',
      text: 'buffered words'
    })
    expect(recovered).not.toHaveProperty('errorCode')
  })

  it('leaves a stored failure code alone when a later write omits the field', async () => {
    const store = new VoiceRecognitionStore()
    await store.record({
      id: 'capture-2',
      capturedAt: NOW,
      source: 'microphone',
      status: 'failed',
      errorCode: FAIL_CODE
    })
    // Every other writer omits what it does not know. Omitting is not clearing: a caller with no
    // failure to report must not erase one it never saw.
    await store.record({
      id: 'capture-2',
      capturedAt: NOW + 1_000,
      source: 'microphone',
      status: 'success',
      text: 'later'
    })

    const [rewritten] = await store.list()
    expect(rewritten).toMatchObject({ id: 'capture-2', status: 'success', text: 'later' })
    expect(rewritten?.errorCode).toBe(FAIL_CODE)
  })
})
