import type { Primitive } from '../utils/logger'
import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { app } from 'electron'
import { createLogger } from '../utils/logger'

const MAX_TEMP_FILE_BYTES = 64 * 1024 * 1024

export interface TempNamespaceConfig {
  /**
   * Namespace directory relative to base dir.
   * Example: 'clipboard/images'
   */
  namespace: string
  /**
   * If provided, files older than this retention will be deleted by periodic cleanup.
   * If omitted/null, cleanup will skip this namespace (manual deletion only).
   */
  retentionMs?: number | null
  /**
   * Set to false when a data owner, rather than the generic timer, owns fallback cleanup.
   */
  automaticCleanup?: boolean
}

export interface TempNamespaceInspection {
  itemCount: number
  byteCount: number
  failedItemCount: number
  bounded: boolean
  cancelled: boolean
}

export interface TempNamespaceCleanupResult {
  deletedItemCount: number
  deletedByteCount: number
  failedItemCount: number
  bounded: boolean
  cancelled: boolean
}

export interface TempFileCreateRequest {
  namespace: string
  ext?: string
  text?: string
  buffer?: Buffer
  /**
   * Base64 content (no data: prefix).
   */
  base64?: string
  /**
   * Optional file name prefix for debugging.
   */
  prefix?: string
}

export interface TempFileCreateResult {
  path: string
  sizeBytes: number
  createdAt: number
}

const tempLog = createLogger('TempFile')
const pollingService = PollingService.getInstance()

function ensureExt(ext?: string): string {
  if (ext === undefined) return ''
  if (typeof ext !== 'string') throw new Error('TEMP_FILE_EXTENSION_INVALID')
  const raw = ext.trim()
  if (!raw) return ''
  const trimmed = raw.replace(/^\./, '')
  if (!/^[A-Za-z0-9]{1,16}$/.test(trimmed)) {
    throw new Error('TEMP_FILE_EXTENSION_INVALID')
  }
  return `.${trimmed}`
}

function safeBasename(value?: string): string {
  const raw = (value ?? '').trim()
  if (!raw) return 'tmp'
  return raw.replace(/[^\w-]+/g, '-').slice(0, 32) || 'tmp'
}

function normalizeNamespace(namespace: string): string {
  if (typeof namespace !== 'string') {
    throw new TypeError('TEMP_NAMESPACE_INVALID')
  }
  const normalized = namespace.trim().replace(/\\/g, '/')
  const segments = normalized.split('/')
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized) ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('TEMP_NAMESPACE_INVALID')
  }
  return normalized
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

async function safeUnlink(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(filePath)
    return true
  } catch {
    return false
  }
}

interface TempDirectoryIdentity {
  readonly path: string
  readonly dev: number
  readonly ino: number
}

interface TempFileCandidate {
  readonly path: string
  readonly size: number
  readonly dev: number
  readonly ino: number
  readonly mtimeMs: number
  readonly ctimeMs: number
}

function sameDirectoryIdentity(
  expected: TempDirectoryIdentity,
  actual: Awaited<ReturnType<typeof fs.lstat>>
): boolean {
  return (
    actual.isDirectory() &&
    !actual.isSymbolicLink() &&
    expected.dev === Number(actual.dev) &&
    expected.ino === Number(actual.ino)
  )
}

function sameFileIdentity(
  expected: TempFileCandidate,
  actual: Awaited<ReturnType<typeof fs.lstat>>
): boolean {
  return (
    actual.isFile() &&
    !actual.isSymbolicLink() &&
    expected.dev === Number(actual.dev) &&
    expected.ino === Number(actual.ino) &&
    expected.size === Number(actual.size) &&
    expected.mtimeMs === Number(actual.mtimeMs) &&
    expected.ctimeMs === Number(actual.ctimeMs)
  )
}

function sameMovedFileIdentity(
  expected: TempFileCandidate,
  actual: Awaited<ReturnType<typeof fs.lstat>>
): boolean {
  return (
    actual.isFile() &&
    !actual.isSymbolicLink() &&
    expected.dev === Number(actual.dev) &&
    expected.ino === Number(actual.ino) &&
    expected.size === Number(actual.size) &&
    expected.mtimeMs === Number(actual.mtimeMs)
  )
}

async function unlinkIdentifiedFile(
  candidate: TempFileCandidate
): Promise<'deleted' | 'missing' | 'changed' | 'failed'> {
  const recoveryPath = path.join(
    path.dirname(candidate.path),
    `.${path.basename(candidate.path)}.${crypto.randomUUID()}.recovery`
  )
  try {
    await fs.rename(candidate.path, recoveryPath)
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'failed'
  }

  try {
    const moved = await fs.lstat(recoveryPath)
    if (!sameMovedFileIdentity(candidate, moved)) {
      try {
        await fs.link(recoveryPath, candidate.path)
        await fs.unlink(recoveryPath)
      } catch {
        // Keep the raced replacement recoverable without overwriting a newer path.
      }
      return 'changed'
    }
    await fs.unlink(recoveryPath)
    return 'deleted'
  } catch {
    return 'failed'
  }
}

async function isDirEmpty(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath)
    return entries.length === 0
  } catch {
    return false
  }
}

export class TempFileService {
  private readonly baseDir: string
  private readonly cleanupTaskId = 'temp-file.cleanup'
  private readonly cleanupIntervalMs: number
  private canonicalBasePath: string | null = null
  private namespaces = new Map<string, TempNamespaceConfig>()

  constructor(options?: { baseDir?: string; cleanupIntervalMs?: number }) {
    this.baseDir = options?.baseDir ?? path.join(app.getPath('userData'), 'temp')
    const cleanupIntervalMs = Number(options?.cleanupIntervalMs ?? 10 * 60_000)
    this.cleanupIntervalMs = Number.isFinite(cleanupIntervalMs)
      ? Math.max(30_000, Math.floor(cleanupIntervalMs))
      : 10 * 60_000
  }

  async ensureReady(): Promise<void> {
    await ensureDir(this.baseDir)
    const stat = await fs.lstat(this.baseDir)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('TEMP_BASE_DIR_INVALID')
    }
  }

  private isWithinRoot(root: string, target: string): boolean {
    return target === root || target.startsWith(`${root}${path.sep}`)
  }

  private async canonicalBaseDir(): Promise<string> {
    await this.ensureReady()
    this.canonicalBasePath = await fs.realpath(this.baseDir)
    return this.canonicalBasePath
  }

  private async resolveNamespaceDirectory(
    namespace: string,
    create: boolean
  ): Promise<string | null> {
    const normalized = this.requireNamespace(namespace)
    const base = await this.canonicalBaseDir()
    let cursor = base
    for (const segment of normalized.split('/')) {
      cursor = path.join(cursor, segment)
      try {
        const stat = await fs.lstat(cursor)
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          throw new Error('TEMP_NAMESPACE_PATH_INVALID')
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        if (!create) return null
        try {
          await fs.mkdir(cursor)
        } catch (mkdirError) {
          if ((mkdirError as NodeJS.ErrnoException).code !== 'EEXIST') throw mkdirError
        }
        const stat = await fs.lstat(cursor)
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          throw new Error('TEMP_NAMESPACE_PATH_INVALID')
        }
      }
    }

    const canonical = await fs.realpath(cursor)
    if (canonical !== cursor || !this.isWithinRoot(base, canonical)) {
      throw new Error('TEMP_NAMESPACE_PATH_INVALID')
    }
    return canonical
  }

  private normalizeMaxRows(value: unknown, fallback = 2_000): number {
    const normalized =
      typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
    return Math.min(10_000, Math.max(1, normalized))
  }

  private async resolveOwnedFile(
    targetPath: string,
    namespaceRoot?: string
  ): Promise<string | null> {
    try {
      const directStat = await fs.lstat(targetPath)
      if (!directStat.isFile() || directStat.isSymbolicLink()) return null
      const base = await this.canonicalBaseDir()
      const canonical = await fs.realpath(targetPath)
      if (!this.isWithinRoot(base, canonical)) return null
      if (namespaceRoot && !this.isWithinRoot(namespaceRoot, canonical)) return null
      const stat = await fs.lstat(canonical)
      return stat.isFile() && !stat.isSymbolicLink() ? canonical : null
    } catch {
      return null
    }
  }

  private async cleanupEmptyParents(startDir: string): Promise<void> {
    try {
      let cursor = startDir
      const base = await this.canonicalBaseDir()
      while (this.isWithinRoot(base, cursor) && cursor !== base) {
        const canonical = await fs.realpath(cursor)
        if (canonical !== cursor || !(await isDirEmpty(canonical))) break
        await fs.rmdir(canonical)
        cursor = path.dirname(canonical)
      }
    } catch {
      // Best-effort cleanup only.
    }
  }

  private requireNamespace(namespace: string): string {
    const normalized = normalizeNamespace(namespace)
    if (!this.namespaces.has(normalized)) {
      throw new Error('TEMP_NAMESPACE_NOT_REGISTERED')
    }
    return normalized
  }

  registerNamespace(config: TempNamespaceConfig): void {
    const normalized = normalizeNamespace(config.namespace)
    const retentionMs = config.retentionMs
    if (
      retentionMs !== null &&
      retentionMs !== undefined &&
      (!Number.isFinite(retentionMs) || retentionMs < 0)
    ) {
      throw new Error('TEMP_NAMESPACE_RETENTION_INVALID')
    }
    this.namespaces.set(normalized, { ...config, namespace: normalized })
  }

  getNamespaceConfig(namespace: string): Readonly<TempNamespaceConfig> | null {
    const config = this.namespaces.get(normalizeNamespace(namespace))
    return config ? Object.freeze({ ...config }) : null
  }

  startCleanup(): void {
    if (pollingService.isRegistered(this.cleanupTaskId)) {
      return
    }
    pollingService.register(
      this.cleanupTaskId,
      async () => {
        try {
          await this.cleanup()
        } catch {
          tempLog.warn('Temp cleanup failed', {
            meta: { code: 'TEMP_CLEANUP_FAILED' }
          })
        }
      },
      { interval: this.cleanupIntervalMs, unit: 'milliseconds' }
    )
    pollingService.start()
  }

  getBaseDir(): string {
    return this.baseDir
  }

  resolveNamespaceDir(namespace: string): string {
    return path.join(this.baseDir, normalizeNamespace(namespace))
  }

  isWithinBaseDir(targetPath: string): boolean {
    const resolvedTarget = path.resolve(targetPath)
    const roots = [path.resolve(this.baseDir), this.canonicalBasePath].filter(
      (root): root is string => typeof root === 'string'
    )
    return roots.some(
      (root) => resolvedTarget === root || resolvedTarget.startsWith(`${root}${path.sep}`)
    )
  }

  async createFile(request: TempFileCreateRequest): Promise<TempFileCreateResult> {
    const namespace = this.requireNamespace(request.namespace)
    const ext = ensureExt(request.ext)
    const namespaceDir = await this.resolveNamespaceDirectory(namespace, true)
    if (!namespaceDir) throw new Error('TEMP_NAMESPACE_PATH_INVALID')

    const createdAt = Date.now()
    const prefix = safeBasename(request.prefix)
    const rand = crypto.randomBytes(6).toString('hex')
    const fileName = `${createdAt}-${prefix}-${rand}${ext || '.tmp'}`
    const filePath = path.join(namespaceDir, fileName)

    let buffer: Buffer
    if (request.buffer) {
      if (request.buffer.byteLength > MAX_TEMP_FILE_BYTES) {
        throw new Error('TEMP_FILE_TOO_LARGE')
      }
      buffer = request.buffer
    } else if (typeof request.text === 'string') {
      if (Buffer.byteLength(request.text, 'utf8') > MAX_TEMP_FILE_BYTES) {
        throw new Error('TEMP_FILE_TOO_LARGE')
      }
      buffer = Buffer.from(request.text, 'utf8')
    } else if (typeof request.base64 === 'string') {
      if (request.base64.length > Math.ceil((MAX_TEMP_FILE_BYTES * 4) / 3) + 4) {
        throw new Error('TEMP_FILE_TOO_LARGE')
      }
      buffer = Buffer.from(request.base64, 'base64')
      if (buffer.byteLength > MAX_TEMP_FILE_BYTES) throw new Error('TEMP_FILE_TOO_LARGE')
    } else {
      buffer = Buffer.from('', 'utf8')
    }

    await fs.writeFile(filePath, buffer, { flag: 'wx' })
    return { path: filePath, sizeBytes: buffer.length, createdAt }
  }

  async deleteFile(targetPath: string): Promise<boolean> {
    const canonical = await this.resolveOwnedFile(targetPath)
    if (!canonical) {
      tempLog.warn('Refusing to delete unowned temp file', {
        meta: { code: 'TEMP_DELETE_OUTSIDE_BASE' }
      })
      return false
    }

    const deleted = await safeUnlink(canonical)
    if (deleted) await this.cleanupEmptyParents(path.dirname(canonical))
    return deleted
  }

  async deleteFileFromNamespaces(
    targetPath: string,
    namespaces: readonly string[]
  ): Promise<boolean> {
    for (const namespace of namespaces) {
      const normalized = normalizeNamespace(namespace)
      if (!this.namespaces.has(normalized)) continue
      const root = await this.resolveNamespaceDirectory(normalized, false)
      if (!root) continue
      const canonical = await this.resolveOwnedFile(targetPath, root)
      if (!canonical) continue
      const deleted = await safeUnlink(canonical)
      if (deleted) await this.cleanupEmptyParents(path.dirname(canonical))
      return deleted
    }
    return false
  }

  async inspectNamespace(
    namespace: string,
    options: { cutoffMs?: number; maxRows?: number; signal?: AbortSignal } = {}
  ): Promise<TempNamespaceInspection> {
    const normalized = this.requireNamespace(namespace)
    if (options.cutoffMs !== undefined && !Number.isFinite(options.cutoffMs)) {
      throw new Error('TEMP_CUTOFF_INVALID')
    }
    const candidates = await this.collectNamespaceFiles(
      normalized,
      options.cutoffMs,
      this.normalizeMaxRows(options.maxRows),
      options.signal
    )
    return {
      itemCount: candidates.files.length,
      byteCount: candidates.files.reduce((sum, file) => sum + file.size, 0),
      failedItemCount: candidates.failedItemCount,
      bounded: candidates.bounded,
      cancelled: candidates.cancelled
    }
  }

  async cleanupNamespace(
    namespace: string,
    options: { cutoffMs: number; maxRows?: number; signal?: AbortSignal }
  ): Promise<TempNamespaceCleanupResult> {
    const normalized = this.requireNamespace(namespace)
    if (!Number.isFinite(options.cutoffMs)) throw new Error('TEMP_CUTOFF_INVALID')
    const candidates = await this.collectNamespaceFiles(
      normalized,
      options.cutoffMs,
      this.normalizeMaxRows(options.maxRows),
      options.signal
    )
    let deletedItemCount = 0
    let deletedByteCount = 0
    let failedItemCount = candidates.failedItemCount
    let cancelled = candidates.cancelled

    for (const file of candidates.files) {
      if (options.signal?.aborted) {
        cancelled = true
        break
      }
      try {
        const namespaceRoot = await this.resolveNamespaceDirectory(normalized, false)
        if (!namespaceRoot || !candidates.rootIdentity) {
          failedItemCount += 1
          break
        }
        const rootStat = await fs.lstat(namespaceRoot)
        if (
          namespaceRoot !== candidates.rootIdentity.path ||
          !sameDirectoryIdentity(candidates.rootIdentity, rootStat)
        ) {
          failedItemCount += 1
          break
        }

        const current = await fs.lstat(file.path)
        if (!sameFileIdentity(file, current)) {
          failedItemCount += 1
          continue
        }
        const deletion = await unlinkIdentifiedFile(file)
        if (deletion === 'deleted') {
          deletedItemCount += 1
          deletedByteCount += file.size
          await this.cleanupEmptyParents(path.dirname(file.path))
        } else if (deletion !== 'missing') {
          failedItemCount += 1
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failedItemCount += 1
      }
    }

    return {
      deletedItemCount,
      deletedByteCount,
      failedItemCount,
      bounded: candidates.bounded,
      cancelled
    }
  }

  async cleanup(): Promise<void> {
    await this.ensureReady()
    const now = Date.now()

    const configs = Array.from(this.namespaces.values())
    for (const config of configs) {
      const retentionMs = config.retentionMs
      if (
        config.automaticCleanup === false ||
        !Number.isFinite(retentionMs as number) ||
        retentionMs === null ||
        retentionMs === undefined
      ) {
        continue
      }

      const removed = await this.cleanupNamespace(config.namespace, {
        cutoffMs: now - Number(retentionMs),
        maxRows: 10_000
      })
      if (removed.deletedItemCount > 0 || removed.failedItemCount > 0) {
        tempLog.info('Temp cleanup completed', {
          meta: {
            namespace: config.namespace,
            removedCount: removed.deletedItemCount,
            removedBytes: removed.deletedByteCount,
            failedCount: removed.failedItemCount,
            bounded: removed.bounded
          }
        })
      }
    }
  }

  private async collectNamespaceFiles(
    namespace: string,
    cutoffMs: number | undefined,
    maxRows: number,
    signal?: AbortSignal
  ): Promise<{
    files: TempFileCandidate[]
    rootIdentity: TempDirectoryIdentity | null
    failedItemCount: number
    bounded: boolean
    cancelled: boolean
  }> {
    const files: TempFileCandidate[] = []
    let failedItemCount = 0
    let bounded = false
    let cancelled = false
    const root = await this.resolveNamespaceDirectory(namespace, false)
    if (!root) return { files, rootIdentity: null, failedItemCount, bounded, cancelled }
    const rootStat = await fs.lstat(root)
    const rootIdentity: TempDirectoryIdentity = {
      path: root,
      dev: Number(rootStat.dev),
      ino: Number(rootStat.ino)
    }

    const visit = async (directory: string): Promise<void> => {
      if (signal?.aborted) {
        cancelled = true
        return
      }

      let canonicalDirectory: string
      let entries: Array<import('node:fs').Dirent>
      try {
        canonicalDirectory = await fs.realpath(directory)
        if (!this.isWithinRoot(root, canonicalDirectory)) {
          throw new Error('TEMP_NAMESPACE_PATH_INVALID')
        }
        const stat = await fs.lstat(canonicalDirectory)
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
          throw new Error('TEMP_NAMESPACE_PATH_INVALID')
        }
        entries = await fs.readdir(canonicalDirectory, { withFileTypes: true })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failedItemCount += 1
        return
      }

      for (const entry of entries) {
        if (signal?.aborted) {
          cancelled = true
          return
        }
        const fullPath = path.join(canonicalDirectory, entry.name)
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) {
          await visit(fullPath)
          if (bounded || cancelled) return
          continue
        }
        if (!entry.isFile()) continue
        if (entry.name.startsWith('.') && entry.name.endsWith('.recovery')) {
          failedItemCount += 1
          continue
        }
        try {
          const directStat = await fs.lstat(fullPath)
          if (!directStat.isFile() || directStat.isSymbolicLink()) continue
          const canonicalFile = await fs.realpath(fullPath)
          if (!this.isWithinRoot(root, canonicalFile)) {
            throw new Error('TEMP_NAMESPACE_PATH_INVALID')
          }
          const stat = await fs.lstat(canonicalFile)
          if (!stat.isFile() || stat.isSymbolicLink()) continue
          if (
            (cutoffMs === undefined || stat.mtimeMs < cutoffMs) &&
            Number.isFinite(stat.mtimeMs)
          ) {
            if (files.length >= maxRows) {
              bounded = true
              return
            }
            files.push({
              path: canonicalFile,
              size: Number.isFinite(stat.size) ? Math.max(0, stat.size) : 0,
              dev: Number(stat.dev),
              ino: Number(stat.ino),
              mtimeMs: Number(stat.mtimeMs),
              ctimeMs: Number(stat.ctimeMs)
            })
          }
        } catch {
          failedItemCount += 1
        }
      }
    }

    await visit(root)
    return { files, rootIdentity, failedItemCount, bounded, cancelled }
  }

  formatMeta(meta: Record<string, unknown>): Record<string, Primitive> {
    const out: Record<string, Primitive> = {}
    for (const [k, v] of Object.entries(meta)) {
      if (
        v === null ||
        v === undefined ||
        typeof v === 'string' ||
        typeof v === 'number' ||
        typeof v === 'boolean'
      ) {
        out[k] = v
      }
    }
    return out
  }
}

export const tempFileService = new TempFileService()
