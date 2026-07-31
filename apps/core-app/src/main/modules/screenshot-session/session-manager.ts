import type {
  ScreenshotEditorAction,
  ScreenshotEditorActionResponse,
  ScreenshotEditorState,
  ScreenshotManagedResource,
  ScreenshotOverlayCommand,
  ScreenshotOverlayCommandResponse,
  ScreenshotOverlayOptions,
  ScreenshotOverlayState,
  ScreenshotRect,
  ScreenshotSafeAreaInsets,
  ScreenshotSessionResult,
  ScreenshotSessionStartResponse
} from '@talex-touch/utils/transport/events/screenshot-session'
import type {
  NativeScreenshotCaptureRequest,
  NativeScreenshotCaptureResult,
  NativeScreenshotDisplay,
  NativeScreenshotSupport
} from '@talex-touch/utils/transport/events/types'
import { randomUUID } from 'node:crypto'

export type ScreenshotSessionEntrypoint =
  | 'shortcut'
  | 'tray'
  | 'assistant'
  | 'system-action'
  | 'plugin'
  | 'demo'

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
}

export interface ScreenshotSessionCaptureService {
  getSupport(): NativeScreenshotSupport
  getFeatures(): string[]
  listDisplays(): NativeScreenshotDisplay[]
  capture(request?: NativeScreenshotCaptureRequest): Promise<NativeScreenshotCaptureResult>
  hitTestCandidate(
    point: { x: number; y: number },
    granularity: 'window' | 'ui-element'
  ): Promise<ScreenshotSessionNativeCandidate | null>
  captureCandidate(
    candidate: ScreenshotSessionNativeCandidate
  ): Promise<NativeScreenshotCaptureResult>
  composeFrozenRegion(
    sources: Array<{
      display: NativeScreenshotDisplay
      resource: NativeScreenshotCaptureResult
    }>,
    region: ScreenshotRect,
    effects?: { border?: boolean; shadow?: boolean; cornerRadius?: number }
  ): Promise<NativeScreenshotCaptureResult>
  writeCaptureResourceToClipboard(tfileUrl: string): Promise<boolean>
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
  createEditor(input: {
    sessionId: string
    resource: NativeScreenshotCaptureResult
  }): ScreenshotSessionWindowHandle
}

interface ScreenshotWindowBinding {
  sessionId: string
  surface: 'overlay' | 'editor'
  displayId: string | null
}

interface ActiveSession {
  id: string
  ownerKey: string
  entrypoint: ScreenshotSessionEntrypoint
  completionMode: 'editor' | 'return-resource'
  initialTarget: ScreenshotSessionStartOptions['initialTarget']
  phase: 'preparing' | 'selecting' | 'confirming' | 'editor' | 'tearing-down'
  mode: 'frozen' | 'live'
  targetMode: 'free-region' | 'object'
  displays: NativeScreenshotDisplay[]
  frozenResources: Map<string, NativeScreenshotCaptureResult>
  windows: ScreenshotSessionWindowHandle[]
  closeDisposers: Map<number, () => void>
  selection?: ScreenshotRect
  candidate?: ScreenshotSessionNativeCandidate
  options: ScreenshotOverlayOptions
  finalResource?: NativeScreenshotCaptureResult
  result: Promise<ScreenshotSessionResult>
  resolveResult: (result: ScreenshotSessionResult) => void
  terminal: boolean
  signalCleanup?: () => void
}

interface CompletedSession {
  ownerKey: string
  result: ScreenshotSessionResult
}

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
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(codedError('Screenshot session was cancelled', 'SCREENSHOT_SESSION_CANCELLED'))
      return
    }
    const timer = setTimeout(resolve, delayMs)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(codedError('Screenshot session was cancelled', 'SCREENSHOT_SESSION_CANCELLED'))
      },
      { once: true }
    )
  })
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

    let resolveResult!: (result: ScreenshotSessionResult) => void
    const result = new Promise<ScreenshotSessionResult>((resolve) => {
      resolveResult = resolve
    })
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
      options: { cursor: false, cornerRadius: 0, border: false, shadow: false },
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
        session.frozenResources.set(
          display.id,
          await this.service.capture({
            target: 'display',
            displayId: display.id,
            writeClipboard: false
          })
        )
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
        this.attachWindow(session, window, 'overlay', display.id, 'overlay-closed')
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
      if (binding.sessionId !== sessionId || binding.surface !== 'overlay') continue
      const state = this.getOverlayState(sessionId, webContentsId)
      if (state) states.push({ webContentsId, state })
    }
    return states
  }

  getOverlayStateForSender(webContentsId: number): ScreenshotOverlayState | null {
    const binding = this.bindings.get(webContentsId)
    return binding?.surface === 'overlay'
      ? this.getOverlayState(binding.sessionId, webContentsId)
      : null
  }

  getOverlayState(sessionId: string, webContentsId: number): ScreenshotOverlayState | null {
    const session = this.authorizedSession(sessionId, webContentsId, 'overlay')
    if (!session) return null
    const binding = this.bindings.get(webContentsId)
    const display = session.displays.find((item) => item.id === binding?.displayId)
    const frozen = display ? session.frozenResources.get(display.id) : undefined
    if (!display || !frozen) return null
    const features = new Set(this.service.getFeatures())
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
      candidate: session.candidate
        ? { kind: session.candidate.kind, bounds: { ...session.candidate.bounds } }
        : undefined,
      options: { ...session.options },
      capabilities: this.capabilities(features)
    }
  }

  getEditorStateForSender(webContentsId: number): ScreenshotEditorState | null {
    const binding = this.bindings.get(webContentsId)
    if (!binding || binding.surface !== 'editor') return null
    const session = this.authorizedSession(binding.sessionId, webContentsId, 'editor')
    if (!session?.finalResource) return null
    return {
      sessionId: session.id,
      resource: managedResource(session.finalResource),
      capabilities: this.capabilities(new Set(this.service.getFeatures()))
    }
  }

  async command(
    sessionId: string,
    webContentsId: number,
    command: ScreenshotOverlayCommand
  ): Promise<ScreenshotOverlayCommandResponse> {
    const session = this.authorizedSession(sessionId, webContentsId, 'overlay')
    if (!session) return { accepted: false, reason: 'sender-not-authorized' }
    switch (command.type) {
      case 'cancel':
        this.cancel(session.id, 'caller-cancelled')
        return { accepted: true }
      case 'set-mode':
        if (session.phase !== 'selecting') return { accepted: false, reason: 'session-busy' }
        session.mode = command.mode
        session.finalResource = undefined
        return { accepted: true }
      case 'set-target-mode':
        if (session.phase !== 'selecting') return { accepted: false, reason: 'session-busy' }
        session.targetMode = command.targetMode
        session.candidate = undefined
        session.finalResource = undefined
        return { accepted: true }
      case 'set-selection':
        if (
          session.phase !== 'selecting' ||
          !validSelection(command.selection) ||
          !session.displays.some((display) => intersectsDisplay(command.selection, display))
        ) {
          return { accepted: false, reason: 'invalid-selection' }
        }
        session.selection = { ...command.selection }
        session.finalResource = undefined
        return { accepted: true }
      case 'set-options': {
        if (session.phase !== 'selecting') return { accepted: false, reason: 'session-busy' }
        const options = sanitizedOptions(session.options, command.options)
        if (!options) return { accepted: false, reason: 'invalid-options' }
        session.options = options
        session.finalResource = undefined
        return { accepted: true }
      }
      case 'pointer': {
        if (session.phase !== 'selecting' || session.targetMode !== 'object') {
          return { accepted: false, reason: 'object-selection-disabled' }
        }
        try {
          session.candidate =
            (await this.service.hitTestCandidate(
              command.point,
              this.service.getFeatures().includes('ui-element-hit-test') ? 'ui-element' : 'window'
            )) ?? undefined
          session.finalResource = undefined
          return { accepted: true }
        } catch {
          session.candidate = undefined
          return { accepted: false, reason: 'hit-test-failed' }
        }
      }
      case 'copy':
        return await this.outputFromOverlay(session, 'copy', webContentsId)
      case 'save':
        return await this.outputFromOverlay(session, 'save', webContentsId)
      case 'confirm':
        return await this.outputFromOverlay(session, 'complete', webContentsId)
    }
  }

  async editorAction(
    sessionId: string,
    webContentsId: number,
    action: ScreenshotEditorAction
  ): Promise<ScreenshotEditorActionResponse> {
    const session = this.authorizedSession(sessionId, webContentsId, 'editor')
    const resource = session?.finalResource
    if (!session || !resource) return { accepted: false, reason: 'sender-not-authorized' }
    try {
      switch (action) {
        case 'copy':
          return (await this.service.writeCaptureResourceToClipboard(resource.tfileUrl))
            ? { accepted: true }
            : { accepted: false, reason: 'clipboard-write-failed' }
        case 'save':
          return (await this.saveResource(resource, webContentsId))
            ? { accepted: true }
            : { accepted: false, reason: 'save-cancelled' }
        case 'quick-save':
          if (!(await this.saveResource(resource, webContentsId))) {
            return { accepted: false, reason: 'save-cancelled' }
          }
          this.complete(session, resource)
          return { accepted: true }
        case 'complete':
          this.complete(session, resource)
          return { accepted: true }
        case 'cancel':
          this.cancel(session.id, 'editor-cancelled')
          return { accepted: true }
      }
    } catch {
      return { accepted: false, reason: 'editor-action-failed' }
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

  private async outputFromOverlay(
    session: ActiveSession,
    action: 'copy' | 'save' | 'complete',
    webContentsId: number
  ): Promise<ScreenshotOverlayCommandResponse> {
    const resource = await this.materializeOverlayResource(session)
    if (!resource) return { accepted: false, reason: 'capture-failed' }
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
    }
  }

  private async materializeOverlayResource(
    session: ActiveSession
  ): Promise<NativeScreenshotCaptureResult | null> {
    if (session.finalResource) return session.finalResource
    if (session.phase !== 'selecting') return null
    if (session.targetMode === 'free-region' && !session.selection) return null
    if (session.targetMode === 'object' && !session.candidate) return null
    session.phase = 'confirming'
    try {
      const resource =
        session.candidate && session.targetMode === 'object'
          ? await this.service.captureCandidate(session.candidate)
          : session.mode === 'frozen' && !session.options.cursor
            ? await this.service.composeFrozenRegion(
                session.displays.map((display) => ({
                  display,
                  resource: session.frozenResources.get(display.id)!
                })),
                session.selection!,
                {
                  border: session.options.border,
                  shadow: session.options.shadow,
                  cornerRadius: session.options.cornerRadius
                }
              )
            : await this.service.capture({
                target: 'region',
                region: session.selection!,
                cursor: session.options.cursor ? 'system' : 'hidden',
                writeClipboard: false
              })
      this.assertActive(session)
      session.finalResource = resource
      session.phase = 'selecting'
      return resource
    } catch {
      if (this.active === session && !session.terminal) session.phase = 'selecting'
      return null
    }
  }

  private complete(session: ActiveSession, resource: NativeScreenshotCaptureResult): void {
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
      annotation: { available: false, reason: 'not-implemented' },
      longCapture: { available: false, reason: 'not-implemented' },
      recognition: { available: false, reason: 'not-implemented' },
      pin: { available: false, reason: 'not-implemented' }
    }
  }

  private attachWindow(
    session: ActiveSession,
    window: ScreenshotSessionWindowHandle,
    surface: 'overlay' | 'editor',
    displayId: string | null,
    closeReason: string
  ): void {
    session.windows.push(window)
    this.bindings.set(window.webContentsId, { sessionId: session.id, surface, displayId })
    session.closeDisposers.set(
      window.webContentsId,
      window.onClosed(() => {
        if (this.active === session && !session.terminal) this.cancel(session.id, closeReason)
      })
    )
  }

  private assertActive(session: ActiveSession): void {
    if (this.active !== session || session.terminal) {
      throw codedError('Screenshot session is no longer active', 'SCREENSHOT_SESSION_CANCELLED')
    }
  }

  private authorizedSession(
    sessionId: string,
    webContentsId: number,
    surface?: 'overlay' | 'editor'
  ): ActiveSession | null {
    const session = this.active
    const binding = this.bindings.get(webContentsId)
    if (
      !session ||
      session.terminal ||
      session.id !== sessionId ||
      binding?.sessionId !== sessionId ||
      (surface !== undefined && binding.surface !== surface)
    ) {
      return null
    }
    return session
  }

  private focusActiveWindow(session: ActiveSession): void {
    const editor = session.windows.find(
      (window) => this.bindings.get(window.webContentsId)?.surface === 'editor'
    )
    const primaryDisplay = session.displays.find((display) => display.isPrimary)
    const preferred =
      editor ??
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
