import type { TempFileService } from '../../service/temp-file.service'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pcm16ToWav } from './voice-recognition-store'
import { readKeptWav, VoiceKeptRecordings } from './voice-kept-recordings'

/** A temp-file service over a real directory, with the calls the registry makes recorded. */
function createTempFiles(root: string) {
  const namespaces = new Map<string, unknown>()
  let sequence = 0
  const service = {
    getNamespaceConfig: vi.fn((name: string) => namespaces.get(name) ?? null),
    registerNamespace: vi.fn((config: { namespace: string }) => {
      namespaces.set(config.namespace, config)
    }),
    createFile: vi.fn(async (request: { buffer: Buffer; ext: string }) => {
      sequence += 1
      const file = path.join(root, `clip-${sequence}.${request.ext}`)
      await writeFile(file, request.buffer)
      return { path: file, sizeBytes: request.buffer.byteLength, createdAt: Date.now() }
    }),
    deleteFile: vi.fn(async (file: string) => {
      await rm(file, { force: true })
      return true
    }),
    cleanupNamespace: vi.fn(async () => ({
      deletedItemCount: 0,
      deletedByteCount: 0,
      failedItemCount: 0,
      bounded: false,
      cancelled: false
    }))
  }
  return { service, load: async () => service as unknown as TempFileService }
}

function pcm(samples: number, amplitude = 1_000): Buffer {
  const buffer = Buffer.alloc(samples * 2)
  for (let index = 0; index < samples; index += 1) buffer.writeInt16LE(amplitude, index * 2)
  return buffer
}

describe('VoiceKeptRecordings', () => {
  let root: string
  let temp: ReturnType<typeof createTempFiles>
  let kept: VoiceKeptRecordings

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'kept-recordings-'))
    temp = createTempFiles(root)
    kept = new VoiceKeptRecordings(temp.load)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('writes a clip that reads back as the same PCM, with its length and a playable URL', async () => {
    const audio = pcm(8_000)

    const clip = await kept.keep(audio, 16_000)

    expect(clip).toMatchObject({ durationMs: 500 })
    expect(clip!.url.startsWith('tfile:')).toBe(true)
    const back = await kept.read(clip!.id)
    expect(back?.sampleRate).toBe(16_000)
    expect(Buffer.compare(back!.pcm, audio)).toBe(0)
    // Swept by age if nobody ever discards it.
    expect(temp.service.registerNamespace).toHaveBeenCalledWith(
      expect.objectContaining({ namespace: 'voice/kept-recordings', retentionMs: 86_400_000 })
    )
  })

  it('keeps nothing for no audio', async () => {
    expect(await kept.keep(Buffer.alloc(0), 16_000)).toBeNull()
    expect(await kept.keep(Buffer.alloc(1), 16_000)).toBeNull()
    expect(temp.service.createFile).not.toHaveBeenCalled()
  })

  it('deletes the file on discard, and a second discard is not an error', async () => {
    const clip = await kept.keep(pcm(160), 16_000)

    await kept.discard(clip!.id)
    await kept.discard(clip!.id)

    expect(await readdir(root)).toEqual([])
    expect(await kept.read(clip!.id)).toBeNull()
    expect(temp.service.deleteFile).toHaveBeenCalledTimes(1)
  })

  it('lets the oldest clips go once more than four are held', async () => {
    const clips = []
    for (let index = 0; index < 6; index += 1) clips.push(await kept.keep(pcm(160), 16_000))

    expect(kept.get(clips[0]!.id)).toBeUndefined()
    expect(kept.get(clips[1]!.id)).toBeUndefined()
    expect(clips.slice(2).every((clip) => kept.get(clip!.id))).toBe(true)
    expect((await readdir(root)).length).toBe(4)
  })

  it('treats a clip that no longer reads as a WAV as gone', async () => {
    const clip = await kept.keep(pcm(160), 16_000)
    await writeFile(kept.get(clip!.id)!.path, 'not audio')

    expect(await kept.read(clip!.id)).toBeNull()
    expect(kept.get(clip!.id)).toBeUndefined()
  })

  it('sweeps what an earlier run left, and only that', async () => {
    const before = Date.now()

    await kept.initialize()

    const [namespace, options] = temp.service.cleanupNamespace.mock.calls[0] as unknown as [
      string,
      { cutoffMs: number }
    ]
    expect(namespace).toBe('voice/kept-recordings')
    expect(options.cutoffMs).toBeGreaterThanOrEqual(before)
    expect(options.cutoffMs).toBeLessThanOrEqual(Date.now())
  })
})

describe('readKeptWav', () => {
  it('reads the header pcm16ToWav writes', async () => {
    const wav = pcm16ToWav(pcm(10), 24_000)

    expect(readKeptWav(wav)).toMatchObject({ sampleRate: 24_000 })
    expect(readKeptWav(wav)?.pcm.byteLength).toBe(20)
  })

  it('refuses stereo, other sample sizes and truncated data', () => {
    const stereo = pcm16ToWav(pcm(10))
    stereo.writeUInt16LE(2, 22)
    const eightBit = pcm16ToWav(pcm(10))
    eightBit.writeUInt16LE(8, 34)
    const truncated = pcm16ToWav(pcm(10)).subarray(0, 50)

    expect(readKeptWav(stereo)).toBeNull()
    expect(readKeptWav(eightBit)).toBeNull()
    expect(readKeptWav(truncated)).toBeNull()
    expect(readKeptWav(Buffer.from('RIFF'))).toBeNull()
  })

  it('round-trips through a real file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kept-wav-'))
    try {
      const file = path.join(dir, 'clip.wav')
      await writeFile(file, pcm16ToWav(pcm(32)))
      expect(readKeptWav(await readFile(file))?.pcm.byteLength).toBe(64)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
