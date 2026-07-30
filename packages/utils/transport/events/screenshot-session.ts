import { defineEvent } from '../event/builder'

export type ScreenshotSessionCompletionMode = 'editor' | 'return-resource'
export type ScreenshotSessionInitialTarget = 'free-region' | 'display' | 'window' | 'ui-element'
export type ScreenshotSessionDelayMs = 0 | 3000 | 5000
export type ScreenshotSessionPhase = 'preparing' | 'selecting' | 'confirming' | 'editor' | 'tearing-down'
export type ScreenshotSessionMode = 'frozen' | 'live'
export type ScreenshotSelectionTargetMode = 'free-region' | 'object'

export interface ScreenshotRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenshotPoint {
  x: number
  y: number
}

export interface ScreenshotSafeAreaInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ScreenshotSessionStartRequest {
  completionMode?: ScreenshotSessionCompletionMode
  delayMs?: ScreenshotSessionDelayMs
  initialTarget?: ScreenshotSessionInitialTarget
}

export interface NormalizedScreenshotSessionStartRequest {
  completionMode: ScreenshotSessionCompletionMode
  delayMs: ScreenshotSessionDelayMs
  initialTarget: ScreenshotSessionInitialTarget
}

export interface ScreenshotSessionStartResponse {
  accepted: boolean
  sessionId?: string
  state?: 'started' | 'existing'
  reason?: string
}

export interface ScreenshotManagedResource {
  tfileUrl: string
  mimeType: 'image/png'
  width: number
  height: number
  sizeBytes: number
}

export type ScreenshotSessionResult =
  | {
      status: 'completed'
      sessionId: string
      resource: ScreenshotManagedResource
    }
  | {
      status: 'canceled'
      sessionId: string
      reason?: string
    }
  | {
      status: 'failed'
      sessionId: string
      code: string
      reason?: string
    }

export interface ScreenshotSessionWaitResultRequest {
  sessionId: string
}

export interface ScreenshotOverlayDisplay {
  id: string
  bounds: ScreenshotRect
  scaleFactor: number
  rotation: 0 | 90 | 180 | 270
  frozenTfileUrl?: string
}

export interface ScreenshotOverlayCapability {
  available: boolean
  reason?: string
}

export interface ScreenshotOverlayOptions {
  cursor: boolean
  cornerRadius: number
  border: boolean
  shadow: boolean
  aspectRatio?: number
}

export interface ScreenshotOverlayCandidate {
  kind: 'display' | 'window' | 'ui-element'
  bounds: ScreenshotRect
}

export interface ScreenshotOverlayState {
  sessionId: string
  phase: ScreenshotSessionPhase
  mode: ScreenshotSessionMode
  targetMode: ScreenshotSelectionTargetMode
  display: ScreenshotOverlayDisplay
  safeAreaInsets: ScreenshotSafeAreaInsets
  desktopBounds: ScreenshotRect
  selection?: ScreenshotRect
  candidate?: ScreenshotOverlayCandidate
  options: ScreenshotOverlayOptions
  capabilities: Record<string, ScreenshotOverlayCapability>
}

export type ScreenshotOverlayCommand =
  | { type: 'set-selection'; selection: ScreenshotRect }
  | { type: 'set-mode'; mode: ScreenshotSessionMode }
  | { type: 'set-target-mode'; targetMode: ScreenshotSelectionTargetMode }
  | { type: 'set-options'; options: Partial<ScreenshotOverlayOptions> }
  | { type: 'pointer'; point: ScreenshotPoint }
  | { type: 'copy' }
  | { type: 'save' }
  | { type: 'confirm' }
  | { type: 'cancel' }

export interface ScreenshotOverlayCommandRequest {
  sessionId: string
  command: ScreenshotOverlayCommand
}

export interface ScreenshotOverlayCommandResponse {
  accepted: boolean
  reason?: string
}

export interface ScreenshotEditorState {
  sessionId: string
  resource: ScreenshotManagedResource
  capabilities: Record<string, ScreenshotOverlayCapability>
}

export type ScreenshotEditorAction = 'copy' | 'save' | 'quick-save' | 'complete' | 'cancel'

export interface ScreenshotEditorActionRequest {
  sessionId: string
  action: ScreenshotEditorAction
}

export interface ScreenshotEditorActionResponse {
  accepted: boolean
  reason?: string
}

const START_KEYS = new Set(['completionMode', 'delayMs', 'initialTarget'])
const COMPLETION_MODES = new Set<ScreenshotSessionCompletionMode>(['editor', 'return-resource'])
const DELAYS = new Set<ScreenshotSessionDelayMs>([0, 3000, 5000])
const INITIAL_TARGETS = new Set<ScreenshotSessionInitialTarget>(['free-region', 'display', 'window', 'ui-element'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeScreenshotSessionStartRequest(value: unknown): NormalizedScreenshotSessionStartRequest | null {
  if (value === undefined) {
    return {
      completionMode: 'editor',
      delayMs: 0,
      initialTarget: 'free-region',
    }
  }
  if (!isRecord(value) || Object.keys(value).some(key => !START_KEYS.has(key))) {
    return null
  }

  const completionMode = value.completionMode ?? 'editor'
  const delayMs = value.delayMs ?? 0
  const initialTarget = value.initialTarget ?? 'free-region'
  if (
    !COMPLETION_MODES.has(completionMode as ScreenshotSessionCompletionMode) ||
    !DELAYS.has(delayMs as ScreenshotSessionDelayMs) ||
    !INITIAL_TARGETS.has(initialTarget as ScreenshotSessionInitialTarget)
  ) {
    return null
  }

  return {
    completionMode: completionMode as ScreenshotSessionCompletionMode,
    delayMs: delayMs as ScreenshotSessionDelayMs,
    initialTarget: initialTarget as ScreenshotSessionInitialTarget,
  }
}

export const ScreenshotSessionEvents = {
  lifecycle: {
    start: defineEvent('screenshot-session')
      .module('lifecycle')
      .event('start')
      .define<ScreenshotSessionStartRequest | void, ScreenshotSessionStartResponse>(),
    waitResult: defineEvent('screenshot-session')
      .module('lifecycle')
      .event('wait-result')
      .define<ScreenshotSessionWaitResultRequest, ScreenshotSessionResult>(),
  },
  overlay: {
    ready: defineEvent('screenshot-session').module('overlay').event('ready').define<void, ScreenshotOverlayState>(),
    state: defineEvent('screenshot-session').module('overlay').event('state').define<ScreenshotOverlayState, void>(),
    command: defineEvent('screenshot-session')
      .module('overlay')
      .event('command')
      .define<ScreenshotOverlayCommandRequest, ScreenshotOverlayCommandResponse>(),
  },
  editor: {
    ready: defineEvent('screenshot-session').module('editor').event('ready').define<void, ScreenshotEditorState>(),
    action: defineEvent('screenshot-session')
      .module('editor')
      .event('action')
      .define<ScreenshotEditorActionRequest, ScreenshotEditorActionResponse>(),
  },
} as const
