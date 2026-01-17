import type { Primitive } from '../utils/logger'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { app } from 'electron'
import { createLogger } from '../utils/logger'

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
  if (!ext) return ''
  const trimmed = ext.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`
}

function safeBasename(value?: string): string {
  const raw = (value ?? '').trim()
  if (!raw) return 'tmp'
  return raw.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 32) || 'tmp'
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
  private namespaces = new Map<string, TempNamespaceConfig>()

  constructor(options?: { baseDir?: string; cleanupIntervalMs?: number }) {
    this.baseDir = options?.baseDir ?? path.join(app.getPath('userData'), 'temp')
    this.cleanupIntervalMs = Math.max(30_000, Number(options?.cleanupIntervalMs ?? 10 * 60_000))
  }

  async ensureReady(): Promise<void> {
    await ensureDir(this.baseDir)
  }

  registerNamespace(config: TempNamespaceConfig): void {
    const normalized = config.namespace.replace(/^\/+/, '').replace(/\\/g, '/')
    this.namespaces.set(normalized, { ...config, namespace: normalized })
  }

  startCleanup(): void {
    if (pollingService.isRegistered(this.cleanupTaskId)) {
      return
    }
    pollingService.register(
      this.cleanupTaskId,
      () => {
        void this.cleanup().catch((error) => {
          tempLog.warn('Temp cleanup failed', { error })
        })
      },
      { interval: this.cleanupIntervalMs, unit: 'milliseconds' }
    )
    pollingService.start()
  }

  getBaseDir(): string {
    return this.baseDir
  }

  resolveNamespaceDir(namespace: string): string {
    const normalized = namespace.replace(/^\/+/, '').replace(/\\/g, '/')
    return path.join(this.baseDir, normalized)
  }

  isWithinBaseDir(targetPath: string): boolean {
    const resolvedBase = path.resolve(this.baseDir)
    const resolvedTarget = path.resolve(targetPath)
    return (
      resolvedTarget === resolvedBase || resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)
    )
  }

  async createFile(request: TempFileCreateRequest): Promise<TempFileCreateResult> {
    await this.ensureReady()

    const namespaceDir = this.resolveNamespaceDir(request.namespace)
    await ensureDir(namespaceDir)

    const createdAt = Date.now()
    const prefix = safeBasename(request.prefix)
    const rand = crypto.randomBytes(6).toString('hex')
    const ext = ensureExt(request.ext)
    const fileName = `${createdAt}-${prefix}-${rand}${ext || '.tmp'}`
    const filePath = path.join(namespaceDir, fileName)

    let buffer: Buffer
    if (request.buffer) {
      buffer = request.buffer
    } else if (typeof request.text === 'string') {
      buffer = Buffer.from(request.text, 'utf8')
    } else if (typeof request.base64 === 'string') {
      buffer = Buffer.from(request.base64, 'base64')
    } else {
      buffer = Buffer.from('', 'utf8')
    }

    await fs.writeFile(filePath, buffer)
    return { path: filePath, sizeBytes: buffer.length, createdAt }
  }

  async deleteFile(targetPath: string): Promise<boolean> {
    if (!this.isWithinBaseDir(targetPath)) {
      tempLog.warn('Refusing to delete file outside base dir', {
        meta: { baseDir: this.baseDir, targetPath }
      })
      return false
    }

    const deleted = await safeUnlink(targetPath)
    if (!deleted) return false

    // Best-effort: cleanup empty parent dirs up to base dir.
    try {
      let cursor = path.dirname(targetPath)
      const resolvedBase = path.resolve(this.baseDir)
      while (this.isWithinBaseDir(cursor) && path.resolve(cursor) !== resolvedBase) {
        if (!(await isDirEmpty(cursor))) break
        await fs.rmdir(cursor)
        cursor = path.dirname(cursor)
      }
    } catch {
      // ignore
    }

    return true
  }

  async cleanup(): Promise<void> {
    await this.ensureReady()
    const now = Date.now()

    const configs = Array.from(this.namespaces.values())
    for (const config of configs) {
      const retentionMs = config.retentionMs
      if (
        !Number.isFinite(retentionMs as number) ||
        retentionMs === null ||
        retentionMs === undefined
      ) {
        continue
      }

      const dirPath = this.resolveNamespaceDir(config.namespace)
      const removed = await this.cleanupDir(dirPath, now - Number(retentionMs))
      if (removed.count > 0) {
        tempLog.info('Temp cleanup removed files', {
          meta: {
            namespace: config.namespace,
            removedCount: removed.count,
            removedBytes: removed.bytes
          }
        })
      }
    }
  }

  private async cleanupDir(
    dirPath: string,
    cutoffMs: number
  ): Promise<{ count: number; bytes: number }> {
    let count = 0
    let bytes = 0

    let entries: Array<import('node:fs').Dirent>
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true })
    } catch {
      return { count, bytes }
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const sub = await this.cleanupDir(fullPath, cutoffMs)
        count += sub.count
        bytes += sub.bytes
        try {
          if (await isDirEmpty(fullPath)) {
            await fs.rmdir(fullPath)
          }
        } catch {
          // ignore
        }
        continue
      }

      if (!entry.isFile()) continue

      try {
        const stat = await fs.stat(fullPath)
        const mtimeMs = stat.mtimeMs
        if (Number.isFinite(mtimeMs) && mtimeMs <= cutoffMs) {
          const ok = await safeUnlink(fullPath)
          if (ok) {
            count += 1
            bytes += stat.size
          }
        }
      } catch {
        // ignore
      }
    }

    return { count, bytes }
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
