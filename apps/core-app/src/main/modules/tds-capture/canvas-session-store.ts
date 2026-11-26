import { Buffer } from 'node:buffer'
import { createHash, randomBytes } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import type {
  TdsCanvasSessionData,
  TdsCanvasSessionDeleteResponse,
  TdsCanvasSessionFrameKind,
  TdsCanvasSessionFrameRecord,
  TdsCanvasSessionFrameSnapshotRecord,
  TdsCanvasSessionHistoryEntryRecord,
  TdsCanvasSessionHistoryRecord,
  TdsCanvasSessionLoadResponse,
  TdsCanvasSessionNoteRecord,
  TdsCanvasSessionOrientation,
  TdsCanvasSessionSaveResponse
} from '@talex-touch/utils/transport/sdk/domains/tds-capture'
import { app } from 'electron'

export const TDS_CANVAS_SESSIONS_DIR_NAME = 'tds-canvas-sessions'
export const MAX_CANVAS_SESSIONS = 20
export const MAX_CANVAS_SESSION_BYTES = 4 * 1024 * 1024
export const MAX_CANVAS_FRAMES = 64
export const MAX_CANVAS_NOTES = 200
export const MAX_CANVAS_HISTORY_ENTRIES = 50
export const MAX_CANVAS_HISTORY_BLOBS = 128
export const MAX_CANVAS_DELETED_IDS = 256
export const MAX_CANVAS_FRAME_SOURCE_BYTES = 2 * 1024 * 1024
export const MAX_CANVAS_NOTE_TEXT_LENGTH = 8 * 1024
export const MAX_CANVAS_CONVERSATION_ID_LENGTH = 256

const SESSION_FILE_PATTERN = /^([0-9a-f]{64})\.json$/
const TEMP_FILE_PATTERN = /^[0-9a-f]{64}\.\d+\.[0-9a-f]+\.tmp$/
const FORBIDDEN_RECORD_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export interface TdsCanvasSessionStoreOptions {
  /** Override storage directory (defaults to `path.join(app.getPath('userData'), 'tds-canvas-sessions')`). */
  storageDir?: string
  /** Maximum retained conversation sessions before LRU eviction (default 20). */
  maxSessions?: number
  /** Maximum UTF-8 serialized byte size per persisted session file (default 4 MiB). */
  maxSessionBytes?: number
  /** Clock provider for deterministic LRU ordering tests. */
  now?: () => number
}

interface PersistedSessionEnvelope {
  version: 1
  keyHash: string
  updatedAt: number
  session: TdsCanvasSessionData
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function sanitizeOptionalString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, maxLength)
}

function sanitizeFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return value
}

function sanitizePositiveDimension(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.min(16_384, Math.max(1, Math.round(value)))
}

function sanitizeRatio(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function sanitizeFrameKind(value: unknown): TdsCanvasSessionFrameKind | null {
  if (value === 'html' || value === 'svg') return value
  return null
}

function sanitizeOrientation(value: unknown): TdsCanvasSessionOrientation | undefined {
  if (value === 'portrait' || value === 'landscape') return value
  return undefined
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return String(error)
}

/**
 * Validates and hashes a `conversationId` into a fixed 64-char SHA-256 hex digest.
 * Raw conversation IDs never touch the filesystem path, eliminating traversal and filename hazards.
 */
export function hashCanvasConversationId(conversationId: unknown): string | null {
  if (typeof conversationId !== 'string') return null
  const normalized = conversationId.trim()
  if (!normalized || normalized.length > MAX_CANVAS_CONVERSATION_ID_LENGTH) {
    return null
  }
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

function sanitizeFrame(
  raw: unknown
): { ok: true; frame: TdsCanvasSessionFrameRecord } | { ok: false; error: string } {
  if (!isPlainRecord(raw)) {
    return { ok: false, error: 'INVALID_FRAME' }
  }
  const id = clampString(raw.id, 256)
  const title = typeof raw.title === 'string' ? raw.title.slice(0, 256) : ''
  const kind = sanitizeFrameKind(raw.kind)
  const deviceId = clampString(raw.deviceId, 128)
  if (!id || !kind || !deviceId || typeof raw.source !== 'string') {
    return { ok: false, error: 'INVALID_FRAME_FIELDS' }
  }
  const sourceBytes = Buffer.byteLength(raw.source, 'utf8')
  if (sourceBytes > MAX_CANVAS_FRAME_SOURCE_BYTES) {
    return {
      ok: false,
      error: `CANVAS_FRAME_SOURCE_TOO_LARGE:${sourceBytes}>${MAX_CANVAS_FRAME_SOURCE_BYTES}`
    }
  }
  const orientation = sanitizeOrientation(raw.orientation)
  const width = sanitizePositiveDimension(raw.width)
  const height = sanitizePositiveDimension(raw.height)
  const sourceRef = sanitizeOptionalString(raw.sourceRef, 512)

  return {
    ok: true,
    frame: {
      id,
      title,
      kind,
      source: raw.source,
      deviceId,
      ...(orientation ? { orientation } : {}),
      ...(typeof raw.showShell === 'boolean' ? { showShell: raw.showShell } : {}),
      x: sanitizeFiniteNumber(raw.x, 0),
      y: sanitizeFiniteNumber(raw.y, 0),
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(sourceRef ? { sourceRef } : {})
    }
  }
}

function sanitizeNote(raw: unknown): TdsCanvasSessionNoteRecord | null {
  if (!isPlainRecord(raw)) return null
  const id = clampString(raw.id, 256)
  const frameId = clampString(raw.frameId, 256)
  if (!id || !frameId || typeof raw.text !== 'string') return null
  return {
    id,
    frameId,
    xRatio: sanitizeRatio(raw.xRatio),
    yRatio: sanitizeRatio(raw.yRatio),
    text: raw.text.slice(0, MAX_CANVAS_NOTE_TEXT_LENGTH),
    resolved: raw.resolved === true,
    createdAt: sanitizeFiniteNumber(raw.createdAt, 0)
  }
}

function sanitizeFrameSnapshot(raw: unknown): TdsCanvasSessionFrameSnapshotRecord | null {
  if (!isPlainRecord(raw)) return null
  const id = clampString(raw.id, 256)
  const title = typeof raw.title === 'string' ? raw.title.slice(0, 256) : ''
  const kind = sanitizeFrameKind(raw.kind)
  const deviceId = clampString(raw.deviceId, 128)
  const sourceHash = clampString(raw.sourceHash, 128)
  if (!id || !kind || !deviceId || !sourceHash) return null

  const orientation = sanitizeOrientation(raw.orientation)
  const width = sanitizePositiveDimension(raw.width)
  const height = sanitizePositiveDimension(raw.height)
  const sourceRef = sanitizeOptionalString(raw.sourceRef, 512)

  return {
    id,
    title,
    kind,
    deviceId,
    ...(orientation ? { orientation } : {}),
    ...(typeof raw.showShell === 'boolean' ? { showShell: raw.showShell } : {}),
    x: sanitizeFiniteNumber(raw.x, 0),
    y: sanitizeFiniteNumber(raw.y, 0),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    ...(sourceRef ? { sourceRef } : {}),
    sourceHash
  }
}

function sanitizeHistory(
  raw: unknown
): { ok: true; history: TdsCanvasSessionHistoryRecord } | { ok: false; error: string } {
  if (!isPlainRecord(raw)) {
    return {
      ok: true,
      history: { blobs: {}, entries: [], cursor: -1 }
    }
  }

  const blobs: Record<string, string> = {}
  if (isPlainRecord(raw.blobs)) {
    let blobCount = 0
    for (const [key, value] of Object.entries(raw.blobs)) {
      if (blobCount >= MAX_CANVAS_HISTORY_BLOBS) break
      if (!key || key.length > 128 || FORBIDDEN_RECORD_KEYS.has(key)) continue
      if (typeof value !== 'string') continue
      const blobBytes = Buffer.byteLength(value, 'utf8')
      if (blobBytes > MAX_CANVAS_FRAME_SOURCE_BYTES) {
        return {
          ok: false,
          error: `CANVAS_HISTORY_BLOB_TOO_LARGE:${blobBytes}>${MAX_CANVAS_FRAME_SOURCE_BYTES}`
        }
      }
      blobs[key] = value
      blobCount += 1
    }
  }

  const entries: TdsCanvasSessionHistoryEntryRecord[] = []
  if (Array.isArray(raw.entries)) {
    for (const candidate of raw.entries) {
      if (entries.length >= MAX_CANVAS_HISTORY_ENTRIES) break
      if (!isPlainRecord(candidate)) continue
      const id = clampString(candidate.id, 256)
      if (!id) continue
      const label = typeof candidate.label === 'string' ? candidate.label.slice(0, 256) : ''
      const createdAt = sanitizeFiniteNumber(candidate.createdAt, 0)
      const frameSnapshots: TdsCanvasSessionFrameSnapshotRecord[] = []
      if (Array.isArray(candidate.frameSnapshots)) {
        for (const snap of candidate.frameSnapshots) {
          if (frameSnapshots.length >= MAX_CANVAS_FRAMES) break
          const cleaned = sanitizeFrameSnapshot(snap)
          if (cleaned) frameSnapshots.push(cleaned)
        }
      }
      entries.push({
        id,
        label,
        createdAt,
        frameSnapshots
      })
    }
  }

  const rawCursor =
    typeof raw.cursor === 'number' && Number.isFinite(raw.cursor) ? Math.trunc(raw.cursor) : -1
  const cursor = entries.length === 0 ? -1 : Math.max(-1, Math.min(entries.length - 1, rawCursor))

  return {
    ok: true,
    history: {
      blobs,
      entries,
      cursor
    }
  }
}

/**
 * Strictly validates and strips an untrusted canvas session payload into a bounded,
 * prototype-safe `TdsCanvasSessionData` record.
 */
export function sanitizeCanvasSessionData(
  raw: unknown
): { ok: true; session: TdsCanvasSessionData } | { ok: false; error: string } {
  if (!isPlainRecord(raw)) {
    return { ok: false, error: 'INVALID_CANVAS_SESSION' }
  }
  if (raw.version !== 1) {
    return { ok: false, error: 'UNSUPPORTED_CANVAS_SESSION_VERSION' }
  }
  if (!Array.isArray(raw.frames)) {
    return { ok: false, error: 'INVALID_CANVAS_FRAMES' }
  }

  const frames: TdsCanvasSessionFrameRecord[] = []
  const seenFrameIds = new Set<string>()
  for (const candidate of raw.frames) {
    if (frames.length >= MAX_CANVAS_FRAMES) break
    const sanitized = sanitizeFrame(candidate)
    if (!sanitized.ok) {
      if (sanitized.error.startsWith('CANVAS_FRAME_SOURCE_TOO_LARGE')) {
        return sanitized
      }
      continue
    }
    if (seenFrameIds.has(sanitized.frame.id)) continue
    seenFrameIds.add(sanitized.frame.id)
    frames.push(sanitized.frame)
  }

  const notes: TdsCanvasSessionNoteRecord[] = []
  const seenNoteIds = new Set<string>()
  if (Array.isArray(raw.notes)) {
    for (const candidate of raw.notes) {
      if (notes.length >= MAX_CANVAS_NOTES) break
      const sanitized = sanitizeNote(candidate)
      if (!sanitized || seenNoteIds.has(sanitized.id)) continue
      seenNoteIds.add(sanitized.id)
      notes.push(sanitized)
    }
  }

  const historyResult = sanitizeHistory(raw.history)
  if (!historyResult.ok) {
    return historyResult
  }

  const deletedAutoFrameIds: string[] = []
  const seenDeleted = new Set<string>()
  if (Array.isArray(raw.deletedAutoFrameIds)) {
    for (const candidate of raw.deletedAutoFrameIds) {
      if (deletedAutoFrameIds.length >= MAX_CANVAS_DELETED_IDS) break
      const cleaned = clampString(candidate, 256)
      if (!cleaned || seenDeleted.has(cleaned)) continue
      seenDeleted.add(cleaned)
      deletedAutoFrameIds.push(cleaned)
    }
  }

  const selectedFrameId =
    raw.selectedFrameId === null ? null : (clampString(raw.selectedFrameId, 256) ?? null)
  const canvasThemePackId =
    raw.canvasThemePackId === null || raw.canvasThemePackId === undefined
      ? null
      : (clampString(raw.canvasThemePackId, 128) ?? null)

  return {
    ok: true,
    session: {
      version: 1,
      frames,
      notes,
      selectedFrameId,
      history: historyResult.history,
      deletedAutoFrameIds,
      antiSlop: raw.antiSlop !== false,
      canvasThemePackId
    }
  }
}

/**
 * Main-process bounded, atomic, privacy-safe persistence store for TDS Canvas sessions.
 *
 * Security & durability guarantees:
 * - Stored strictly under main-owned `userData/tds-canvas-sessions/<sha256(conversationId)>.json`
 *   with owner-only permissions (`0o700` dir, `0o600` files); never touches renderer Web Storage.
 * - Strict schema sanitization + UTF-8 byte ceiling (`maxSessionBytes`, default 4 MiB).
 * - Atomic write (`wx` temp file + `rename`) and symlink refusal so partial writes never corrupt
 *   previously committed sessions.
 * - Bounded LRU retention (`maxSessions`, default 20 conversations) with automatic eviction.
 */
export class TdsCanvasSessionStore {
  private readonly explicitStorageDir: string | null
  private readonly maxSessions: number
  private readonly maxSessionBytes: number
  private readonly now: () => number

  private resolvedDir: string | null = null
  private indexLoaded = false
  private readonly sessionIndex = new Map<string, number>()
  private pendingChain: Promise<unknown> = Promise.resolve()

  constructor(options: TdsCanvasSessionStoreOptions = {}) {
    this.explicitStorageDir = options.storageDir ? path.resolve(options.storageDir) : null
    this.maxSessions = Math.max(1, Math.floor(options.maxSessions ?? MAX_CANVAS_SESSIONS))
    this.maxSessionBytes = Math.max(
      1024,
      Math.floor(options.maxSessionBytes ?? MAX_CANVAS_SESSION_BYTES)
    )
    this.now = options.now ?? (() => Date.now())
  }

  private resolveStorageDir(): string {
    if (!this.resolvedDir) {
      this.resolvedDir =
        this.explicitStorageDir ?? path.join(app.getPath('userData'), TDS_CANVAS_SESSIONS_DIR_NAME)
    }
    return this.resolvedDir
  }

  private resolveSessionFilePath(keyHash: string): string {
    const dir = this.resolveStorageDir()
    const target = path.join(dir, `${keyHash}.json`)
    if (path.dirname(target) !== dir) {
      throw new Error('CANVAS_SESSION_PATH_ESCAPE')
    }
    return target
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pendingChain.then(operation, operation)
    this.pendingChain = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private async ensureIndexLoaded(): Promise<void> {
    if (this.indexLoaded) return
    const dir = this.resolveStorageDir()
    try {
      const entries = await readdir(dir)
      for (const name of entries) {
        const fullPath = path.join(dir, name)
        if (TEMP_FILE_PATTERN.test(name)) {
          await unlink(fullPath).catch(() => {})
          continue
        }
        const match = SESSION_FILE_PATTERN.exec(name)
        if (!match?.[1]) continue
        const keyHash = match[1]
        try {
          const stats = await lstat(fullPath)
          if (!stats.isFile() || stats.isSymbolicLink()) continue
          let updatedAt = stats.mtimeMs
          if (stats.size <= this.maxSessionBytes + 4096) {
            try {
              const raw = await readFile(fullPath, 'utf8')
              const parsed = JSON.parse(raw) as Partial<PersistedSessionEnvelope>
              if (typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)) {
                updatedAt = parsed.updatedAt
              }
            } catch {
              // Fall back to filesystem mtime if unreadable; load() handles corruption safely.
            }
          }
          this.sessionIndex.set(keyHash, updatedAt)
        } catch {
          // Ignore disappeared entries during scan.
        }
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code
      if (code !== 'ENOENT') {
        throw error
      }
    }
    this.indexLoaded = true
  }

  private async assertNotSymlinkIfExists(filePath: string): Promise<boolean> {
    try {
      const stats = await lstat(filePath)
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new Error('CANVAS_SESSION_UNSAFE_TARGET')
      }
      return true
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code
      if (code === 'ENOENT') return false
      throw error
    }
  }

  private async evictExcessSessions(): Promise<void> {
    if (this.sessionIndex.size <= this.maxSessions) return
    const ordered = [...this.sessionIndex.entries()].sort((a, b) => a[1] - b[1])
    const overflow = this.sessionIndex.size - this.maxSessions
    for (let index = 0; index < overflow; index += 1) {
      const victim = ordered[index]
      if (!victim) break
      const [victimHash] = victim
      this.sessionIndex.delete(victimHash)
      const victimPath = this.resolveSessionFilePath(victimHash)
      try {
        const stats = await lstat(victimPath)
        if (stats.isFile() && !stats.isSymbolicLink()) {
          await unlink(victimPath)
        }
      } catch {
        // Already removed or absent.
      }
    }
  }

  async load(conversationId: string): Promise<TdsCanvasSessionLoadResponse> {
    const keyHash = hashCanvasConversationId(conversationId)
    if (!keyHash) {
      return { ok: false, session: null, error: 'INVALID_CONVERSATION_ID' }
    }

    return this.enqueue(async () => {
      try {
        await this.ensureIndexLoaded()
        const filePath = this.resolveSessionFilePath(keyHash)
        let stats
        try {
          stats = await lstat(filePath)
        } catch (error) {
          const code = (error as NodeJS.ErrnoException | null)?.code
          if (code === 'ENOENT') {
            this.sessionIndex.delete(keyHash)
            return { ok: true, session: null }
          }
          throw error
        }

        if (stats.isSymbolicLink() || !stats.isFile()) {
          return { ok: false, session: null, error: 'CANVAS_SESSION_UNSAFE_TARGET' }
        }
        if (stats.size > this.maxSessionBytes + 4096) {
          return { ok: true, session: null, error: 'CANVAS_SESSION_CORRUPT_OVERSIZED' }
        }

        const rawText = await readFile(filePath, 'utf8')
        const parsed = JSON.parse(rawText) as unknown
        if (!isPlainRecord(parsed) || parsed.version !== 1 || parsed.keyHash !== keyHash) {
          return { ok: true, session: null }
        }

        const sanitized = sanitizeCanvasSessionData(parsed.session)
        if (!sanitized.ok) {
          return { ok: true, session: null }
        }

        this.sessionIndex.set(keyHash, this.now())
        return { ok: true, session: sanitized.session }
      } catch (error) {
        if (error instanceof SyntaxError) {
          return { ok: true, session: null }
        }
        return { ok: false, session: null, error: formatError(error) }
      }
    })
  }

  async save(conversationId: string, rawSession: unknown): Promise<TdsCanvasSessionSaveResponse> {
    const keyHash = hashCanvasConversationId(conversationId)
    if (!keyHash) {
      return { ok: false, error: 'INVALID_CONVERSATION_ID' }
    }

    const sanitized = sanitizeCanvasSessionData(rawSession)
    if (!sanitized.ok) {
      return { ok: false, error: sanitized.error }
    }

    return this.enqueue(async () => {
      const updatedAt = this.now()
      const envelope: PersistedSessionEnvelope = {
        version: 1,
        keyHash,
        updatedAt,
        session: sanitized.session
      }
      const serialized = JSON.stringify(envelope)
      const bytes = Buffer.byteLength(serialized, 'utf8')
      if (bytes > this.maxSessionBytes) {
        return {
          ok: false,
          bytes,
          error: `CANVAS_SESSION_TOO_LARGE:${bytes}>${this.maxSessionBytes}`
        }
      }

      const dir = this.resolveStorageDir()
      const targetPath = this.resolveSessionFilePath(keyHash)
      const nonce = randomBytes(6).toString('hex')
      const tempPath = path.join(dir, `${keyHash}.${process.pid}.${nonce}.tmp`)

      try {
        await this.ensureIndexLoaded()
        await mkdir(dir, { recursive: true, mode: 0o700 })
        await this.assertNotSymlinkIfExists(targetPath)
        await writeFile(tempPath, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
        await rename(tempPath, targetPath)

        this.sessionIndex.set(keyHash, updatedAt)
        await this.evictExcessSessions()
        return { ok: true, bytes }
      } catch (error) {
        await unlink(tempPath).catch(() => {})
        return { ok: false, error: formatError(error) }
      }
    })
  }

  async delete(conversationId: string): Promise<TdsCanvasSessionDeleteResponse> {
    const keyHash = hashCanvasConversationId(conversationId)
    if (!keyHash) {
      return { ok: false, deleted: false, error: 'INVALID_CONVERSATION_ID' }
    }

    return this.enqueue(async () => {
      try {
        await this.ensureIndexLoaded()
        const targetPath = this.resolveSessionFilePath(keyHash)
        const exists = await this.assertNotSymlinkIfExists(targetPath)
        this.sessionIndex.delete(keyHash)
        if (!exists) {
          return { ok: true, deleted: false }
        }
        await unlink(targetPath)
        return { ok: true, deleted: true }
      } catch (error) {
        return { ok: false, deleted: false, error: formatError(error) }
      }
    })
  }

  async getStoredSessionCount(): Promise<number> {
    return this.enqueue(async () => {
      await this.ensureIndexLoaded()
      return this.sessionIndex.size
    })
  }
}
