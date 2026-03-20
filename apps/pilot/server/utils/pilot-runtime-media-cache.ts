import { randomUUID } from 'node:crypto'

const DEFAULT_TTL_MS = 30 * 60 * 1000
const MAX_CACHE_ITEMS = 256

export interface PilotRuntimeMediaCacheItem {
  id: string
  mimeType: string
  bytes: Uint8Array
  createdAt: number
  expiresAt: number
}

const mediaCache = new Map<string, PilotRuntimeMediaCacheItem>()

function normalizeMimeType(value: unknown): string {
  const text = String(value || '').trim().toLowerCase()
  return text || 'application/octet-stream'
}

function toUint8Array(value: ArrayBuffer | Uint8Array | Buffer): Uint8Array {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value)
  }
  return new Uint8Array(value)
}

function cleanupExpired(now = Date.now()): void {
  for (const [id, item] of mediaCache.entries()) {
    if (item.expiresAt <= now) {
      mediaCache.delete(id)
    }
  }
}

function cleanupOverflow(): void {
  if (mediaCache.size <= MAX_CACHE_ITEMS) {
    return
  }
  const list = Array.from(mediaCache.values()).sort((a, b) => a.createdAt - b.createdAt)
  const deleteCount = Math.max(0, mediaCache.size - MAX_CACHE_ITEMS)
  for (let index = 0; index < deleteCount; index += 1) {
    const item = list[index]
    if (!item) {
      continue
    }
    mediaCache.delete(item.id)
  }
}

export function savePilotRuntimeMediaCache(input: {
  bytes: ArrayBuffer | Uint8Array | Buffer
  mimeType?: string
  ttlMs?: number
}): {
  id: string
  url: string
  expiresAt: number
  size: number
  mimeType: string
} {
  const now = Date.now()
  cleanupExpired(now)

  const id = randomUUID()
  const bytes = toUint8Array(input.bytes)
  const mimeType = normalizeMimeType(input.mimeType)
  const ttlMs = Math.max(30_000, Math.floor(Number(input.ttlMs) || DEFAULT_TTL_MS))
  const expiresAt = now + ttlMs

  mediaCache.set(id, {
    id,
    mimeType,
    bytes,
    createdAt: now,
    expiresAt,
  })
  cleanupOverflow()

  return {
    id,
    url: `/api/runtime/media-cache/${id}`,
    expiresAt,
    size: bytes.byteLength,
    mimeType,
  }
}

export function readPilotRuntimeMediaCache(id: string): PilotRuntimeMediaCacheItem | null {
  cleanupExpired()
  const key = String(id || '').trim()
  if (!key) {
    return null
  }
  const item = mediaCache.get(key)
  if (!item) {
    return null
  }
  return {
    ...item,
    bytes: new Uint8Array(item.bytes),
  }
}
