import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, open, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os, { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import process from 'node:process'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { createDeflate } from 'node:zlib'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { localEmbeddingInstallManifestPath } from './local-embedding-assets'
import * as models from './local-embedding-model'
import { EMBEDDING_QUEUE_LIMITS, runWithEmbeddingPriority } from './local-embedding-queue'
import {
  getLocalEmbeddingRuntime,
  setLocalEmbeddingRuntimeForTests
} from './local-embedding-runtime'

const hashedFiles = vi.hoisted(() => ({ paths: [] as string[] }))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    createReadStream: ((file: unknown, options?: unknown) => {
      hashedFiles.paths.push(String(file))
      return actual.createReadStream(file as never, options as never)
    }) as typeof actual.createReadStream
  }
})

let directory: string | undefined

const execFileAsync = promisify(execFile)

async function imageInput(file: string) {
  const details = await stat(file)
  vi.stubEnv('TEST_ORIGINAL_IMAGE', file)
  return { path: file, mtime: details.mtimeMs, size: details.size }
}

/** Valid, highly compressible PNGs exercise declared decode budgets without giant allocations. */
async function budgetPng(width: number, height: number, bitDepth: 8 | 16, channels: 1 | 4) {
  function chunk(type: string, data: Buffer): Buffer {
    const body = Buffer.concat([Buffer.from(type), data])
    let crc = 0xffffffff
    for (const byte of body) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
      }
    }
    const framed = Buffer.alloc(data.length + 12)
    framed.writeUInt32BE(data.length, 0)
    body.copy(framed, 4)
    framed.writeUInt32BE((crc ^ 0xffffffff) >>> 0, framed.length - 4)
    return framed
  }
  function* scanlines() {
    const row = Buffer.alloc(1 + width * channels * (bitDepth / 8))
    for (let index = 0; index < height; index++) yield row
  }
  const compressed: Buffer[] = []
  await pipeline(
    Readable.from(scanlines()),
    createDeflate(),
    new Writable({
      write(data: Buffer, _encoding, callback) {
        compressed.push(data)
        callback()
      }
    })
  )
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = bitDepth
  header[9] = channels === 4 ? 6 : 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', Buffer.concat(compressed)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

async function expectNormalizedCapture(file: string, width: number, height: number) {
  const bytes = await readFile(file)
  const metadata = await sharp(bytes).metadata()
  expect(metadata.format).toBe('png')
  expect(metadata.orientation).toBeUndefined()
  expect(metadata.exif).toBeUndefined()
  expect(metadata.icc).toBeUndefined()
  const decoded = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
  expect(decoded.info).toMatchObject({ width, height })
}

async function sparseWeight(file: string, bytes: number): Promise<void> {
  const handle = await open(file, 'w')
  try {
    await handle.truncate(bytes)
  } finally {
    await handle.close()
  }
}

/** A real JSON-lines subprocess replaces only the slow neural-model boundary. */
async function makeRuntime(media: boolean) {
  directory = await mkdtemp(join(tmpdir(), 'embedding-image-runtime-'))
  vi.spyOn(os, 'homedir').mockReturnValue(directory)
  for (const variable of ['XDG_DATA_HOME', 'LOCALAPPDATA', 'HF_HOME', 'HF_HUB_CACHE']) {
    vi.stubEnv(variable, directory)
  }
  vi.stubEnv('TUFF_DIGUP_HELPER', '')
  vi.stubEnv('DIGUP_MODELS', '')
  const imagePath = join(directory, 'IMG_2048.png')
  await sharp({ create: { width: 2, height: 2, channels: 3, background: '#996633' } })
    .png()
    .toFile(imagePath)
  const details = await stat(imagePath)
  const input = { path: imagePath, mtime: details.mtimeMs, size: details.size }
  await sparseWeight(
    join(directory, models.LOCAL_EMBEDDING_MODEL.file),
    models.LOCAL_EMBEDDING_MODEL.bytes
  )
  if (media) {
    await sparseWeight(
      join(directory, models.LOCAL_EMBEDDING_MEDIA_MODEL.file),
      models.LOCAL_EMBEDDING_MEDIA_MODEL.bytes
    )
  }
  // Verifying hundreds of MB of pinned weights belongs to the real-model acceptance run.
  vi.spyOn(models, 'verifyLocalEmbeddingModel').mockResolvedValue(undefined)
  vi.spyOn(models, 'verifyLocalEmbeddingMediaModel').mockResolvedValue(undefined)
  const script = `#!${process.execPath}
const fs = require('node:fs')
const readline = require('node:readline')
const launchRecord = process.env.TEST_HELPER_LAUNCH_RECORD
if (launchRecord) fs.writeFileSync(launchRecord, process.argv[1])
const trace = process.env.TEST_HELPER_LOG
const note = text => { if (trace) fs.appendFileSync(trace, text + '\\n') }
note('launch ' + process.pid)
const textOnly = process.argv.includes('--text-only')
const info = ${JSON.stringify({
    model: 'google/embeddinggemma-2',
    revision: models.LOCAL_EMBEDDING_MODEL.revision,
    runtime: models.LOCAL_EMBEDDING_MODEL.runtime,
    dtype: models.LOCAL_EMBEDDING_MODEL.dtype,
    dim: models.LOCAL_EMBEDDING_MODEL.dimension
  })}
info.text_only = process.env.TEST_HELPER_WRONG_MODE === '1' ? !textOnly : textOnly
const send = value => process.stdout.write(JSON.stringify(value) + '\\n')
send({ ready: true, info })
readline.createInterface({ input: process.stdin }).on('line', async line => {
  const request = JSON.parse(line)
  const label = request.op === 'image' ? 'image' : String(request.inputs[0])
  note(request.op + ' ' + label)
  const gate = process.env.TEST_HELPER_GATE
  const held = label.startsWith('hold:') || (request.op === 'image' && process.env.TEST_HELPER_HOLD_IMAGE === '1')
  while (gate && held && fs.existsSync(gate)) await new Promise(resolve => setTimeout(resolve, 5))
  if (label.startsWith('crash:')) process.exit(3)
  try {
    const values = new Float32Array(info.dim)
    if (request.op === 'image') {
      if (textOnly) throw new Error('IMAGE_SENT_TO_TEXT_ONLY_HELPER')
      if (request.inputs[0] === process.env.TEST_ORIGINAL_IMAGE) throw new Error('UNSAFE_ORIGINAL_PATH_EXPOSED')
      const bytes = fs.readFileSync(request.inputs[0])
      if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('NOT_A_REAL_PNG')
      const width = bytes.readUInt32BE(16)
      const height = bytes.readUInt32BE(20)
      if (Math.max(width, height) > 1024) throw new Error('IMAGE_NOT_RESIZED')
      fs.writeFileSync(process.env.TEST_IMAGE_CAPTURE, bytes)
      values[1] = 1
      if (process.env.TEST_REPLACE_IMAGE === '1') fs.writeFileSync(process.env.TEST_ORIGINAL_IMAGE, 'replaced during inference')
    } else if (request.op === 'text') {
      values[0] = 1
    } else {
      throw new Error('UNSUPPORTED_MODEL_OPERATION')
    }
    send({ id: request.id, ok: true, dim: info.dim, count: 1, vectors: Buffer.from(values.buffer).toString('base64') })
  } catch (error) {
    send({ id: request.id, ok: false, error: error.message })
  }
})
`
  const helper = join(directory, 'model-helper.cjs')
  await writeFile(helper, script, { mode: 0o700 })
  const launchRecord = join(directory, 'helper-launched.txt')
  vi.stubEnv('TEST_HELPER_LAUNCH_RECORD', launchRecord)
  const imageCapture = join(directory, 'helper-image.png')
  vi.stubEnv('TEST_IMAGE_CAPTURE', imageCapture)
  const log = join(directory, 'helper.log')
  const gate = join(directory, 'helper.gate')
  vi.stubEnv('TEST_HELPER_LOG', log)
  vi.stubEnv('TEST_HELPER_GATE', gate)
  vi.stubEnv('TEST_HELPER_HOLD_IMAGE', '')
  vi.stubEnv('TUFF_LOCAL_EMBEDDING_HELPER', helper)
  vi.stubEnv(
    'TUFF_LOCAL_EMBEDDING_HELPER_SHA256',
    createHash('sha256').update(script).digest('hex')
  )
  vi.stubEnv('TUFF_LOCAL_EMBEDDING_MODEL_DIR', directory)
  vi.stubEnv('TEST_ORIGINAL_IMAGE', imagePath)
  vi.stubEnv('TEST_REPLACE_IMAGE', '')
  vi.stubEnv('TEST_HELPER_WRONG_MODE', '')
  setLocalEmbeddingRuntimeForTests(null)
  hashedFiles.paths.length = 0
  return {
    runtime: getLocalEmbeddingRuntime(),
    input,
    helper,
    script,
    launchRecord,
    imageCapture,
    log,
    gate
  }
}

async function installRuntime(media: boolean) {
  const fixture = await makeRuntime(media)
  const manifest = {
    version: 1,
    platform: process.platform,
    arch: process.arch,
    helper: fixture.helper,
    helperSha256: createHash('sha256').update(fixture.script).digest('hex'),
    modelDirectory: directory!
  }
  vi.stubEnv('TUFF_LOCAL_EMBEDDING_HELPER', '')
  vi.stubEnv('TUFF_LOCAL_EMBEDDING_HELPER_SHA256', '')
  vi.stubEnv('TUFF_LOCAL_EMBEDDING_MODEL_DIR', '')
  const manifestPath = localEmbeddingInstallManifestPath()
  if (!manifestPath.startsWith(`${directory!}${sep}`)) {
    throw new Error('Install manifest fixture escaped its isolated temporary home')
  }
  await mkdir(dirname(manifestPath), { recursive: true })
  await writeFile(manifestPath, JSON.stringify(manifest))
  return { ...fixture, manifest, manifestPath }
}

afterEach(async () => {
  setLocalEmbeddingRuntimeForTests(null)
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = undefined
})

describe('LocalEmbeddingRuntime image filesystem and vector-space boundaries', () => {
  it('keeps text generation usable when the image encoder is missing', async () => {
    const { runtime, input } = await makeRuntime(false)
    expect(runtime.isReady()).toBe(true)
    expect(runtime.isImageReady()).toBe(false)
    const before = await runtime.generate('猫')
    await expect(runtime.generateImage(input)).rejects.toThrow(/media|image|model.*unavailable/i)
    const text = await runtime.generate('猫')
    expect(text.vector).toEqual([
      1,
      ...Array<number>(models.LOCAL_EMBEDDING_MODEL.dimension - 1).fill(0)
    ])
    expect(text.modelKey).toBe(models.LOCAL_EMBEDDING_MODEL_KEY)
    expect(text.vector).toEqual(before.vector)
  })

  it('upgrades a text helper to full mode and returns image and text in the same vector space', async () => {
    const { runtime, input } = await makeRuntime(true)
    const before = await runtime.generate('猫')
    const image = await runtime.generateImage(input)
    const after = await runtime.generate('宠物')
    expect(before.vector).toEqual([
      1,
      ...Array<number>(models.LOCAL_EMBEDDING_MODEL.dimension - 1).fill(0)
    ])
    expect(image.vector).toEqual([
      0,
      1,
      ...Array<number>(models.LOCAL_EMBEDDING_MODEL.dimension - 2).fill(0)
    ])
    expect(after.vector).toEqual(before.vector)
    expect(image.modelKey).toBe(before.modelKey)
    expect(after.modelKey).toBe(before.modelKey)
  })

  it.each([
    {
      name: '19.6MP JPEG with a quarter-turn EXIF orientation',
      format: 'jpeg' as const,
      width: 5120,
      height: 3840,
      outputWidth: 768,
      outputHeight: 1024
    },
    {
      name: '25.2MP PNG',
      format: 'png' as const,
      width: 6000,
      height: 4200,
      outputWidth: 1024,
      outputHeight: 717
    }
  ])(
    'normalizes $name above the former pixel limit before embedding',
    async (sample) => {
      const { runtime, imageCapture } = await makeRuntime(true)
      const file = join(directory!, sample.format === 'jpeg' ? 'large.JPG' : 'large.png')
      const encoder = sharp({
        create: {
          width: sample.width,
          height: sample.height,
          channels: 3,
          background: '#996633'
        }
      })
      if (sample.format === 'jpeg') {
        await encoder.withMetadata({ orientation: 6 }).jpeg().toFile(file)
      } else {
        await encoder.png().toFile(file)
      }
      const original = await readFile(file)
      const image = await runtime.generateImage(await imageInput(file))
      expect(image.vector).toEqual([
        0,
        1,
        ...Array<number>(models.LOCAL_EMBEDDING_MODEL.dimension - 2).fill(0)
      ])
      expect(image.modelKey).toBe(models.LOCAL_EMBEDDING_MODEL_KEY)
      await expectNormalizedCapture(imageCapture, sample.outputWidth, sample.outputHeight)
      expect(await readFile(file)).toEqual(original)
    },
    30_000
  )

  it('accepts AVIF bytes named .jpg without enlarging the normalized image', async () => {
    const { runtime, imageCapture } = await makeRuntime(true)
    const file = join(directory!, 'avif-disguised.jpg')
    await sharp({ create: { width: 40, height: 24, channels: 3, background: '#996633' } })
      .avif({ effort: 1 })
      .toFile(file)
    const original = await readFile(file)
    expect(await sharp(original).metadata()).toMatchObject({ format: 'heif', compression: 'av1' })
    const image = await runtime.generateImage(await imageInput(file))
    expect(image.vector).toEqual([
      0,
      1,
      ...Array<number>(models.LOCAL_EMBEDDING_MODEL.dimension - 2).fill(0)
    ])
    await expectNormalizedCapture(imageCapture, 40, 24)
    expect(await readFile(file)).toEqual(original)
  })

  it.skipIf(process.platform !== 'darwin')(
    'normalizes native HEVC HEIC bytes named .JPG using the macOS image decoder',
    async () => {
      const { runtime, imageCapture } = await makeRuntime(true)
      const file = join(directory!, 'native-heic.JPG')
      const source = join(directory!, 'heic-source.png')
      await sharp({ create: { width: 80, height: 48, channels: 3, background: '#996633' } })
        .png()
        .toFile(source)
      try {
        await execFileAsync('/usr/bin/sips', ['-s', 'format', 'heic', source, '--out', file], {
          timeout: 20_000,
          killSignal: 'SIGKILL',
          maxBuffer: 16 * 1024
        })
      } catch (error) {
        throw new Error(
          'Native HEIC regression fixture unavailable: /usr/bin/sips could not encode HEIC',
          { cause: error }
        )
      }
      const original = await readFile(file)
      expect(await sharp(original).metadata()).toMatchObject({
        format: 'heif',
        compression: 'hevc'
      })
      const image = await runtime.generateImage(await imageInput(file))
      expect(image.vector).toEqual([
        0,
        1,
        ...Array<number>(models.LOCAL_EMBEDDING_MODEL.dimension - 2).fill(0)
      ])
      await expectNormalizedCapture(imageCapture, 80, 48)
      expect(await readFile(file)).toEqual(original)
    },
    60_000
  )

  it.each([
    {
      name: '64Mi pixels exceeded by one image column',
      width: 8193,
      height: 8192,
      bitDepth: 8 as const,
      channels: 1 as const,
      error: /exceeds pixel limit/i
    },
    {
      name: '256MiB decoded RGBA16 exceeded below the pixel limit',
      width: 8193,
      height: 4096,
      bitDepth: 16 as const,
      channels: 4 as const,
      error: /image decoded size exceeds limit/i
    }
  ])(
    'rejects $name before launching the model helper',
    async (sample) => {
      const { runtime, launchRecord, imageCapture } = await makeRuntime(true)
      const file = join(directory!, 'budget.png')
      await writeFile(
        file,
        await budgetPng(sample.width, sample.height, sample.bitDepth, sample.channels)
      )
      const metadata = await sharp(file, { limitInputPixels: false }).metadata()
      expect(metadata).toMatchObject({
        format: 'png',
        width: sample.width,
        height: sample.height,
        channels: sample.channels,
        depth: sample.bitDepth === 16 ? 'ushort' : 'uchar'
      })
      await expect(runtime.generateImage(await imageInput(file))).rejects.toThrow(sample.error)
      await expect(stat(launchRecord)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(stat(imageCapture)).rejects.toMatchObject({ code: 'ENOENT' })
    },
    30_000
  )

  it('rejects a PNG exceeding 32MiB by one byte before launching the model helper', async () => {
    const { runtime, input, launchRecord, imageCapture } = await makeRuntime(true)
    const handle = await open(input.path, 'r+')
    try {
      await handle.truncate(32 * 1024 * 1024 + 1)
    } finally {
      await handle.close()
    }
    await expect(runtime.generateImage(await imageInput(input.path))).rejects.toThrow(
      'Local EmbeddingGemma image identity or size is invalid'
    )
    await expect(stat(launchRecord)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(imageCapture)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a symlink rather than reading a different file through an admitted image path', async () => {
    const { runtime, input } = await makeRuntime(true)
    const link = join(directory!, 'link.png')
    await symlink(input.path, link)
    await expect(runtime.generateImage({ ...input, path: link })).rejects.toMatchObject({
      code: 'ELOOP'
    })
    expect((await runtime.generate('猫')).vector[0]).toBe(1)
  })

  it.each([
    { name: 'mtime', field: 'mtime' as const },
    { name: 'size', field: 'size' as const }
  ])('rejects an image scheduled with a stale $name before decoding it', async ({ field }) => {
    const { runtime, input } = await makeRuntime(true)
    await expect(runtime.generateImage({ ...input, [field]: input[field] + 1 })).rejects.toThrow(
      'Local EmbeddingGemma image identity changed'
    )
  })

  it('rejects a vector when the source image is replaced during inference', async () => {
    const { runtime, input } = await makeRuntime(true)
    vi.stubEnv('TEST_REPLACE_IMAGE', '1')
    await expect(runtime.generateImage(input)).rejects.toThrow(/changed|identity|version/i)
    expect(await stat(input.path).then((value) => value.size)).toBe(
      Buffer.byteLength('replaced during inference')
    )
  })

  it('rejects a helper claiming the wrong text-only mode before accepting its vectors', async () => {
    const { runtime } = await makeRuntime(true)
    vi.stubEnv('TEST_HELPER_WRONG_MODE', '1')
    await expect(runtime.generate('猫')).rejects.toThrow(/identity|mode|space/i)
  })

  it('cancels image model loading without making subsequent text generation unusable', async () => {
    const { runtime, input } = await makeRuntime(true)
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    vi.mocked(models.verifyLocalEmbeddingMediaModel).mockImplementation(async () => {
      entered.resolve()
      await release.promise
    })
    const controller = new AbortController()
    const operation = runtime.generateImage(input, controller.signal)
    const cancelled = expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    try {
      await entered.promise
      controller.abort()
      release.resolve()
      await cancelled
      expect((await runtime.generate('猫')).vector).toEqual([
        1,
        ...Array<number>(models.LOCAL_EMBEDDING_MODEL.dimension - 1).fill(0)
      ])
    } finally {
      controller.abort()
      release.resolve()
      await operation.catch(() => undefined)
    }
  })
})

describe('LocalEmbeddingRuntime installed asset discovery', () => {
  it('uses an installed helper without embedding env and preserves caller-owned assets on close', async () => {
    const { runtime, input, helper, script, manifestPath, launchRecord } =
      await installRuntime(true)
    const originalImage = await readFile(input.path)
    const originalManifest = await readFile(manifestPath)
    expect(runtime.isReady()).toBe(true)
    expect(runtime.isImageReady()).toBe(true)
    const text = await runtime.generate('猫')
    const image = await runtime.generateImage(input)
    expect(text.vector).toEqual([
      1,
      ...Array<number>(models.LOCAL_EMBEDDING_MODEL.dimension - 1).fill(0)
    ])
    expect(image.vector).toEqual([
      0,
      1,
      ...Array<number>(models.LOCAL_EMBEDDING_MODEL.dimension - 2).fill(0)
    ])
    expect(text.modelKey).toBe(models.LOCAL_EMBEDDING_MODEL_KEY)
    expect(image.modelKey).toBe(text.modelKey)
    expect(await readFile(launchRecord, 'utf8')).toBe(helper)
    runtime.close()
    expect(await readFile(helper, 'utf8')).toBe(script)
    expect(await readFile(input.path)).toEqual(originalImage)
    expect(await readFile(manifestPath)).toEqual(originalManifest)
    expect((await stat(join(directory!, models.LOCAL_EMBEDDING_MODEL.file))).size).toBe(
      models.LOCAL_EMBEDDING_MODEL.bytes
    )
    expect((await stat(join(directory!, models.LOCAL_EMBEDDING_MEDIA_MODEL.file))).size).toBe(
      models.LOCAL_EMBEDDING_MEDIA_MODEL.bytes
    )
  })

  it.each([
    { name: 'missing manifest', patch: null },
    { name: 'malformed JSON', patch: '{' },
    { name: 'unsupported version', patch: { version: 2 } },
    { name: 'foreign platform', patch: { platform: 'foreign-platform' } },
    { name: 'foreign architecture', patch: { arch: 'foreign-architecture' } },
    { name: 'relative helper', patch: { helper: 'model-helper.cjs' } },
    { name: 'relative model directory', patch: { modelDirectory: 'models' } },
    { name: 'invalid helper hash', patch: { helperSha256: 'not-a-sha256' } }
  ])('refuses readiness and generation for $name', async ({ patch }) => {
    const { runtime, manifest, manifestPath, launchRecord } = await installRuntime(true)
    if (patch === null) {
      await rm(manifestPath)
    } else {
      await writeFile(
        manifestPath,
        typeof patch === 'string' ? patch : JSON.stringify({ ...manifest, ...patch })
      )
    }
    expect(runtime.isReady()).toBe(false)
    expect(runtime.isImageReady()).toBe(false)
    await expect(runtime.generate('猫')).rejects.toBeInstanceOf(Error)
    await expect(stat(launchRecord)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each([
    { name: 'missing explicit helper', missingHelper: true, hash: 'valid' },
    { name: 'explicit helper without its own hash', missingHelper: false, hash: '' },
    { name: 'explicit helper with an invalid hash', missingHelper: false, hash: 'invalid' }
  ])(
    'never rescues $name with an installed helper or its hash',
    async ({ missingHelper, hash }) => {
      const { runtime, helper, manifest, launchRecord } = await installRuntime(true)
      vi.stubEnv(
        'TUFF_LOCAL_EMBEDDING_HELPER',
        missingHelper ? join(directory!, 'missing-helper') : helper
      )
      vi.stubEnv(
        'TUFF_LOCAL_EMBEDDING_HELPER_SHA256',
        hash === 'valid' ? manifest.helperSha256 : hash
      )
      expect(runtime.isReady()).toBe(false)
      expect(runtime.isImageReady()).toBe(false)
      await expect(runtime.generate('猫')).rejects.toBeInstanceOf(Error)
      await expect(stat(launchRecord)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )

  it.each(['env', 'manifest'] as const)('refuses a wrong %s checksum', async (source) => {
    const { runtime, helper, manifest, manifestPath, launchRecord } = await installRuntime(false)
    vi.stubEnv('TUFF_LOCAL_EMBEDDING_MODEL_DIR', manifest.modelDirectory)
    const wrongHash = '0'.repeat(64)
    if (source === 'env') {
      vi.stubEnv('TUFF_LOCAL_EMBEDDING_HELPER', helper)
      vi.stubEnv('TUFF_LOCAL_EMBEDDING_HELPER_SHA256', wrongHash)
    } else {
      await writeFile(manifestPath, JSON.stringify({ ...manifest, helperSha256: wrongHash }))
    }
    await expect(runtime.generate('猫')).rejects.toBeInstanceOf(Error)
    await expect(stat(launchRecord)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('uses an explicit model directory instead of unavailable installed model files', async () => {
    const { runtime, input } = await installRuntime(true)
    const override = join(directory!, 'override-models')
    await mkdir(override)
    for (const model of [models.LOCAL_EMBEDDING_MODEL, models.LOCAL_EMBEDDING_MEDIA_MODEL]) {
      await sparseWeight(join(override, model.file), model.bytes)
      await rm(join(directory!, model.file))
    }
    vi.stubEnv('TUFF_LOCAL_EMBEDDING_MODEL_DIR', override)
    expect(runtime.isReady()).toBe(true)
    expect(runtime.isImageReady()).toBe(true)
    expect((await runtime.generateImage(input)).vector).toEqual([
      0,
      1,
      ...Array<number>(models.LOCAL_EMBEDDING_MODEL.dimension - 2).fill(0)
    ])
  })
})

async function helperLog(log: string): Promise<string[]> {
  return (await readFile(log, 'utf8').catch(() => '')).split('\n').filter(Boolean)
}

const textRequests = (lines: string[]) =>
  lines.filter((line) => line.startsWith('text ')).map((line) => line.slice('text '.length))
const launches = (lines: string[]) => lines.filter((line) => line.startsWith('launch '))
const turns = () => new Promise<void>((resolve) => setTimeout(resolve, 50))

async function eventually(check: () => Promise<boolean>, what: string): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (await check()) return
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`Timed out waiting for ${what}`)
}

/** The helper answers `hold:` requests only after the gate file is removed. */
async function startHeldJob({
  runtime,
  gate,
  log
}: Awaited<ReturnType<typeof makeRuntime>>): Promise<{
  running: Promise<unknown>
  release: () => Promise<void>
}> {
  await writeFile(gate, '')
  const running = runtime.generate('hold:running')
  await eventually(
    async () => (await helperLog(log)).includes('text hold:running'),
    'the helper to receive the held request'
  )
  return { running, release: () => rm(gate, { force: true }) }
}

describe('LocalEmbeddingRuntime job queue', () => {
  it('queues a second request behind the running one instead of rejecting it as busy', async () => {
    const fixture = await makeRuntime(false)
    const { running, release } = await startHeldJob(fixture)
    let settled = false
    const queued = fixture.runtime.generate('queued')
    void queued.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    await turns()
    expect(settled).toBe(false)
    expect(textRequests(await helperLog(fixture.log))).toEqual(['hold:running'])

    await release()
    await running
    expect((await queued).modelKey).toBe(models.LOCAL_EMBEDDING_MODEL_KEY)
    expect(textRequests(await helperLog(fixture.log))).toEqual(['hold:running', 'queued'])
    expect(launches(await helperLog(fixture.log))).toHaveLength(1)
  })

  it('serves interactive requests ahead of queued background ones, each class in arrival order', async () => {
    const fixture = await makeRuntime(false)
    const { runtime } = fixture
    const { running, release } = await startHeldJob(fixture)
    const jobs = [
      runtime.generate('background-1'),
      runtime.generate('background-2'),
      runWithEmbeddingPriority('interactive', () => runtime.generate('interactive-1')),
      runWithEmbeddingPriority('interactive', () => runtime.generate('interactive-2'))
    ]
    await release()
    await Promise.all([running, ...jobs])
    expect(textRequests(await helperLog(fixture.log))).toEqual([
      'hold:running',
      'interactive-1',
      'interactive-2',
      'background-1',
      'background-2'
    ])
  })

  it('removes an aborted waiter without touching the running job or the helper', async () => {
    const fixture = await makeRuntime(false)
    const { runtime } = fixture
    const { running, release } = await startHeldJob(fixture)
    const controller = new AbortController()
    const aborted = runtime.generate('aborted', controller.signal)
    const rejected = expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
    const survivor = runtime.generate('survivor')
    controller.abort()
    await rejected

    await release()
    await running
    await survivor
    expect(textRequests(await helperLog(fixture.log))).toEqual(['hold:running', 'survivor'])
    expect(launches(await helperLog(fixture.log))).toHaveLength(1)
  })

  it('fails fast with a clear error when the background lane is full, while a query still queues', async () => {
    const fixture = await makeRuntime(false)
    const { runtime } = fixture
    const { running, release } = await startHeldJob(fixture)
    const controller = new AbortController()
    const waiting = Array.from({ length: EMBEDDING_QUEUE_LIMITS.background }, (_, index) =>
      runtime.generate(`background-${index}`, controller.signal).catch((error: unknown) => error)
    )
    await expect(runtime.generate('one too many')).rejects.toThrow(/background queue is full/)
    const query = runWithEmbeddingPriority('interactive', () =>
      runtime.generate('query', controller.signal)
    ).catch((error: unknown) => error)

    controller.abort()
    const outcomes = await Promise.all([...waiting, query])
    expect(outcomes.every((outcome) => (outcome as Error).name === 'AbortError')).toBe(true)
    await release()
    await running
    expect(textRequests(await helperLog(fixture.log))).toEqual(['hold:running'])
  })

  it('lets a query wait for a running image embedding instead of aborting it', async () => {
    const fixture = await makeRuntime(true)
    const { runtime, input, gate, log } = fixture
    vi.stubEnv('TEST_HELPER_HOLD_IMAGE', '1')
    await writeFile(gate, '')
    const image = runtime.generateImage(input)
    await eventually(
      async () => (await helperLog(log)).includes('image image'),
      'the helper to receive the image request'
    )
    let settled = false
    const query = runWithEmbeddingPriority('interactive', () => runtime.generate('query'))
    void query.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    await turns()
    expect(settled).toBe(false)

    await rm(gate)
    expect((await image).vector[1]).toBe(1)
    expect((await query).vector[0]).toBe(1)
    expect(textRequests(await helperLog(log))).toEqual(['query'])
    expect(launches(await helperLog(log))).toHaveLength(1)
  })

  it('rejects only the running job when the helper dies and runs queued work on a fresh helper', async () => {
    const { runtime, log } = await makeRuntime(false)
    const crashing = runtime.generate('crash:running')
    const rejected = expect(crashing).rejects.toThrow(/helper exited/)
    const behind = runtime.generate('behind')
    await rejected
    expect((await behind).vector[0]).toBe(1)
    const started = launches(await helperLog(log))
    expect(started).toHaveLength(2)
    expect(new Set(started).size).toBe(2)
  })

  it('rejects queued requests when the runtime closes', async () => {
    const fixture = await makeRuntime(false)
    const { running, release } = await startHeldJob(fixture)
    const queued = fixture.runtime.generate('queued')
    const outcomes = Promise.all([
      expect(queued).rejects.toThrow(/closed/),
      expect(running).rejects.toThrow(/closed/)
    ])
    fixture.runtime.close()
    await outcomes
    await release()
  })
})

describe('LocalEmbeddingRuntime asset verification cache', () => {
  it('does not hash the helper again when it restarts', async () => {
    const { runtime, helper, log } = await makeRuntime(false)
    await expect(runtime.generate('crash:first')).rejects.toThrow(/helper exited/)
    expect((await runtime.generate('second')).vector[0]).toBe(1)
    expect(launches(await helperLog(log))).toHaveLength(2)
    expect(hashedFiles.paths.filter((file) => file === helper)).toHaveLength(1)
  })

  it('refuses a helper that was replaced after it was first verified', async () => {
    const { runtime, helper, script, log } = await makeRuntime(false)
    await expect(runtime.generate('crash:first')).rejects.toThrow(/helper exited/)
    await writeFile(helper, `${script}\n// swapped after verification\n`, { mode: 0o700 })
    await expect(runtime.generate('second')).rejects.toThrow(
      'Local EmbeddingGemma helper checksum mismatch'
    )
    expect(launches(await helperLog(log))).toHaveLength(1)
    expect(hashedFiles.paths.filter((file) => file === helper)).toHaveLength(2)
  })
})
