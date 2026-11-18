import { hasWindow } from '@talex-touch/utils/env'

const CHUNK_RELOAD_STORAGE_KEY = 'nexus:chunk-reload'
const CACHE_BUST_QUERY_PARAM = '__nexus_v'
const DEFAULT_CHUNK_RELOAD_COOLDOWN_MS = 15_000

const STALE_CHUNK_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Unable to preload CSS/i,
  /Loading (?:CSS )?chunk [\w-]+ failed/i,
]

export interface ChunkReloadStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export interface RecoverFromStaleChunkOptions {
  now?: number
  cooldownMs?: number
  href?: string
  pathname?: string
  storage?: ChunkReloadStorage | null
  navigate?: (url: string) => void
}

function readErrorMessage(error: unknown, depth = 0, seen = new Set<unknown>()): string[] {
  if (error == null || depth > 3 || seen.has(error))
    return []
  if (typeof error === 'string')
    return [error]
  if (typeof error !== 'object')
    return []

  seen.add(error)
  const record = error as { name?: unknown, message?: unknown, reason?: unknown, cause?: unknown, payload?: unknown }
  const parts: string[] = []
  if (typeof record.name === 'string')
    parts.push(record.name)
  if (typeof record.message === 'string')
    parts.push(record.message)
  if (record.reason !== undefined)
    parts.push(...readErrorMessage(record.reason, depth + 1, seen))
  if (record.cause !== undefined)
    parts.push(...readErrorMessage(record.cause, depth + 1, seen))
  if (record.payload !== undefined)
    parts.push(...readErrorMessage(record.payload, depth + 1, seen))
  return parts
}

export function isStaleChunkError(error: unknown): boolean {
  const messages = readErrorMessage(error)
  return messages.some(message =>
    STALE_CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(message)),
  )
}

export function buildCacheBustReloadUrl(href: string, now: number): string {
  const url = new URL(href)
  url.searchParams.set(CACHE_BUST_QUERY_PARAM, String(now))
  return url.toString()
}

export function stripCacheBustParamFromUrl(href: string): string | null {
  const url = new URL(href)
  if (!url.searchParams.has(CACHE_BUST_QUERY_PARAM))
    return null
  url.searchParams.delete(CACHE_BUST_QUERY_PARAM)
  const search = url.searchParams.toString()
  return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`
}

export function canAttemptChunkReload(
  storage: ChunkReloadStorage | null | undefined,
  pathname: string,
  now: number,
  _cooldownMs = DEFAULT_CHUNK_RELOAD_COOLDOWN_MS,
): boolean {
  if (!storage)
    return false
  try {
    const raw = storage.getItem(CHUNK_RELOAD_STORAGE_KEY)
    if (!raw)
      return true
    const parsed = JSON.parse(raw) as { path?: unknown, expiresAt?: unknown }
    if (parsed?.path !== pathname)
      return true
    return typeof parsed.expiresAt !== 'number' || parsed.expiresAt <= now
  }
  catch {
    return true
  }
}

export function markChunkReloadAttempt(
  storage: ChunkReloadStorage | null | undefined,
  pathname: string,
  now: number,
  cooldownMs = DEFAULT_CHUNK_RELOAD_COOLDOWN_MS,
): void {
  if (!storage)
    return
  try {
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, JSON.stringify({
      path: pathname,
      expiresAt: now + cooldownMs,
    }))
  }
  catch {
    // Ignore storage quota or private browsing errors cleanly.
  }
}

/**
 * Reloads once with a cache-busting query token when a deploy invalidates
 * lazy JS/CSS chunk hashes referenced by stale HTML or an already-open tab.
 */
export function recoverFromStaleChunkError(
  error: unknown,
  options: RecoverFromStaleChunkOptions = {},
): boolean {
  if (!isStaleChunkError(error))
    return false

  const hasBrowserWindow = hasWindow()
  const href = options.href ?? (hasBrowserWindow ? window.location.href : undefined)
  const pathname = options.pathname ?? (hasBrowserWindow ? window.location.pathname : undefined)
  const storage = options.storage !== undefined
    ? options.storage
    : (hasBrowserWindow ? window.sessionStorage : null)
  const navigate = options.navigate ?? (hasBrowserWindow
    ? (url: string) => window.location.replace(url)
    : undefined)

  if (!href || !pathname || !navigate)
    return false

  const now = options.now ?? Date.now()
  if (!canAttemptChunkReload(storage, pathname, now, options.cooldownMs))
    return false

  markChunkReloadAttempt(storage, pathname, now, options.cooldownMs)
  navigate(buildCacheBustReloadUrl(href, now))
  return true
}
