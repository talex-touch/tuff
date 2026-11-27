import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { mkdir, mkdtemp, rm, stat, symlink, unlink, utimes, writeFile } from 'node:fs/promises'
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

const aux = vi.hoisted(() => ({
  resolution: null as { db: unknown; isAux: boolean } | null,
  recordingsDir: ''
}))

vi.mock('../../db/db-write', () => ({
  resolveCurrentAuxDb: () => aux.resolution,
  scheduleAuxWrite: async (_label: string, op: (db: unknown) => Promise<unknown>) => {
    if (!aux.resolution) throw new Error('the aux database has not been initialised')
    return await op(aux.resolution.db)
  }
}))

/**
 * Temp-file service backed by a real scratch directory under `directory`, so audio write,
 * canonical containment validation, symlink rejection, delete unlink, and orphan sweeps all run
 * against real filesystem entries.
 */
vi.mock('../../service/temp-file.service', () => ({
  tempFileService: {
    getNamespaceConfig: vi.fn(() => ({ namespace: 'voice/recordings' })),
    registerNamespace: vi.fn(),
    resolveNamespaceDir: vi.fn(() => aux.recordingsDir),
    createFile: vi.fn(
      async ({ prefix, ext, buffer }: { prefix?: string; ext?: string; buffer?: Buffer }) => {
        await mkdir(aux.recordingsDir, { recursive: true })
        const filePath = join(
          aux.recordingsDir,
          `${prefix ?? 'voice'}-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext ?? 'wav'}`
        )
        const bytes = buffer ?? Buffer.alloc(0)
        await writeFile(filePath, bytes)
        return { url: `tfile://${filePath}`, path: filePath, sizeBytes: bytes.byteLength }
      }
    ),
    deleteFileFromNamespaces: vi.fn(async (filePath: string) => {
      try {
        await unlink(filePath)
        return true
      } catch {
        return false
      }
    })
  }
}))

import {
  pcm16ToWav,
  subscribeVoiceRecognitionRecordMutations,
  VoiceRecognitionStore
} from './voice-recognition-store'

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
  aux.recordingsDir = join(directory, 'recordings')
  await mkdir(aux.recordingsDir, { recursive: true })
  client = createClient({ url: `file:${join(directory, 'aux.db')}` })
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS })
  aux.resolution = { db: drizzle(client, { schema }), isAux: true }
})

beforeEach(async () => {
  await client.execute('DELETE FROM voice_recognition_records')
  await rm(aux.recordingsDir, { recursive: true, force: true })
  await mkdir(aux.recordingsDir, { recursive: true })
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

describe('VoiceRecognitionStore retained audio safety, retry updates, delete, and TTL purge', () => {
  it('reads retained WAV inside voice/recordings and rejects traversal, symlinks, and missing files', async () => {
    const store = new VoiceRecognitionStore()
    const pcm = Buffer.alloc(640, 12)
    await store.record({
      id: 'rec-safe',
      capturedAt: NOW,
      source: 'dictate',
      status: 'failed',
      audio: pcm,
      audioFormat: 'pcm',
      audioSampleRate: 16_000,
      errorCode: FAIL_CODE
    })

    const stored = await store.getStoredRow('rec-safe')
    expect(stored?.audioPath).toBeTruthy()
    const audioPath = stored!.audioPath!

    const valid = await store.readRetainedAudio(audioPath)
    expect(valid.ok).toBe(true)
    if (valid.ok) {
      expect(valid.ext).toBe('wav')
      expect(valid.buffer.subarray(0, 4).toString('ascii')).toBe('RIFF')
      expect(valid.buffer.byteLength).toBe(pcm16ToWav(pcm, 16_000).byteLength)
    }

    // Reject path traversal outside namespace
    const outsideFile = join(directory, 'secret.wav')
    await writeFile(outsideFile, Buffer.from('not-voice'))
    expect(await store.readRetainedAudio(join(aux.recordingsDir, '..', 'secret.wav'))).toEqual({
      ok: false,
      code: 'VOICE_RECORD_AUDIO_PATH_INVALID'
    })
    expect(await store.readRetainedAudio('relative/escape.wav')).toEqual({
      ok: false,
      code: 'VOICE_RECORD_AUDIO_PATH_INVALID'
    })
    expect(await store.readRetainedAudio(`${audioPath}\0.wav`)).toEqual({
      ok: false,
      code: 'VOICE_RECORD_AUDIO_PATH_INVALID'
    })

    // Reject symlinks escaping the canonical recordings root
    const escapeLink = join(aux.recordingsDir, 'escape-link.wav')
    await symlink(outsideFile, escapeLink)
    expect(await store.readRetainedAudio(escapeLink)).toEqual({
      ok: false,
      code: 'VOICE_RECORD_AUDIO_PATH_INVALID'
    })

    // Missing / pruned file returns VOICE_RECORD_AUDIO_MISSING
    await unlink(audioPath)
    expect(await store.readRetainedAudio(audioPath)).toEqual({
      ok: false,
      code: 'VOICE_RECORD_AUDIO_MISSING'
    })
  })

  it('atomically updates retry results and transcripts while preserving audioPath and source', async () => {
    const store = new VoiceRecognitionStore()
    const mutations: unknown[] = []
    const unsubscribe = subscribeVoiceRecognitionRecordMutations((m) => mutations.push(m))

    try {
      await store.record({
        id: 'rec-retry',
        capturedAt: NOW,
        source: 'ask',
        status: 'failed',
        audio: Buffer.alloc(320, 7),
        audioFormat: 'pcm',
        audioSampleRate: 16_000,
        errorCode: FAIL_CODE
      })
      const before = await store.getStoredRow('rec-retry')
      expect(before?.audioPath).toBeTruthy()

      const updated = await store.updateRetryResult('rec-retry', {
        status: 'success',
        recognitionLocation: 'on-device',
        recognitionDurationMs: 420,
        providerLatencyMs: 310,
        rawText: 'raw retry',
        text: 'Polished retry.',
        providerId: 'local-whisper',
        model: 'whisper-small',
        channel: 'Local',
        errorCode: null
      })

      expect(updated).toMatchObject({
        id: 'rec-retry',
        source: 'ask',
        status: 'success',
        recognitionLocation: 'on-device',
        rawText: 'raw retry',
        text: 'Polished retry.',
        providerId: 'local-whisper',
        model: 'whisper-small'
      })
      expect(updated).not.toHaveProperty('errorCode')
      expect(updated?.audioUrl).toBeTruthy()

      const afterRetry = await store.getStoredRow('rec-retry')
      expect(afterRetry?.audioPath).toBe(before?.audioPath)

      const edited = await store.updateTranscript('rec-retry', 'User corrected SGLang.')
      expect(edited).toMatchObject({ id: 'rec-retry', text: 'User corrected SGLang.' })

      // Non-existent row returns null
      expect(
        await store.updateRetryResult('missing-id', { status: 'failed', errorCode: 'E_NONE' })
      ).toBeNull()
      expect(await store.updateTranscript('missing-id', 'nope')).toBeNull()
      expect(mutations.some((m) => (m as { type?: string }).type === 'upsert')).toBe(true)
    } finally {
      unsubscribe()
    }
  })

  it('deletes a single row, unlinks its WAV file, and emits a delete mutation', async () => {
    const store = new VoiceRecognitionStore()
    const mutations: unknown[] = []
    const unsubscribe = subscribeVoiceRecognitionRecordMutations((m) => mutations.push(m))

    try {
      await store.record({
        id: 'rec-del',
        capturedAt: NOW,
        source: 'dictate',
        status: 'failed',
        audio: Buffer.alloc(320, 3),
        audioFormat: 'pcm',
        audioSampleRate: 16_000,
        errorCode: FAIL_CODE
      })
      const stored = await store.getStoredRow('rec-del')
      const audioPath = stored!.audioPath!
      await expect(stat(audioPath)).resolves.toBeDefined()

      expect(await store.delete('rec-del')).toBe(true)
      expect(await store.getRecord('rec-del')).toBeNull()
      await expect(stat(audioPath)).rejects.toThrow()
      expect(mutations).toContainEqual({ type: 'delete', id: 'rec-del' })

      expect(await store.delete('rec-del')).toBe(false)
    } finally {
      unsubscribe()
    }
  })

  it('purges expired records under strict < cutoff boundary and sweeps aged orphan WAVs', async () => {
    const store = new VoiceRecognitionStore()
    const DAY_MS = 24 * 60 * 60 * 1000
    const retentionMs = 7 * DAY_MS
    const nowMs = NOW + 30 * DAY_MS
    const cutoffMs = nowMs - retentionMs

    // 1. Expired (strictly < cutoffMs)
    await store.record({
      id: 'rec-expired',
      capturedAt: cutoffMs - 1,
      source: 'dictate',
      status: 'failed',
      audio: Buffer.alloc(320, 1),
      audioFormat: 'pcm',
      errorCode: FAIL_CODE
    })
    // 2. Exact boundary (=== cutoffMs): MUST survive strict < cutoff boundary
    await store.record({
      id: 'rec-boundary',
      capturedAt: cutoffMs,
      source: 'ask',
      status: 'success',
      audio: Buffer.alloc(320, 2),
      audioFormat: 'pcm',
      text: 'on boundary'
    })
    // 3. Fresh (> cutoffMs): MUST survive
    await store.record({
      id: 'rec-fresh',
      capturedAt: nowMs - 1_000,
      source: 'dictate',
      status: 'success',
      audio: Buffer.alloc(320, 3),
      audioFormat: 'pcm',
      text: 'fresh'
    })

    const expiredAudio = (await store.getStoredRow('rec-expired'))!.audioPath!
    const boundaryAudio = (await store.getStoredRow('rec-boundary'))!.audioPath!
    const freshAudio = (await store.getStoredRow('rec-fresh'))!.audioPath!

    // Add an aged orphan WAV (older than 60s grace) and a fresh in-flight orphan WAV
    const agedOrphan = join(aux.recordingsDir, 'aged-orphan.wav')
    await writeFile(agedOrphan, Buffer.from('old-orphan'))
    const agedDate = new Date(nowMs - 5 * 60_000)
    await utimes(agedOrphan, agedDate, agedDate)

    const freshOrphan = join(aux.recordingsDir, 'fresh-inflight.wav')
    await writeFile(freshOrphan, Buffer.from('inflight'))
    const recentDate = new Date(nowMs - 5_000)
    await utimes(freshOrphan, recentDate, recentDate)

    const mutations: unknown[] = []
    const unsubscribe = subscribeVoiceRecognitionRecordMutations((m) => mutations.push(m))

    try {
      const result = await store.purgeExpired(retentionMs, nowMs)
      expect(result.deletedRecords).toBe(1)
      expect(result.deletedFiles).toBe(2) // expiredAudio + agedOrphan

      const remaining = await store.list()
      expect(remaining.map((r) => r.id).sort()).toEqual(['rec-boundary', 'rec-fresh'])
      await expect(stat(expiredAudio)).rejects.toThrow()
      await expect(stat(agedOrphan)).rejects.toThrow()
      await expect(stat(boundaryAudio)).resolves.toBeDefined()
      await expect(stat(freshAudio)).resolves.toBeDefined()
      await expect(stat(freshOrphan)).resolves.toBeDefined()
      expect(mutations).toContainEqual({ type: 'prune', ids: ['rec-expired'] })
    } finally {
      unsubscribe()
    }

    // clear() removes all remaining rows and unlinks remaining WAVs including orphans
    await store.clear()
    expect(await store.list()).toEqual([])
    await expect(stat(boundaryAudio)).rejects.toThrow()
    await expect(stat(freshAudio)).rejects.toThrow()
    await expect(stat(freshOrphan)).rejects.toThrow()
  })
})
