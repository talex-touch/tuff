import { desc, eq, lt } from 'drizzle-orm'
import type {
  VoiceRecognitionLocation,
  VoiceRecognitionRecord,
  VoiceRecognitionRecordMutation
} from '@talex-touch/utils/transport/sdk/domains/voice'

import { toTfileUrl } from '@talex-touch/utils/network'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as schema from '../../db/schema'
import { resolveCurrentAuxDb, scheduleAuxWrite } from '../../db/db-write'
import type { TempFileService } from '../../service/temp-file.service'
import { createLogger } from '../../utils/logger'

export const VOICE_RECORDING_NAMESPACE = 'voice/recordings'
const RECORDING_NAMESPACE = VOICE_RECORDING_NAMESPACE
const MAX_RECORDS = 200
const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const MAX_TEXT_LENGTH = 2_000_000
/**
 * Grace period before sweeping an unreferenced WAV inside `voice/recordings`, so an in-flight
 * `record()` call that just created a file before its DB transaction commits is never raced.
 */
const ORPHAN_AUDIO_GRACE_MS = 60_000
const voiceRecordLog = createLogger('VoiceRecords')
const mutationListeners = new Set<(mutation: VoiceRecognitionRecordMutation) => void>()

export type VoiceRecognitionStoredRow = typeof schema.voiceRecognitionRecords.$inferSelect

export type VoiceRetainedAudioReadResult =
  | { ok: true; buffer: Buffer; ext: string; canonicalPath: string }
  | { ok: false; code: 'VOICE_RECORD_AUDIO_PATH_INVALID' | 'VOICE_RECORD_AUDIO_MISSING' }

export interface VoiceRecognitionRetryUpdate {
  status: VoiceRecognitionRecord['status']
  recognitionLocation?: VoiceRecognitionLocation
  recognitionDurationMs?: number
  providerLatencyMs?: number | null
  rawText?: string | null
  text?: string | null
  providerId?: string
  model?: string
  channel?: string
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  errorCode: string | null
}

export interface VoiceRecognitionPurgeResult {
  deletedRecords: number
  deletedFiles: number
}

export function subscribeVoiceRecognitionRecordMutations(
  listener: (mutation: VoiceRecognitionRecordMutation) => void
): () => void {
  mutationListeners.add(listener)
  return () => mutationListeners.delete(listener)
}

function emitVoiceRecognitionRecordMutation(mutation: VoiceRecognitionRecordMutation): void {
  for (const listener of mutationListeners) {
    try {
      listener(mutation)
    } catch (error) {
      voiceRecordLog.warn('Recognition record listener failed', { error })
    }
  }
}

async function loadTempFileService(): Promise<TempFileService> {
  const module = await import('../../service/temp-file.service')
  return module.tempFileService
}

export interface VoiceRecognitionRecordInput {
  id: string
  capturedAt: number
  source: VoiceRecognitionRecord['source']
  recognitionLocation?: VoiceRecognitionLocation
  status: VoiceRecognitionRecord['status']
  audio?: Buffer
  audioFormat?: 'wav' | 'pcm' | 'encoded'
  audioSampleRate?: number
  audioExt?: string
  audioBytes?: number
  audioDurationMs?: number
  recognitionDurationMs?: number
  providerLatencyMs?: number
  rawText?: string
  text?: string
  providerId?: string
  model?: string
  channel?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  /**
   * The failure this record carries, when it carries one.
   *
   * `undefined` leaves whatever the row already had and `null` clears it, so a retry that
   * succeeded can drop the code its row was first written with. Without the distinction a
   * recovered record would keep showing a failure it no longer has.
   */
  errorCode?: string | null
  deliveryMethod?: VoiceRecognitionRecord['deliveryMethod']
}

function boundedText(value?: string): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text ? text.slice(0, MAX_TEXT_LENGTH) : undefined
}

function boundedNumber(value?: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined
}

export function pcm16ToWav(pcm: Buffer, sampleRate = 16_000): Buffer {
  const sampleBytes = pcm.byteLength - (pcm.byteLength % 2)
  const wav = Buffer.allocUnsafe(44 + sampleBytes)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + sampleBytes, 4)
  wav.write('WAVE', 8)
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(sampleBytes, 40)
  pcm.copy(wav, 44, 0, sampleBytes)
  return wav
}

function toRecord(row: typeof schema.voiceRecognitionRecords.$inferSelect): VoiceRecognitionRecord {
  return {
    id: row.id,
    capturedAt: row.capturedAt,
    source: row.source as VoiceRecognitionRecord['source'],
    ...(row.recognitionLocation
      ? { recognitionLocation: row.recognitionLocation as VoiceRecognitionLocation }
      : {}),
    status: row.status as VoiceRecognitionRecord['status'],
    ...(row.audioPath ? { audioUrl: toTfileUrl(row.audioPath) } : {}),
    ...(row.audioBytes === null ? {} : { audioBytes: Math.max(0, row.audioBytes) }),
    ...(row.audioDurationMs === null ? {} : { audioDurationMs: Math.max(0, row.audioDurationMs) }),
    ...(row.recognitionDurationMs === null
      ? {}
      : { recognitionDurationMs: Math.max(0, row.recognitionDurationMs) }),
    ...(row.providerLatencyMs === null
      ? {}
      : { providerLatencyMs: Math.max(0, row.providerLatencyMs) }),
    ...(row.rawText ? { rawText: row.rawText } : {}),
    ...(row.text ? { text: row.text } : {}),
    ...(row.providerId ? { providerId: row.providerId } : {}),
    ...(row.model ? { model: row.model } : {}),
    ...(row.channel ? { channel: row.channel } : {}),
    ...(row.inputTokens === null ? {} : { inputTokens: Math.max(0, row.inputTokens) }),
    ...(row.outputTokens === null ? {} : { outputTokens: Math.max(0, row.outputTokens) }),
    ...(row.totalTokens === null ? {} : { totalTokens: Math.max(0, row.totalTokens) }),
    ...(row.errorCode ? { errorCode: row.errorCode } : {}),
    ...(row.deliveryMethod
      ? { deliveryMethod: row.deliveryMethod as VoiceRecognitionRecord['deliveryMethod'] }
      : {})
  }
}

function isWithinDirectory(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/** Main-owned local recognition history. Audio URLs are controlled tfile resources, never paths. */
export class VoiceRecognitionStore {
  initialize(): void {
    // Namespace registration is deferred until an actual record or clear request;
    // importing the Electron-backed temp service must not affect voice unit tests.
  }

  private ensureNamespace(tempFileService: TempFileService): void {
    if (tempFileService.getNamespaceConfig(RECORDING_NAMESPACE)) return
    tempFileService.registerNamespace({
      namespace: RECORDING_NAMESPACE,
      retentionMs: null,
      automaticCleanup: false
    })
  }

  async getStoredRow(id: string): Promise<VoiceRecognitionStoredRow | null> {
    if (typeof id !== 'string' || !id.trim()) return null
    const db = resolveCurrentAuxDb()?.db
    if (!db) return null
    const [row] = await db
      .select()
      .from(schema.voiceRecognitionRecords)
      .where(eq(schema.voiceRecognitionRecords.id, id))
      .limit(1)
    return row ?? null
  }

  async getRecord(id: string): Promise<VoiceRecognitionRecord | null> {
    const row = await this.getStoredRow(id)
    return row ? toRecord(row) : null
  }

  /**
   * Resolves and reads a retained local audio file strictly inside the managed `voice/recordings`
   * namespace. Rejects relative paths, path traversal (`..`), symlinks, non-regular files, and
   * paths escaping the canonical namespace root before reading a byte.
   */
  async readRetainedAudio(audioPath: string): Promise<VoiceRetainedAudioReadResult> {
    if (
      typeof audioPath !== 'string' ||
      !audioPath.trim() ||
      audioPath.includes('\0') ||
      !path.isAbsolute(audioPath)
    ) {
      return { ok: false, code: 'VOICE_RECORD_AUDIO_PATH_INVALID' }
    }

    const tempFileService = await loadTempFileService()
    this.ensureNamespace(tempFileService)
    const configuredRoot = path.resolve(tempFileService.resolveNamespaceDir(RECORDING_NAMESPACE))
    const resolvedTarget = path.resolve(audioPath)
    let canonicalRoot: string | null = null
    try {
      canonicalRoot = await fs.realpath(configuredRoot)
    } catch {
      canonicalRoot = null
    }

    const lexicallyContained =
      isWithinDirectory(configuredRoot, resolvedTarget) ||
      (canonicalRoot !== null && isWithinDirectory(canonicalRoot, resolvedTarget))
    if (!lexicallyContained) {
      return { ok: false, code: 'VOICE_RECORD_AUDIO_PATH_INVALID' }
    }

    if (!canonicalRoot) {
      return { ok: false, code: 'VOICE_RECORD_AUDIO_MISSING' }
    }

    let directStat: Awaited<ReturnType<typeof fs.lstat>>
    try {
      directStat = await fs.lstat(resolvedTarget)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ok: false, code: 'VOICE_RECORD_AUDIO_MISSING' }
      }
      return { ok: false, code: 'VOICE_RECORD_AUDIO_PATH_INVALID' }
    }
    if (!directStat.isFile() || directStat.isSymbolicLink()) {
      return { ok: false, code: 'VOICE_RECORD_AUDIO_PATH_INVALID' }
    }

    let canonicalPath: string
    try {
      canonicalPath = await fs.realpath(resolvedTarget)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ok: false, code: 'VOICE_RECORD_AUDIO_MISSING' }
      }
      return { ok: false, code: 'VOICE_RECORD_AUDIO_PATH_INVALID' }
    }
    if (!isWithinDirectory(canonicalRoot, canonicalPath)) {
      return { ok: false, code: 'VOICE_RECORD_AUDIO_PATH_INVALID' }
    }

    if (directStat.size <= 0 || directStat.size > MAX_AUDIO_BYTES) {
      return { ok: false, code: 'VOICE_RECORD_AUDIO_MISSING' }
    }

    try {
      const buffer = await fs.readFile(canonicalPath)
      if (buffer.byteLength <= 0 || buffer.byteLength > MAX_AUDIO_BYTES) {
        return { ok: false, code: 'VOICE_RECORD_AUDIO_MISSING' }
      }
      const ext = path.extname(canonicalPath).replace(/^\./, '').toLowerCase() || 'wav'
      return { ok: true, buffer, ext, canonicalPath }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { ok: false, code: 'VOICE_RECORD_AUDIO_MISSING' }
      }
      return { ok: false, code: 'VOICE_RECORD_AUDIO_PATH_INVALID' }
    }
  }

  async record(input: VoiceRecognitionRecordInput): Promise<void> {
    if (!input.id || !Number.isFinite(input.capturedAt)) return
    const tempFileService = await loadTempFileService()
    this.ensureNamespace(tempFileService)

    const sourceAudio = input.audio && input.audio.byteLength > 0 ? input.audio : undefined
    const sampleRate = boundedNumber(input.audioSampleRate)
    const audio =
      sourceAudio && input.audioFormat === 'pcm'
        ? pcm16ToWav(sourceAudio, sampleRate && sampleRate > 0 ? sampleRate : 16_000)
        : sourceAudio
    if (audio && audio.byteLength > MAX_AUDIO_BYTES) {
      voiceRecordLog.warn('Recognition audio exceeded history bound', {
        meta: { code: 'VOICE_RECORD_AUDIO_TOO_LARGE', bytes: audio.byteLength }
      })
    }

    let audioBytes = boundedNumber(input.audioBytes)
    let audioPath: string | undefined
    if (audio && audio.byteLength <= MAX_AUDIO_BYTES) {
      try {
        const created = await tempFileService.createFile({
          namespace: RECORDING_NAMESPACE,
          ext: input.audioFormat === 'pcm' ? 'wav' : input.audioExt || 'wav',
          buffer: audio,
          prefix: 'recognition'
        })
        audioPath = created.path
        audioBytes = created.sizeBytes
      } catch (error) {
        voiceRecordLog.warn('Recognition audio could not be retained', {
          meta: { code: 'VOICE_RECORD_AUDIO_WRITE_FAILED' },
          error
        })
      }
    }

    const values = {
      id: input.id,
      capturedAt: Math.max(0, Math.floor(input.capturedAt)),
      source: input.source,
      ...(input.recognitionLocation ? { recognitionLocation: input.recognitionLocation } : {}),
      status: input.status,
      ...(audioPath ? { audioPath } : {}),
      ...(audioBytes === undefined ? {} : { audioBytes }),
      ...(boundedNumber(input.audioDurationMs) === undefined
        ? {}
        : { audioDurationMs: boundedNumber(input.audioDurationMs) }),
      ...(boundedNumber(input.recognitionDurationMs) === undefined
        ? {}
        : { recognitionDurationMs: boundedNumber(input.recognitionDurationMs) }),
      ...(boundedNumber(input.providerLatencyMs) === undefined
        ? {}
        : { providerLatencyMs: boundedNumber(input.providerLatencyMs) }),
      ...(boundedText(input.rawText) ? { rawText: boundedText(input.rawText) } : {}),
      ...(boundedText(input.text) ? { text: boundedText(input.text) } : {}),
      ...(input.providerId ? { providerId: input.providerId.slice(0, 128) } : {}),
      ...(input.model ? { model: input.model.slice(0, 128) } : {}),
      ...(input.channel ? { channel: input.channel.slice(0, 128) } : {}),
      ...(boundedNumber(input.inputTokens) === undefined
        ? {}
        : { inputTokens: boundedNumber(input.inputTokens) }),
      ...(boundedNumber(input.outputTokens) === undefined
        ? {}
        : { outputTokens: boundedNumber(input.outputTokens) }),
      ...(boundedNumber(input.totalTokens) === undefined
        ? {}
        : { totalTokens: boundedNumber(input.totalTokens) }),
      ...(input.errorCode === undefined
        ? {}
        : { errorCode: input.errorCode ? input.errorCode.slice(0, 128) : null }),
      ...(input.deliveryMethod ? { deliveryMethod: input.deliveryMethod } : {})
    }

    try {
      const outcome = await scheduleAuxWrite('voice-records.record', async (db) => {
        return await db.transaction(async (tx) => {
          await tx.insert(schema.voiceRecognitionRecords).values(values).onConflictDoUpdate({
            target: schema.voiceRecognitionRecords.id,
            set: values
          })
          const [stored] = await tx
            .select()
            .from(schema.voiceRecognitionRecords)
            .where(eq(schema.voiceRecognitionRecords.id, input.id))
            .limit(1)
          const retained = await tx
            .select({
              id: schema.voiceRecognitionRecords.id,
              audioPath: schema.voiceRecognitionRecords.audioPath
            })
            .from(schema.voiceRecognitionRecords)
            .orderBy(desc(schema.voiceRecognitionRecords.capturedAt))
            .limit(MAX_RECORDS + 1)
          const stale = retained.slice(MAX_RECORDS)
          for (const row of stale) {
            await tx
              .delete(schema.voiceRecognitionRecords)
              .where(eq(schema.voiceRecognitionRecords.id, row.id))
          }
          return {
            record: stored ? toRecord(stored) : null,
            stalePaths: stale.flatMap((row) => (row.audioPath ? [row.audioPath] : []))
          }
        })
      })
      if (outcome?.record) {
        emitVoiceRecognitionRecordMutation({ type: 'upsert', record: outcome.record })
      }
      for (const path of outcome?.stalePaths ?? []) {
        try {
          await tempFileService.deleteFileFromNamespaces(path, [RECORDING_NAMESPACE])
        } catch (error) {
          voiceRecordLog.warn('Stale recognition audio cleanup failed', {
            meta: { code: 'VOICE_RECORD_STALE_AUDIO_CLEANUP_FAILED' },
            error
          })
        }
      }
    } catch (error) {
      if (audioPath) {
        await tempFileService.deleteFileFromNamespaces(audioPath, [RECORDING_NAMESPACE])
      }
      voiceRecordLog.warn('Recognition record persistence failed', {
        meta: { code: 'VOICE_RECORD_PERSIST_FAILED' },
        error
      })
    }
  }

  async list(limit = 100): Promise<VoiceRecognitionRecord[]> {
    const db = resolveCurrentAuxDb()?.db
    if (!db) return []
    const boundedLimit = Math.min(MAX_RECORDS, Math.max(1, Math.floor(limit)))
    const rows = await db
      .select()
      .from(schema.voiceRecognitionRecords)
      .orderBy(desc(schema.voiceRecognitionRecords.capturedAt))
      .limit(boundedLimit)
    return rows.map(toRecord)
  }

  /**
   * Atomically updates an existing row after a per-row retry without touching `capturedAt`,
   * `source`, or its retained `audioPath`. Returns `null` if the row was deleted concurrently.
   */
  async updateRetryResult(
    id: string,
    patch: VoiceRecognitionRetryUpdate
  ): Promise<VoiceRecognitionRecord | null> {
    if (typeof id !== 'string' || !id.trim()) return null
    const values: Partial<typeof schema.voiceRecognitionRecords.$inferInsert> = {
      status: patch.status,
      errorCode: patch.errorCode ? patch.errorCode.slice(0, 128) : null,
      ...(patch.recognitionLocation ? { recognitionLocation: patch.recognitionLocation } : {}),
      ...(boundedNumber(patch.recognitionDurationMs) === undefined
        ? {}
        : { recognitionDurationMs: boundedNumber(patch.recognitionDurationMs) }),
      ...(patch.providerLatencyMs === undefined
        ? {}
        : {
            providerLatencyMs:
              patch.providerLatencyMs === null
                ? null
                : (boundedNumber(patch.providerLatencyMs) ?? null)
          }),
      ...(patch.rawText === undefined
        ? {}
        : { rawText: patch.rawText === null ? null : (boundedText(patch.rawText) ?? null) }),
      ...(patch.text === undefined
        ? {}
        : { text: patch.text === null ? null : (boundedText(patch.text) ?? null) }),
      ...(patch.providerId ? { providerId: patch.providerId.slice(0, 128) } : {}),
      ...(patch.model ? { model: patch.model.slice(0, 128) } : {}),
      ...(patch.channel ? { channel: patch.channel.slice(0, 128) } : {}),
      ...(patch.inputTokens === undefined
        ? {}
        : {
            inputTokens:
              patch.inputTokens === null ? null : (boundedNumber(patch.inputTokens) ?? null)
          }),
      ...(patch.outputTokens === undefined
        ? {}
        : {
            outputTokens:
              patch.outputTokens === null ? null : (boundedNumber(patch.outputTokens) ?? null)
          }),
      ...(patch.totalTokens === undefined
        ? {}
        : {
            totalTokens:
              patch.totalTokens === null ? null : (boundedNumber(patch.totalTokens) ?? null)
          })
    }

    const updated = await scheduleAuxWrite('voice-records.retry-update', async (db) => {
      return await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: schema.voiceRecognitionRecords.id })
          .from(schema.voiceRecognitionRecords)
          .where(eq(schema.voiceRecognitionRecords.id, id))
          .limit(1)
        if (!existing) return null
        await tx
          .update(schema.voiceRecognitionRecords)
          .set(values)
          .where(eq(schema.voiceRecognitionRecords.id, id))
        const [stored] = await tx
          .select()
          .from(schema.voiceRecognitionRecords)
          .where(eq(schema.voiceRecognitionRecords.id, id))
          .limit(1)
        return stored ? toRecord(stored) : null
      })
    })
    if (updated) {
      emitVoiceRecognitionRecordMutation({ type: 'upsert', record: updated })
    }
    return updated
  }

  /** Atomically persists a user's manual transcript edit on an existing history record. */
  async updateTranscript(id: string, text: string): Promise<VoiceRecognitionRecord | null> {
    if (typeof id !== 'string' || !id.trim()) return null
    const nextText = boundedText(text)
    if (!nextText) return null
    const updated = await scheduleAuxWrite('voice-records.update-text', async (db) => {
      return await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: schema.voiceRecognitionRecords.id })
          .from(schema.voiceRecognitionRecords)
          .where(eq(schema.voiceRecognitionRecords.id, id))
          .limit(1)
        if (!existing) return null
        await tx
          .update(schema.voiceRecognitionRecords)
          .set({ text: nextText })
          .where(eq(schema.voiceRecognitionRecords.id, id))
        const [stored] = await tx
          .select()
          .from(schema.voiceRecognitionRecords)
          .where(eq(schema.voiceRecognitionRecords.id, id))
          .limit(1)
        return stored ? toRecord(stored) : null
      })
    })
    if (updated) {
      emitVoiceRecognitionRecordMutation({ type: 'upsert', record: updated })
    }
    return updated
  }

  /** Permanently deletes one history record and unlinks its retained WAV audio file. */
  async delete(id: string): Promise<boolean> {
    if (typeof id !== 'string' || !id.trim()) return false
    const tempFileService = await loadTempFileService()
    this.ensureNamespace(tempFileService)
    const outcome = await scheduleAuxWrite('voice-records.delete', async (db) => {
      return await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({
            id: schema.voiceRecognitionRecords.id,
            audioPath: schema.voiceRecognitionRecords.audioPath
          })
          .from(schema.voiceRecognitionRecords)
          .where(eq(schema.voiceRecognitionRecords.id, id))
          .limit(1)
        if (!existing) return { deleted: false, audioPath: null as string | null }
        await tx
          .delete(schema.voiceRecognitionRecords)
          .where(eq(schema.voiceRecognitionRecords.id, id))
        return { deleted: true, audioPath: existing.audioPath }
      })
    })
    if (!outcome.deleted) return false
    emitVoiceRecognitionRecordMutation({ type: 'delete', id })
    if (outcome.audioPath) {
      try {
        await tempFileService.deleteFileFromNamespaces(outcome.audioPath, [RECORDING_NAMESPACE])
      } catch (error) {
        voiceRecordLog.warn('Deleted recognition record audio cleanup failed', {
          meta: { code: 'VOICE_RECORD_AUDIO_DELETE_FAILED' },
          error
        })
      }
    }
    return true
  }

  /**
   * Purges expired history rows (`capturedAt < nowMs - retentionMs`), unlinks their WAV files,
   * and sweeps any unreferenced orphan files left in `voice/recordings`.
   */
  async purgeExpired(
    retentionMs: number | null,
    nowMs = Date.now()
  ): Promise<VoiceRecognitionPurgeResult> {
    if (
      retentionMs === null ||
      !Number.isFinite(retentionMs) ||
      retentionMs <= 0 ||
      !Number.isFinite(nowMs)
    ) {
      return { deletedRecords: 0, deletedFiles: 0 }
    }
    const db = resolveCurrentAuxDb()?.db
    if (!db) return { deletedRecords: 0, deletedFiles: 0 }

    const tempFileService = await loadTempFileService()
    this.ensureNamespace(tempFileService)
    const cutoffMs = Math.floor(nowMs - retentionMs)

    const outcome = await scheduleAuxWrite(
      'voice-records.purge-expired',
      async (writeDb) => {
        return await writeDb.transaction(async (tx) => {
          const expired = await tx
            .select({
              id: schema.voiceRecognitionRecords.id,
              audioPath: schema.voiceRecognitionRecords.audioPath
            })
            .from(schema.voiceRecognitionRecords)
            .where(lt(schema.voiceRecognitionRecords.capturedAt, cutoffMs))
          if (expired.length > 0) {
            await tx
              .delete(schema.voiceRecognitionRecords)
              .where(lt(schema.voiceRecognitionRecords.capturedAt, cutoffMs))
          }
          const surviving = await tx
            .select({ audioPath: schema.voiceRecognitionRecords.audioPath })
            .from(schema.voiceRecognitionRecords)
          return {
            expiredIds: expired.map((row) => row.id),
            expiredPaths: expired.flatMap((row) => (row.audioPath ? [row.audioPath] : [])),
            survivingPaths: surviving.flatMap((row) => (row.audioPath ? [row.audioPath] : []))
          }
        })
      },
      { priority: 'background' }
    )

    if (outcome.expiredIds.length > 0) {
      emitVoiceRecognitionRecordMutation({ type: 'prune', ids: outcome.expiredIds })
    }

    let deletedFiles = 0
    for (const filePath of outcome.expiredPaths) {
      try {
        const deleted = await tempFileService.deleteFileFromNamespaces(filePath, [
          RECORDING_NAMESPACE
        ])
        if (deleted) deletedFiles += 1
      } catch (error) {
        voiceRecordLog.warn('Expired recognition audio cleanup failed', {
          meta: { code: 'VOICE_RECORD_EXPIRED_AUDIO_CLEANUP_FAILED' },
          error
        })
      }
    }

    deletedFiles += await this.sweepOrphanedAudioFiles(
      tempFileService,
      outcome.survivingPaths,
      nowMs - ORPHAN_AUDIO_GRACE_MS
    )

    return {
      deletedRecords: outcome.expiredIds.length,
      deletedFiles
    }
  }

  private async sweepOrphanedAudioFiles(
    tempFileService: TempFileService,
    survivingPaths: readonly string[],
    orphanCutoffMs: number
  ): Promise<number> {
    if (typeof tempFileService.resolveNamespaceDir !== 'function') return 0
    const namespaceDir = tempFileService.resolveNamespaceDir(RECORDING_NAMESPACE)
    let canonicalRoot: string
    try {
      canonicalRoot = await fs.realpath(namespaceDir)
    } catch {
      return 0
    }

    const referenced = new Set<string>()
    for (const rawPath of survivingPaths) {
      referenced.add(path.resolve(rawPath))
      try {
        referenced.add(await fs.realpath(rawPath))
      } catch {
        // Ignore dangling references when building the keep-set.
      }
    }

    let entries: Array<import('node:fs').Dirent>
    try {
      entries = await fs.readdir(canonicalRoot, { withFileTypes: true })
    } catch {
      return 0
    }

    let deletedFiles = 0
    for (const entry of entries) {
      if (entry.isSymbolicLink() || !entry.isFile()) continue
      if (entry.name.startsWith('.') && entry.name.endsWith('.recovery')) continue
      const candidatePath = path.join(canonicalRoot, entry.name)
      try {
        const canonicalFile = await fs.realpath(candidatePath)
        if (!isWithinDirectory(canonicalRoot, canonicalFile)) continue
        if (referenced.has(candidatePath) || referenced.has(canonicalFile)) continue
        const stat = await fs.lstat(canonicalFile)
        if (!stat.isFile() || stat.isSymbolicLink()) continue
        if (Number.isFinite(stat.mtimeMs) && stat.mtimeMs >= orphanCutoffMs) continue
        const deleted = await tempFileService.deleteFileFromNamespaces(canonicalFile, [
          RECORDING_NAMESPACE
        ])
        if (deleted) deletedFiles += 1
      } catch {
        // Best-effort orphan cleanup.
      }
    }
    return deletedFiles
  }

  async clear(): Promise<void> {
    const db = resolveCurrentAuxDb()?.db
    if (!db) return
    const tempFileService = await loadTempFileService()
    this.ensureNamespace(tempFileService)
    const paths = await db
      .select({ audioPath: schema.voiceRecognitionRecords.audioPath })
      .from(schema.voiceRecognitionRecords)
    await scheduleAuxWrite('voice-records.clear', async (writeDb) => {
      await writeDb.delete(schema.voiceRecognitionRecords)
    })
    emitVoiceRecognitionRecordMutation({ type: 'clear' })
    for (const filePath of paths.flatMap((row) => (row.audioPath ? [row.audioPath] : []))) {
      await tempFileService.deleteFileFromNamespaces(filePath, [RECORDING_NAMESPACE])
    }
    // Sweep any unreferenced orphan WAVs left behind by earlier crashes or failed writes.
    await this.sweepOrphanedAudioFiles(tempFileService, [], Date.now() + 1)
  }
}

export const voiceRecognitionStore = new VoiceRecognitionStore()
