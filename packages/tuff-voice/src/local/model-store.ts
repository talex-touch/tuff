import type { LocalAuxiliaryRole, LocalModelDescriptor, ResolvedLocalModel } from './types'
import { createHash } from 'node:crypto'
import { createReadStream, readdirSync, readFileSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import process from 'node:process'
import { LocalEngineError, SHERPA_ONNX_FAMILIES } from './types'

export const MODEL_DESCRIPTOR_FILE = 'model.json'

const ENGINES: Record<string, true> = {
  'whisper-cpp': true,
  'sherpa-onnx': true,
  'onnxruntime': true,
}

/**
 * Where installed bundles live.
 *
 * The same layout is written by the `tuff-speech-models` install tool, so a model
 * fetched by that repository is found here without any extra registration step.
 */
export function resolveModelStoreRoot(explicit?: string): string {
  if (explicit)
    return resolve(explicit)
  const fromEnv = process.env.TUFF_SPEECH_MODEL_DIR?.trim()
  if (fromEnv)
    return resolve(fromEnv)
  if (process.platform === 'darwin')
    return join(homedir(), 'Library', 'Application Support', 'Tuff', 'speech-models')
  const dataHome = process.env.XDG_DATA_HOME?.trim() || join(homedir(), '.local', 'share')
  return join(dataHome, 'Tuff', 'speech-models')
}

/**
 * Validate a descriptor read off disk.
 *
 * A truncated or hand-edited model.json is a normal failure here — users copy these
 * directories around — so every field the runtime depends on is checked before it is
 * trusted, and the failure names the file rather than surfacing as a decode error later.
 */
function parseDescriptor(raw: unknown, sourcePath: string): LocalModelDescriptor {
  const invalid = (detail: string): LocalEngineError =>
    new LocalEngineError('LOCAL_ENGINE_MODEL_DESCRIPTOR_INVALID', `${sourcePath}: ${detail}`)

  if (typeof raw !== 'object' || raw === null)
    throw invalid('descriptor is not an object')
  const value = raw as Record<string, unknown>

  if (value.schemaVersion !== 1)
    throw invalid(`unsupported schemaVersion ${String(value.schemaVersion)}`)
  if (typeof value.id !== 'string' || !value.id)
    throw invalid('id is missing')
  if (typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version))
    throw invalid(`version ${String(value.version)} is not semver`)
  if (typeof value.engine !== 'string' || ENGINES[value.engine] !== true)
    throw invalid(`unknown engine ${String(value.engine)}`)

  const runtime = value.runtime as Record<string, unknown> | undefined
  if (!runtime)
    throw invalid('runtime is missing')
  if (typeof runtime.file !== 'string' || !runtime.file)
    throw invalid('runtime.file is missing')
  if (!Number.isInteger(runtime.bytes) || (runtime.bytes as number) <= 0)
    throw invalid('runtime.bytes is invalid')
  if (typeof runtime.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(runtime.sha256))
    throw invalid('runtime.sha256 is not a sha256')

  const capabilities = value.capabilities as Record<string, unknown> | undefined
  if (!capabilities || typeof capabilities.stream !== 'boolean' || typeof capabilities.upload !== 'boolean')
    throw invalid('capabilities.stream/upload are required booleans')

  const license = value.license as Record<string, unknown> | undefined
  if (!license || typeof license.spdx !== 'string' || typeof license.redistributable !== 'boolean')
    throw invalid('license.spdx/redistributable are required')

  if (!Array.isArray(value.languages) || value.languages.length === 0)
    throw invalid('languages must be a non-empty array')

  if (value.engine === 'sherpa-onnx') {
    // The family decides which recognizer the runtime constructs, so an unrecognised one is a
    // bundle this build cannot run — not a bundle it should guess at.
    const family = (value.sherpa as Record<string, unknown> | undefined)?.family
    if (typeof family !== 'string' || !(SHERPA_ONNX_FAMILIES as readonly string[]).includes(family))
      throw invalid(`sherpa.family ${String(family)} is not a family this build can drive`)
  }

  return value as unknown as LocalModelDescriptor
}

/** Interpret descriptor text that has already been read, mapping failures to engine errors. */
function descriptorFromText(text: string, sourcePath: string): LocalModelDescriptor {
  try {
    return parseDescriptor(JSON.parse(text), sourcePath)
  }
  catch (error) {
    if (error instanceof LocalEngineError)
      throw error
    throw new LocalEngineError('LOCAL_ENGINE_MODEL_DESCRIPTOR_INVALID', `${sourcePath}: ${String(error)}`, { cause: error })
  }
}

/** Absent and unreadable are the same failure to a caller: there is no bundle here. */
function missingDescriptor(sourcePath: string, cause: unknown): LocalEngineError {
  return new LocalEngineError('LOCAL_ENGINE_MODEL_MISSING', `No model descriptor at ${sourcePath}.`, { cause })
}

export async function readModelDescriptor(directory: string): Promise<LocalModelDescriptor> {
  const sourcePath = join(directory, MODEL_DESCRIPTOR_FILE)
  let text: string
  try {
    text = await readFile(sourcePath, 'utf8')
  }
  catch (error) {
    throw missingDescriptor(sourcePath, error)
  }
  return descriptorFromText(text, sourcePath)
}

/** Blocking twin of {@link readModelDescriptor}; see {@link loadInstalledModelSync} for why. */
function readModelDescriptorSync(directory: string): LocalModelDescriptor {
  const sourcePath = join(directory, MODEL_DESCRIPTOR_FILE)
  let text: string
  try {
    text = readFileSync(sourcePath, 'utf8')
  }
  catch (error) {
    throw missingDescriptor(sourcePath, error)
  }
  return descriptorFromText(text, sourcePath)
}

/**
 * Refuse any descriptor-supplied path that escapes its own version directory.
 *
 * The descriptor travels with the bundle, so a hostile or truncated one could point at an
 * arbitrary path; the runtime must not follow it out of the store.
 */
function resolveInsideBundle(directory: string, relative: string): string {
  const base = resolve(directory)
  const candidate = resolve(base, relative)
  if (candidate !== base && !candidate.startsWith(base + sep)) {
    throw new LocalEngineError(
      'LOCAL_ENGINE_MODEL_DESCRIPTOR_INVALID',
      `Descriptor file escapes the model directory: ${relative}`,
    )
  }
  return candidate
}

function resolveWeightsPath(directory: string, descriptor: LocalModelDescriptor): string {
  return resolveInsideBundle(directory, descriptor.runtime.file)
}

/**
 * Absolute path of one auxiliary file, by the role the descriptor gives it.
 *
 * Roles rather than filenames: an engine needs "the tokenizer", and which file that is belongs
 * to the bundle. `undefined` means the bundle does not ship one, which is a different failure
 * from having it and being unable to read it.
 */
export function resolveAuxiliaryPath(model: ResolvedLocalModel, role: LocalAuxiliaryRole): string | undefined {
  const entry = model.descriptor.auxiliary?.find(file => file.role === role)
  if (!entry)
    return undefined
  return resolveInsideBundle(model.directory, entry.file)
}

/** Higher version wins; a tie is not possible because versions are unique per directory. */
function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0)
      return difference
  }
  return 0
}

export interface InstalledModelSummary {
  id: string
  version: string
  name: string
  engine: string
  languages: readonly string[]
  directory: string
  bytes: number
}

/** Everything on disk, described well enough to populate a picker without loading weights. */
export async function listInstalledModels(root = resolveModelStoreRoot()): Promise<InstalledModelSummary[]> {
  let ids: string[]
  try {
    ids = await readdir(root)
  }
  catch {
    return []
  }
  const summaries: InstalledModelSummary[] = []
  for (const id of ids) {
    const idDirectory = join(root, id)
    let versions: string[]
    try {
      versions = await readdir(idDirectory)
    }
    catch {
      continue
    }
    for (const version of versions) {
      const directory = join(idDirectory, version)
      try {
        const descriptor = await readModelDescriptor(directory)
        summaries.push({
          id: descriptor.id,
          version: descriptor.version,
          name: descriptor.name,
          engine: descriptor.engine,
          languages: descriptor.languages,
          directory,
          bytes: descriptor.runtime.bytes,
        })
      }
      catch (error) {
        // A directory without a descriptor is just a stray folder — users create those.
        // A descriptor that exists but does not validate is a corrupted install, and
        // silently hiding it would leave the user staring at a model that never appears.
        if (error instanceof LocalEngineError && error.code === 'LOCAL_ENGINE_MODEL_MISSING')
          continue
        throw error
      }
    }
  }
  return summaries.sort((a, b) => (a.id === b.id ? compareVersions(b.version, a.version) : a.id.localeCompare(b.id)))
}

/**
 * Load one installed model. Without a version the newest installed one is chosen, which
 * is what a fresh launch wants; pinning a version is what a benchmark wants.
 */
export async function loadInstalledModel(
  root: string,
  id: string,
  version?: string,
): Promise<ResolvedLocalModel> {
  const idDirectory = join(root, id)
  if (!version) {
    const installed = (await listInstalledModels(root)).filter(entry => entry.id === id)
    if (installed.length === 0) {
      throw new LocalEngineError('LOCAL_ENGINE_MODEL_MISSING', `No installed version of model "${id}" under ${root}.`)
    }
    return loadInstalledModel(root, id, installed[0].version)
  }
  const directory = join(idDirectory, version)
  const descriptor = await readModelDescriptor(directory)
  if (descriptor.id !== id || descriptor.version !== version) {
    throw new LocalEngineError(
      'LOCAL_ENGINE_MODEL_DESCRIPTOR_INVALID',
      `${directory}/model.json declares ${descriptor.id}@${descriptor.version}, which contradicts its path.`,
    )
  }
  const weightsPath = resolveWeightsPath(directory, descriptor)
  return { descriptor, directory, weightsPath }
}

/**
 * Resolve an installed model without awaiting.
 *
 * The provider runtime builds adapters synchronously: it must know which bundle a local
 * adapter will run before it can hand one back, and making that whole path async would
 * ripple through every call site for the sake of one small file read. Only the descriptor
 * is touched here, never the weights, so the blocking read stays cheap.
 */
export function loadInstalledModelSync(root: string, id: string, version?: string): ResolvedLocalModel {
  if (!version) {
    const newest = newestInstalledVersionSync(root, id)
    if (!newest) {
      throw new LocalEngineError('LOCAL_ENGINE_MODEL_MISSING', `No installed version of model "${id}" under ${root}.`)
    }
    return loadInstalledModelSync(root, id, newest)
  }
  const directory = join(root, id, version)
  const descriptor = readModelDescriptorSync(directory)
  if (descriptor.id !== id || descriptor.version !== version) {
    throw new LocalEngineError(
      'LOCAL_ENGINE_MODEL_DESCRIPTOR_INVALID',
      `${directory}/model.json declares ${descriptor.id}@${descriptor.version}, which contradicts its path.`,
    )
  }
  const weightsPath = resolveWeightsPath(directory, descriptor)
  return { descriptor, directory, weightsPath }
}

/**
 * Newest installed version of one model, or undefined when there is none.
 *
 * Version directories are scanned rather than trusted, matching {@link listInstalledModels}:
 * a stray folder is skipped, but a descriptor that exists and fails validation is a
 * corrupted install and is raised, so a half-broken bundle cannot silently resolve to an
 * older version instead of surfacing.
 */
function newestInstalledVersionSync(root: string, id: string): string | undefined {
  let versions: string[]
  try {
    versions = readdirSync(join(root, id))
  }
  catch {
    return undefined
  }
  let newest: string | undefined
  for (const version of versions) {
    try {
      const descriptor = readModelDescriptorSync(join(root, id, version))
      if (descriptor.id !== id)
        continue
      if (newest === undefined || compareVersions(descriptor.version, newest) > 0)
        newest = descriptor.version
    }
    catch (error) {
      if (error instanceof LocalEngineError && error.code === 'LOCAL_ENGINE_MODEL_MISSING')
        continue
      throw error
    }
  }
  return newest
}

/** Streamed so a 150 MB weight file does not have to be resident to check its digest. */
export async function verifyModelIntegrity(model: ResolvedLocalModel): Promise<void> {
  let size: number
  try {
    size = (await stat(model.weightsPath)).size
  }
  catch (error) {
    throw new LocalEngineError('LOCAL_ENGINE_MODEL_MISSING', `Weights are missing at ${model.weightsPath}.`, {
      cause: error,
    })
  }

  const hash = createHash('sha256')
  await new Promise<void>((settle, reject) => {
    const stream = createReadStream(model.weightsPath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => settle())
  })
  const digest = hash.digest('hex')

  if (digest !== model.descriptor.runtime.sha256) {
    throw new LocalEngineError(
      'LOCAL_ENGINE_MODEL_INTEGRITY_FAILED',
      `Weights at ${model.weightsPath} hash to ${digest}, not the declared ${model.descriptor.runtime.sha256}.`,
    )
  }
  if (size !== model.descriptor.runtime.bytes) {
    throw new LocalEngineError(
      'LOCAL_ENGINE_MODEL_INTEGRITY_FAILED',
      `Weights at ${model.weightsPath} are ${size} bytes, not the declared ${model.descriptor.runtime.bytes}.`,
    )
  }
}
