import { desc, eq } from 'drizzle-orm'
import type { VoiceRecognitionRecord } from '@talex-touch/utils/transport/sdk/domains/voice'
import { toTfileUrl } from '@talex-touch/utils/network'
import { Buffer } from 'node:buffer'
import * as schema from '../../db/schema'
import { resolveCurrentAuxDb, scheduleAuxWrite } from '../../db/db-write'
import type { TempFileService } from '../../service/temp-file.service'
import { createLogger } from '../../utils/logger'

const RECORDING_NAMESPACE = 'voice/recordings'
const MAX_RECORDS = 200
const MAX_AUDIO_BYTES = 10 * 1024 * 1024
const MAX_TEXT_LENGTH = 2_000_000
const voiceRecordLog = createLogger('VoiceRecords')

async function loadTempFileService(): Promise<TempFileService> {
  const module = await import('../../service/temp-file.service')
  return module.tempFileService
}

export interface VoiceRecognitionRecordInput {
  id: string
  capturedAt: number
  source: VoiceRecognitionRecord['source']
  status: VoiceRecognitionRecord['status']
  audio?: Buffer
  audioFormat?: 'wav' | 'pcm' | 'encoded'
  audioSampleRate?: number
  audioExt?: string
  audioBytes?: number
  audioDurationMs?: number
  recognitionDurationMs?: number
  rawText?: string
  text?: string
  providerId?: string
  model?: string
  channel?: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  errorCode?: string
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

function pcm16ToWav(pcm: Buffer, sampleRate = 16_000): Buffer {
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
    status: row.status as VoiceRecognitionRecord['status'],
    ...(row.audioPath ? { audioUrl: toTfileUrl(row.audioPath) } : {}),
    ...(row.audioBytes === null ? {} : { audioBytes: Math.max(0, row.audioBytes) }),
    ...(row.audioDurationMs === null ? {} : { audioDurationMs: Math.max(0, row.audioDurationMs) }),
    ...(row.recognitionDurationMs === null
      ? {}
      : { recognitionDurationMs: Math.max(0, row.recognitionDurationMs) }),
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
      status: input.status,
      ...(audioPath ? { audioPath } : {}),
      ...(audioBytes === undefined ? {} : { audioBytes }),
      ...(boundedNumber(input.audioDurationMs) === undefined
        ? {}
        : { audioDurationMs: boundedNumber(input.audioDurationMs) }),
      ...(boundedNumber(input.recognitionDurationMs) === undefined
        ? {}
        : { recognitionDurationMs: boundedNumber(input.recognitionDurationMs) }),
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
      ...(input.errorCode ? { errorCode: input.errorCode.slice(0, 128) } : {}),
      ...(input.deliveryMethod ? { deliveryMethod: input.deliveryMethod } : {})
    }

    try {
      const stalePaths = await scheduleAuxWrite('voice-records.record', async (db) => {
        return await db.transaction(async (tx) => {
          await tx.insert(schema.voiceRecognitionRecords).values(values).onConflictDoUpdate({
            target: schema.voiceRecognitionRecords.id,
            set: values
          })
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
          return stale.flatMap((row) => (row.audioPath ? [row.audioPath] : []))
        })
      })
      for (const path of stalePaths ?? []) {
        await tempFileService.deleteFileFromNamespaces(path, [RECORDING_NAMESPACE])
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
    for (const path of paths.flatMap((row) => (row.audioPath ? [row.audioPath] : []))) {
      await tempFileService.deleteFileFromNamespaces(path, [RECORDING_NAMESPACE])
    }
  }
}

export const voiceRecognitionStore = new VoiceRecognitionStore()
