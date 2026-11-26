import type {
  TdsCaptureFormat,
  TdsCaptureRenderRequest,
  TdsCaptureRenderResponse
} from '@talex-touch/utils/transport/sdk/domains/tds-capture'
import type { TdsLintCategory, TdsLintIssue, TdsLintRuleId, TdsLintSeverity } from './types'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createTdsCaptureSdk } from '@talex-touch/utils/transport/sdk/domains/tds-capture'

/** Hard upper bound for in-memory captured bitmap & DOM probe LRU cache (32 MB). */
export const MAX_CAPTURE_CACHE_BYTES = 32 * 1024 * 1024

/** Hard upper bound on concurrent renderer -> main offscreen capture IPC requests. */
export const MAX_CAPTURE_CONCURRENCY = 2

const VALID_BITMAP_DATA_URL_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/i

const VALID_SEVERITIES = new Set<TdsLintSeverity>(['error', 'warning', 'info'])
const VALID_CATEGORIES = new Set<TdsLintCategory>([
  'sandbox',
  'tokens',
  'layout',
  'contrast',
  'icons',
  'anti-slop'
])

export interface TdsLiveCaptureInput {
  /** HTML document string rendered in the isolated offscreen BrowserWindow. */
  srcdoc: string
  /** Logical viewport width in px. */
  width: number
  /** Logical viewport height in px. */
  height: number
  /** Device pixel ratio (`1` or `2`; default `1`). */
  pixelRatio?: number
  /** Captured bitmap format (`'jpeg' | 'png' | 'none'`; default `'jpeg'`). */
  format?: TdsCaptureFormat
  /** JPEG encoding quality `[1..100]` when `format === 'jpeg'`. */
  quality?: number
  /** Post-load settle delay in ms before capturing/probing. */
  settleMs?: number
  /** Optional self-contained DOM probe IIFE script (e.g. from `buildTdsDomProbeScript`). */
  domProbeScript?: string
  /** Optional session key to reuse/release a pooled offscreen capture window. */
  sessionKey?: string
  /** Optional IPC timeout override in ms. */
  timeoutMs?: number
  /** Bypass cache lookup (still deduplicates in-flight calls and updates cache on success). */
  bypassCache?: boolean
}

export interface TdsLiveCaptureResult {
  ok: boolean
  bitmapDataUrl?: string
  domIssues: TdsLintIssue[]
  fromCache: boolean
  width?: number
  height?: number
  durationMs?: number
  probeError?: string
  error?: string
}

export interface TdsCaptureCacheStats {
  entries: number
  bytes: number
  maxBytes: number
  inFlight: number
  activeRequests: number
  queuedRequests: number
  hits: number
  misses: number
}

interface CacheEntry {
  bitmapDataUrl?: string
  domIssues: TdsLintIssue[]
  width?: number
  height?: number
  byteSize: number
}

interface InFlightCaptureEntry {
  token: symbol
  promise: Promise<TdsLiveCaptureResult>
}

const captureCache = new Map<string, CacheEntry>()
const inFlightRequests = new Map<string, InFlightCaptureEntry>()
const pendingQueue: Array<() => void> = []

let cachedTotalBytes = 0
let cacheMaxBytes = MAX_CAPTURE_CACHE_BYTES
let activeRequests = 0
let cacheHits = 0
let cacheMisses = 0

/**
 * Fast deterministic 64-bit FNV-1a (two independent 32-bit lanes) hex digest
 * for cache keying without requiring WebCrypto async calls.
 */
function fnv1a64Hex(input: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x9e3779b1
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i)
    h1 ^= code
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= code ^ ((i & 0xff) + 1)
    h2 = Math.imul(h2, 0x85ebca6b)
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
}

function normalizePositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.round(value)
}

function normalizePixelRatio(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 1
  return Math.max(1, Math.min(3, Math.round(value * 100) / 100))
}

function normalizeFormat(value: TdsCaptureFormat | undefined): TdsCaptureFormat {
  if (value === 'png' || value === 'none' || value === 'jpeg') return value
  return 'jpeg'
}

/**
 * Computes a deterministic cache key from `srcdoc + width + height + format + pixelRatio`
 * (and optional `domProbeScript` digest so toggling anti-slop options never returns stale DOM issues).
 */
export function buildCaptureCacheKey(
  input: Pick<
    TdsLiveCaptureInput,
    'srcdoc' | 'width' | 'height' | 'format' | 'pixelRatio' | 'domProbeScript'
  >
): string {
  const width = normalizePositiveInt(input.width, 0)
  const height = normalizePositiveInt(input.height, 0)
  const format = normalizeFormat(input.format)
  const pixelRatio = normalizePixelRatio(input.pixelRatio)
  const srcDigest = fnv1a64Hex(input.srcdoc)
  const probeDigest = input.domProbeScript ? fnv1a64Hex(input.domProbeScript) : 'no-probe'
  return `tds-cap:v1:${width}x${height}@${pixelRatio}:${format}:${srcDigest}:${input.srcdoc.length}:${probeDigest}`
}

function estimateEntryBytes(
  bitmapDataUrl: string | undefined,
  domIssues: readonly TdsLintIssue[]
): number {
  let bytes = 0
  if (bitmapDataUrl) {
    bytes += bitmapDataUrl.length
  }
  if (domIssues.length > 0) {
    try {
      bytes += JSON.stringify(domIssues).length
    } catch {
      bytes += domIssues.length * 160
    }
  }
  return Math.max(64, bytes)
}

function readFromCache(key: string): CacheEntry | null {
  const existing = captureCache.get(key)
  if (!existing) return null
  // Refresh LRU recency by moving key to Map tail.
  captureCache.delete(key)
  captureCache.set(key, existing)
  return existing
}

function writeToCache(key: string, entry: CacheEntry): void {
  if (entry.byteSize > cacheMaxBytes) {
    return
  }

  const prev = captureCache.get(key)
  if (prev) {
    cachedTotalBytes = Math.max(0, cachedTotalBytes - prev.byteSize)
    captureCache.delete(key)
  }

  while (cachedTotalBytes + entry.byteSize > cacheMaxBytes && captureCache.size > 0) {
    const oldestKey = captureCache.keys().next().value as string | undefined
    if (oldestKey === undefined) break
    const oldest = captureCache.get(oldestKey)
    captureCache.delete(oldestKey)
    if (oldest) {
      cachedTotalBytes = Math.max(0, cachedTotalBytes - oldest.byteSize)
    }
  }

  if (cachedTotalBytes + entry.byteSize <= cacheMaxBytes) {
    captureCache.set(key, entry)
    cachedTotalBytes += entry.byteSize
  }
}

function cloneDomIssues(issues: readonly TdsLintIssue[]): TdsLintIssue[] {
  return issues.map((issue) => ({ ...issue }))
}

function sanitizeDomProbeResult(raw: unknown): TdsLintIssue[] {
  if (!Array.isArray(raw)) return []
  const normalized: TdsLintIssue[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    const ruleId = typeof candidate.ruleId === 'string' ? candidate.ruleId.trim() : ''
    const message = typeof candidate.message === 'string' ? candidate.message.trim() : ''
    const fixHint = typeof candidate.fixHint === 'string' ? candidate.fixHint.trim() : ''
    const severity = candidate.severity as TdsLintSeverity
    const category = candidate.category as TdsLintCategory
    if (!ruleId || !message || !VALID_SEVERITIES.has(severity) || !VALID_CATEGORIES.has(category)) {
      continue
    }

    const issue: TdsLintIssue = {
      ruleId: ruleId as TdsLintRuleId,
      phase: 'dom',
      severity,
      category,
      message,
      fixHint: fixHint || 'Inspect rendered element styling and align with TDS tokens.'
    }
    if (typeof candidate.selector === 'string' && candidate.selector.trim()) {
      issue.selector = candidate.selector.trim()
    }
    if (typeof candidate.snippet === 'string' && candidate.snippet.trim()) {
      issue.snippet = candidate.snippet.trim()
    }
    if (typeof candidate.line === 'number' && Number.isFinite(candidate.line)) {
      issue.line = candidate.line
    }
    if (typeof candidate.column === 'number' && Number.isFinite(candidate.column)) {
      issue.column = candidate.column
    }
    normalized.push(issue)
  }
  return normalized
}

function sanitizeBitmapDataUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!trimmed || !VALID_BITMAP_DATA_URL_RE.test(trimmed)) return undefined
  return trimmed
}

function resolveCaptureSdk() {
  if (!isElectronRenderer()) return null
  try {
    const transport = useTuffTransport()
    if (!transport || typeof transport.send !== 'function') {
      return null
    }
    return createTdsCaptureSdk(transport)
  } catch {
    return null
  }
}

function waitForConcurrencySlot(): Promise<void> {
  return new Promise<void>((resolve) => {
    pendingQueue.push(() => {
      activeRequests += 1
      resolve()
    })
  })
}

function releaseConcurrencySlot(): void {
  activeRequests = Math.max(0, activeRequests - 1)
  const next = pendingQueue.shift()
  if (next) {
    next()
  }
}

/**
 * Captures a frame bitmap and/or runs a live Chromium DOM probe through the main-process
 * isolated `tds-capture` module.
 *
 * Guarantees:
 * - Bounded 32 MB LRU cache keyed by deterministic content + viewport + format + DPR digest
 * - In-flight deduplication (identical concurrent requests share a single IPC round-trip)
 * - Concurrency capped at `MAX_CAPTURE_CONCURRENCY = 2`
 * - Graceful non-throwing `{ ok: false, domIssues: [], fromCache: false }` degradation when
 *   not running in Electron or when transport is unavailable
 */
export async function captureFrameAndProbe(
  input: TdsLiveCaptureInput
): Promise<TdsLiveCaptureResult> {
  const srcdoc = typeof input.srcdoc === 'string' ? input.srcdoc : ''
  const width = normalizePositiveInt(input.width, 0)
  const height = normalizePositiveInt(input.height, 0)
  if (!srcdoc.trim() || width <= 0 || height <= 0) {
    return {
      ok: false,
      domIssues: [],
      fromCache: false,
      error: 'Invalid capture input'
    }
  }

  const format = normalizeFormat(input.format)
  const pixelRatio = normalizePixelRatio(input.pixelRatio)
  const cacheKey = buildCaptureCacheKey({
    srcdoc,
    width,
    height,
    format,
    pixelRatio,
    domProbeScript: input.domProbeScript
  })

  if (!input.bypassCache) {
    const cached = readFromCache(cacheKey)
    if (cached) {
      cacheHits += 1
      return {
        ok: true,
        ...(cached.bitmapDataUrl ? { bitmapDataUrl: cached.bitmapDataUrl } : {}),
        domIssues: cloneDomIssues(cached.domIssues),
        fromCache: true,
        ...(cached.width !== undefined ? { width: cached.width } : {}),
        ...(cached.height !== undefined ? { height: cached.height } : {})
      }
    }
  }

  const existingInFlight = inFlightRequests.get(cacheKey)
  if (existingInFlight) {
    const shared = await existingInFlight.promise
    return {
      ...shared,
      domIssues: cloneDomIssues(shared.domIssues)
    }
  }

  const sdk = resolveCaptureSdk()
  if (!sdk) {
    return {
      ok: false,
      domIssues: [],
      fromCache: false
    }
  }

  cacheMisses += 1

  const taskPromise = (async (): Promise<TdsLiveCaptureResult> => {
    if (activeRequests < MAX_CAPTURE_CONCURRENCY) {
      activeRequests += 1
    } else {
      await waitForConcurrencySlot()
    }
    try {
      const request: TdsCaptureRenderRequest = {
        srcdoc,
        width,
        height,
        pixelRatio,
        format,
        ...(typeof input.quality === 'number' ? { quality: input.quality } : {}),
        ...(typeof input.settleMs === 'number' ? { settleMs: input.settleMs } : {}),
        ...(input.domProbeScript ? { domProbeScript: input.domProbeScript } : {}),
        ...(input.sessionKey ? { sessionKey: input.sessionKey } : {}),
        ...(typeof input.timeoutMs === 'number' ? { timeoutMs: input.timeoutMs } : {})
      }

      const rawResponse = (await sdk.renderFrame(
        request,
        typeof input.timeoutMs === 'number' ? { timeout: input.timeoutMs + 2000 } : undefined
      )) as TdsCaptureRenderResponse | null | undefined

      if (!rawResponse || typeof rawResponse !== 'object' || rawResponse.ok !== true) {
        return {
          ok: false,
          domIssues: [],
          fromCache: false,
          ...(rawResponse && typeof rawResponse.error === 'string'
            ? { error: rawResponse.error }
            : {})
        }
      }

      const bitmapDataUrl = sanitizeBitmapDataUrl(rawResponse.bitmapDataUrl)
      const rawError =
        typeof rawResponse.error === 'string' && rawResponse.error.trim().length > 0
          ? rawResponse.error.trim()
          : undefined
      const probeFailed = Boolean(rawError && rawError.startsWith('DOM_PROBE_FAILED'))
      const domIssues = probeFailed ? [] : sanitizeDomProbeResult(rawResponse.domProbeResult)
      const resolvedWidth =
        typeof rawResponse.width === 'number' && Number.isFinite(rawResponse.width)
          ? rawResponse.width
          : width
      const resolvedHeight =
        typeof rawResponse.height === 'number' && Number.isFinite(rawResponse.height)
          ? rawResponse.height
          : height

      if (!probeFailed) {
        writeToCache(cacheKey, {
          ...(bitmapDataUrl ? { bitmapDataUrl } : {}),
          domIssues: cloneDomIssues(domIssues),
          width: resolvedWidth,
          height: resolvedHeight,
          byteSize: estimateEntryBytes(bitmapDataUrl, domIssues)
        })
      }

      return {
        ok: true,
        ...(bitmapDataUrl ? { bitmapDataUrl } : {}),
        domIssues,
        fromCache: false,
        width: resolvedWidth,
        height: resolvedHeight,
        ...(typeof rawResponse.durationMs === 'number'
          ? { durationMs: rawResponse.durationMs }
          : {}),
        ...(probeFailed && rawError ? { probeError: rawError, error: rawError } : {})
      }
    } catch (err) {
      return {
        ok: false,
        domIssues: [],
        fromCache: false,
        error: err instanceof Error ? err.message : String(err)
      }
    } finally {
      releaseConcurrencySlot()
    }
  })()

  const requestToken = Symbol('tds-capture-in-flight')
  inFlightRequests.set(cacheKey, { token: requestToken, promise: taskPromise })
  try {
    const settled = await taskPromise
    return {
      ...settled,
      domIssues: cloneDomIssues(settled.domIssues)
    }
  } finally {
    if (inFlightRequests.get(cacheKey)?.token === requestToken) {
      inFlightRequests.delete(cacheKey)
    }
  }
}

/**
 * Releases a pooled main-process offscreen capture session cleanly (no-op outside Electron).
 */
export async function releaseCaptureSession(sessionKey: string): Promise<boolean> {
  const cleanKey = sessionKey.trim()
  if (!cleanKey) return false
  const sdk = resolveCaptureSdk()
  if (!sdk) return false
  try {
    const res = await sdk.releaseSession(cleanKey)
    return Boolean(res && res.released)
  } catch {
    return false
  }
}

/**
 * Cleanly merges Phase 1 (`static`) and Phase 2 (`dom`) TDS lint findings, deduplicating
 * identical records while preserving each finding's `phase: 'static' | 'dom'` and stable ordering.
 */
export function mergeLintIssues(
  staticIssues: readonly TdsLintIssue[],
  domIssues: readonly TdsLintIssue[]
): TdsLintIssue[] {
  const merged: TdsLintIssue[] = []
  const seen = new Set<string>()

  const pushUnique = (issue: TdsLintIssue, fallbackPhase: 'static' | 'dom'): void => {
    const phase = issue.phase === 'dom' || issue.phase === 'static' ? issue.phase : fallbackPhase
    const dedupeKey = [
      phase,
      issue.ruleId,
      issue.line ?? '',
      issue.column ?? '',
      issue.selector ?? '',
      issue.snippet ?? '',
      issue.message
    ].join('|')

    if (seen.has(dedupeKey)) return
    seen.add(dedupeKey)
    merged.push({
      ...issue,
      phase
    })
  }

  for (const issue of staticIssues) {
    pushUnique(issue, 'static')
  }
  for (const issue of domIssues) {
    pushUnique(issue, 'dom')
  }

  return merged
}

/** Clears the in-memory LRU capture cache and resets hit/miss counters. */
export function clearCaptureCache(): void {
  captureCache.clear()
  cachedTotalBytes = 0
  cacheHits = 0
  cacheMisses = 0
}

/** Returns live statistics for the bounded LRU capture cache and concurrency queue. */
export function getCaptureCacheStats(): TdsCaptureCacheStats {
  return {
    entries: captureCache.size,
    bytes: cachedTotalBytes,
    maxBytes: cacheMaxBytes,
    inFlight: inFlightRequests.size,
    activeRequests,
    queuedRequests: pendingQueue.length,
    hits: cacheHits,
    misses: cacheMisses
  }
}

/**
 * Test-only hook to override the LRU cache ceiling (clamped to `[1024, MAX_CAPTURE_CACHE_BYTES]`)
 * so eviction behavior can be verified cleanly without allocating >32 MB strings in jsdom.
 */
export function setCaptureCacheMaxBytesForTests(maxBytes: number): void {
  const clamped = Number.isFinite(maxBytes)
    ? Math.max(1024, Math.min(MAX_CAPTURE_CACHE_BYTES, Math.floor(maxBytes)))
    : MAX_CAPTURE_CACHE_BYTES
  cacheMaxBytes = clamped
  while (cachedTotalBytes > cacheMaxBytes && captureCache.size > 0) {
    const oldestKey = captureCache.keys().next().value as string | undefined
    if (oldestKey === undefined) break
    const oldest = captureCache.get(oldestKey)
    captureCache.delete(oldestKey)
    if (oldest) {
      cachedTotalBytes = Math.max(0, cachedTotalBytes - oldest.byteSize)
    }
  }
}
