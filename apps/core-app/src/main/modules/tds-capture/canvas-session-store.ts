import { Buffer } from 'node:buffer'
import { lstat, readdir, rmdir, unlink } from 'node:fs/promises'
import path from 'node:path'
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
import { eq } from 'drizzle-orm'
import { app } from 'electron'
import { scheduleDbWrite, type MainDatabase } from '../../db/db-write'
import { tdsCanvasSessions } from '../../db/schema'
import { resolveRuntimeRootPath } from '../../utils/app-root-path'
import { createLogger } from '../../utils/logger'
import { unwrapSecureStoreValue, wrapSecureStoreValue } from '../../utils/secure-store'
import { databaseModule } from '../database'
import {
  hashCanvasConversationId,
  MAX_CANVAS_CONVERSATION_ID_LENGTH
} from './canvas-session-cascade'

export { hashCanvasConversationId, MAX_CANVAS_CONVERSATION_ID_LENGTH }

export const TDS_CANVAS_SESSIONS_DIR_NAME = 'tds-canvas-sessions'
export const TDS_CANVAS_SESSION_SECURE_PURPOSE = 'tds-canvas-session'
export const MAX_CANVAS_SESSIONS = 20
export const MAX_CANVAS_SESSION_BYTES = 4 * 1024 * 1024
export const MAX_CANVAS_FRAMES = 64
export const MAX_CANVAS_NOTES = 200
export const MAX_CANVAS_HISTORY_ENTRIES = 50
export const MAX_CANVAS_HISTORY_BLOBS = 512
export const MAX_CANVAS_DELETED_IDS = 256
export const MAX_CANVAS_FRAME_SOURCE_BYTES = 2 * 1024 * 1024
export const MAX_CANVAS_NOTE_TEXT_LENGTH = 8 * 1024
export const DEFAULT_DELETE_TOMBSTONE_TTL_MS = 60_000

const MAX_DELETE_TOMBSTONES = 512
const LEGACY_SESSION_FILE_PATTERN = /^([0-9a-f]{64})\.json$/
const LEGACY_TEMP_FILE_PATTERN = /^[0-9a-f]{64}\.\d+\.[0-9a-f]+\.tmp$/
const FORBIDDEN_RECORD_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const tdsCanvasStoreLog = createLogger('TdsCanvasSessionStore')

export interface TdsCanvasSessionStoreOptions {
  /** Override legacy plaintext cleanup directory (defaults to `<userData>/tds-canvas-sessions`). */
  legacyStorageDir?: string
  /** Alias for `legacyStorageDir` kept for legacy cleanup tests. */
  storageDir?: string
  /** Override CoreApp secure-store root path (defaults to `resolveRuntimeRootPath(app)`). */
  rootPath?: string | (() => string)
  /** Override Drizzle DB resolver (defaults to `() => databaseModule.getDb()`). */
  getDb?: () => MainDatabase
  /** Override serialized DB write scheduler (defaults to `scheduleDbWrite`). */
  scheduleWrite?: <T>(label: string, operation: () => Promise<T>) => Promise<T>
  /** Maximum retained conversation sessions before LRU eviction (default 20). */
  maxSessions?: number
  /** Maximum UTF-8 serialized byte size per persisted session payload (default 4 MiB). */
  maxSessionBytes?: number
  /** Duration (ms) a deleted conversation stays tombstoned against late/queued saves (default 60s). */
  deleteTombstoneTtlMs?: number
  /** Clock provider for deterministic LRU and tombstone tests. */
  now?: () => number
}

export interface SanitizeCanvasSessionOptions {
  /** Optional aggregate UTF-8 lower-bound byte ceiling checked before `JSON.stringify`. */
  maxSessionBytes?: number
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

function sanitizeFrame(
  raw: unknown
):
  | { ok: true; frame: TdsCanvasSessionFrameRecord; sourceBytes: number }
  | { ok: false; error: string } {
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
    sourceBytes,
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
  if (!id || !kind || !deviceId || !sourceHash || FORBIDDEN_RECORD_KEYS.has(sourceHash)) {
    return null
  }

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

function collectReferencedHashes(
  entries: readonly TdsCanvasSessionHistoryEntryRecord[]
): Set<string> {
  const referenced = new Set<string>()
  for (const entry of entries) {
    for (const snap of entry.frameSnapshots) {
      referenced.add(snap.sourceHash)
    }
  }
  return referenced
}

function sanitizeHistory(
  raw: unknown,
  baseBytes: number,
  maxSessionBytes?: number
):
  | { ok: true; history: TdsCanvasSessionHistoryRecord; blobBytes: number }
  | { ok: false; error: string; bytes?: number } {
  if (!isPlainRecord(raw)) {
    return {
      ok: true,
      blobBytes: 0,
      history: { blobs: {}, entries: [], cursor: -1 }
    }
  }

  const rawBlobs = isPlainRecord(raw.blobs) ? raw.blobs : null
  const blobCache = new Map<string, { value: string; bytes: number } | null>()

  const resolveValidBlob = (
    hash: string
  ):
    | { ok: true; entry: { value: string; bytes: number } | null }
    | { ok: false; error: string } => {
    if (blobCache.has(hash)) {
      return { ok: true, entry: blobCache.get(hash) ?? null }
    }
    if (
      !rawBlobs ||
      !hash ||
      hash.length > 128 ||
      FORBIDDEN_RECORD_KEYS.has(hash) ||
      !Object.hasOwn(rawBlobs, hash)
    ) {
      blobCache.set(hash, null)
      return { ok: true, entry: null }
    }
    const candidate = rawBlobs[hash]
    if (typeof candidate !== 'string') {
      blobCache.set(hash, null)
      return { ok: true, entry: null }
    }
    const blobBytes = Buffer.byteLength(candidate, 'utf8')
    if (blobBytes > MAX_CANVAS_FRAME_SOURCE_BYTES) {
      return {
        ok: false,
        error: `CANVAS_HISTORY_BLOB_TOO_LARGE:${blobBytes}>${MAX_CANVAS_FRAME_SOURCE_BYTES}`
      }
    }
    const record = { value: candidate, bytes: blobBytes }
    blobCache.set(hash, record)
    return { ok: true, entry: record }
  }

  const rawCursor =
    typeof raw.cursor === 'number' && Number.isFinite(raw.cursor) ? Math.trunc(raw.cursor) : -1
  let mappedCursor = -1

  let entries: TdsCanvasSessionHistoryEntryRecord[] = []
  if (Array.isArray(raw.entries)) {
    for (let rawIndex = 0; rawIndex < raw.entries.length; rawIndex += 1) {
      const candidate = raw.entries[rawIndex]
      if (!isPlainRecord(candidate)) continue
      const id = clampString(candidate.id, 256)
      if (!id) continue
      const label = typeof candidate.label === 'string' ? candidate.label.slice(0, 256) : ''
      const createdAt = sanitizeFiniteNumber(candidate.createdAt, 0)
      const frameSnapshots: TdsCanvasSessionFrameSnapshotRecord[] = []
      let hasMissingBlob = false

      if (Array.isArray(candidate.frameSnapshots)) {
        if (candidate.frameSnapshots.length > MAX_CANVAS_FRAMES * 8) {
          return {
            ok: false,
            error: `CANVAS_SESSION_FRAME_LIMIT:${candidate.frameSnapshots.length}>${MAX_CANVAS_FRAMES}`
          }
        }
        for (const snap of candidate.frameSnapshots) {
          const cleaned = sanitizeFrameSnapshot(snap)
          if (!cleaned) continue
          if (frameSnapshots.length >= MAX_CANVAS_FRAMES) {
            return {
              ok: false,
              error: `CANVAS_SESSION_FRAME_LIMIT:${frameSnapshots.length + 1}>${MAX_CANVAS_FRAMES}`
            }
          }
          const resolved = resolveValidBlob(cleaned.sourceHash)
          if (!resolved.ok) {
            return resolved
          }
          if (!resolved.entry) {
            hasMissingBlob = true
            break
          }
          frameSnapshots.push(cleaned)
        }
      }

      if (hasMissingBlob) continue

      const nextIndex = entries.length
      entries.push({
        id,
        label,
        createdAt,
        frameSnapshots
      })
      if (rawIndex === rawCursor) {
        mappedCursor = nextIndex
      }
    }
  }

  // Keep the newest entries when over MAX_CANVAS_HISTORY_ENTRIES so recent snapshots survive.
  if (entries.length > MAX_CANVAS_HISTORY_ENTRIES) {
    const dropped = entries.length - MAX_CANVAS_HISTORY_ENTRIES
    entries = entries.slice(dropped)
    if (mappedCursor >= 0) {
      mappedCursor = Math.max(0, mappedCursor - dropped)
    }
  }

  // Never retain a snapshot whose blob would be dropped: prune oldest entries until the retained
  // referenced blob set fits within MAX_CANVAS_HISTORY_BLOBS.
  let referencedHashes = collectReferencedHashes(entries)
  while (referencedHashes.size > MAX_CANVAS_HISTORY_BLOBS && entries.length > 0) {
    entries.shift()
    if (mappedCursor >= 0) {
      mappedCursor = entries.length === 0 ? -1 : Math.max(0, mappedCursor - 1)
    }
    referencedHashes = collectReferencedHashes(entries)
  }

  const blobs: Record<string, string> = {}
  let blobBytes = 0
  for (const hash of referencedHashes) {
    const cached = blobCache.get(hash)
    if (!cached) continue
    blobBytes += cached.bytes
    if (maxSessionBytes !== undefined && baseBytes + blobBytes > maxSessionBytes) {
      const estimated = baseBytes + blobBytes
      return {
        ok: false,
        bytes: estimated,
        error: `CANVAS_SESSION_TOO_LARGE:${estimated}>${maxSessionBytes}`
      }
    }
    blobs[hash] = cached.value
  }

  let cursor: number
  if (entries.length === 0 || rawCursor < 0) {
    cursor = -1
  } else if (mappedCursor >= 0) {
    cursor = Math.min(entries.length - 1, mappedCursor)
  } else {
    cursor = Math.max(0, Math.min(entries.length - 1, rawCursor))
  }

  return {
    ok: true,
    blobBytes,
    history: {
      blobs,
      entries,
      cursor
    }
  }
}

/**
 * Computes a fast UTF-8 lower bound over frame sources, notes, and history blobs before calling
 * `JSON.stringify`. Guaranteed never to exceed the final UTF-8 byte length of the JSON envelope.
 */
export function estimateCanvasSessionLowerBoundBytes(session: TdsCanvasSessionData): number {
  let bytes = 0
  for (const frame of session.frames) {
    bytes += Buffer.byteLength(frame.source, 'utf8')
  }
  for (const note of session.notes) {
    bytes += Buffer.byteLength(note.text, 'utf8')
  }
  for (const blob of Object.values(session.history.blobs)) {
    bytes += Buffer.byteLength(blob, 'utf8')
  }
  return bytes
}

/**
 * Strictly validates and strips an untrusted canvas session payload into a bounded,
 * prototype-safe `TdsCanvasSessionData` record.
 */
export function sanitizeCanvasSessionData(
  raw: unknown,
  options: SanitizeCanvasSessionOptions = {}
): { ok: true; session: TdsCanvasSessionData } | { ok: false; error: string; bytes?: number } {
  if (!isPlainRecord(raw)) {
    return { ok: false, error: 'INVALID_CANVAS_SESSION' }
  }
  if (raw.version !== 1) {
    return { ok: false, error: 'UNSUPPORTED_CANVAS_SESSION_VERSION' }
  }
  if (!Array.isArray(raw.frames)) {
    return { ok: false, error: 'INVALID_CANVAS_FRAMES' }
  }
  if (raw.frames.length > MAX_CANVAS_FRAMES * 8) {
    return {
      ok: false,
      error: `CANVAS_SESSION_FRAME_LIMIT:${raw.frames.length}>${MAX_CANVAS_FRAMES}`
    }
  }

  const maxSessionBytes = options.maxSessionBytes
  let runningBytes = 0

  const frames: TdsCanvasSessionFrameRecord[] = []
  const seenFrameIds = new Set<string>()
  for (const candidate of raw.frames) {
    const sanitized = sanitizeFrame(candidate)
    if (!sanitized.ok) {
      if (sanitized.error.startsWith('CANVAS_FRAME_SOURCE_TOO_LARGE')) {
        return sanitized
      }
      continue
    }
    if (seenFrameIds.has(sanitized.frame.id)) continue
    if (frames.length >= MAX_CANVAS_FRAMES) {
      return {
        ok: false,
        error: `CANVAS_SESSION_FRAME_LIMIT:${frames.length + 1}>${MAX_CANVAS_FRAMES}`
      }
    }
    runningBytes += sanitized.sourceBytes
    if (maxSessionBytes !== undefined && runningBytes > maxSessionBytes) {
      return {
        ok: false,
        bytes: runningBytes,
        error: `CANVAS_SESSION_TOO_LARGE:${runningBytes}>${maxSessionBytes}`
      }
    }
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
      runningBytes += Buffer.byteLength(sanitized.text, 'utf8')
      if (maxSessionBytes !== undefined && runningBytes > maxSessionBytes) {
        return {
          ok: false,
          bytes: runningBytes,
          error: `CANVAS_SESSION_TOO_LARGE:${runningBytes}>${maxSessionBytes}`
        }
      }
      seenNoteIds.add(sanitized.id)
      notes.push(sanitized)
    }
  }

  const historyResult = sanitizeHistory(raw.history, runningBytes, maxSessionBytes)
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
 * Main-process encrypted SQLite persistence store for TDS Design Canvas sessions.
 *
 * Security & durability guarantees:
 * - Stored in the primary SQLite database (`tds_canvas_sessions`) keyed by `sha256(conversationId)`
 *   through `scheduleDbWrite`; never touches renderer Web Storage or plaintext JSON files.
 * - Every session payload is sealed via CoreApp `wrapSecureStoreValue` (AES-256-GCM under
 *   `local-secret.v1.key`, authenticated against `keyHash` + purpose `tds-canvas-session`); fails
 *   closed if encryption is unavailable or an envelope is tampered.
 * - Strict schema sanitization, frame limit rejection (`CANVAS_SESSION_FRAME_LIMIT`), pre-stringify
 *   aggregate UTF-8 lower-bound check + exact serialized byte ceiling (`maxSessionBytes`, 4 MiB).
 * - Bounded LRU retention (`maxSessions`, default 20 conversations) with delete-before-index-removal
 *   and observable cleanup errors, plus conversation-delete cascade tombstones.
 */
export class TdsCanvasSessionStore {
  private readonly explicitLegacyDir: string | null
  private readonly explicitRootPath: string | (() => string) | null
  private readonly getDb: () => MainDatabase
  private readonly scheduleWrite: <T>(label: string, operation: () => Promise<T>) => Promise<T>
  private readonly maxSessions: number
  private readonly maxSessionBytes: number
  private readonly deleteTombstoneTtlMs: number
  private readonly now: () => number

  private indexLoaded = false
  private legacyCleanupPromise: Promise<void> | null = null
  private readonly sessionIndex = new Map<string, number>()
  private readonly deletedTombstones = new Map<string, number>()
  private pendingChain: Promise<unknown> = Promise.resolve()

  constructor(options: TdsCanvasSessionStoreOptions = {}) {
    const legacyDir = options.legacyStorageDir ?? options.storageDir
    this.explicitLegacyDir = legacyDir ? path.resolve(legacyDir) : null
    this.explicitRootPath = options.rootPath ?? null
    this.getDb = options.getDb ?? (() => databaseModule.getDb())
    this.scheduleWrite = options.scheduleWrite ?? ((label, op) => scheduleDbWrite(label, op))
    this.maxSessions = Math.max(1, Math.floor(options.maxSessions ?? MAX_CANVAS_SESSIONS))
    this.maxSessionBytes = Math.max(
      1024,
      Math.floor(options.maxSessionBytes ?? MAX_CANVAS_SESSION_BYTES)
    )
    this.deleteTombstoneTtlMs = Math.max(
      1_000,
      Math.floor(options.deleteTombstoneTtlMs ?? DEFAULT_DELETE_TOMBSTONE_TTL_MS)
    )
    this.now = options.now ?? (() => Date.now())
  }

  private resolveRootPath(): string {
    if (typeof this.explicitRootPath === 'function') {
      return this.explicitRootPath()
    }
    if (typeof this.explicitRootPath === 'string') {
      return this.explicitRootPath
    }
    return resolveRuntimeRootPath(app)
  }

  private resolveLegacyDir(): string | null {
    if (this.explicitLegacyDir) return this.explicitLegacyDir
    if (typeof app?.getPath !== 'function') return null
    try {
      const userData = app.getPath('userData')
      return userData ? path.join(userData, TDS_CANVAS_SESSIONS_DIR_NAME) : null
    } catch {
      return null
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.pendingChain.then(operation, operation)
    this.pendingChain = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private pruneExpiredTombstones(currentMs: number): void {
    for (const [keyHash, expiresAt] of this.deletedTombstones) {
      if (expiresAt <= currentMs) {
        this.deletedTombstones.delete(keyHash)
      }
    }
    while (this.deletedTombstones.size > MAX_DELETE_TOMBSTONES) {
      const oldest = this.deletedTombstones.keys().next().value
      if (!oldest) break
      this.deletedTombstones.delete(oldest)
    }
  }

  private isDeletedTombstoned(keyHash: string): boolean {
    const expiresAt = this.deletedTombstones.get(keyHash)
    if (expiresAt === undefined) return false
    const currentMs = this.now()
    if (expiresAt <= currentMs) {
      this.deletedTombstones.delete(keyHash)
      return false
    }
    return true
  }

  /**
   * Synchronously records a short-lived deletion tombstone so an already-queued renderer `save`
   * cannot recreate a canvas session for a conversation that was just deleted locally or via sync.
   */
  markConversationDeleted(conversationId: string): void {
    const keyHash = hashCanvasConversationId(conversationId)
    if (!keyHash) return
    const currentMs = this.now()
    this.pruneExpiredTombstones(currentMs)
    this.deletedTombstones.delete(keyHash)
    this.deletedTombstones.set(keyHash, currentMs + this.deleteTombstoneTtlMs)
    this.pruneExpiredTombstones(currentMs)
  }

  /** Clears a deletion tombstone when a conversation ID is explicitly saved or restored again. */
  clearConversationDeletedTombstone(conversationId: string): void {
    const keyHash = hashCanvasConversationId(conversationId)
    if (!keyHash) return
    this.deletedTombstones.delete(keyHash)
  }

  /**
   * Synchronously fences late saves for `conversationId`, then serializes removal behind any
   * already-in-flight store operation so no concurrent save can leave a surviving SQLite row.
   */
  async deleteForDeletedConversation(
    conversationId: string
  ): Promise<TdsCanvasSessionDeleteResponse> {
    this.markConversationDeleted(conversationId)
    return await this.delete(conversationId)
  }

  /**
   * Best-effort cleanup of legacy plaintext JSON session files under `<userData>/tds-canvas-sessions/`.
   * Refuses symlinks, ignores unrelated files, and never throws.
   */
  cleanupLegacyPlaintextFiles(): Promise<void> {
    if (!this.legacyCleanupPromise) {
      this.legacyCleanupPromise = this.performLegacyPlaintextCleanup()
    }
    return this.legacyCleanupPromise
  }

  private async performLegacyPlaintextCleanup(): Promise<void> {
    const legacyDir = this.resolveLegacyDir()
    if (!legacyDir) return
    try {
      const dirStats = await lstat(legacyDir)
      if (dirStats.isSymbolicLink() || !dirStats.isDirectory()) return
      const entries = await readdir(legacyDir)
      for (const name of entries) {
        if (!LEGACY_SESSION_FILE_PATTERN.test(name) && !LEGACY_TEMP_FILE_PATTERN.test(name)) {
          continue
        }
        const targetPath = path.join(legacyDir, name)
        if (path.dirname(targetPath) !== legacyDir) continue
        try {
          const stats = await lstat(targetPath)
          if (stats.isFile() && !stats.isSymbolicLink()) {
            await unlink(targetPath)
          }
        } catch {
          // Best-effort per-file cleanup.
        }
      }
      await rmdir(legacyDir).catch(() => {})
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code
      if (code !== 'ENOENT') {
        tdsCanvasStoreLog.warn('Legacy plaintext canvas session cleanup failed', { error })
      }
    }
  }

  private async ensureIndexLoaded(): Promise<void> {
    await this.cleanupLegacyPlaintextFiles()
    if (this.indexLoaded) return
    const db = this.getDb()
    const rows = await db
      .select({
        keyHash: tdsCanvasSessions.keyHash,
        updatedAt: tdsCanvasSessions.updatedAt
      })
      .from(tdsCanvasSessions)
    this.sessionIndex.clear()
    for (const row of rows) {
      this.sessionIndex.set(row.keyHash, row.updatedAt)
    }
    this.indexLoaded = true
  }

  private async evictExcessSessions(protectedKeyHash?: string): Promise<void> {
    if (this.sessionIndex.size <= this.maxSessions) return
    const ordered = [...this.sessionIndex.entries()]
      .filter(([keyHash]) => keyHash !== protectedKeyHash)
      .sort((a, b) => a[1] - b[1])
    const overflow = this.sessionIndex.size - this.maxSessions
    for (let index = 0; index < overflow; index += 1) {
      const victim = ordered[index]
      if (!victim) break
      const [victimHash] = victim
      try {
        await this.scheduleWrite('tds-canvas.evict', async () => {
          const db = this.getDb()
          await db.delete(tdsCanvasSessions).where(eq(tdsCanvasSessions.keyHash, victimHash))
        })
        // Only drop tracking state after SQLite confirms deletion succeeded.
        this.sessionIndex.delete(victimHash)
      } catch (error) {
        tdsCanvasStoreLog.warn('Failed to evict excess canvas session from SQLite', {
          meta: { keyHashPrefix: victimHash.slice(0, 12) },
          error
        })
        throw error
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
        const db = this.getDb()
        const [row] = await db
          .select({
            keyHash: tdsCanvasSessions.keyHash,
            envelope: tdsCanvasSessions.envelope,
            updatedAt: tdsCanvasSessions.updatedAt
          })
          .from(tdsCanvasSessions)
          .where(eq(tdsCanvasSessions.keyHash, keyHash))
          .limit(1)

        if (!row) {
          this.sessionIndex.delete(keyHash)
          return { ok: true, session: null }
        }

        const plain = await unwrapSecureStoreValue(
          this.resolveRootPath(),
          keyHash,
          row.envelope,
          TDS_CANVAS_SESSION_SECURE_PURPOSE
        )
        if (plain === null) {
          return { ok: false, session: null, error: 'CANVAS_SESSION_DECRYPT_FAILED' }
        }

        if (Buffer.byteLength(plain, 'utf8') > this.maxSessionBytes + 4096) {
          return { ok: false, session: null, error: 'CANVAS_SESSION_CORRUPT_OVERSIZED' }
        }

        const parsed = JSON.parse(plain) as unknown
        if (!isPlainRecord(parsed) || parsed.version !== 1 || parsed.keyHash !== keyHash) {
          return { ok: false, session: null, error: 'CANVAS_SESSION_CORRUPT' }
        }

        const sanitized = sanitizeCanvasSessionData(parsed.session, {
          maxSessionBytes: this.maxSessionBytes
        })
        if (!sanitized.ok) {
          return { ok: false, session: null, error: 'CANVAS_SESSION_CORRUPT' }
        }

        const touchedAt = this.now()
        try {
          await this.scheduleWrite('tds-canvas.touch', async () => {
            const writeDb = this.getDb()
            await writeDb
              .update(tdsCanvasSessions)
              .set({ updatedAt: touchedAt })
              .where(eq(tdsCanvasSessions.keyHash, keyHash))
          })
          this.sessionIndex.set(keyHash, touchedAt)
        } catch (error) {
          tdsCanvasStoreLog.warn('Failed to update canvas session LRU timestamp', {
            meta: { keyHashPrefix: keyHash.slice(0, 12) },
            error
          })
        }

        return { ok: true, session: sanitized.session }
      } catch (error) {
        if (error instanceof SyntaxError) {
          return { ok: false, session: null, error: 'CANVAS_SESSION_CORRUPT' }
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

    if (this.isDeletedTombstoned(keyHash)) {
      return { ok: false, error: 'CANVAS_SESSION_CONVERSATION_DELETED' }
    }

    const sanitized = sanitizeCanvasSessionData(rawSession, {
      maxSessionBytes: this.maxSessionBytes
    })
    if (!sanitized.ok) {
      return {
        ok: false,
        ...(sanitized.bytes !== undefined ? { bytes: sanitized.bytes } : {}),
        error: sanitized.error
      }
    }

    return this.enqueue(async () => {
      if (this.isDeletedTombstoned(keyHash)) {
        return { ok: false, error: 'CANVAS_SESSION_CONVERSATION_DELETED' }
      }

      const lowerBoundBytes = estimateCanvasSessionLowerBoundBytes(sanitized.session)
      if (lowerBoundBytes > this.maxSessionBytes) {
        return {
          ok: false,
          bytes: lowerBoundBytes,
          error: `CANVAS_SESSION_TOO_LARGE:${lowerBoundBytes}>${this.maxSessionBytes}`
        }
      }

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

      try {
        const wrapped = await wrapSecureStoreValue(
          this.resolveRootPath(),
          keyHash,
          serialized,
          TDS_CANVAS_SESSION_SECURE_PURPOSE,
          (message, error) => tdsCanvasStoreLog.warn(message, { error })
        )
        if (!wrapped) {
          return { ok: false, error: 'CANVAS_SESSION_ENCRYPT_FAILED' }
        }

        // Re-check tombstone after async encryption in case conversation delete raced in.
        if (this.isDeletedTombstoned(keyHash)) {
          return { ok: false, error: 'CANVAS_SESSION_CONVERSATION_DELETED' }
        }

        await this.ensureIndexLoaded()
        await this.scheduleWrite('tds-canvas.save', async () => {
          const db = this.getDb()
          await db
            .insert(tdsCanvasSessions)
            .values({
              keyHash,
              envelope: wrapped.value,
              updatedAt
            })
            .onConflictDoUpdate({
              target: tdsCanvasSessions.keyHash,
              set: {
                envelope: wrapped.value,
                updatedAt
              }
            })
        })

        this.sessionIndex.set(keyHash, updatedAt)
        await this.evictExcessSessions(keyHash)
        return { ok: true, bytes }
      } catch (error) {
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
        const removed = await this.scheduleWrite('tds-canvas.delete', async () => {
          const db = this.getDb()
          return await db
            .delete(tdsCanvasSessions)
            .where(eq(tdsCanvasSessions.keyHash, keyHash))
            .returning({ keyHash: tdsCanvasSessions.keyHash })
        })
        // Only drop tracking state after SQLite confirms deletion or absence.
        this.sessionIndex.delete(keyHash)
        return { ok: true, deleted: removed.length > 0 }
      } catch (error) {
        tdsCanvasStoreLog.warn('Failed to delete canvas session from SQLite', {
          meta: { keyHashPrefix: keyHash.slice(0, 12) },
          error
        })
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
