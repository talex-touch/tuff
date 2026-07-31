import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type PluginPreludeResolutionErrorCode =
  | 'PLUGIN_RUNTIME_PRELUDE_CONTRACT_INVALID'
  | 'PLUGIN_RUNTIME_PRELUDE_ARTIFACT_MISSING'
  | 'PLUGIN_RUNTIME_PRELUDE_ARTIFACT_INVALID'
  | 'PLUGIN_RUNTIME_PRELUDE_ARTIFACT_STALE'

export class PluginPreludeResolutionError extends Error {
  constructor(readonly code: PluginPreludeResolutionErrorCode) {
    super(code)
    this.name = 'PluginPreludeResolutionError'
  }
}

export interface PluginPreludeManifestContract {
  readonly main?: string
  readonly buildIndexEntry?: string
}

export interface ResolvedPluginPrelude {
  readonly kind: 'empty' | 'file'
  readonly filePath?: string
  readonly scriptContent: string
}

const EMPTY_PRELUDE = 'module.exports = {}'
const CANONICAL_BUILD_PRELUDE = path.join('dist', 'build', 'index.js')
const PACKAGED_PRELUDE = 'index.js'

function invalidContract(): never {
  throw new PluginPreludeResolutionError('PLUGIN_RUNTIME_PRELUDE_CONTRACT_INVALID')
}

function normalizeRelativeFile(value: string): string {
  const trimmed = value.trim()
  if (
    !trimmed ||
    trimmed.includes('\0') ||
    trimmed.includes('\\') ||
    path.isAbsolute(trimmed) ||
    path.win32.isAbsolute(trimmed)
  ) {
    invalidContract()
  }

  const normalized = path.normalize(trimmed)
  if (normalized === '.' || normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    invalidContract()
  }
  return normalized
}

function resolveContainedFile(pluginPath: string, relativePath: string): string {
  const candidate = path.resolve(pluginPath, relativePath)
  if (!fs.existsSync(candidate)) {
    throw new PluginPreludeResolutionError('PLUGIN_RUNTIME_PRELUDE_ARTIFACT_MISSING')
  }

  try {
    const canonicalRoot = fs.realpathSync(pluginPath)
    const canonicalCandidate = fs.realpathSync(candidate)
    const relative = path.relative(canonicalRoot, canonicalCandidate)
    if (
      !relative ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative) ||
      !fs.statSync(canonicalCandidate).isFile()
    ) {
      throw new PluginPreludeResolutionError('PLUGIN_RUNTIME_PRELUDE_ARTIFACT_INVALID')
    }
    return canonicalCandidate
  } catch (error) {
    if (error instanceof PluginPreludeResolutionError) throw error
    throw new PluginPreludeResolutionError('PLUGIN_RUNTIME_PRELUDE_ARTIFACT_INVALID')
  }
}

function readPreludeFile(
  pluginPath: string,
  relativePath: string,
  verifyProjection = false
): ResolvedPluginPrelude {
  const filePath = resolveContainedFile(pluginPath, relativePath)
  const content = fs.readFileSync(filePath)
  if (verifyProjection) {
    try {
      const manifestPath = path.join(path.dirname(filePath), 'manifest.json')
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown
      if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error()
      const files = (manifest as { _files?: unknown })._files
      if (!files || typeof files !== 'object' || Array.isArray(files)) throw new Error()
      const expected = (files as { 'index.js'?: unknown })['index.js']
      const actual = `sha256-${createHash('sha256').update(content).digest('hex')}`
      if (typeof expected !== 'string' || expected !== actual) throw new Error()
    } catch {
      throw new PluginPreludeResolutionError('PLUGIN_RUNTIME_PRELUDE_ARTIFACT_STALE')
    }
  }
  return Object.freeze({
    kind: 'file',
    filePath,
    scriptContent: content.toString('utf8')
  })
}

export function resolvePluginPrelude(
  pluginPath: string,
  contract: PluginPreludeManifestContract
): ResolvedPluginPrelude {
  if (typeof pluginPath !== 'string' || !pluginPath.trim()) invalidContract()

  const main = contract.main
  const buildIndexEntry = contract.buildIndexEntry
  if (main !== undefined && typeof main !== 'string') invalidContract()
  if (buildIndexEntry !== undefined && typeof buildIndexEntry !== 'string') invalidContract()
  if (main !== undefined && buildIndexEntry !== undefined) invalidContract()

  if (main !== undefined) {
    return readPreludeFile(pluginPath, normalizeRelativeFile(main))
  }

  if (buildIndexEntry !== undefined) {
    const sourceEntry = normalizeRelativeFile(buildIndexEntry)
    const sourceCandidate = path.resolve(pluginPath, sourceEntry)
    if (fs.existsSync(sourceCandidate)) {
      resolveContainedFile(pluginPath, sourceEntry)
      return readPreludeFile(pluginPath, CANONICAL_BUILD_PRELUDE, true)
    }
    return readPreludeFile(pluginPath, PACKAGED_PRELUDE, true)
  }

  return Object.freeze({ kind: 'empty', scriptContent: EMPTY_PRELUDE })
}
