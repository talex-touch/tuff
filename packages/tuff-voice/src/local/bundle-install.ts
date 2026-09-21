/**
 * Installing a speech-model bundle from a catalog entry.
 *
 * The runtime's side of this contract is `model-store.ts`: it resolves
 * `<root>/<id>/<version>/` and refuses anything whose descriptor it cannot validate or
 * whose weights are missing. This module is the other half — it puts those bytes there,
 * and it is built around three rules:
 *
 * 1. **Nothing is installed that was not verified.** Every file is streamed through
 *    SHA-256 while it is written, and a size or digest mismatch deletes the partial and
 *    fails the install. The same check runs again over what landed on disk, because the
 *    check that matters is the one performed on the file the runtime will open.
 * 2. **A half-installed bundle is invisible, not broken.** Files land in the version
 *    directory but `model.json` is written last, and that is the file the runtime reads
 *    first. An interrupted install therefore leaves a directory the store skips, instead
 *    of one that resolves and then fails at decode time.
 * 3. **An existing good file is left alone.** Re-running an install is cheap and safe:
 *    a file whose size and digest already match is not downloaded again, so a model that
 *    is already present costs one `stat` and one hash per file.
 *
 * The catalog entry carries what a client must verify (`files[]`), while the descriptor
 * is the bundle's own contract with the runtime; both travel here, and the descriptor's
 * own `runtime` block must agree with the weights entry or the install is refused.
 */

import type { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'

export type SpeechBundleFileRole = 'weights' | 'tokenizer' | 'runtime' | 'vad' | 'punctuation'

export interface SpeechBundleFileSpec {
  role: SpeechBundleFileRole
  /** Bundle-relative file name; never a path. */
  file: string
  bytes: number
  sha256: string
  url: string
}

export interface SpeechBundleSpec {
  id: string
  version: string
  engine: 'whisper-cpp' | 'sherpa-onnx' | 'onnxruntime'
  files: readonly SpeechBundleFileSpec[]
  /** The model.json bytes to install, exactly as published. */
  descriptor: unknown
}

export interface SpeechBundleInstallReport {
  id: string
  version: string
  directory: string
  downloaded: Array<{ file: string, bytes: number }>
  reused: Array<{ file: string, bytes: number }>
}

export interface SpeechBundleInstallOptions {
  /** Root of the model store, as `resolveModelStoreRoot()` returns it. */
  root: string
  fetchImpl?: typeof fetch
  onProgress?: (progress: { file: string, received: number, total: number }) => void
  signal?: AbortSignal
}

export class SpeechBundleInstallError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'SpeechBundleInstallError'
    this.code = code
  }
}

const ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const FILE_PATTERN = /^[A-Z0-9][\w.-]{0,120}$/i
const ENGINES = new Set(['whisper-cpp', 'sherpa-onnx', 'onnxruntime'])

function invalid(detail: string): SpeechBundleInstallError {
  return new SpeechBundleInstallError('SPEECH_BUNDLE_INVALID', detail)
}

/**
 * Validate an entry before anything touches the network or the store.
 *
 * A catalog is remote input: every field is checked here rather than trusted downstream,
 * including the two that are quietly dangerous — `file` (which becomes a path) and `url`
 * (which becomes a request). A name that is not a bare file name is refused outright,
 * because `join()` would happily follow `../..` out of the store.
 */
export function assertSpeechBundleSpec(spec: SpeechBundleSpec): void {
  if (!ID_PATTERN.test(spec.id))
    throw invalid(`id "${spec.id}" is not a catalog id`)
  if (!SEMVER_PATTERN.test(spec.version))
    throw invalid(`version "${spec.version}" is not semver`)
  if (!ENGINES.has(spec.engine))
    throw invalid(`unknown engine "${spec.engine}"`)
  if (!spec.files.length)
    throw invalid('bundle declares no files')
  if (!spec.descriptor || typeof spec.descriptor !== 'object')
    throw invalid('bundle carries no descriptor')

  const seen = new Set<string>()
  let weights: SpeechBundleFileSpec | undefined
  for (const file of spec.files) {
    if (!FILE_PATTERN.test(file.file))
      throw invalid(`file "${file.file}" is not a bare file name`)
    if (seen.has(file.file))
      throw invalid(`file "${file.file}" is listed twice`)
    seen.add(file.file)
    if (!Number.isInteger(file.bytes) || file.bytes <= 0)
      throw invalid(`${file.file}: bytes must be a positive integer`)
    if (!SHA256_PATTERN.test(file.sha256))
      throw invalid(`${file.file}: sha256 is malformed`)
    if (!/^https:\/\//.test(file.url))
      throw invalid(`${file.file}: url must be https`)
    if (file.role === 'weights') {
      if (weights)
        throw invalid('bundle declares two weights files')
      weights = file
    }
  }
  if (!weights)
    throw invalid('bundle declares no weights file')

  // The descriptor is what the runtime trusts; a mismatch here would install a bundle the
  // store resolves and the engine then refuses, so it is caught before the download.
  const descriptor = spec.descriptor as {
    id?: unknown
    version?: unknown
    engine?: unknown
    runtime?: { file?: unknown, bytes?: unknown, sha256?: unknown }
  }
  if (descriptor.id !== spec.id)
    throw invalid(`descriptor id ${String(descriptor.id)} contradicts the entry id ${spec.id}`)
  if (descriptor.version !== spec.version)
    throw invalid(`descriptor version ${String(descriptor.version)} contradicts ${spec.version}`)
  if (descriptor.engine !== spec.engine)
    throw invalid(`descriptor engine ${String(descriptor.engine)} contradicts ${spec.engine}`)
  if (descriptor.runtime?.file !== weights.file) {
    throw invalid(
      `descriptor runtime.file ${String(descriptor.runtime?.file)} contradicts weights ${weights.file}`,
    )
  }
  if (descriptor.runtime?.bytes !== weights.bytes || descriptor.runtime?.sha256 !== weights.sha256)
    throw invalid('descriptor runtime digest contradicts the weights entry')
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  const contents = await readFile(path)
  hash.update(contents)
  return hash.digest('hex')
}

/** True when the file on disk is already exactly what the entry promises. */
async function isVerifiedOnDisk(path: string, spec: SpeechBundleFileSpec): Promise<boolean> {
  try {
    const info = await stat(path)
    if (info.size !== spec.bytes)
      return false
    return (await sha256File(path)) === spec.sha256
  }
  catch {
    return false
  }
}

async function downloadVerified(
  spec: SpeechBundleFileSpec,
  destination: string,
  fetchImpl: typeof fetch,
  onProgress: SpeechBundleInstallOptions['onProgress'],
  signal?: AbortSignal,
): Promise<{ bytes: number }> {
  const partial = `${destination}.part`
  await rm(partial, { force: true })

  let response: Response
  try {
    response = await fetchImpl(spec.url, { redirect: 'follow', ...(signal ? { signal } : {}) })
  }
  catch (error) {
    throw new SpeechBundleInstallError(
      'SPEECH_BUNDLE_DOWNLOAD_FAILED',
      `${spec.file}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!response.ok) {
    throw new SpeechBundleInstallError(
      'SPEECH_BUNDLE_DOWNLOAD_FAILED',
      `${spec.file}: HTTP ${response.status} ${response.statusText} from ${spec.url}`,
    )
  }
  if (!response.body) {
    throw new SpeechBundleInstallError(
      'SPEECH_BUNDLE_DOWNLOAD_FAILED',
      `${spec.file}: the response carried no body`,
    )
  }

  const hash = createHash('sha256')
  let received = 0
  const sink = createWriteStream(partial)
  const writeFailure = new Promise<never>((_finished, failed) => sink.once('error', failed))
  try {
    for await (const chunk of Readable.fromWeb(response.body as never)) {
      const buffer = chunk as Buffer
      received += buffer.byteLength
      hash.update(buffer)
      if (!sink.write(buffer))
        await Promise.race([new Promise<void>(done => sink.once('drain', () => done())), writeFailure])
      onProgress?.({ file: spec.file, received, total: spec.bytes })
    }
    await new Promise<void>((finished, failed) => {
      sink.once('error', failed)
      sink.once('finish', () => finished())
      sink.end()
    })
  }
  catch (error) {
    sink.destroy()
    await rm(partial, { force: true })
    throw new SpeechBundleInstallError(
      'SPEECH_BUNDLE_WRITE_FAILED',
      `${spec.file}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const digest = hash.digest('hex')
  if (received !== spec.bytes || digest !== spec.sha256) {
    await rm(partial, { force: true })
    throw new SpeechBundleInstallError(
      'SPEECH_BUNDLE_DIGEST_MISMATCH',
      `${spec.file}: refusing to install — expected ${spec.bytes} bytes / ${spec.sha256}, got ${received} bytes / ${digest}. The partial download was deleted.`,
    )
  }

  await rename(partial, destination)
  return { bytes: received }
}

/** Resolve a bundle-relative file name inside the version directory, refusing escapes. */
function resolveInsideBundle(directory: string, file: string): string {
  const target = resolve(directory, file)
  if (!target.startsWith(directory + sep))
    throw invalid(`file "${file}" escapes its bundle directory`)
  return target
}

export async function installSpeechBundle(
  spec: SpeechBundleSpec,
  options: SpeechBundleInstallOptions,
): Promise<SpeechBundleInstallReport> {
  assertSpeechBundleSpec(spec)

  const fetchImpl = options.fetchImpl ?? fetch
  const directory = join(options.root, spec.id, spec.version)
  await mkdir(directory, { recursive: true })

  // The descriptor is written last, so an interrupted install stays invisible to the
  // runtime instead of resolving into a bundle whose weights are half a file.
  const descriptorPath = join(directory, 'model.json')
  await rm(descriptorPath, { force: true })

  const report: SpeechBundleInstallReport = {
    id: spec.id,
    version: spec.version,
    directory,
    downloaded: [],
    reused: [],
  }

  for (const file of spec.files) {
    const destination = resolveInsideBundle(directory, file.file)
    if (await isVerifiedOnDisk(destination, file)) {
      report.reused.push({ file: file.file, bytes: file.bytes })
      continue
    }
    const result = await downloadVerified(file, destination, fetchImpl, options.onProgress, options.signal)
    report.downloaded.push({ file: file.file, bytes: result.bytes })
  }

  // Post-install verification: the runtime opens these bytes, so they are checked here
  // rather than assumed from the download having reported success.
  for (const file of spec.files) {
    const destination = resolveInsideBundle(directory, file.file)
    if (!(await isVerifiedOnDisk(destination, file))) {
      throw new SpeechBundleInstallError(
        'SPEECH_BUNDLE_VERIFY_FAILED',
        `${file.file}: the file on disk is not what the catalog promised; the bundle was not activated`,
      )
    }
  }

  await writeFile(descriptorPath, `${JSON.stringify(spec.descriptor, null, 2)}\n`, 'utf8')
  return report
}

/** Remove one installed version. Best-effort: an absent bundle is not an error. */
export async function removeSpeechBundle(root: string, id: string, version: string): Promise<boolean> {
  if (!ID_PATTERN.test(id) || !SEMVER_PATTERN.test(version))
    throw invalid(`refusing to remove "${id}@${version}"`)
  const directory = join(root, id, version)
  if (!directory.startsWith(resolve(root) + sep))
    throw invalid('refusing to remove outside the store')
  try {
    await rm(directory, { recursive: true, force: true })
    return true
  }
  catch {
    return false
  }
}

/** Total bytes a bundle will occupy, for a size shown before the user commits. */
export function bundleBytes(spec: SpeechBundleSpec): number {
  return spec.files.reduce((sum, file) => sum + file.bytes, 0)
}
