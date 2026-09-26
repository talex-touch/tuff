import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A real 2x2 8-bit RGBA PNG (84 bytes). IconService validates whatever native or worker output it
 * promotes, so the fixtures have to be a PNG the artifact store accepts; the artifact store's own
 * byte-level behaviour is covered in file-icon-artifact.test.ts.
 */
const PNG_2X2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGNgYPj/n5H5/38Gdsb//zlY/v8HAEBuCBGhphy2AAAAAElFTkSuQmCC',
  'base64'
)

interface IconExtractMessage {
  type: string
  taskId: string
  filePath: string
  outputPath: string
  size?: number
}

const harness = vi.hoisted(() => {
  type Handler = (payload: unknown) => void

  const workers: MockWorker[] = []
  const shared = {
    onExtract: null as null | ((worker: MockWorker, message: IconExtractMessage) => void)
  }
  const paths = { cache: '', userData: '', cacheUnavailable: false, userDataUnavailable: false }

  class MockWorker {
    readonly threadId = 1
    readonly messages: IconExtractMessage[] = []
    terminateCalls = 0
    private readonly handlers: Record<string, Handler[]> = {}

    constructor(readonly workerPath: string) {
      workers.push(this)
    }

    on(event: string, handler: Handler): this {
      ;(this.handlers[event] ??= []).push(handler)
      return this
    }

    postMessage(message: IconExtractMessage): void {
      this.messages.push(message)
      if (message.type === 'extract') {
        shared.onExtract?.(this, message)
      }
    }

    emit(event: string, payload: unknown): void {
      for (const handler of this.handlers[event] ?? []) {
        handler(payload)
      }
    }

    terminate(): Promise<number> {
      this.terminateCalls += 1
      return Promise.resolve(0)
    }
  }

  return {
    workers,
    shared,
    paths,
    MockWorker,
    writeDarwinAppIcon: vi.fn(),
    getElectronFileIcon: vi.fn(),
    execFileSafe: vi.fn(),
    getPath: vi.fn((name: string): string => {
      if (name === 'cache') {
        if (paths.cacheUnavailable) throw new Error('cache path unavailable')
        return paths.cache
      }
      if (paths.userDataUnavailable) throw new Error('user data path unavailable')
      return paths.userData
    })
  }
})

vi.mock('node:worker_threads', () => ({
  Worker: harness.MockWorker
}))

vi.mock('electron', () => ({
  app: {
    getPath: harness.getPath,
    getFileIcon: vi.fn()
  }
}))

vi.mock('@talex-touch/tuff-native', () => ({
  writeDarwinAppIcon: harness.writeDarwinAppIcon
}))

vi.mock('@talex-touch/utils/common/utils/safe-shell', () => ({
  execFileSafe: harness.execFileSafe
}))

vi.mock('../utils/electron-file-icon', () => ({
  canUseElectronFileIcon: () => true,
  getElectronFileIcon: harness.getElectronFileIcon
}))

import { IconService } from './icon-service'

const originalPlatform = process.platform

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
}

let tempRoot = ''
let cacheRoot = ''
let userDataRoot = ''
let sourceRoot = ''

async function writeSourceFile(name: string, contents = `contents of ${name}`): Promise<string> {
  const filePath = path.join(sourceRoot, name)
  await fs.writeFile(filePath, contents)
  return filePath
}

function readExtractMessages(): IconExtractMessage[] {
  return harness.workers.flatMap((worker) => worker.messages)
}

async function writeStagedOutput(message: IconExtractMessage, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(message.outputPath), { recursive: true })
  await fs.writeFile(message.outputPath, bytes)
}

/** Answers an extraction the way the real worker does: write the staged file, echo its path. */
function answerExtraction(
  worker: InstanceType<typeof harness.MockWorker>,
  message: IconExtractMessage,
  bytes: Uint8Array = PNG_2X2
): void {
  void writeStagedOutput(message, bytes).then(() => {
    worker.emit('message', { type: 'done', taskId: message.taskId, path: message.outputPath })
  })
}

async function cacheDirectoryEntries(service: IconService): Promise<string[]> {
  return (await fs.readdir(service.getFileIconCacheDirectory()).catch(() => [] as string[])).sort()
}

/**
 * sharp picks its native binding from `process.platform` the first time it loads, and these tests
 * fake `process.platform`. Loading it once under the real platform keeps the artifact store's decode
 * real while IconService runs under the simulated one. Without this, whichever platform the first
 * test simulates decides the binding sharp looks for: a Linux runner asks for a darwin binding that
 * is not installed, the failed load is cached, and every later promotion yields no icon.
 */
beforeAll(async () => {
  await import('sharp')
})

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'icon-service-'))
  cacheRoot = path.join(tempRoot, 'cache')
  userDataRoot = path.join(tempRoot, 'userData')
  sourceRoot = path.join(tempRoot, 'sources')
  await Promise.all([
    fs.mkdir(cacheRoot, { recursive: true }),
    fs.mkdir(userDataRoot, { recursive: true }),
    fs.mkdir(sourceRoot, { recursive: true })
  ])

  setPlatform('win32')
  harness.paths.cache = cacheRoot
  harness.paths.userData = userDataRoot
  harness.paths.cacheUnavailable = false
  harness.paths.userDataUnavailable = false
  harness.workers.length = 0
  vi.clearAllMocks()

  harness.shared.onExtract = (worker, message) => answerExtraction(worker, message)
  harness.writeDarwinAppIcon.mockImplementation(
    async (request: { outputPath: string; size: number }) => {
      await fs.mkdir(path.dirname(request.outputPath), { recursive: true })
      await fs.writeFile(request.outputPath, PNG_2X2)
      return { path: request.outputPath, width: 2, height: 2 }
    }
  )
  harness.getElectronFileIcon.mockResolvedValue(null)
  harness.execFileSafe.mockResolvedValue({ stdout: '', stderr: '' })
})

afterEach(async () => {
  setPlatform(originalPlatform)
  harness.shared.onExtract = null
  await fs.rm(tempRoot, { recursive: true, force: true })
})

describe('getFileIconCacheDirectory', () => {
  it('owns the file-icons directory under the Electron cache', () => {
    const service = new IconService()

    expect(service.getFileIconCacheDirectory()).toBe(path.join(cacheRoot, 'file-icons'))
  })

  it('falls back to a user-data owned directory when the cache root is unavailable', () => {
    harness.paths.cacheUnavailable = true
    const service = new IconService()

    expect(service.getFileIconCacheDirectory()).toBe(path.join(userDataRoot, 'cache', 'file-icons'))
  })

  it('fails closed instead of inventing a shared directory when no Electron path resolves', async () => {
    harness.paths.cacheUnavailable = true
    harness.paths.userDataUnavailable = true
    const service = new IconService()
    const sourcePath = await writeSourceFile('no-owned-root.txt')

    expect(() => service.getFileIconCacheDirectory()).toThrow(/unavailable/i)
    // Failing closed means no icon, not pixels dropped into a directory the tfile allowlist does
    // not own — and no native work started to produce them.
    await expect(service.getFileIconPath(sourcePath, 64)).resolves.toBeNull()
    expect(harness.workers).toHaveLength(0)
    expect(await fs.readdir(cacheRoot)).toEqual([])
  })
})

describe('darwin file icons', () => {
  beforeEach(() => {
    setPlatform('darwin')
  })

  it('writes through the native main-thread path and never starts the icon worker', async () => {
    const service = new IconService()
    const sourcePath = await writeSourceFile('report.txt')

    const iconPath = await service.getFileIconPath(sourcePath)

    expect(iconPath).not.toBeNull()
    expect(iconPath!.startsWith('data:')).toBe(false)
    expect(path.dirname(iconPath!)).toBe(service.getFileIconCacheDirectory())
    expect(await fs.readFile(iconPath!)).toEqual(PNG_2X2)
    expect(await cacheDirectoryEntries(service)).toEqual([path.basename(iconPath!)])

    // The unsafe path is `extract-file-icon` inside a worker; on darwin it must not be started at
    // all, and the Electron `getFileIcon` fallback must not be reached either.
    expect(harness.workers).toHaveLength(0)
    expect(harness.getElectronFileIcon).not.toHaveBeenCalled()

    const request = harness.writeDarwinAppIcon.mock.calls[0][0] as {
      sourcePath: string
      outputPath: string
      size: number
    }
    expect(request.sourcePath).toBe(sourcePath)
    expect(request.size).toBe(64)
    expect(path.dirname(request.outputPath)).toBe(service.getFileIconCacheDirectory())
    await expect(fs.access(request.outputPath)).rejects.toThrow()
  })

  it('clamps the requested size to the bounded dimension range', async () => {
    const service = new IconService()
    const sourcePath = await writeSourceFile('sizes.txt')

    await service.getFileIconPath(sourcePath, 4096)
    await service.getFileIconPath(sourcePath, 1)
    await service.getFileIconPath(sourcePath)

    expect(
      harness.writeDarwinAppIcon.mock.calls.map((call) => (call[0] as { size: number }).size)
    ).toEqual([256, 16, 64])
  })

  it('shares one extraction between sizes that clamp to the same dimension', async () => {
    const service = new IconService()
    const sourcePath = await writeSourceFile('same-dimension.txt')

    const [upper, middle] = [
      service.getFileIconPath(sourcePath, 4096),
      service.getFileIconPath(sourcePath, 512)
    ]
    const [upperPath, middlePath] = await Promise.all([upper, middle])

    expect(harness.writeDarwinAppIcon).toHaveBeenCalledTimes(1)
    expect(middlePath).toBe(upperPath)
  })

  it('publishes nothing when the native writer reports an over-dimension image', async () => {
    harness.writeDarwinAppIcon.mockImplementationOnce(async (request: { outputPath: string }) => {
      await fs.mkdir(path.dirname(request.outputPath), { recursive: true })
      await fs.writeFile(request.outputPath, PNG_2X2)
      return { path: request.outputPath, width: 300, height: 300 }
    })
    const service = new IconService()
    const sourcePath = await writeSourceFile('oversize-native.txt')

    await expect(service.getFileIconPath(sourcePath)).resolves.toBeNull()
    expect(await cacheDirectoryEntries(service)).toEqual([])
  })

  it('publishes nothing when the native writer reports a different output file', async () => {
    const elsewhere = path.join(sourceRoot, 'elsewhere.png')
    harness.writeDarwinAppIcon.mockImplementationOnce(async () => {
      await fs.writeFile(elsewhere, PNG_2X2)
      return { path: elsewhere, width: 2, height: 2 }
    })
    const service = new IconService()
    const sourcePath = await writeSourceFile('unexpected-native-path.txt')

    await expect(service.getFileIconPath(sourcePath)).resolves.toBeNull()
    expect(await cacheDirectoryEntries(service)).toEqual([])
  })
})

describe('win32 file icons', () => {
  it('extracts into an owned staging file and publishes the content-addressed path', async () => {
    const service = new IconService()
    const sourcePath = await writeSourceFile('invoice.txt')
    const cacheDirectory = service.getFileIconCacheDirectory()

    const iconPath = await service.getFileIconPath(sourcePath, 48)

    expect(iconPath).not.toBeNull()
    expect(iconPath!.startsWith('data:')).toBe(false)
    expect(path.dirname(iconPath!)).toBe(cacheDirectory)
    expect(await fs.readFile(iconPath!)).toEqual(PNG_2X2)

    const [message] = readExtractMessages()
    expect(message).toMatchObject({ type: 'extract', filePath: sourcePath, size: 48 })
    expect(path.dirname(message.outputPath)).toBe(cacheDirectory)
    // Only the published artifact survives: the staging file must not accumulate in the cache.
    expect(await cacheDirectoryEntries(service)).toEqual([path.basename(iconPath!)])
  })

  it('extracts once for concurrent requests of the same file and size', async () => {
    harness.shared.onExtract = null
    const service = new IconService()
    const sourcePath = await writeSourceFile('shared.txt')

    const first = service.getFileIconPath(sourcePath, 64)
    const second = service.getFileIconPath(sourcePath, 64)

    let worker: (typeof harness.workers)[number] | undefined
    await vi.waitFor(
      () => {
        worker = harness.workers.at(-1)
        if (!worker || worker.messages.length < 1) {
          throw new Error('the extraction was not dispatched')
        }
      },
      { timeout: 5_000 }
    )

    answerExtraction(worker!, worker!.messages[0])
    const [firstPath, secondPath] = await Promise.all([first, second])

    expect(firstPath).not.toBeNull()
    expect(secondPath).toBe(firstPath)
    expect(worker!.messages).toHaveLength(1)
  })

  it('keeps different requested sizes as separate extractions', async () => {
    const service = new IconService()
    const sourcePath = await writeSourceFile('two-sizes.txt')

    const small = await service.getFileIconPath(sourcePath, 32)
    const large = await service.getFileIconPath(sourcePath, 128)

    expect(readExtractMessages().map((message) => message.size)).toEqual([32, 128])
    expect(small).not.toBeNull()
    expect(large).not.toBeNull()
    expect(await fs.readFile(small!)).toEqual(PNG_2X2)
    expect(await fs.readFile(large!)).toEqual(PNG_2X2)
  })

  it('counts only the artifacts it actually created', async () => {
    const service = new IconService()
    const first = await writeSourceFile('one.txt')
    const second = await writeSourceFile('two.txt')

    await service.getFileIconPath(first, 64)
    await service.getFileIconPath(second, 64)

    // Both files produced identical bytes, so the second persist reused the first artifact.
    expect(await cacheDirectoryEntries(service)).toHaveLength(1)
    expect(service.getFileIconCacheStats()).toMatchObject({
      generatedBytesCumulative: PNG_2X2.byteLength
    })
  })

  it('reuses the cached path while the source file is unchanged', async () => {
    const service = new IconService()
    const sourcePath = await writeSourceFile('stable.txt')

    const first = await service.getFileIconPath(sourcePath, 64)
    const second = await service.getFileIconPath(sourcePath, 64)

    expect(second).toBe(first)
    expect(readExtractMessages()).toHaveLength(1)
    expect(service.getFileIconCacheStats()).toMatchObject({ cacheHits: 1, cached: 1 })
  })

  it('extracts again after the source file changes', async () => {
    const service = new IconService()
    const sourcePath = await writeSourceFile('changed.txt')

    await service.getFileIconPath(sourcePath, 64)
    await fs.writeFile(sourcePath, 'a different and much longer payload')
    const refreshed = await service.getFileIconPath(sourcePath, 64)

    expect(readExtractMessages()).toHaveLength(2)
    expect(refreshed).not.toBeNull()
    expect(await fs.readFile(refreshed!)).toEqual(PNG_2X2)
  })

  it('extracts again when the published icon file disappears', async () => {
    const service = new IconService()
    const sourcePath = await writeSourceFile('vanished-icon.txt')

    const first = await service.getFileIconPath(sourcePath, 64)
    await fs.rm(first!, { force: true })
    const second = await service.getFileIconPath(sourcePath, 64)

    expect(readExtractMessages()).toHaveLength(2)
    expect(second).not.toBeNull()
    expect(await fs.readFile(second!)).toEqual(PNG_2X2)
  })

  it.each([
    {
      name: 'output that is not a PNG',
      bytes: Buffer.from('this is not a png, it is a plain text file')
    },
    {
      name: 'output larger than the byte budget',
      bytes: Buffer.alloc(1024 * 1024 + 1, 0x41)
    }
  ])('publishes nothing for $name', async ({ bytes }) => {
    harness.shared.onExtract = (worker, message) => answerExtraction(worker, message, bytes)
    const service = new IconService()
    const sourcePath = await writeSourceFile('bad-output.txt')

    await expect(service.getFileIconPath(sourcePath, 64)).resolves.toBeNull()
    expect(await cacheDirectoryEntries(service)).toEqual([])
  })

  it('degrades to no icon when the worker fails instead of hanging the caller', async () => {
    harness.shared.onExtract = (worker, message) =>
      worker.emit('message', {
        type: 'error',
        taskId: message.taskId,
        error: 'extract-file-icon exploded'
      })
    const service = new IconService()
    const sourcePath = await writeSourceFile('worker-failure.txt')

    await expect(service.getFileIconPath(sourcePath, 64)).resolves.toBeNull()
    expect(await cacheDirectoryEntries(service)).toEqual([])
  })

  it('admits at most 64 distinct extractions and drains once they complete', async () => {
    harness.shared.onExtract = null
    const service = new IconService()
    const sourcePaths = await Promise.all(
      Array.from({ length: 65 }, async (_, index) => await writeSourceFile(`bulk-${index}.txt`))
    )

    const requests = sourcePaths.map((sourcePath) => service.getFileIconPath(sourcePath, 64))
    // Admission is reserved in the same turn as the call, before any stat or native work: 64
    // flights registered and the 65th refused.
    expect(service.getFileIconCacheStats()).toMatchObject({ inflight: 64, deferred: 1 })
    await vi.waitFor(
      () => {
        const dispatched = readExtractMessages().length
        if (dispatched !== 64) throw new Error(`dispatched ${dispatched} of 64 expected`)
      },
      { timeout: 5_000 }
    )

    // The 65th request is refused rather than queued: no work is retained and nothing else is
    // dispatched, so the worker never carries more than the admission bound.
    await expect(requests[64]).resolves.toBeNull()
    expect(readExtractMessages()).toHaveLength(64)

    const worker = harness.workers.at(-1)!
    for (const message of worker.messages) {
      answerExtraction(worker, message)
    }
    const admitted = await Promise.all(requests.slice(0, 64))
    // Identical bytes collapse onto one content-addressed artifact, so every admitted request must
    // hand back the same path — and it must be a real, readable icon.
    expect(new Set(admitted).size).toBe(1)
    expect(admitted[0]).not.toBeNull()
    await expect(fs.readFile(admitted[0]!)).resolves.toEqual(PNG_2X2)
    // The refusal counter is cumulative: completing the admitted work does not reset it, while the
    // retained entries are the 64 that actually produced icons.
    expect(service.getFileIconCacheStats()).toMatchObject({ cached: 64, deferred: 1 })

    // Completion frees the admission credit, so later work is admitted again.
    harness.shared.onExtract = (worker, message) => answerExtraction(worker, message)
    const latePath = await service.getFileIconPath(sourcePaths[64]!, 64)
    expect(latePath).not.toBeNull()
    expect(await fs.readFile(latePath!)).toEqual(PNG_2X2)
  })

  it('keeps retained cache entries bounded so later files still extract', async () => {
    const service = new IconService()
    const sourcePaths: string[] = []
    for (let index = 0; index < 257; index += 1) {
      const sourcePath = await writeSourceFile(`retained-${index}.txt`)
      sourcePaths.push(sourcePath)
      await service.getFileIconPath(sourcePath, 64)
    }
    const beforeEviction = readExtractMessages().length
    expect(service.getFileIconCacheStats().cached).toBe(256)

    // The first entry is past the 256-entry retention bound, so it is produced again rather than
    // served from a cache that grew with every file the index has ever shown.
    const first = await service.getFileIconPath(sourcePaths[0], 64)
    expect(readExtractMessages()).toHaveLength(beforeEviction + 1)

    // The most recent entry is still retained: no extra extraction for it.
    const last = await service.getFileIconPath(sourcePaths[256], 64)
    expect(readExtractMessages()).toHaveLength(beforeEviction + 1)
    expect(first).not.toBeNull()
    expect(last).not.toBeNull()
  })
})

describe('fallback file icons', () => {
  it('promotes Electron native images through the same bounded artifact store', async () => {
    setPlatform('linux')
    harness.getElectronFileIcon.mockResolvedValue({
      isEmpty: () => false,
      toPNG: () => PNG_2X2
    })
    const service = new IconService()
    const sourcePath = await writeSourceFile('linux.txt')

    const iconPath = await service.getFileIconPath(sourcePath, 64)

    expect(harness.getElectronFileIcon).toHaveBeenCalledWith(sourcePath, expect.anything())
    expect(iconPath).not.toBeNull()
    expect(iconPath!.startsWith('data:')).toBe(false)
    expect(path.dirname(iconPath!)).toBe(service.getFileIconCacheDirectory())
    expect(await fs.readFile(iconPath!)).toEqual(PNG_2X2)
    expect(harness.workers).toHaveLength(0)
  })
})
