import type { PluginBusinessDto } from './plugin-business-capabilities'
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

const MAX_FILE_BYTES = 1024 * 1024
const MAX_TOTAL_BYTES = 10 * 1024 * 1024
const MAX_FILES = 1_000
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

export class PluginBusinessFileStorageError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'PluginBusinessFileStorageError'
  }
}

function fail(code: string): never {
  throw new PluginBusinessFileStorageError(code)
}

function assertFileName(name: string): void {
  if (!FILE_NAME.test(name) || name === '.' || name === '..') {
    fail('PLUGIN_BUSINESS_FILE_PATH_INVALID')
  }
}

function isInside(parentPath: string, targetPath: string): boolean {
  const relative = path.relative(parentPath, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function resolveCanonicalRoot(configPath: string): string {
  const absoluteConfig = path.resolve(configPath)
  const ownerPath = path.dirname(absoluteConfig)
  const pluginRootPath = path.dirname(ownerPath)
  let rootStat: ReturnType<typeof lstatSync>
  let ownerStat: ReturnType<typeof lstatSync>
  let configStat: ReturnType<typeof lstatSync>
  try {
    rootStat = lstatSync(pluginRootPath)
    ownerStat = lstatSync(ownerPath)
    configStat = lstatSync(absoluteConfig)
  } catch {
    fail('PLUGIN_BUSINESS_FILE_STORAGE_UNAVAILABLE')
  }
  if (
    !rootStat.isDirectory() ||
    !ownerStat.isDirectory() ||
    !configStat.isDirectory() ||
    rootStat.isSymbolicLink() ||
    ownerStat.isSymbolicLink() ||
    configStat.isSymbolicLink()
  ) {
    fail('PLUGIN_BUSINESS_FILE_SYMLINK_DENIED')
  }

  let canonicalRoot: string
  let canonicalOwner: string
  let canonicalConfig: string
  try {
    canonicalRoot = realpathSync(pluginRootPath)
    canonicalOwner = realpathSync(ownerPath)
    canonicalConfig = realpathSync(absoluteConfig)
  } catch {
    fail('PLUGIN_BUSINESS_FILE_STORAGE_UNAVAILABLE')
  }
  if (
    !isInside(canonicalRoot, canonicalOwner) ||
    path.dirname(canonicalConfig) !== canonicalOwner
  ) {
    fail('PLUGIN_BUSINESS_FILE_PATH_INVALID')
  }
  return canonicalConfig
}

function resolveTarget(configPath: string, name: string): string {
  assertFileName(name)
  const root = resolveCanonicalRoot(configPath)
  const target = path.join(root, name)
  if (path.dirname(target) !== root) fail('PLUGIN_BUSINESS_FILE_PATH_INVALID')
  return target
}

function existingRegularFile(target: string): ReturnType<typeof lstatSync> | null {
  try {
    const entry = lstatSync(target)
    if (entry.isSymbolicLink()) fail('PLUGIN_BUSINESS_FILE_SYMLINK_DENIED')
    if (!entry.isFile()) fail('PLUGIN_BUSINESS_FILE_PATH_INVALID')
    return entry
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function noFollowFlag(): number {
  return typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
}

function assertProjectedQuota(root: string, target: string, nextBytes: number): void {
  let fileCount = 0
  let totalBytes = 0
  for (const name of readdirSync(root)) {
    const entryPath = path.join(root, name)
    const entry = lstatSync(entryPath)
    if (entry.isSymbolicLink()) fail('PLUGIN_BUSINESS_FILE_SYMLINK_DENIED')
    if (!entry.isFile()) continue
    fileCount += 1
    if (entryPath !== target) totalBytes += entry.size
  }
  const targetExists = existingRegularFile(target) !== null
  const projectedCount = fileCount + (targetExists ? 0 : 1)
  if (projectedCount > MAX_FILES || totalBytes + nextBytes > MAX_TOTAL_BYTES) {
    fail('PLUGIN_BUSINESS_FILE_QUOTA_EXCEEDED')
  }
}

export function readPluginBusinessFile(
  configPath: string,
  name: string
): { found: false } | { found: true; value: PluginBusinessDto } {
  const target = resolveTarget(configPath, name)
  const entry = existingRegularFile(target)
  if (!entry) return { found: false }
  if (entry.size > MAX_FILE_BYTES) fail('PLUGIN_BUSINESS_FILE_QUOTA_EXCEEDED')

  let descriptor: number | undefined
  try {
    descriptor = openSync(target, constants.O_RDONLY | noFollowFlag())
    const opened = fstatSync(descriptor)
    if (!opened.isFile() || opened.size > MAX_FILE_BYTES) {
      fail('PLUGIN_BUSINESS_FILE_QUOTA_EXCEEDED')
    }
    const raw = readFileSync(descriptor, 'utf8')
    if (Buffer.byteLength(raw, 'utf8') > MAX_FILE_BYTES) {
      fail('PLUGIN_BUSINESS_FILE_QUOTA_EXCEEDED')
    }
    return { found: true, value: JSON.parse(raw) as PluginBusinessDto }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

export function writePluginBusinessFile(
  configPath: string,
  name: string,
  value: PluginBusinessDto
): void {
  const target = resolveTarget(configPath, name)
  const root = path.dirname(target)
  const serialized = JSON.stringify(value)
  const size = Buffer.byteLength(serialized, 'utf8')
  if (size > MAX_FILE_BYTES) fail('PLUGIN_BUSINESS_FILE_QUOTA_EXCEEDED')
  assertProjectedQuota(root, target, size)

  const temporary = path.join(
    root,
    `.business-${process.pid}-${randomBytes(8).toString('hex')}.tmp`
  )
  let descriptor: number | undefined
  let operationError: unknown
  try {
    descriptor = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollowFlag(),
      0o600
    )
    writeFileSync(descriptor, serialized, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    existingRegularFile(target)
    renameSync(temporary, target)
    try {
      const directory = openSync(root, constants.O_RDONLY)
      try {
        fsyncSync(directory)
      } finally {
        closeSync(directory)
      }
    } catch {
      // Directory fsync is not available on every supported platform.
    }
  } catch (error) {
    operationError = error
  }

  let cleanupError: unknown
  if (descriptor !== undefined) {
    try {
      closeSync(descriptor)
    } catch (error) {
      cleanupError = error
    }
  }
  try {
    unlinkSync(temporary)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && cleanupError === undefined) {
      cleanupError = error
    }
  }
  if (operationError !== undefined) throw operationError
  if (cleanupError !== undefined) throw cleanupError
}

export function removePluginBusinessFile(configPath: string, name: string): boolean {
  const target = resolveTarget(configPath, name)
  if (!existingRegularFile(target)) return false
  unlinkSync(target)
  return true
}

export function listPluginBusinessFiles(configPath: string): readonly string[] {
  const root = resolveCanonicalRoot(configPath)
  const names: string[] = []
  for (const name of readdirSync(root)) {
    if (!FILE_NAME.test(name)) continue
    const target = path.join(root, name)
    const entry = lstatSync(target)
    if (entry.isSymbolicLink()) fail('PLUGIN_BUSINESS_FILE_SYMLINK_DENIED')
    if (entry.isFile()) names.push(name)
  }
  if (names.length > MAX_FILES) fail('PLUGIN_BUSINESS_FILE_QUOTA_EXCEEDED')
  return Object.freeze(names.sort())
}
