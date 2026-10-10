import type { VoiceKeptRecording } from '@talex-touch/utils/transport/sdk/domains/voice'
import type { TempFileService } from '../../service/temp-file.service'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { toTfileUrl } from '@talex-touch/utils/network'
import { createLogger } from '../../utils/logger'
import { pcm16ToWav } from './voice-recognition-store'

const KEPT_RECORDING_NAMESPACE = 'voice/kept-recordings'
/**
 * The composer shows one clip at a time; the spares cover a send still copying the previous one.
 * Past this the oldest is deleted, so a renderer that never discards cannot pile audio up.
 */
const MAX_KEPT_RECORDINGS = 4
/**
 * The backstop for a clip nobody discarded — a crash, a renderer reload. The registry is memory
 * only, so after a restart every file here is an orphan, and the temp sweep removes it by age.
 */
const KEPT_RECORDING_RETENTION_MS = 24 * 60 * 60 * 1000
const WAV_HEADER_BYTES = 44
const PCM16_BYTES_PER_SAMPLE = 2

const keptLog = createLogger('VoiceKeptRecordings')

export interface KeptRecordingEntry {
  id: string
  /** Main's file; it never leaves main except as `toTfileUrl(path)` for playback. */
  path: string
  sampleRate: number
  durationMs: number
  createdAt: number
}

export interface KeptRecordingAudio {
  pcm: Buffer
  sampleRate: number
}

/**
 * Reads back a WAV written by `pcm16ToWav`: the canonical 44-byte header for 16-bit mono PCM and
 * nothing else. Anything that does not match is treated as gone rather than guessed at.
 */
export function readKeptWav(wav: Buffer): KeptRecordingAudio | null {
  if (wav.byteLength < WAV_HEADER_BYTES) return null
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') return null
  if (wav.toString('ascii', 12, 16) !== 'fmt ' || wav.readUInt32LE(16) !== 16) return null
  // PCM, one channel, 16 bits.
  if (wav.readUInt16LE(20) !== 1 || wav.readUInt16LE(22) !== 1 || wav.readUInt16LE(34) !== 16)
    return null
  if (wav.toString('ascii', 36, 40) !== 'data') return null
  const sampleRate = wav.readUInt32LE(24)
  const dataBytes = wav.readUInt32LE(40)
  if (sampleRate <= 0 || WAV_HEADER_BYTES + dataBytes > wav.byteLength) return null
  return { pcm: wav.subarray(WAV_HEADER_BYTES, WAV_HEADER_BYTES + dataBytes), sampleRate }
}

async function loadTempFileService(): Promise<TempFileService> {
  const module = await import('../../service/temp-file.service')
  return module.tempFileService
}

/**
 * Audio of composer dictations, kept so the Home voice clip can play it, recognize it again or
 * send it (`VoiceAsrStreamPayload.keepRecording`).
 *
 * Separate from `VoiceService`'s retry buffer on purpose. That slot is global, memory only and
 * cleared the moment a session succeeds, because the HUD's undo and retry are the only things
 * that may spend it; a clip has to outlive a success and must not be overwritten by the next HUD
 * session. Each clip is one file in its own temp namespace, deleted when the renderer discards
 * it, when a send has copied it, when newer clips push it out, or by the retention sweep.
 */
export class VoiceKeptRecordings {
  private readonly entries = new Map<string, KeptRecordingEntry>()
  private tempFiles: Promise<TempFileService> | null = null

  constructor(
    private readonly loadTempFiles: () => Promise<TempFileService> = loadTempFileService
  ) {}

  /**
   * Registers the namespace and deletes what an earlier run left behind. The registry is memory
   * only, so every file already there at startup is an orphan no clip can reach.
   */
  async initialize(): Promise<void> {
    const startedAt = Date.now()
    try {
      const service = await this.service()
      await service.cleanupNamespace(KEPT_RECORDING_NAMESPACE, { cutoffMs: startedAt })
    } catch (error) {
      keptLog.warn('Kept recordings from an earlier run could not be swept', {
        meta: { code: 'VOICE_RECORDING_SWEEP_FAILED' },
        error
      })
    }
  }

  private async service(): Promise<TempFileService> {
    this.tempFiles ??= this.loadTempFiles().then((service) => {
      if (!service.getNamespaceConfig(KEPT_RECORDING_NAMESPACE)) {
        service.registerNamespace({
          namespace: KEPT_RECORDING_NAMESPACE,
          retentionMs: KEPT_RECORDING_RETENTION_MS
        })
      }
      return service
    })
    return this.tempFiles
  }

  /** Writes 16-bit mono PCM out as a clip; `null` when there is no audio to keep. */
  async keep(pcm: Buffer, sampleRate: number): Promise<VoiceKeptRecording | null> {
    const usableBytes = pcm.byteLength - (pcm.byteLength % PCM16_BYTES_PER_SAMPLE)
    if (usableBytes <= 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) return null
    const service = await this.service()
    const created = await service.createFile({
      namespace: KEPT_RECORDING_NAMESPACE,
      ext: 'wav',
      buffer: pcm16ToWav(pcm, sampleRate),
      prefix: 'clip'
    })
    const entry: KeptRecordingEntry = {
      id: randomUUID(),
      path: created.path,
      sampleRate,
      durationMs: Math.round((usableBytes / PCM16_BYTES_PER_SAMPLE / sampleRate) * 1000),
      createdAt: created.createdAt
    }
    this.entries.set(entry.id, entry)
    // Oldest first: a Map iterates in insertion order.
    for (const id of [...this.entries.keys()].slice(0, -MAX_KEPT_RECORDINGS)) {
      await this.discard(id)
    }
    return { id: entry.id, url: toTfileUrl(entry.path), durationMs: entry.durationMs }
  }

  get(id: string): KeptRecordingEntry | undefined {
    return typeof id === 'string' ? this.entries.get(id) : undefined
  }

  /** The clip's PCM, or `null` once it is gone — discarded, expired, or unreadable. */
  async read(id: string): Promise<KeptRecordingAudio | null> {
    const entry = this.get(id)
    if (!entry) return null
    try {
      const audio = readKeptWav(await readFile(entry.path))
      if (audio) return audio
    } catch (error) {
      keptLog.warn('Kept recording could not be read', {
        meta: { code: 'VOICE_RECORDING_UNREADABLE' },
        error
      })
    }
    await this.discard(id)
    return null
  }

  /** Idempotent: a clip that is already gone is not an error. */
  async discard(id: string): Promise<void> {
    const entry = this.get(id)
    if (!entry) return
    this.entries.delete(id)
    try {
      await (await this.service()).deleteFile(entry.path)
    } catch (error) {
      // The retention sweep removes it later; the clip is unreachable either way.
      keptLog.warn('Kept recording could not be deleted', {
        meta: { code: 'VOICE_RECORDING_DELETE_FAILED' },
        error
      })
    }
  }

  async discardAll(): Promise<void> {
    for (const id of [...this.entries.keys()]) await this.discard(id)
  }
}

export const voiceKeptRecordings = new VoiceKeptRecordings()
