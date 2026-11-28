import type {
  ScreenshotAccessibilityFallback,
  ScreenshotManagedResource,
  ScreenshotOverlayCommand,
  ScreenshotOverlayCommandResponse,
  ScreenshotOverlayOptions,
  ScreenshotOverlayState,
  ScreenshotRect,
  ScreenshotSafeAreaInsets,
  ScreenshotSelectionSource,
  ScreenshotSessionPhase,
  ScreenshotSessionResult,
  ScreenshotSessionStartResponse
} from '@talex-touch/utils/transport/events/screenshot-session'
import { SCREENSHOT_EDIT_MAX_PNG_BYTES } from '@talex-touch/utils/transport/events/screenshot-session'
import type {
  NativeScreenshotCaptureRequest,
  NativeScreenshotCaptureResult,
  NativeScreenshotDisplay,
  NativeScreenshotSupport
} from '@talex-touch/utils/transport/events/types'
import { randomUUID } from 'node:crypto'

export type ScreenshotSessionEntrypoint = 'shortcut' | 'tray' | 'system-action' | 'plugin' | 'demo'

export interface ScreenshotSessionStartOptions {
  entrypoint: ScreenshotSessionEntrypoint
  ownerKey: string
  completionMode: 'editor' | 'return-resource'
  delayMs: 0 | 3000 | 5000
  initialTarget: 'free-region' | 'display' | 'window' | 'ui-element'
  signal?: AbortSignal
}

export interface ScreenshotSessionNativeCandidate {
  kind: 'window' | 'ui-element'
  bounds: ScreenshotRect
  generation: string
  targetId: string
  role?: string
}

export interface ScreenshotSessionHitResult {
  /** Native chain, deepest first: the UI element when resolved, then its window. */
  candidates: ScreenshotSessionNativeCandidate[]
  fallback?: ScreenshotAccessibilityFallback
}

interface ScreenshotEffects {
  border?: boolean
  shadow?: boolean
  cornerRadius?: number
}

export interface ScreenshotSessionCaptureService {
  getSupport(): NativeScreenshotSupport
  getFeatures(): string[]
  listDisplays(): NativeScreenshotDisplay[]
  capture(request?: NativeScreenshotCaptureRequest): Promise<NativeScreenshotCaptureResult>
  hitTestCandidates(
    point: { x: number; y: number },
    granularity: 'window' | 'ui-element'
  ): Promise<ScreenshotSessionHitResult>
  captureCandidate(
    candidate: ScreenshotSessionNativeCandidate
  ): Promise<NativeScreenshotCaptureResult>
  composeFrozenRegion(
    sources: Array<{
      display: NativeScreenshotDisplay
      resource: NativeScreenshotCaptureResult
    }>,
    region: ScreenshotRect,
    effects?: ScreenshotEffects
  ): Promise<NativeScreenshotCaptureResult>
  applyEffects(
    resource: NativeScreenshotCaptureResult,
    effects: ScreenshotEffects
  ): Promise<NativeScreenshotCaptureResult>
  grantCaptureReadback(tfileUrl: string): Promise<string>
  storeEditedCapture(
    source: NativeScreenshotCaptureResult,
    png: Uint8Array
  ): Promise<NativeScreenshotCaptureResult>
  writeCaptureResourceToClipboard(tfileUrl: string): Promise<boolean>
  releaseTempArtifact(tfileUrl: string): Promise<boolean>
}

export interface ScreenshotSessionWindowHandle {
  webContentsId: number
  displayId: string | null
  load(): Promise<void>
  show(): void
  focus(): void
  destroy(): void
  isDestroyed(): boolean
  onClosed(listener: () => void): () => void
}

export interface ScreenshotSessionWindowFactory {
  createOverlay(input: {
    sessionId: string
    display: NativeScreenshotDisplay
    frozenResource: NativeScreenshotCaptureResult
  }): ScreenshotSessionWindowHandle
}

interface ScreenshotWindowBinding {
  sessionId: string
  displayId: string | null
}

/** Hover result of the latest pointer request, kept with its full native chain in main. */
interface HoverCandidate {
  sequence: number
  chain: ScreenshotSessionNativeCandidate[]
  level: number
  fallback?: ScreenshotAccessibilityFallback
}

/** What the selection means. A native target survives only until the selection is edited. */
interface SelectionTarget {
  source: ScreenshotSelectionSource
  native?: ScreenshotSessionNativeCandidate
}

/**
 * Inline annotation state. `source` is the immutable image the overlay draws on; `edited` is the
 * overlay's committed PNG for `revision`, and `output` is that PNG with effects applied.
 */
interface SessionEdit {
  id: string
  displayId: string
  bounds: ScreenshotRect
  source: NativeScreenshotCaptureResult
  sourceUrl: string
  revision?: number
  edited?: NativeScreenshotCaptureResult
  output?: NativeScreenshotCaptureResult
}

interface ActiveSession {
  id: string
  ownerKey: string
  entrypoint: ScreenshotSessionEntrypoint
  completionMode: 'editor' | 'return-resource'
  initialTarget: ScreenshotSessionStartOptions['initialTarget']
  phase: ScreenshotSessionPhase
  mode: 'frozen' | 'live'
  targetMode: 'free-region' | 'object'
  displays: NativeScreenshotDisplay[]
  frozenResources: Map<string, NativeScreenshotCaptureResult>
  windows: ScreenshotSessionWindowHandle[]
  closeDisposers: Map<number, () => void>
  selection?: ScreenshotRect
  target: SelectionTarget
  hover?: HoverCandidate
  hitTestError?: string
  pointerSequence: number
  options: ScreenshotOverlayOptions
  /** Cached output of the un-edited selection, invalidated by any selection/option change. */
  output?: NativeScreenshotCaptureResult
  edit?: SessionEdit
  /** Managed resources this session produced beyond the frozen frames; released unless returned. */
  artifacts: Set<string>
  result: Promise<ScreenshotSessionResult>
  resolveResult: (result: ScreenshotSessionResult) => void
  terminal: boolean
  signalCleanup?: () => void
}

interface CompletedSession {
  ownerKey: string
  result: ScreenshotSessionResult
}

type OutputResolution = { resource: NativeScreenshotCaptureResult } | { reason: string }

export interface ScreenshotSessionManagerOptions {
  service: ScreenshotSessionCaptureService
  windowFactory: ScreenshotSessionWindowFactory
  saveResource?: (
    resource: NativeScreenshotCaptureResult,
    parentWebContentsId?: number
  ) => Promise<boolean>
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>
  createSessionId?: () => string
  getSafeAreaInsets?: (display: NativeScreenshotDisplay) => ScreenshotSafeAreaInsets
}

const MAX_COMPLETED_SESSIONS = 16

function codedError(message: string, code: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string }
  error.code = code
  return error
}

function defaultSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return Promise.resolve()
  if (signal?.aborted) {
    return Promise.reject(
      codedError('Screenshot session was cancelled', 'SCREENSHOT_SESSION_CANCELLED')
    )
  }
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  const timer = setTimeout(resolve, delayMs)
  signal?.addEventListener(
    'abort',
    () => {
      clearTimeout(timer)
      reject(codedError('Screenshot session was cancelled', 'SCREENSHOT_SESSION_CANCELLED'))
    },
    { once: true }
  )
  return promise
}

function validSelection(value: ScreenshotRect): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.width) &&
    Number.isFinite(value.height) &&
    value.width >= 1 &&
    value.height >= 1
  )
}

function intersectsDisplay(selection: ScreenshotRect, display: NativeScreenshotDisplay): boolean {
  return (
    selection.x < display.x + display.width &&
    selection.x + selection.width > display.x &&
    selection.y < display.y + display.height &&
    selection.y + selection.height > display.y
  )
}

function isSequence(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function desktopBounds(displays: NativeScreenshotDisplay[]): ScreenshotRect {
  const left = Math.min(...displays.map((display) => display.x))
  const top = Math.min(...displays.map((display) => display.y))
  const right = Math.max(...displays.map((display) => display.x + display.width))
  const bottom = Math.max(...displays.map((display) => display.y + display.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function normalizeSafeAreaInsets(
  display: NativeScreenshotDisplay,
  resolve: (display: NativeScreenshotDisplay) => ScreenshotSafeAreaInsets
): ScreenshotSafeAreaInsets {
  let value: ScreenshotSafeAreaInsets
  try {
    value = resolve(display)
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 }
  }
  const finiteInset = (inset: number, maximum: number): number =>
    Number.isFinite(inset) ? Math.min(maximum, Math.max(0, inset)) : 0
  const left = finiteInset(value.left, display.width)
  const top = finiteInset(value.top, display.height)
  return {
    top,
    right: finiteInset(value.right, display.width - left),
    bottom: finiteInset(value.bottom, display.height - top),
    left
  }
}

function managedResource(resource: NativeScreenshotCaptureResult): ScreenshotManagedResource {
  return {
    tfileUrl: resource.tfileUrl,
    mimeType: 'image/png',
    width: resource.width,
    height: resource.height,
    sizeBytes: resource.sizeBytes
  }
}

function sanitizedOptions(
  current: ScreenshotOverlayOptions,
  patch: Partial<ScreenshotOverlayOptions>
): ScreenshotOverlayOptions | null {
  const next = { ...current }
  if (patch.cursor !== undefined) {
    if (typeof patch.cursor !== 'boolean') return null
    next.cursor = patch.cursor
  }
  if (patch.border !== undefined) {
    if (typeof patch.border !== 'boolean') return null
    next.border = patch.border
  }
  if (patch.shadow !== undefined) {
    if (typeof patch.shadow !== 'boolean') return null
    next.shadow = patch.shadow
  }
  if (patch.cornerRadius !== undefined) {
    if (
      !Number.isFinite(patch.cornerRadius) ||
      patch.cornerRadius < 0 ||
      patch.cornerRadius > 128
    ) {
      return null
    }
    next.cornerRadius = patch.cornerRadius
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'aspectRatio')) {
    if (
      patch.aspectRatio !== undefined &&
      (!Number.isFinite(patch.aspectRatio) || patch.aspectRatio <= 0 || patch.aspectRatio > 32)
    ) {
      return null
    }
    next.aspectRatio = patch.aspectRatio
  }
  return next
}

export class ScreenshotSessionManager {
  private readonly service: ScreenshotSessionCaptureService
  private readonly windowFactory: ScreenshotSessionWindowFactory
  private readonly saveResource: NonNullable<ScreenshotSessionManagerOptions['saveResource']>
  private readonly sleep: NonNullable<ScreenshotSessionManagerOptions['sleep']>
  private readonly createSessionId: NonNullable<ScreenshotSessionManagerOptions['createSessionId']>
  private readonly getSafeAreaInsets: NonNullable<
    ScreenshotSessionManagerOptions['getSafeAreaInsets']
  >
  private readonly bindings = new Map<number, ScreenshotWindowBinding>()
  private readonly completed = new Map<string, CompletedSession>()
  private active: ActiveSession | null = null
  private disposed = false

  constructor(options: ScreenshotSessionManagerOptions) {
    this.service = options.service
    this.windowFactory = options.windowFactory
    this.saveResource = options.saveResource ?? (async () => false)
    this.sleep = options.sleep ?? defaultSleep
    this.createSessionId = options.createSessionId ?? (() => `screenshot-session:${randomUUID()}`)
    this.getSafeAreaInsets =
      options.getSafeAreaInsets ?? (() => ({ top: 0, right: 0, bottom: 0, left: 0 }))
  }

  async start(options: ScreenshotSessionStartOptions): Promise<ScreenshotSessionStartResponse> {
    if (this.disposed) {
      throw codedError('Screenshot session manager is disposed', 'SCREENSHOT_SESSION_DISPOSED')
    }
    if (this.active) {
      this.focusActiveWindow(this.active)
      return { accepted: true, sessionId: this.active.id, state: 'existing' }
    }
    if (!this.service.getSupport().supported) {
      throw codedError('Screenshot capability is unavailable', 'SCREENSHOT_SESSION_UNAVAILABLE')
    }
    if (!options.ownerKey.trim()) {
      throw codedError('Screenshot session owner is invalid', 'SCREENSHOT_SESSION_OWNER_INVALID')
    }

    const { promise: result, resolve: resolveResult } =
      Promise.withResolvers<ScreenshotSessionResult>()
    const session: ActiveSession = {
      id: this.createSessionId(),
      ownerKey: options.ownerKey,
      entrypoint: options.entrypoint,
      completionMode: options.completionMode,
      initialTarget: options.initialTarget,
      phase: 'preparing',
      mode: 'frozen',
      targetMode:
        options.initialTarget === 'window' || options.initialTarget === 'ui-element'
          ? 'object'
          : 'free-region',
      displays: [],
      frozenResources: new Map(),
      windows: [],
      closeDisposers: new Map(),
      target: { source: 'region' },
      pointerSequence: 0,
      options: { cursor: false, cornerRadius: 0, border: false, shadow: false },
      artifacts: new Set(),
      result,
      resolveResult,
      terminal: false
    }
    this.active = session

    if (options.signal) {
      const handleAbort = (): void => {
        this.cancel(session.id, 'caller-aborted')
      }
      options.signal.addEventListener('abort', handleAbort, { once: true })
      session.signalCleanup = () => options.signal?.removeEventListener('abort', handleAbort)
    }

    try {
      await this.sleep(options.delayMs, options.signal)
      this.assertActive(session)
      const displays = this.service.listDisplays()
      if (displays.length === 0) {
        throw codedError('No screenshot display is available', 'SCREENSHOT_SESSION_NO_DISPLAY')
      }
      session.displays = displays.map((display) => ({ ...display }))
      for (const display of session.displays) {
        this.assertActive(session)
        const frozen = await this.service.capture({
          target: 'display',
          displayId: display.id,
          writeClipboard: false
        })
        if (this.active !== session || session.terminal) {
          void this.service.releaseTempArtifact(frozen.tfileUrl).catch(() => false)
          this.assertActive(session)
        }
        session.frozenResources.set(display.id, frozen)
      }
      for (const display of session.displays) {
        this.assertActive(session)
        const frozenResource = session.frozenResources.get(display.id)
        if (!frozenResource) {
          throw codedError(
            'Frozen screenshot resource is unavailable',
            'SCREENSHOT_SESSION_FROZEN_RESOURCE_MISSING'
          )
        }
        const window = this.windowFactory.createOverlay({
          sessionId: session.id,
          display,
          frozenResource
        })
        this.attachWindow(session, window, display.id)
        await window.load()
      }
      this.assertActive(session)
      session.phase = 'selecting'
      for (const window of session.windows) window.show()
      this.focusActiveWindow(session)
      return { accepted: true, sessionId: session.id, state: 'started' }
    } catch (error) {
      if (!session.terminal) {
        const failed: ScreenshotSessionResult = {
          status: 'failed',
          sessionId: session.id,
          code:
            error && typeof error === 'object' && 'code' in error
              ? String(error.code)
              : 'SCREENSHOT_SESSION_START_FAILED'
        }
        this.finishSession(session, failed)
      }
      throw codedError('SCREENSHOT_SESSION_START_FAILED', 'SCREENSHOT_SESSION_START_FAILED')
    }
  }

  getActiveSessionId(): string | null {
    return this.active?.id ?? null
  }

  getOverlayStates(sessionId: string): Array<{
    webContentsId: number
    state: ScreenshotOverlayState
  }> {
    const states: Array<{ webContentsId: number; state: ScreenshotOverlayState }> = []
    for (const [webContentsId, binding] of this.bindings) {
      if (binding.sessionId !== sessionId) continue
      const state = this.getOverlayState(sessionId, webContentsId)
      if (state) states.push({ webContentsId, state })
    }
    return states
  }

  getOverlayStateForSender(webContentsId: number): ScreenshotOverlayState | null {
    const binding = this.bindings.get(webContentsId)
    return binding ? this.getOverlayState(binding.sessionId, webContentsId) : null
  }

  getOverlayState(sessionId: string, webContentsId: number): ScreenshotOverlayState | null {
    const session = this.authorizedSession(sessionId, webContentsId)
    if (!session) return null
    const binding = this.bindings.get(webContentsId)
    const display = session.displays.find((item) => item.id === binding?.displayId)
    const frozen = display ? session.frozenResources.get(display.id) : undefined
    if (!display || !frozen) return null
    const features = new Set(this.service.getFeatures())
    const hovered = session.hover?.chain[session.hover.level]
    const edit = session.edit
    return {
      sessionId: session.id,
      phase: session.phase,
      mode: session.mode,
      targetMode: session.targetMode,
      display: {
        id: display.id,
        bounds: { x: display.x, y: display.y, width: display.width, height: display.height },
        scaleFactor: display.scaleFactor,
        rotation:
          display.rotation === 90 || display.rotation === 180 || display.rotation === 270
            ? display.rotation
            : 0,
        frozenTfileUrl: frozen.tfileUrl
      },
      safeAreaInsets: normalizeSafeAreaInsets(display, this.getSafeAreaInsets),
      desktopBounds: desktopBounds(session.displays),
      selection: session.selection ? { ...session.selection } : undefined,
      selectionTarget: session.selection
        ? {
            source: session.target.source,
            ...(session.target.native?.role ? { role: session.target.native.role } : {})
          }
        : undefined,
      candidate:
        session.hover && hovered
          ? {
              sequence: session.hover.sequence,
              kind: hovered.kind,
              bounds: { ...hovered.bounds },
              ...(hovered.role ? { role: hovered.role } : {}),
              level: session.hover.level,
              levels: session.hover.chain.length,
              ...(session.hover.fallback ? { fallback: session.hover.fallback } : {})
            }
          : undefined,
      hitTestError: session.hitTestError,
      edit: edit
        ? {
            editId: edit.id,
            displayId: edit.displayId,
            sourceUrl: edit.sourceUrl,
            width: edit.source.width,
            height: edit.source.height,
            bounds: { ...edit.bounds },
            committedRevision: edit.revision
          }
        : undefined,
      options: { ...session.options },
      capabilities: this.capabilities(features)
    }
  }

  async command(
    sessionId: string,
    webContentsId: number,
    command: ScreenshotOverlayCommand
  ): Promise<ScreenshotOverlayCommandResponse> {
    const session = this.authorizedSession(sessionId, webContentsId)
    if (!session) return { accepted: false, reason: 'sender-not-authorized' }
    switch (command.type) {
      case 'cancel':
        this.cancel(session.id, 'caller-cancelled')
        return { accepted: true }
      case 'set-mode':
        if (session.phase !== 'selecting') return { accepted: false, reason: 'session-busy' }
        session.mode = command.mode
        this.invalidateOutput(session)
        return { accepted: true }
      case 'set-target-mode':
        if (session.phase !== 'selecting') return { accepted: false, reason: 'session-busy' }
        session.targetMode = command.targetMode
        session.hover = undefined
        session.hitTestError = undefined
        this.invalidateOutput(session)
        return { accepted: true }
      case 'set-selection':
        if (
          session.phase !== 'selecting' ||
          !validSelection(command.selection) ||
          !session.displays.some((display) => intersectsDisplay(command.selection, display))
        ) {
          return { accepted: false, reason: 'invalid-selection' }
        }
        session.selection = {
          x: command.selection.x,
          y: command.selection.y,
          width: command.selection.width,
          height: command.selection.height
        }
        session.target = { source: command.source === 'grid' ? 'grid' : 'region' }
        session.hover = undefined
        this.invalidateOutput(session)
        return { accepted: true }
      case 'clear-selection':
        if (session.phase !== 'selecting') return { accepted: false, reason: 'session-busy' }
        session.selection = undefined
        session.target = { source: 'region' }
        session.hover = undefined
        this.invalidateOutput(session)
        return { accepted: true }
      case 'set-options': {
        if (session.phase !== 'selecting' && session.phase !== 'editing') {
          return { accepted: false, reason: 'session-busy' }
        }
        if (session.phase === 'editing' && command.options.cursor !== undefined) {
          return { accepted: false, reason: 'session-busy' }
        }
        const options = sanitizedOptions(session.options, command.options)
        if (!options) return { accepted: false, reason: 'invalid-options' }
        session.options = options
        this.invalidateOutput(session)
        return { accepted: true }
      }
      case 'pointer':
        return await this.hitTest(session, command.point, command.sequence)
      case 'set-candidate-level': {
        const hover = session.hover
        if (
          session.phase !== 'selecting' ||
          !hover ||
          hover.sequence !== command.sequence ||
          !Number.isInteger(command.level) ||
          command.level < 0 ||
          command.level >= hover.chain.length
        ) {
          return { accepted: false, reason: 'stale-candidate' }
        }
        hover.level = command.level
        return { accepted: true }
      }
      case 'lock-candidate':
        return this.lockCandidate(session, command.sequence)
      case 'begin-edit':
        return await this.beginEdit(session)
      case 'end-edit':
        if (session.phase !== 'editing' || !session.edit) {
          return { accepted: false, reason: 'session-busy' }
        }
        this.discardEdit(session)
        session.phase = 'selecting'
        return { accepted: true }
      case 'commit-edit':
        return await this.commitEdit(session, command.editId, command.revision, command.png)
      case 'copy':
        return await this.outputFromOverlay(session, 'copy', command.revision, webContentsId)
      case 'save':
        return await this.outputFromOverlay(session, 'save', command.revision, webContentsId)
      case 'confirm':
        return await this.outputFromOverlay(session, 'complete', command.revision, webContentsId)
      default:
        return { accepted: false, reason: 'invalid-command' }
    }
  }

  waitForResult(sessionId: string, ownerKey: string): Promise<ScreenshotSessionResult> {
    if (this.active?.id === sessionId) {
      if (this.active.ownerKey !== ownerKey) {
        return Promise.reject(
          codedError('Screenshot session owner mismatch', 'SCREENSHOT_SESSION_OWNER_MISMATCH')
        )
      }
      return this.active.result
    }
    const completed = this.completed.get(sessionId)
    if (!completed || completed.ownerKey !== ownerKey) {
      return Promise.reject(
        codedError('Screenshot session owner mismatch', 'SCREENSHOT_SESSION_OWNER_MISMATCH')
      )
    }
    return Promise.resolve(completed.result)
  }

  cancel(sessionId: string, reason = 'caller-cancelled'): boolean {
    const session = this.active
    if (!session || session.id !== sessionId || session.terminal) return false
    this.finishSession(session, { status: 'canceled', sessionId: session.id, reason })
    return true
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    if (this.active) this.cancel(this.active.id, 'manager-disposed')
  }

  /**
   * Latest-wins hit testing: a result is applied only while its sequence is still the newest
   * pointer request and nothing has been locked meanwhile, so a slow response can never replace
   * a newer candidate or a chosen selection.
   */
  private async hitTest(
    session: ActiveSession,
    point: { x: number; y: number },
    sequence?: number
  ): Promise<ScreenshotOverlayCommandResponse> {
    if (session.phase !== 'selecting' || session.targetMode !== 'object' || session.selection) {
      return { accepted: false, reason: 'object-selection-inactive' }
    }
    const effectiveSequence = isSequence(sequence) ? sequence : ++session.pointerSequence
    if (
      effectiveSequence < session.pointerSequence ||
      !Number.isFinite(point?.x) ||
      !Number.isFinite(point?.y)
    ) {
      return { accepted: false, reason: 'stale-pointer' }
    }
    session.pointerSequence = effectiveSequence
    const granularity = this.service.getFeatures().includes('ui-element-hit-test')
      ? 'ui-element'
      : 'window'
    let hit: ScreenshotSessionHitResult | null = null
    try {
      if (typeof this.service.hitTestCandidates === 'function') {
        hit = await this.service.hitTestCandidates({ x: point.x, y: point.y }, granularity)
      } else {
        const legacyService = this.service as {
          hitTestCandidate?: (
            pt: { x: number; y: number },
            g: 'window' | 'ui-element'
          ) => Promise<ScreenshotSessionNativeCandidate | null>
        }
        if (typeof legacyService.hitTestCandidate === 'function') {
          const candidate = await legacyService.hitTestCandidate(
            { x: point.x, y: point.y },
            granularity
          )
          hit = candidate ? { candidates: [candidate] } : null
        }
      }
    } catch {
      hit = null
    }
    if (
      this.active !== session ||
      session.terminal ||
      session.phase !== 'selecting' ||
      session.selection ||
      session.targetMode !== 'object' ||
      session.pointerSequence !== effectiveSequence
    ) {
      return { accepted: false, reason: 'superseded' }
    }
    if (!hit) {
      session.hover = undefined
      session.hitTestError = 'hit-test-failed'
      return { accepted: true }
    }
    session.hitTestError = undefined
    session.hover =
      hit.candidates.length > 0
        ? { sequence: effectiveSequence, chain: hit.candidates, level: 0, fallback: hit.fallback }
        : undefined
    return { accepted: true }
  }

  private lockCandidate(
    session: ActiveSession,
    sequence: number
  ): ScreenshotOverlayCommandResponse {
    const hover = session.hover
    if (session.phase !== 'selecting' || !hover || hover.sequence !== sequence) {
      return { accepted: false, reason: 'stale-candidate' }
    }
    const candidate = hover.chain[hover.level]
    if (
      !candidate ||
      !validSelection(candidate.bounds) ||
      !session.displays.some((display) => intersectsDisplay(candidate.bounds, display))
    ) {
      return { accepted: false, reason: 'invalid-selection' }
    }
    session.selection = { ...candidate.bounds }
    session.target = { source: candidate.kind, native: candidate }
    session.hover = undefined
    this.invalidateOutput(session)
    return { accepted: true }
  }

  private async beginEdit(session: ActiveSession): Promise<ScreenshotOverlayCommandResponse> {
    if (session.phase !== 'selecting') return { accepted: false, reason: 'session-busy' }
    const selection = session.selection
    if (!selection) return { accepted: false, reason: 'selection-required' }
    const displays = session.displays.filter((display) => intersectsDisplay(selection, display))
    if (displays.length !== 1) return { accepted: false, reason: 'edit-spans-displays' }
    session.phase = 'confirming'
    let source: NativeScreenshotCaptureResult | null = null
    try {
      source = await this.materialize(session, false)
      const sourceUrl = await this.service.grantCaptureReadback(source.tfileUrl)
      this.assertActive(session)
      session.edit = {
        id: randomUUID(),
        displayId: displays[0].id,
        bounds: { ...selection },
        source,
        sourceUrl
      }
      session.phase = 'editing'
      return { accepted: true }
    } catch {
      if (source) this.discardOrRelease(session, source)
      if (this.active === session && !session.terminal) session.phase = 'selecting'
      return { accepted: false, reason: 'capture-failed' }
    }
  }

  /**
   * Accepts the overlay's rendered PNG for one document revision. Revisions only move forward:
   * a late commit of an older revision is rejected and can never replace newer edits.
   */
  private async commitEdit(
    session: ActiveSession,
    editId: string,
    revision: number,
    png: Uint8Array
  ): Promise<ScreenshotOverlayCommandResponse> {
    const edit = session.edit
    if (session.phase !== 'editing' || !edit || edit.id !== editId) {
      return { accepted: false, reason: 'edit-not-active' }
    }
    if (!Number.isSafeInteger(revision) || revision < 0 || revision <= (edit.revision ?? -1)) {
      return { accepted: false, reason: 'stale-revision' }
    }
    if (
      !(png instanceof Uint8Array) ||
      png.byteLength === 0 ||
      png.byteLength > SCREENSHOT_EDIT_MAX_PNG_BYTES
    ) {
      return { accepted: false, reason: 'edit-invalid' }
    }
    let stored: NativeScreenshotCaptureResult
    try {
      stored = await this.service.storeEditedCapture(edit.source, png)
    } catch {
      return { accepted: false, reason: 'edit-invalid' }
    }
    session.artifacts.add(stored.tfileUrl)
    if (
      this.active !== session ||
      session.terminal ||
      session.edit !== edit ||
      revision <= (edit.revision ?? -1)
    ) {
      this.discard(session, stored)
      return { accepted: false, reason: 'stale-revision' }
    }
    if (edit.output && edit.output !== edit.edited) this.discard(session, edit.output)
    if (edit.edited) this.discard(session, edit.edited)
    edit.revision = revision
    edit.edited = stored
    edit.output = undefined
    return { accepted: true }
  }

  private async outputFromOverlay(
    session: ActiveSession,
    action: 'copy' | 'save' | 'complete',
    revision: number | undefined,
    webContentsId: number
  ): Promise<ScreenshotOverlayCommandResponse> {
    const resolution = await this.resolveOutput(session, revision)
    if ('reason' in resolution) return { accepted: false, reason: resolution.reason }
    const resource = resolution.resource
    if (this.active !== session || session.terminal) {
      return { accepted: false, reason: 'session-busy' }
    }
    const previousPhase = session.phase
    if (action === 'save' || action === 'copy') {
      session.phase = 'confirming'
    }
    try {
      if (action === 'copy') {
        return (await this.service.writeCaptureResourceToClipboard(resource.tfileUrl))
          ? { accepted: true }
          : { accepted: false, reason: 'clipboard-write-failed' }
      }
      if (action === 'save') {
        return (await this.saveResource(resource, webContentsId))
          ? { accepted: true }
          : { accepted: false, reason: 'save-cancelled' }
      }
      this.complete(session, resource)
      return { accepted: true }
    } catch {
      return { accepted: false, reason: `${action}-failed` }
    } finally {
      if (
        (action === 'save' || action === 'copy') &&
        this.active === session &&
        !session.terminal &&
        session.phase === 'confirming'
      ) {
        session.phase = previousPhase
      }
    }
  }

  /**
   * While editing, every output is the committed PNG of exactly `revision` (plus effects); the
   * unedited source is never substituted. Otherwise the selection is materialized once and cached.
   */
  private async resolveOutput(
    session: ActiveSession,
    revision: number | undefined
  ): Promise<OutputResolution> {
    if (session.phase === 'editing') {
      const edit = session.edit
      if (!edit?.edited || revision === undefined || revision !== edit.revision) {
        return { reason: 'revision-mismatch' }
      }
      if (edit.output) return { resource: edit.output }
      session.phase = 'confirming'
      let output: NativeScreenshotCaptureResult | null = null
      try {
        output = await this.service.applyEffects(edit.edited, this.effects(session))
        if (output !== edit.edited) session.artifacts.add(output.tfileUrl)
        this.assertActive(session)
        edit.output = output
        session.phase = 'editing'
        return { resource: output }
      } catch {
        if (output && output !== edit.edited) {
          this.discardOrRelease(session, output)
        }
        if (this.active === session && !session.terminal) session.phase = 'editing'
        return { reason: 'capture-failed' }
      }
    }
    if (session.phase !== 'selecting') return { reason: 'session-busy' }
    if (session.output) return { resource: session.output }
    if (!session.selection && !session.hover) return { reason: 'selection-required' }
    session.phase = 'confirming'
    let output: NativeScreenshotCaptureResult | null = null
    try {
      output = await this.materialize(session, true)
      this.assertActive(session)
      session.output = output
      session.phase = 'selecting'
      return { resource: output }
    } catch {
      if (output) {
        this.discardOrRelease(session, output)
      }
      if (this.active === session && !session.terminal) session.phase = 'selecting'
      return { reason: 'capture-failed' }
    }
  }

  /**
   * Produces the selection image. Frozen mode always crops the frozen frame, so the output is the
   * frame the user saw; live mode captures now, through the native target when one is locked.
   */
  private async materialize(
    session: ActiveSession,
    withEffects: boolean
  ): Promise<NativeScreenshotCaptureResult> {
    const hovered = session.selection ? undefined : session.hover?.chain[session.hover.level]
    const region = session.selection ?? hovered?.bounds
    if (!region) throw codedError('Selection is required', 'SCREENSHOT_SESSION_SELECTION_REQUIRED')
    const native = session.selection ? session.target.native : hovered
    const effects = withEffects ? this.effects(session) : {}
    if (native && session.targetMode === 'object') {
      const captured = await this.service.captureCandidate(native)
      session.artifacts.add(captured.tfileUrl)
      return captured
    }
    if (session.mode === 'frozen' && !session.options.cursor) {
      const composed = await this.service.composeFrozenRegion(
        session.displays.map((display) => ({
          display,
          resource: session.frozenResources.get(display.id)!
        })),
        region,
        effects
      )
      session.artifacts.add(composed.tfileUrl)
      return composed
    }
    const captured = native
      ? await this.service.captureCandidate(native)
      : await this.service.capture({
          target: 'region',
          region,
          cursor: session.options.cursor ? 'system' : 'hidden',
          writeClipboard: false
        })
    session.artifacts.add(captured.tfileUrl)
    const hasEffects = Boolean(
      effects.border || effects.shadow || (effects.cornerRadius && effects.cornerRadius > 0)
    )
    if (!withEffects || !hasEffects) return captured
    if (typeof this.service.applyEffects !== 'function') return captured
    const output = await this.service.applyEffects(captured, effects)
    if (output !== captured) {
      session.artifacts.add(output.tfileUrl)
      this.discard(session, captured)
    }
    return output
  }

  private effects(session: ActiveSession): ScreenshotEffects {
    return {
      border: session.options.border,
      shadow: session.options.shadow,
      cornerRadius: session.options.cornerRadius
    }
  }

  private invalidateOutput(session: ActiveSession): void {
    if (session.output) this.discard(session, session.output)
    session.output = undefined
    const edit = session.edit
    if (edit?.output) {
      if (edit.output !== edit.edited) this.discard(session, edit.output)
      edit.output = undefined
    }
  }

  private discardEdit(session: ActiveSession): void {
    const edit = session.edit
    if (!edit) return
    session.edit = undefined
    for (const resource of [edit.output, edit.edited, edit.source]) {
      if (resource) this.discard(session, resource)
    }
  }

  private discard(session: ActiveSession, resource: NativeScreenshotCaptureResult): void {
    if (!session.artifacts.delete(resource.tfileUrl)) return
    void this.service.releaseTempArtifact(resource.tfileUrl).catch(() => false)
  }

  private discardOrRelease(session: ActiveSession, resource: NativeScreenshotCaptureResult): void {
    // If cleanupSession already ran while an async capture/effects call was in flight,
    // session.artifacts has already been cleared, so release the late artifact directly.
    if (session.artifacts.delete(resource.tfileUrl) || session.terminal) {
      void this.service.releaseTempArtifact(resource.tfileUrl).catch(() => false)
    }
  }

  private complete(session: ActiveSession, resource: NativeScreenshotCaptureResult): void {
    session.artifacts.delete(resource.tfileUrl)
    this.finishSession(session, {
      status: 'completed',
      sessionId: session.id,
      resource: managedResource(resource)
    })
  }

  private capabilities(features: Set<string>) {
    return {
      window: { available: features.has('window') },
      uiElement: { available: features.has('ui-element-hit-test') },
      annotation: { available: features.has('frozen-compose') },
      longCapture: { available: false, reason: 'not-implemented' },
      recognition: { available: false, reason: 'not-implemented' },
      pin: { available: false, reason: 'not-implemented' }
    }
  }

  private attachWindow(
    session: ActiveSession,
    window: ScreenshotSessionWindowHandle,
    displayId: string
  ): void {
    session.windows.push(window)
    this.bindings.set(window.webContentsId, { sessionId: session.id, displayId })
    session.closeDisposers.set(
      window.webContentsId,
      window.onClosed(() => {
        if (this.active === session && !session.terminal) this.cancel(session.id, 'overlay-closed')
      })
    )
  }

  private assertActive(session: ActiveSession): void {
    if (this.active !== session || session.terminal) {
      throw codedError('Screenshot session is no longer active', 'SCREENSHOT_SESSION_CANCELLED')
    }
  }

  private authorizedSession(sessionId: string, webContentsId: number): ActiveSession | null {
    const session = this.active
    const binding = this.bindings.get(webContentsId)
    if (
      !session ||
      session.terminal ||
      session.id !== sessionId ||
      binding?.sessionId !== sessionId
    ) {
      return null
    }
    return session
  }

  private focusActiveWindow(session: ActiveSession): void {
    const primaryDisplay = session.displays.find((display) => display.isPrimary)
    const preferred =
      session.windows.find((window) => window.displayId === primaryDisplay?.id) ??
      session.windows[0]
    if (preferred && !preferred.isDestroyed()) preferred.focus()
  }

  private finishSession(session: ActiveSession, result: ScreenshotSessionResult): void {
    if (session.terminal) return
    session.terminal = true
    session.phase = 'tearing-down'
    this.cleanupSession(session)
    this.rememberCompleted(session.ownerKey, result)
    session.resolveResult(result)
    if (this.active === session) this.active = null
  }

  private cleanupSession(session: ActiveSession): void {
    session.signalCleanup?.()
    session.signalCleanup = undefined
    for (const dispose of session.closeDisposers.values()) dispose()
    session.closeDisposers.clear()
    for (const window of session.windows) {
      this.bindings.delete(window.webContentsId)
      if (!window.isDestroyed()) window.destroy()
    }
    session.windows = []
    for (const tfileUrl of session.artifacts) {
      void this.service.releaseTempArtifact(tfileUrl).catch(() => false)
    }
    session.artifacts.clear()
    for (const frozen of session.frozenResources.values()) {
      void this.service.releaseTempArtifact(frozen.tfileUrl).catch(() => false)
    }
    session.frozenResources.clear()
  }

  private rememberCompleted(ownerKey: string, result: ScreenshotSessionResult): void {
    this.completed.set(result.sessionId, { ownerKey, result })
    while (this.completed.size > MAX_COMPLETED_SESSIONS) {
      const oldest = this.completed.keys().next().value
      if (typeof oldest !== 'string') break
      this.completed.delete(oldest)
    }
  }
}
