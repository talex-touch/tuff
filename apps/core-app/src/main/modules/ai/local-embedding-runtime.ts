import { Buffer } from 'node:buffer'
import { execFile, spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { constants, existsSync, statSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { lstat, mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { cachedFileSha256 } from './local-embedding-digest'
import {
  embeddingModelDirectories,
  locateLocalEmbeddingModel,
  LOCAL_EMBEDDING_MODEL,
  LOCAL_EMBEDDING_MEDIA_MODEL,
  LOCAL_EMBEDDING_MODEL_KEY,
  verifyLocalEmbeddingModel,
  verifyLocalEmbeddingMediaModel
} from './local-embedding-model'
import { currentEmbeddingPriority, EmbeddingJobQueue } from './local-embedding-queue'
import type { LocalEmbeddingAssets } from './local-embedding-assets'
import { resolveLocalEmbeddingAssets } from './local-embedding-assets'

export interface LocalEmbeddingGeneration {
  readonly vector: number[]
  readonly modelKey: string
}

export interface LocalEmbeddingImageInput {
  readonly path: string
  readonly mtime: number
  readonly size: number
}

export interface LocalEmbeddingRuntime {
  /** Synchronous readiness probe: no process launch, model loading, hashing, or download. */
  isReady(): boolean
  isImageReady(): boolean
  generate(text: string, signal?: AbortSignal): Promise<LocalEmbeddingGeneration>
  generateImage(
    input: LocalEmbeddingImageInput,
    signal?: AbortSignal
  ): Promise<LocalEmbeddingGeneration>
  close(): void
}

interface WorkerInfo {
  readonly model?: string
  readonly revision?: string
  readonly runtime?: string
  readonly dtype?: string
  readonly dim?: number
  readonly text_only?: boolean
}

interface WorkerResponse {
  readonly id?: number
  readonly ready?: boolean
  readonly ok?: boolean
  readonly error?: string
  readonly info?: WorkerInfo
  readonly dim?: number
  readonly count?: number
  readonly vectors?: string
}

interface PendingRequest {
  readonly resolve: (value: LocalEmbeddingGeneration) => void
  readonly reject: (error: unknown) => void
  readonly cleanup: () => void
  readonly timer: NodeJS.Timeout
}

const MAX_INPUT_CHARS = 32_000
const START_TIMEOUT_MS = 20_000
const REQUEST_TIMEOUT_MS = 120_000
const MAX_IMAGE_BYTES = 32 * 1024 * 1024
// Admit ordinary high-resolution photos, but bound decoded storage as well as pixels.
const MAX_IMAGE_PIXELS = 64 * 1024 * 1024
const MAX_IMAGE_DECODED_BYTES = 256 * 1024 * 1024
const IMAGE_MAX_EDGE = 1024
const IMAGE_DEPTH_BYTES: Partial<Record<string, number>> = {
  uchar: 1,
  char: 1,
  ushort: 2,
  short: 2,
  uint: 4,
  int: 4,
  float: 4,
  double: 8
}
const execFileAsync = promisify(execFile)
const IMAGE_EXTENSIONS: Record<string, true> = {
  '.png': true,
  '.jpg': true,
  '.jpeg': true,
  '.webp': true,
  '.gif': true,
  '.tiff': true
}

function sameImageIdentity(before: Stats, after: Stats): boolean {
  return (
    after.isFile() &&
    before.dev === after.dev &&
    before.ino === after.ino &&
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs &&
    before.ctimeMs === after.ctimeMs
  )
}

interface ImageSnapshot {
  readonly path: string
  readonly recheck: () => Promise<void>
  readonly cleanup: () => Promise<void>
}

/** Only the bounded bytes from this no-follow descriptor ever reach the image decoder/helper. */
async function prepareImageSnapshot(
  input: LocalEmbeddingImageInput,
  signal?: AbortSignal
): Promise<ImageSnapshot> {
  const { path: imagePath, mtime, size } = input
  if (
    !path.isAbsolute(imagePath) ||
    !Object.hasOwn(IMAGE_EXTENSIONS, path.extname(imagePath).toLowerCase()) ||
    !Number.isFinite(mtime) ||
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > MAX_IMAGE_BYTES
  ) {
    throw new Error('Local EmbeddingGemma image identity or size is invalid')
  }
  if (signal?.aborted) throw abortError()
  const handle = await open(
    imagePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  )
  let directory: string | undefined
  try {
    const before = await handle.stat()
    if (!before.isFile() || before.size !== size || before.mtimeMs !== mtime) {
      throw new Error('Local EmbeddingGemma image identity changed')
    }
    const recheck = async () => {
      if (!sameImageIdentity(before, await lstat(imagePath))) {
        throw new Error('Local EmbeddingGemma image identity changed')
      }
    }
    await recheck()
    const bytes = Buffer.allocUnsafe(size)
    let offset = 0
    while (offset < bytes.length) {
      if (signal?.aborted) throw abortError()
      const result = await handle.read(
        bytes,
        offset,
        Math.min(1024 * 1024, bytes.length - offset),
        offset
      )
      if (result.bytesRead === 0) throw new Error('Local EmbeddingGemma image was truncated')
      offset += result.bytesRead
    }
    if (!sameImageIdentity(before, await handle.stat())) {
      throw new Error('Local EmbeddingGemma image identity changed during read')
    }
    await recheck()
    if (signal?.aborted) throw abortError()
    let decoder = sharp(bytes, {
      failOn: 'error',
      limitInputPixels: MAX_IMAGE_PIXELS,
      pages: 1
    }).timeout({ seconds: 20 })
    const metadata = await decoder.metadata()
    if (!['png', 'jpeg', 'webp', 'gif', 'tiff', 'heif'].includes(metadata.format ?? '')) {
      throw new Error('Local EmbeddingGemma image format is unsupported')
    }
    const sampleBytes = IMAGE_DEPTH_BYTES[metadata.depth]
    const decodedBytes = metadata.width * metadata.height * metadata.channels * (sampleBytes ?? 0)
    if (
      !sampleBytes ||
      !Number.isSafeInteger(decodedBytes) ||
      decodedBytes <= 0 ||
      decodedBytes > MAX_IMAGE_DECODED_BYTES
    ) {
      throw new Error('Local EmbeddingGemma image decoded size exceeds limit')
    }
    if (signal?.aborted) throw abortError()
    if (
      metadata.format === 'heif' &&
      metadata.compression === 'hevc' &&
      process.platform === 'darwin'
    ) {
      // The bundled libvips has AV1, not HEVC. ImageIO handles HEIC locally; it only
      // sees the bounded, no-follow bytes, never a second read of the original path.
      directory = await mkdtemp(path.join(os.tmpdir(), 'tuff-embedding-image-'))
      const sourcePath = path.join(directory, 'source.heic')
      const decodedPath = path.join(directory, 'decoded.png')
      const nativeMaxEdge = Math.min(IMAGE_MAX_EDGE, Math.max(metadata.width, metadata.height))
      await writeFile(sourcePath, bytes, { mode: 0o600, flag: 'wx' })
      await execFileAsync(
        '/usr/bin/sips',
        [
          '--setProperty',
          'format',
          'png',
          '--resampleHeightWidthMax',
          String(nativeMaxEdge),
          sourcePath,
          '--out',
          decodedPath
        ],
        { timeout: 20_000, maxBuffer: 16 * 1024, signal, killSignal: 'SIGKILL' }
      )
      await rm(sourcePath)
      if (signal?.aborted) throw abortError()
      decoder.destroy()
      decoder = sharp(decodedPath, {
        failOn: 'error',
        limitInputPixels: IMAGE_MAX_EDGE * IMAGE_MAX_EDGE,
        pages: 1
      }).timeout({ seconds: 20 })
    }
    const decoding = decoder
      .rotate()
      .resize(IMAGE_MAX_EDGE, IMAGE_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer()
    const normalized = await new Promise<Buffer>((resolve, reject) => {
      const onAbort = () => {
        signal?.removeEventListener('abort', onAbort)
        decoder.destroy()
        reject(abortError())
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      decoding.then(
        (result) => {
          signal?.removeEventListener('abort', onAbort)
          resolve(result)
        },
        (error) => {
          signal?.removeEventListener('abort', onAbort)
          reject(error)
        }
      )
      if (signal?.aborted) onAbort()
    })
    if (signal?.aborted) throw abortError()
    await recheck()
    directory ??= await mkdtemp(path.join(os.tmpdir(), 'tuff-embedding-image-'))
    const snapshotPath = path.join(directory, 'input.png')
    await writeFile(snapshotPath, normalized, { mode: 0o600, flag: 'wx' })
    if (signal?.aborted) throw abortError()
    const snapshotDirectory = directory
    return {
      path: snapshotPath,
      recheck,
      cleanup: () => rm(snapshotDirectory, { recursive: true, force: true })
    }
  } catch (error) {
    if (directory) await rm(directory, { recursive: true, force: true })
    throw error
  } finally {
    await handle.close()
  }
}

function configuredHelperAssets(): LocalEmbeddingAssets | null {
  const assets = resolveLocalEmbeddingAssets()
  if (!assets) return null
  try {
    const details = statSync(assets.helper)
    return details.isFile() && (details.mode & 0o111) !== 0 ? assets : null
  } catch {
    return null
  }
}

function abortError(): Error {
  const error = new Error('Local EmbeddingGemma generation cancelled')
  error.name = 'AbortError'
  return error
}

function readOptionalNumber(value: Record<string, unknown>, key: string): number | undefined {
  const field = value[key]
  if (field === undefined) return undefined
  if (typeof field !== 'number' || !Number.isFinite(field))
    throw new Error(`EmbeddingGemma worker field ${key} is invalid`)
  return field
}

function readOptionalString(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key]
  if (field === undefined) return undefined
  if (typeof field !== 'string') throw new Error(`EmbeddingGemma worker field ${key} is invalid`)
  return field
}

function readOptionalBoolean(value: Record<string, unknown>, key: string): boolean | undefined {
  const field = value[key]
  if (field === undefined) return undefined
  if (typeof field !== 'boolean') throw new Error(`EmbeddingGemma worker field ${key} is invalid`)
  return field
}
async function verifyHelperBinary(helper: string, expected: string): Promise<void> {
  if ((await cachedFileSha256(helper)) !== expected.toLowerCase())
    throw new Error('Local EmbeddingGemma helper checksum mismatch')
}

function parseWorkerResponse(line: string): WorkerResponse {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    throw new Error('EmbeddingGemma helper emitted invalid JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('EmbeddingGemma helper emitted a non-object response')
  }
  const record = parsed as Record<string, unknown>
  const ready = record.ready
  if (ready !== undefined && typeof ready !== 'boolean')
    throw new Error('EmbeddingGemma worker ready field is invalid')
  const ok = record.ok
  if (ok !== undefined && typeof ok !== 'boolean')
    throw new Error('EmbeddingGemma worker ok field is invalid')
  const infoValue = record.info
  let info: WorkerInfo | undefined
  if (infoValue !== undefined) {
    if (infoValue === null || typeof infoValue !== 'object' || Array.isArray(infoValue)) {
      throw new Error('EmbeddingGemma worker info field is invalid')
    }
    const infoRecord = infoValue as Record<string, unknown>
    info = {
      model: readOptionalString(infoRecord, 'model'),
      revision: readOptionalString(infoRecord, 'revision'),
      runtime: readOptionalString(infoRecord, 'runtime'),
      dtype: readOptionalString(infoRecord, 'dtype'),
      dim: readOptionalNumber(infoRecord, 'dim'),
      text_only: readOptionalBoolean(infoRecord, 'text_only')
    }
  }
  return {
    id: readOptionalNumber(record, 'id'),
    ready,
    ok,
    error: readOptionalString(record, 'error'),
    info,
    dim: readOptionalNumber(record, 'dim'),
    count: readOptionalNumber(record, 'count'),
    vectors: readOptionalString(record, 'vectors')
  }
}

function readFloat32Vector(encoded: string, dimension: number): number[] {
  if (encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('EmbeddingGemma helper returned invalid base64')
  }
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.byteLength !== dimension * Float32Array.BYTES_PER_ELEMENT) {
    throw new Error(`EmbeddingGemma vector dimension mismatch: expected ${dimension}`)
  }
  const values = new Float32Array(bytes.buffer, bytes.byteOffset, dimension)
  const vector = Array.from(values)
  let norm = 0
  for (const value of vector) {
    if (!Number.isFinite(value)) throw new Error('EmbeddingGemma returned a non-finite vector')
    norm += value * value
  }
  if (!(norm > 0)) throw new Error('EmbeddingGemma returned an empty vector')
  return vector
}

class DigUpEmbeddingRuntime implements LocalEmbeddingRuntime {
  private child: ChildProcessWithoutNullStreams | null = null
  private ready = false
  private nextId = 1
  private readonly jobs = new EmbeddingJobQueue(abortError)
  private stdout = ''
  private pending = new Map<number, PendingRequest>()
  private startResolve: (() => void) | null = null
  private startReject: ((error: unknown) => void) | null = null
  private startTimer: NodeJS.Timeout | undefined
  private stopping: Promise<void> | null = null
  private textOnly = true
  private imageController: AbortController | null = null
  private closed = false

  isReady(): boolean {
    if (this.closed) return false
    const assets = configuredHelperAssets()
    if (!assets || !existsSync(assets.helper)) return false
    for (const directory of embeddingModelDirectories()) {
      try {
        const model = statSync(`${directory}/${LOCAL_EMBEDDING_MODEL.file}`)
        if (model.isFile() && model.size === LOCAL_EMBEDDING_MODEL.bytes) return true
      } catch {
        // A missing model is an unavailable local capability, not a download trigger.
      }
    }
    return false
  }

  isImageReady(): boolean {
    if (!this.isReady()) return false
    for (const directory of embeddingModelDirectories()) {
      try {
        const text = statSync(path.join(directory, LOCAL_EMBEDDING_MODEL.file))
        const media = statSync(path.join(directory, LOCAL_EMBEDDING_MEDIA_MODEL.file))
        if (
          text.isFile() &&
          text.size === LOCAL_EMBEDDING_MODEL.bytes &&
          media.isFile() &&
          media.size === LOCAL_EMBEDDING_MEDIA_MODEL.bytes
        )
          return true
      } catch {
        // Media is optional for text generation; readiness never hashes or downloads.
      }
    }
    return false
  }

  async generate(text: string, signal?: AbortSignal): Promise<LocalEmbeddingGeneration> {
    if (this.closed) throw new Error('Local EmbeddingGemma runtime is closed')
    if (signal?.aborted) throw abortError()
    if (text.length > MAX_INPUT_CHARS) {
      throw new Error(`Local EmbeddingGemma input exceeds ${MAX_INPUT_CHARS} characters`)
    }
    const release = await this.jobs.acquire(currentEmbeddingPriority(), signal)
    try {
      await this.ensureStarted(signal)
      if (!this.child || !this.ready) throw new Error('Local EmbeddingGemma runtime is not ready')
      return await this.request('text', text, signal)
    } finally {
      try {
        await this.stopping
      } finally {
        release()
      }
    }
  }

  async generateImage(
    input: LocalEmbeddingImageInput,
    signal?: AbortSignal
  ): Promise<LocalEmbeddingGeneration> {
    if (this.closed) throw new Error('Local EmbeddingGemma runtime is closed')
    if (signal?.aborted) throw abortError()
    if (!this.isImageReady()) throw new Error('Local EmbeddingGemma media model is unavailable')
    const release = await this.jobs.acquire(currentEmbeddingPriority(), signal)
    if (signal?.aborted) {
      release()
      throw abortError()
    }
    const controller = new AbortController()
    this.imageController = controller
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, REQUEST_TIMEOUT_MS)
    let snapshot: ImageSnapshot | undefined
    try {
      snapshot = await prepareImageSnapshot(input, controller.signal)
      await this.ensureStarted(controller.signal, true)
      if (controller.signal.aborted) throw abortError()
      await snapshot.recheck()
      const generated = await this.request('image', snapshot.path, controller.signal)
      await snapshot.recheck()
      if (controller.signal.aborted) throw abortError()
      return generated
    } catch (error) {
      if (controller.signal.aborted) {
        const failure = timedOut
          ? new Error('Local EmbeddingGemma image request timed out')
          : abortError()
        this.terminate(failure)
        throw failure
      }
      throw error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      this.imageController = null
      try {
        await this.stopping
        await snapshot?.cleanup()
      } finally {
        release()
      }
    }
  }

  close(): void {
    this.closed = true
    this.jobs.close(new Error('Local EmbeddingGemma runtime closed'))
    this.imageController?.abort()
    this.terminate(new Error('Local EmbeddingGemma runtime closed'))
  }

  private async ensureStarted(signal?: AbortSignal, requireImage = false): Promise<void> {
    if (signal?.aborted) throw abortError()
    if (this.child && this.ready && (!requireImage || !this.textOnly)) return
    await this.awaitWithAbort(this.start(signal, requireImage), signal)
  }

  private async start(signal?: AbortSignal, requireImage = false): Promise<void> {
    if (signal?.aborted) throw abortError()
    const assets = configuredHelperAssets()
    if (!assets)
      throw new Error('Local EmbeddingGemma helper is unavailable; install local model assets')
    const helper = assets.helper
    await verifyHelperBinary(helper, assets.helperSha256)
    const model = await locateLocalEmbeddingModel(requireImage)
    if (!model)
      throw new Error(
        `EmbeddingGemma 2 model is unavailable at pinned revision ${LOCAL_EMBEDDING_MODEL.revision}`
      )
    if (this.closed) throw new Error('Local EmbeddingGemma runtime is closed')
    await verifyLocalEmbeddingModel(model)
    if (requireImage) await verifyLocalEmbeddingMediaModel(model)
    if (signal?.aborted) throw abortError()
    if (this.child) this.terminate(new Error('EmbeddingGemma helper upgrading to image mode'))
    await this.stopping
    if (this.closed) throw new Error('Local EmbeddingGemma runtime is closed')
    if (signal?.aborted) throw abortError()
    this.textOnly = !requireImage

    const readiness = new Promise<void>((resolve, reject) => {
      this.startResolve = resolve
      this.startReject = reject
      this.startTimer = setTimeout(
        () => this.terminate(new Error('EmbeddingGemma helper readiness timed out')),
        START_TIMEOUT_MS
      )
    })
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(helper, requireImage ? ['worker'] : ['worker', '--text-only'], {
        env: { ...process.env, DIGUP_MODELS: model.directory },
        stdio: ['pipe', 'pipe', 'pipe']
      })
    } catch (error) {
      this.rejectStart(error)
      throw error
    }
    this.child = child
    this.ready = false
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      if (this.child === child) this.consumeOutput(chunk)
    })
    child.stderr.resume()
    child.once('error', (error) => {
      if (this.child === child) this.terminate(error)
    })
    child.once('exit', (code, signalName) => {
      if (this.child === child)
        this.terminate(
          new Error(`EmbeddingGemma helper exited (${code ?? signalName ?? 'unknown'})`)
        )
    })
    return await readiness
  }

  private consumeOutput(chunk: string): void {
    this.stdout += chunk
    if (this.stdout.length > 4 * 1024 * 1024) {
      this.terminate(new Error('EmbeddingGemma helper response exceeded the size limit'))
      return
    }
    const lines = this.stdout.split('\n')
    this.stdout = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      let response: WorkerResponse
      try {
        response = parseWorkerResponse(line)
      } catch (error) {
        this.terminate(error)
        return
      }
      if (response.ready !== undefined) {
        if (!response.ready) {
          this.terminate(new Error(response.error || 'EmbeddingGemma helper failed to load'))
          return
        }
        const info = response.info
        if (
          info?.model !== 'google/embeddinggemma-2' ||
          info.revision !== LOCAL_EMBEDDING_MODEL.revision ||
          info.dim !== LOCAL_EMBEDDING_MODEL.dimension ||
          info.runtime !== LOCAL_EMBEDDING_MODEL.runtime ||
          info.dtype !== LOCAL_EMBEDDING_MODEL.dtype ||
          info.text_only !== this.textOnly
        ) {
          this.terminate(
            new Error('EmbeddingGemma helper model identity does not match the pinned vector space')
          )
          return
        }
        this.ready = true
        clearTimeout(this.startTimer)
        this.startTimer = undefined
        const resolve = this.startResolve
        this.startResolve = null
        this.startReject = null
        resolve?.()
        continue
      }
      if (typeof response.id !== 'number') continue
      const pending = this.pending.get(response.id)
      if (!pending) continue
      this.pending.delete(response.id)
      clearTimeout(pending.timer)
      pending.cleanup()
      if (!response.ok) {
        pending.reject(new Error(response.error || 'EmbeddingGemma helper request failed'))
        continue
      }
      try {
        if (
          response.dim !== LOCAL_EMBEDDING_MODEL.dimension ||
          response.count !== 1 ||
          !response.vectors
        ) {
          throw new Error('EmbeddingGemma helper returned an invalid vector payload')
        }
        pending.resolve({
          vector: readFloat32Vector(response.vectors, LOCAL_EMBEDDING_MODEL.dimension),
          modelKey: LOCAL_EMBEDDING_MODEL_KEY
        })
      } catch (error) {
        pending.reject(error)
      }
    }
  }

  private request(
    op: 'text' | 'image',
    input: string,
    signal?: AbortSignal
  ): Promise<LocalEmbeddingGeneration> {
    if (signal?.aborted) {
      this.terminate(abortError())
      return Promise.reject(abortError())
    }
    const child = this.child
    if (!child) return Promise.reject(new Error('Local EmbeddingGemma helper is unavailable'))
    const id = this.nextId++
    return new Promise<LocalEmbeddingGeneration>((resolve, reject) => {
      let onAbort: () => void = () => undefined
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort)
      }
      const timer = setTimeout(() => {
        this.pending.delete(id)
        cleanup()
        this.terminate(new Error('Local EmbeddingGemma request timed out'))
        reject(new Error('Local EmbeddingGemma request timed out'))
      }, REQUEST_TIMEOUT_MS)
      onAbort = () => {
        this.pending.delete(id)
        clearTimeout(timer)
        cleanup()
        this.terminate(abortError())
        reject(abortError())
      }
      this.pending.set(id, { resolve, reject, cleanup, timer })
      signal?.addEventListener('abort', onAbort, { once: true })
      child.stdin.write(
        `${JSON.stringify({ id, op, inputs: [input], ...(op === 'image' ? { budget: 280 } : {}) })}\n`,
        (error) => {
          if (!error) return
          this.pending.delete(id)
          clearTimeout(timer)
          cleanup()
          this.terminate(error)
          reject(error)
        }
      )
    })
  }

  private awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) return promise
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort)
        this.terminate(abortError())
        reject(abortError())
      }
      signal.addEventListener('abort', onAbort, { once: true })
      promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort)
          resolve(value)
        },
        (error) => {
          signal.removeEventListener('abort', onAbort)
          reject(error)
        }
      )
      if (signal.aborted) onAbort()
    })
  }

  private rejectStart(error: unknown): void {
    clearTimeout(this.startTimer)
    this.startTimer = undefined
    const reject = this.startReject
    this.startResolve = null
    this.startReject = null
    reject?.(error)
  }

  private terminate(error: unknown): void {
    const child = this.child
    this.child = null
    this.ready = false
    this.stdout = ''
    this.rejectStart(error)
    for (const [id, pending] of this.pending) {
      this.pending.delete(id)
      clearTimeout(pending.timer)
      pending.cleanup()
      pending.reject(error)
    }
    if (!child) return
    const stopping = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      }, 1_000)
      child.once('close', () => {
        clearTimeout(timer)
        resolve()
      })
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    })
    this.stopping = stopping
    void stopping.then(() => {
      if (this.stopping === stopping) this.stopping = null
    })
  }
}

let runtime: LocalEmbeddingRuntime | null = null

export function getLocalEmbeddingRuntime(): LocalEmbeddingRuntime {
  runtime ??= new DigUpEmbeddingRuntime()
  return runtime
}

/** Test/host seam; production callers should use the singleton getter. */
export function setLocalEmbeddingRuntimeForTests(value: LocalEmbeddingRuntime | null): void {
  runtime?.close()
  runtime = value
}
