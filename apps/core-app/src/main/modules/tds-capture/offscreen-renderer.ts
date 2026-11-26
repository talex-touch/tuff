import { Buffer } from 'node:buffer'
import type { Session } from 'electron'
import type {
  TdsCaptureFormat,
  TdsCaptureReleaseSessionResponse,
  TdsCaptureRenderRequest,
  TdsCaptureRenderResponse
} from '@talex-touch/utils/transport/sdk/domains/tds-capture'
import { BrowserWindow, session } from 'electron'
import { buildWindowWebPreferences } from '../../core/window-security-profile'
import { createLogger } from '../../utils/logger'

const captureLog = createLogger('TdsCapture')

export const TDS_CAPTURE_PARTITION = 'tds-capture-isolated'
export const TDS_CAPTURE_CSP =
  "default-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src about:; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
export const MAX_CONCURRENT_SLOTS = 2
export const MAX_WAIT_QUEUE_LENGTH = 16
export const IDLE_TTL_MS = 30_000
export const MAX_DIMENSION = 2560
export const MIN_DIMENSION = 64
export const DEFAULT_DIMENSION_WIDTH = 1280
export const DEFAULT_DIMENSION_HEIGHT = 720
export const MAX_SRCDOC_BYTES = 2 * 1024 * 1024
export const MAX_DOM_PROBE_SCRIPT_BYTES = 512 * 1024
export const DEFAULT_TIMEOUT_MS = 8_000
export const MIN_TIMEOUT_MS = 1_000
export const MAX_TIMEOUT_MS = 15_000
export const DEFAULT_SETTLE_MS = 150
export const MIN_SETTLE_MS = 0
export const MAX_SETTLE_MS = 800
export const DEFAULT_JPEG_QUALITY = 85
export const MIN_JPEG_QUALITY = 1
export const MAX_JPEG_QUALITY = 100
export const DEFAULT_PIXEL_RATIO = 1
export const MIN_PIXEL_RATIO = 1
export const MAX_PIXEL_RATIO = 3

export type TdsCaptureTimerHandle = ReturnType<typeof globalThis.setTimeout>

export interface TdsCaptureTimers {
  setTimeout: (callback: () => void, ms: number) => TdsCaptureTimerHandle
  clearTimeout: (handle: TdsCaptureTimerHandle) => void
}

export interface TdsCaptureNativeImageLike {
  toJPEG: (quality: number) => Buffer
  toPNG: () => Buffer
}

export interface TdsCaptureWebContentsLike {
  on(event: 'did-finish-load', listener: () => void): unknown
  on(
    event: 'did-fail-load',
    listener: (
      event: unknown,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame?: boolean
    ) => void
  ): unknown
  on(
    event: 'render-process-gone',
    listener: (event: unknown, details?: { reason?: string }) => void
  ): unknown
  on(
    event: 'will-navigate',
    listener: (event: { preventDefault: () => void }, url: string) => void
  ): unknown
  on(
    event: 'will-redirect',
    listener: (event: { preventDefault: () => void }, url: string) => void
  ): unknown
  removeListener(event: 'did-finish-load', listener: () => void): unknown
  removeListener(
    event: 'did-fail-load',
    listener: (
      event: unknown,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame?: boolean
    ) => void
  ): unknown
  removeListener(
    event: 'render-process-gone',
    listener: (event: unknown, details?: { reason?: string }) => void
  ): unknown
  setWindowOpenHandler?: (handler: (details: { url: string }) => { action: 'deny' }) => void
  setWebRTCIPHandlingPolicy?: (
    policy:
      | 'default'
      | 'default_public_interface_only'
      | 'default_public_and_private_interfaces'
      | 'disable_non_proxied_udp'
  ) => void
  enableDeviceEmulation?: (parameters: {
    screenPosition: 'desktop' | 'mobile'
    screenSize: { width: number; height: number }
    viewPosition: { x: number; y: number }
    deviceScaleFactor: number
    viewSize: { width: number; height: number }
    scale: number
  }) => void
  disableDeviceEmulation?: () => void
  loadURL: (url: string) => Promise<void>
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>
  capturePage: (rect?: {
    x: number
    y: number
    width: number
    height: number
  }) => Promise<TdsCaptureNativeImageLike>
  invalidate?: () => void
  startPainting?: () => void
  stopPainting?: () => void
  isDestroyed: () => boolean
}

export interface TdsCaptureWindowLike {
  webContents: TdsCaptureWebContentsLike
  setContentSize: (width: number, height: number) => void
  isDestroyed: () => boolean
  destroy: () => void
}

export interface TdsCaptureSessionLike {
  webRequest: {
    onBeforeRequest: (
      listener:
        | ((details: { url: string }, callback: (response: { cancel?: boolean }) => void) => void)
        | null
    ) => void
    onHeadersReceived?: (
      listener:
        | ((
            details: { url: string; responseHeaders?: Record<string, string[]> },
            callback: (response: { responseHeaders?: Record<string, string[]> }) => void
          ) => void)
        | null
    ) => void
  }
  setPermissionRequestHandler?: (
    handler:
      | ((webContents: unknown, permission: string, callback: (granted: boolean) => void) => void)
      | null
  ) => void
  setPermissionCheckHandler?: (handler: (() => boolean) | null) => void
  setDevicePermissionHandler?: (handler: (() => boolean) | null) => void
  setDisplayMediaRequestHandler?: (
    handler: ((request: unknown, callback: (streams: Record<string, never>) => void) => void) | null
  ) => void
  on?: (
    event: 'will-download',
    listener: (event: { preventDefault: () => void }) => void
  ) => unknown
  removeListener?: (
    event: 'will-download',
    listener: (event: { preventDefault: () => void }) => void
  ) => unknown
}

export interface TdsCaptureWindowFactoryOptions {
  width: number
  height: number
  pixelRatio: number
  session: TdsCaptureSessionLike
  webPreferences: Electron.WebPreferences
}

export interface TdsOffscreenCaptureOptions {
  maxConcurrentSlots?: number
  maxWaitQueueLength?: number
  idleTtlMs?: number
  sessionFactory?: (partition: string, options: { cache: boolean }) => TdsCaptureSessionLike
  windowFactory?: (options: TdsCaptureWindowFactoryOptions) => TdsCaptureWindowLike
  timers?: TdsCaptureTimers
  now?: () => number
}

interface NormalizedRenderRequest {
  srcdoc: string
  width: number
  height: number
  pixelRatio: number
  format: TdsCaptureFormat
  quality: number
  settleMs: number
  domProbeScript?: string
  sessionKey: string | null
  timeoutMs: number
}

interface PoolSlot {
  id: number
  window: TdsCaptureWindowLike
  busy: boolean
  sessionKey: string | null
  width: number
  height: number
  pixelRatio: number
  idleTimer: TdsCaptureTimerHandle | null
  destroyAfterRun: boolean
  abortActive: ((reason: string) => void) | null
}

interface QueueWaiter {
  width: number
  height: number
  pixelRatio: number
  sessionKey: string | null
  enqueuedAt: number
  timeoutMs: number
  queueTimer: TdsCaptureTimerHandle | null
  resolve: (slot: PoolSlot) => void
  reject: (error: Error) => void
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.round(value)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  if (value < min) return min
  if (value > max) return max
  return value
}

function normalizeFormat(value: unknown): TdsCaptureFormat {
  if (value === 'png' || value === 'none' || value === 'jpeg') return value
  return 'jpeg'
}

function normalizeSessionKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 256) : null
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  return String(error)
}

/**
 * Strict allowlist for offscreen capture requests.
 * Only local inline `data:` and `about:` (non-hierarchical) URLs are allowed.
 * All external/network/local-file schemes (`http:`, `https:`, `ws:`, `wss:`, `ftp:`, `file:`, etc.) are blocked.
 */
export function isAllowedTdsCaptureUrl(rawUrl: unknown): boolean {
  if (typeof rawUrl !== 'string') return false
  const trimmed = rawUrl.trim()
  if (!trimmed) return false
  const colonIndex = trimmed.indexOf(':')
  if (colonIndex <= 0) return false
  const scheme = trimmed.slice(0, colonIndex + 1).toLowerCase()
  const rest = trimmed.slice(colonIndex + 1)
  if (scheme === 'data:') {
    return rest.length > 0 && !rest.startsWith('//')
  }
  if (scheme === 'about:') {
    return rest.length > 0 && !rest.startsWith('//')
  }
  return false
}

export function injectCaptureCsp(srcdoc: string): string {
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${TDS_CAPTURE_CSP}">`
  if (/<head\b[^>]*>/i.test(srcdoc)) {
    return srcdoc.replace(/<head\b[^>]*>/i, (match) => `${match}${cspMeta}`)
  }
  if (/<html\b[^>]*>/i.test(srcdoc)) {
    return srcdoc.replace(/<html\b[^>]*>/i, (match) => `${match}<head>${cspMeta}</head>`)
  }
  if (/<!doctype[^>]*>/i.test(srcdoc)) {
    return srcdoc.replace(/<!doctype[^>]*>/i, (match) => `${match}<head>${cspMeta}</head>`)
  }
  return `<!doctype html><html><head>${cspMeta}</head><body>${srcdoc}</body></html>`
}

/**
 * Locks down the isolated offscreen capture partition so untrusted HTML cannot perform
 * any network requests, WebRTC egress, downloads, or permission escalations.
 */
export function secureTdsCaptureSession(targetSession: TdsCaptureSessionLike): () => void {
  targetSession.setPermissionRequestHandler?.((_webContents, _permission, callback) => {
    callback(false)
  })
  targetSession.setPermissionCheckHandler?.(() => false)
  targetSession.setDevicePermissionHandler?.(() => false)
  targetSession.setDisplayMediaRequestHandler?.((_request, callback) => {
    callback({})
  })
  targetSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedTdsCaptureUrl(details.url) })
  })
  targetSession.webRequest.onHeadersReceived?.((details, callback) => {
    const nextHeaders: Record<string, string[]> = {}
    if (details.responseHeaders) {
      for (const [key, value] of Object.entries(details.responseHeaders)) {
        if (key.toLowerCase() === 'content-security-policy') continue
        nextHeaders[key] = value
      }
    }
    nextHeaders['Content-Security-Policy'] = [TDS_CAPTURE_CSP]
    callback({ responseHeaders: nextHeaders })
  })
  const handleDownload = (event: { preventDefault: () => void }) => {
    event.preventDefault()
  }
  targetSession.on?.('will-download', handleDownload)

  return () => {
    targetSession.removeListener?.('will-download', handleDownload)
    targetSession.webRequest.onBeforeRequest(null)
    targetSession.webRequest.onHeadersReceived?.(null)
  }
}

export function normalizeTdsCaptureRequest(
  request: TdsCaptureRenderRequest
):
  | { ok: true; value: NormalizedRenderRequest }
  | { ok: false; width: number; height: number; error: string } {
  const width = clampInteger(request?.width, MIN_DIMENSION, MAX_DIMENSION, DEFAULT_DIMENSION_WIDTH)
  const height = clampInteger(
    request?.height,
    MIN_DIMENSION,
    MAX_DIMENSION,
    DEFAULT_DIMENSION_HEIGHT
  )
  if (!request || typeof request.srcdoc !== 'string') {
    return { ok: false, width, height, error: 'INVALID_SRCDOC' }
  }
  const srcdocBytes = Buffer.byteLength(request.srcdoc, 'utf8')
  if (srcdocBytes > MAX_SRCDOC_BYTES) {
    return {
      ok: false,
      width,
      height,
      error: `SRCDOC_TOO_LARGE:${srcdocBytes}>${MAX_SRCDOC_BYTES}`
    }
  }
  let domProbeScript: string | undefined
  if (typeof request.domProbeScript === 'string' && request.domProbeScript.trim().length > 0) {
    const scriptBytes = Buffer.byteLength(request.domProbeScript, 'utf8')
    if (scriptBytes > MAX_DOM_PROBE_SCRIPT_BYTES) {
      return {
        ok: false,
        width,
        height,
        error: `DOM_PROBE_SCRIPT_TOO_LARGE:${scriptBytes}>${MAX_DOM_PROBE_SCRIPT_BYTES}`
      }
    }
    domProbeScript = request.domProbeScript
  }

  return {
    ok: true,
    value: {
      srcdoc: request.srcdoc,
      width,
      height,
      pixelRatio: clampFloat(
        request.pixelRatio,
        MIN_PIXEL_RATIO,
        MAX_PIXEL_RATIO,
        DEFAULT_PIXEL_RATIO
      ),
      format: normalizeFormat(request.format),
      quality: clampInteger(
        request.quality,
        MIN_JPEG_QUALITY,
        MAX_JPEG_QUALITY,
        DEFAULT_JPEG_QUALITY
      ),
      settleMs: clampInteger(request.settleMs, MIN_SETTLE_MS, MAX_SETTLE_MS, DEFAULT_SETTLE_MS),
      domProbeScript,
      sessionKey: normalizeSessionKey(request.sessionKey),
      timeoutMs: clampInteger(request.timeoutMs, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
    }
  }
}

function applyWebContentsDeviceScale(
  webContents: TdsCaptureWebContentsLike,
  width: number,
  height: number,
  pixelRatio: number
): boolean {
  if (typeof webContents.enableDeviceEmulation !== 'function') {
    return false
  }
  webContents.enableDeviceEmulation({
    screenPosition: 'desktop',
    screenSize: { width, height },
    viewPosition: { x: 0, y: 0 },
    deviceScaleFactor: pixelRatio,
    viewSize: { width, height },
    scale: 1
  })
  return true
}

function createDefaultCaptureWindow(options: TdsCaptureWindowFactoryOptions): TdsCaptureWindowLike {
  const win = new BrowserWindow({
    width: options.width,
    height: options.height,
    show: false,
    frame: false,
    transparent: false,
    skipTaskbar: true,
    focusable: false,
    enableLargerThanScreen: true,
    webPreferences: options.webPreferences
  })
  win.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')
  applyWebContentsDeviceScale(win.webContents, options.width, options.height, options.pixelRatio)
  return win
}

const defaultTimers: TdsCaptureTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle)
}

export class TdsOffscreenCaptureRenderer {
  private readonly maxConcurrentSlots: number
  private readonly maxWaitQueueLength: number
  private readonly idleTtlMs: number
  private readonly sessionFactory: (
    partition: string,
    options: { cache: boolean }
  ) => TdsCaptureSessionLike
  private readonly windowFactory: (options: TdsCaptureWindowFactoryOptions) => TdsCaptureWindowLike
  private readonly timers: TdsCaptureTimers
  private readonly now: () => number

  private isolatedSession: TdsCaptureSessionLike | null = null
  private sessionDisposer: (() => void) | null = null
  private readonly slots: PoolSlot[] = []
  private readonly waitQueue: QueueWaiter[] = []
  private nextSlotId = 1
  private disposed = false

  constructor(options: TdsOffscreenCaptureOptions = {}) {
    this.maxConcurrentSlots = Math.max(
      1,
      Math.floor(options.maxConcurrentSlots ?? MAX_CONCURRENT_SLOTS)
    )
    this.maxWaitQueueLength = Math.max(
      0,
      Math.floor(options.maxWaitQueueLength ?? MAX_WAIT_QUEUE_LENGTH)
    )
    this.idleTtlMs = Math.max(100, Math.floor(options.idleTtlMs ?? IDLE_TTL_MS))
    this.sessionFactory =
      options.sessionFactory ??
      ((partition, partitionOptions) => session.fromPartition(partition, partitionOptions))
    this.windowFactory = options.windowFactory ?? createDefaultCaptureWindow
    this.timers = options.timers ?? defaultTimers
    this.now = options.now ?? (() => Date.now())
  }

  getActiveSlotCount(): number {
    this.pruneDestroyedSlots()
    return this.slots.length
  }

  getQueueLength(): number {
    return this.waitQueue.length
  }

  async renderFrame(request: TdsCaptureRenderRequest): Promise<TdsCaptureRenderResponse> {
    const startedAt = this.now()
    const normalized = normalizeTdsCaptureRequest(request)
    if (!normalized.ok) {
      return {
        ok: false,
        width: normalized.width,
        height: normalized.height,
        durationMs: Math.max(0, this.now() - startedAt),
        error: normalized.error
      }
    }

    const spec = normalized.value
    if (this.disposed) {
      return {
        ok: false,
        width: spec.width,
        height: spec.height,
        durationMs: Math.max(0, this.now() - startedAt),
        error: 'TDS_CAPTURE_DISPOSED'
      }
    }

    let slot: PoolSlot
    try {
      slot = await this.acquireSlot(spec)
    } catch (error) {
      return {
        ok: false,
        width: spec.width,
        height: spec.height,
        durationMs: Math.max(0, this.now() - startedAt),
        error: formatError(error)
      }
    }

    let keepSlot = true
    try {
      const result = await this.runCaptureInSlot(slot, spec, startedAt)
      if (!result.ok && result.recycleSlot) {
        keepSlot = false
      }
      return result.response
    } catch (error) {
      keepSlot = false
      return {
        ok: false,
        width: spec.width,
        height: spec.height,
        durationMs: Math.max(0, this.now() - startedAt),
        error: formatError(error)
      }
    } finally {
      slot.abortActive = null
      if (this.disposed || !keepSlot || slot.destroyAfterRun || slot.window.isDestroyed()) {
        this.destroySlot(slot)
        this.drainWaitQueue()
      } else {
        this.releaseSlot(slot)
      }
    }
  }

  releaseSession(sessionKey: string): TdsCaptureReleaseSessionResponse {
    const key = normalizeSessionKey(sessionKey)
    if (!key) return { released: false }

    let released = false
    for (const slot of [...this.slots]) {
      if (slot.sessionKey !== key) continue
      released = true
      if (slot.busy) {
        slot.sessionKey = null
        slot.destroyAfterRun = true
      } else {
        this.destroySlot(slot)
      }
    }
    for (let index = this.waitQueue.length - 1; index >= 0; index -= 1) {
      const waiter = this.waitQueue[index]
      if (!waiter || waiter.sessionKey !== key) continue
      released = true
      this.waitQueue.splice(index, 1)
      this.clearWaiterTimer(waiter)
      waiter.reject(new Error('TDS_CAPTURE_SESSION_RELEASED'))
    }
    if (released) {
      this.drainWaitQueue()
    }
    return { released }
  }

  disposeAll(): void {
    if (this.disposed) return
    this.disposed = true

    const waiters = this.waitQueue.splice(0)
    for (const waiter of waiters) {
      this.clearWaiterTimer(waiter)
      waiter.reject(new Error('TDS_CAPTURE_DISPOSED'))
    }

    for (const slot of [...this.slots]) {
      slot.abortActive?.('TDS_CAPTURE_DISPOSED')
      this.destroySlot(slot)
    }

    this.sessionDisposer?.()
    this.sessionDisposer = null
    this.isolatedSession = null
  }

  private clearWaiterTimer(waiter: QueueWaiter): void {
    if (waiter.queueTimer !== null) {
      this.timers.clearTimeout(waiter.queueTimer)
      waiter.queueTimer = null
    }
  }

  private ensureIsolatedSession(): TdsCaptureSessionLike {
    if (!this.isolatedSession) {
      const created = this.sessionFactory(TDS_CAPTURE_PARTITION, { cache: false })
      this.sessionDisposer = secureTdsCaptureSession(created)
      this.isolatedSession = created
    }
    return this.isolatedSession
  }

  private pruneDestroyedSlots(): void {
    for (let index = this.slots.length - 1; index >= 0; index -= 1) {
      const slot = this.slots[index]
      if (!slot || slot.window.isDestroyed()) {
        if (slot?.idleTimer) {
          this.timers.clearTimeout(slot.idleTimer)
          slot.idleTimer = null
        }
        this.slots.splice(index, 1)
      }
    }
  }

  private findIdleSlot(sessionKey: string | null, pixelRatio: number): PoolSlot | null {
    this.pruneDestroyedSlots()
    const isEligible = (slot: PoolSlot): boolean => !slot.busy && !slot.destroyAfterRun
    if (sessionKey) {
      const exactMatch = this.slots.find(
        (slot) =>
          isEligible(slot) && slot.sessionKey === sessionKey && slot.pixelRatio === pixelRatio
      )
      if (exactMatch) return exactMatch
      const matchingSession = this.slots.find(
        (slot) => isEligible(slot) && slot.sessionKey === sessionKey
      )
      if (matchingSession) return matchingSession
    }
    const unpinnedExact = this.slots.find(
      (slot) => isEligible(slot) && slot.sessionKey === null && slot.pixelRatio === pixelRatio
    )
    if (unpinnedExact) return unpinnedExact
    const unpinned = this.slots.find((slot) => isEligible(slot) && slot.sessionKey === null)
    if (unpinned) return unpinned
    const sameDpr = this.slots.find((slot) => isEligible(slot) && slot.pixelRatio === pixelRatio)
    if (sameDpr) return sameDpr
    return this.slots.find((slot) => isEligible(slot)) ?? null
  }

  private prepareSlotForSpec(
    slot: PoolSlot,
    spec: {
      width: number
      height: number
      pixelRatio: number
      sessionKey: string | null
    }
  ): PoolSlot {
    const wc = slot.window.webContents
    const dprChanged = slot.pixelRatio !== spec.pixelRatio
    const canReconfigureDpr = typeof wc.enableDeviceEmulation === 'function'
    if (dprChanged && !canReconfigureDpr) {
      this.destroySlot(slot)
      const replacement = this.createSlot(spec)
      replacement.window.webContents.startPainting?.()
      return replacement
    }

    slot.busy = true
    slot.sessionKey = spec.sessionKey
    slot.window.webContents.startPainting?.()
    return slot
  }

  private createSlot(spec: {
    width: number
    height: number
    pixelRatio: number
    sessionKey: string | null
  }): PoolSlot {
    const isolatedSession = this.ensureIsolatedSession()
    const webPreferences = buildWindowWebPreferences('app', {
      session: isolatedSession as Session,
      offscreen: true,
      backgroundThrottling: false,
      navigateOnDragDrop: false,
      safeDialogs: true
    })
    const window = this.windowFactory({
      width: spec.width,
      height: spec.height,
      pixelRatio: spec.pixelRatio,
      session: isolatedSession,
      webPreferences
    })

    window.webContents.setWebRTCIPHandlingPolicy?.('disable_non_proxied_udp')
    applyWebContentsDeviceScale(window.webContents, spec.width, spec.height, spec.pixelRatio)
    window.webContents.setWindowOpenHandler?.(() => ({ action: 'deny' }))
    const guardNavigation = (event: { preventDefault: () => void }, url: string) => {
      if (!isAllowedTdsCaptureUrl(url)) {
        event.preventDefault()
      }
    }
    window.webContents.on('will-navigate', guardNavigation)
    window.webContents.on('will-redirect', guardNavigation)

    const slot: PoolSlot = {
      id: this.nextSlotId++,
      window,
      busy: true,
      sessionKey: spec.sessionKey,
      width: spec.width,
      height: spec.height,
      pixelRatio: spec.pixelRatio,
      idleTimer: null,
      destroyAfterRun: false,
      abortActive: null
    }
    this.slots.push(slot)
    return slot
  }

  private acquireSlot(spec: {
    width: number
    height: number
    pixelRatio: number
    sessionKey: string | null
    timeoutMs: number
  }): Promise<PoolSlot> {
    const idle = this.findIdleSlot(spec.sessionKey, spec.pixelRatio)
    if (idle) {
      if (idle.idleTimer) {
        this.timers.clearTimeout(idle.idleTimer)
        idle.idleTimer = null
      }
      return Promise.resolve(this.prepareSlotForSpec(idle, spec))
    }

    if (this.slots.length < this.maxConcurrentSlots) {
      const slot = this.createSlot(spec)
      slot.window.webContents.startPainting?.()
      return Promise.resolve(slot)
    }

    if (this.waitQueue.length >= this.maxWaitQueueLength) {
      return Promise.reject(new Error(`TDS_CAPTURE_QUEUE_OVERFLOW:${this.maxWaitQueueLength}`))
    }

    return new Promise<PoolSlot>((resolve, reject) => {
      const waiter: QueueWaiter = {
        width: spec.width,
        height: spec.height,
        pixelRatio: spec.pixelRatio,
        sessionKey: spec.sessionKey,
        enqueuedAt: this.now(),
        timeoutMs: spec.timeoutMs,
        queueTimer: null,
        resolve,
        reject
      }
      waiter.queueTimer = this.timers.setTimeout(() => {
        waiter.queueTimer = null
        const idx = this.waitQueue.indexOf(waiter)
        if (idx >= 0) {
          this.waitQueue.splice(idx, 1)
          waiter.reject(new Error(`TDS_CAPTURE_QUEUE_TIMEOUT:${spec.timeoutMs}ms`))
        }
      }, spec.timeoutMs)
      this.waitQueue.push(waiter)
    })
  }

  private releaseSlot(slot: PoolSlot): void {
    if (this.disposed || slot.window.isDestroyed()) {
      this.destroySlot(slot)
      this.drainWaitQueue()
      return
    }

    const nextWaiter = this.waitQueue.shift()
    if (nextWaiter) {
      this.clearWaiterTimer(nextWaiter)
      try {
        const readySlot = this.prepareSlotForSpec(slot, nextWaiter)
        nextWaiter.resolve(readySlot)
      } catch (error) {
        nextWaiter.reject(error instanceof Error ? error : new Error(String(error)))
        this.drainWaitQueue()
      }
      return
    }

    slot.busy = false
    slot.window.webContents.stopPainting?.()
    if (slot.idleTimer) {
      this.timers.clearTimeout(slot.idleTimer)
    }
    slot.idleTimer = this.timers.setTimeout(() => {
      slot.idleTimer = null
      if (!slot.busy) {
        this.destroySlot(slot)
      }
    }, this.idleTtlMs)
  }

  private drainWaitQueue(): void {
    if (this.disposed) return
    this.pruneDestroyedSlots()
    while (this.waitQueue.length > 0) {
      const next = this.waitQueue[0]
      if (!next) break

      const idle = this.findIdleSlot(next.sessionKey, next.pixelRatio)
      if (idle) {
        this.waitQueue.shift()
        this.clearWaiterTimer(next)
        if (idle.idleTimer) {
          this.timers.clearTimeout(idle.idleTimer)
          idle.idleTimer = null
        }
        try {
          const readySlot = this.prepareSlotForSpec(idle, next)
          next.resolve(readySlot)
        } catch (error) {
          next.reject(error instanceof Error ? error : new Error(String(error)))
        }
        continue
      }

      if (this.slots.length < this.maxConcurrentSlots) {
        this.waitQueue.shift()
        this.clearWaiterTimer(next)
        try {
          const created = this.createSlot(next)
          created.window.webContents.startPainting?.()
          next.resolve(created)
        } catch (error) {
          next.reject(error instanceof Error ? error : new Error(String(error)))
        }
        continue
      }

      break
    }
  }

  private destroySlot(slot: PoolSlot): void {
    if (slot.idleTimer) {
      this.timers.clearTimeout(slot.idleTimer)
      slot.idleTimer = null
    }
    const index = this.slots.indexOf(slot)
    if (index >= 0) {
      this.slots.splice(index, 1)
    }
    try {
      if (!slot.window.isDestroyed()) {
        slot.window.destroy()
      }
    } catch (error) {
      captureLog.warn('Failed to destroy offscreen capture window', {
        error,
        meta: { slotId: slot.id }
      })
    }
  }

  private async runCaptureInSlot(
    slot: PoolSlot,
    spec: NormalizedRenderRequest,
    startedAt: number
  ): Promise<{ ok: boolean; recycleSlot: boolean; response: TdsCaptureRenderResponse }> {
    const wc = slot.window.webContents
    if (slot.window.isDestroyed() || wc.isDestroyed()) {
      return {
        ok: false,
        recycleSlot: true,
        response: {
          ok: false,
          width: spec.width,
          height: spec.height,
          durationMs: Math.max(0, this.now() - startedAt),
          error: 'CAPTURE_WINDOW_DESTROYED'
        }
      }
    }

    if (
      slot.width !== spec.width ||
      slot.height !== spec.height ||
      slot.pixelRatio !== spec.pixelRatio
    ) {
      if (slot.width !== spec.width || slot.height !== spec.height) {
        slot.window.setContentSize(spec.width, spec.height)
        slot.width = spec.width
        slot.height = spec.height
      }
      applyWebContentsDeviceScale(wc, spec.width, spec.height, spec.pixelRatio)
      slot.pixelRatio = spec.pixelRatio
    }

    let aborted = false
    let abortReason = ''
    const cleanupCallbacks: Array<() => void> = []
    let rejectDeadline: ((error: Error) => void) | null = null

    const deadlinePromise = new Promise<never>((_resolve, reject) => {
      rejectDeadline = reject
    })
    const deadlineTimer = this.timers.setTimeout(() => {
      triggerAbort(`TDS_CAPTURE_TIMEOUT:${spec.timeoutMs}ms`)
    }, spec.timeoutMs)

    const triggerAbort = (reason: string) => {
      if (aborted) return
      aborted = true
      abortReason = reason
      this.timers.clearTimeout(deadlineTimer)
      for (const cleanup of cleanupCallbacks.splice(0)) {
        cleanup()
      }
      rejectDeadline?.(new Error(reason))
    }

    slot.abortActive = triggerAbort

    const runPipeline = async (): Promise<TdsCaptureRenderResponse> => {
      const guardedHtml = injectCaptureCsp(spec.srcdoc)
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(guardedHtml)}`
      await new Promise<void>((resolve, reject) => {
        if (aborted) {
          reject(new Error(abortReason || 'TDS_CAPTURE_ABORTED'))
          return
        }
        let settled = false
        const cleanup = () => {
          wc.removeListener('did-finish-load', onFinish)
          wc.removeListener('did-fail-load', onFail)
          wc.removeListener('render-process-gone', onGone)
        }
        const finish = (err?: Error) => {
          if (settled) return
          settled = true
          cleanup()
          if (err) reject(err)
          else resolve()
        }
        const onFinish = () => finish()
        const onFail = (
          _event: unknown,
          errorCode: number,
          errorDescription: string,
          _validatedURL: string,
          isMainFrame?: boolean
        ) => {
          if (isMainFrame === false) return
          finish(new Error(`TDS_CAPTURE_LOAD_FAILED:${errorCode}:${errorDescription}`))
        }
        const onGone = (_event: unknown, details?: { reason?: string }) => {
          finish(new Error(`TDS_CAPTURE_RENDER_GONE:${details?.reason ?? 'unknown'}`))
        }
        cleanupCallbacks.push(() => finish(new Error(abortReason || 'TDS_CAPTURE_ABORTED')))
        wc.on('did-finish-load', onFinish)
        wc.on('did-fail-load', onFail)
        wc.on('render-process-gone', onGone)
        try {
          void Promise.resolve(wc.loadURL(dataUrl)).catch((error) => {
            finish(error instanceof Error ? error : new Error(String(error)))
          })
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)))
        }
      })

      if (spec.settleMs > 0 && !aborted) {
        await new Promise<void>((resolve, reject) => {
          let settled = false
          const settleHandle = this.timers.setTimeout(() => {
            if (settled) return
            settled = true
            resolve()
          }, spec.settleMs)
          cleanupCallbacks.push(() => {
            if (settled) return
            settled = true
            this.timers.clearTimeout(settleHandle)
            reject(new Error(abortReason || 'TDS_CAPTURE_ABORTED'))
          })
        })
      }

      if (aborted) {
        throw new Error(abortReason || 'TDS_CAPTURE_ABORTED')
      }

      let domProbeResult: unknown
      let probeError: string | undefined
      if (spec.domProbeScript) {
        try {
          domProbeResult = await wc.executeJavaScript(spec.domProbeScript, true)
        } catch (error) {
          probeError = formatError(error)
          captureLog.warn('DOM probe script execution failed', {
            error,
            meta: { slotId: slot.id }
          })
        }
      }

      if (aborted) {
        throw new Error(abortReason || 'TDS_CAPTURE_ABORTED')
      }

      let bitmapDataUrl: string | undefined
      if (spec.format !== 'none') {
        wc.invalidate?.()
        const image = await wc.capturePage({
          x: 0,
          y: 0,
          width: spec.width,
          height: spec.height
        })
        if (aborted) {
          throw new Error(abortReason || 'TDS_CAPTURE_ABORTED')
        }
        if (spec.format === 'png') {
          bitmapDataUrl = `data:image/png;base64,${image.toPNG().toString('base64')}`
        } else {
          bitmapDataUrl = `data:image/jpeg;base64,${image.toJPEG(spec.quality).toString('base64')}`
        }
      }

      const durationMs = Math.max(0, this.now() - startedAt)
      if (spec.format === 'none' && probeError) {
        return {
          ok: false,
          width: spec.width,
          height: spec.height,
          durationMs,
          error: `DOM_PROBE_FAILED:${probeError}`
        }
      }

      return {
        ok: true,
        ...(bitmapDataUrl !== undefined ? { bitmapDataUrl } : {}),
        width: spec.width,
        height: spec.height,
        ...(domProbeResult !== undefined ? { domProbeResult } : {}),
        durationMs,
        ...(probeError ? { error: `DOM_PROBE_FAILED:${probeError}` } : {})
      }
    }

    try {
      const response = await Promise.race([runPipeline(), deadlinePromise])
      return { ok: response.ok, recycleSlot: false, response }
    } catch (error) {
      const message = formatError(error)
      return {
        ok: false,
        recycleSlot: true,
        response: {
          ok: false,
          width: spec.width,
          height: spec.height,
          durationMs: Math.max(0, this.now() - startedAt),
          error: message
        }
      }
    } finally {
      this.timers.clearTimeout(deadlineTimer)
      for (const cleanup of cleanupCallbacks.splice(0)) {
        cleanup()
      }
    }
  }
}
