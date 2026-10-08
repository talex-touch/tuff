export const COREBOX_FOCUS_TARGETS = ['input', 'flow', 'history', 'plugin', 'meta-overlay', 'none'] as const
export type CoreBoxFocusTarget = (typeof COREBOX_FOCUS_TARGETS)[number]
export const COREBOX_FOCUS_STAGES = [
  'summon', 'show', 'native-focus', 'renderer-focus', 'sample', 'complete', 'cancel',
  'window-focus', 'window-blur'
] as const
export type CoreBoxFocusStage = (typeof COREBOX_FOCUS_STAGES)[number]
export const COREBOX_FOCUS_STATUSES = ['pending', 'success', 'failed', 'cancelled'] as const
export type CoreBoxFocusStatus = (typeof COREBOX_FOCUS_STATUSES)[number]
export const COREBOX_FOCUS_CODES = [
  'COREBOX_FOCUS_SUMMON_STARTED',
  'COREBOX_FOCUS_SHOWN',
  'COREBOX_FOCUS_REQUESTED',
  'COREBOX_FOCUS_OK',
  'COREBOX_FOCUS_WINDOW_MISSING',
  'COREBOX_FOCUS_WINDOW_HIDDEN',
  'COREBOX_FOCUS_WINDOW_NOT_FOCUSED',
  'COREBOX_FOCUS_DOCUMENT_NOT_FOCUSED',
  'COREBOX_FOCUS_TARGET_MISSING',
  'COREBOX_FOCUS_TARGET_NOT_FOCUSED',
  'COREBOX_FOCUS_RENDERER_TIMEOUT',
  'COREBOX_FOCUS_RENDERER_INVALID_REPLY',
  'COREBOX_FOCUS_NATIVE_SNAPSHOT_FAILED',
  'COREBOX_FOCUS_FOCUS_FROM_RENDERER_FAILED',
  'COREBOX_FOCUS_CREATE_FAILED',
  'COREBOX_FOCUS_SHOW_FAILED',
  'COREBOX_FOCUS_REQUEST_FAILED',
  'COREBOX_FOCUS_INPUT_REQUEST_FAILED',
  'COREBOX_FOCUS_UNEXPECTED_HIDE',
  'COREBOX_FOCUS_DESTROYED',
  'COREBOX_FOCUS_COMPLETED',
  'COREBOX_FOCUS_CANCELLED'
] as const
export type CoreBoxFocusCode = (typeof COREBOX_FOCUS_CODES)[number]
export const COREBOX_FOCUS_TRIGGER_SOURCES = ['shortcut', 'programmatic'] as const
export const COREBOX_FOCUS_REASONS = [
  'hidden', 'superseded', 'shutdown', 'destroyed', 'create-failed', 'show-failed'
] as const

export interface CoreBoxFocusProbeRequest {
  summonId: string
  sampleIndex: number
}

export interface CoreBoxFocusProbeResponse extends CoreBoxFocusProbeRequest {
  documentFocused: boolean
  inputPresent: boolean
  inputFocused: boolean
  expectedTarget: CoreBoxFocusTarget
  expectedTargetPresent: boolean
  expectedTargetFocused: boolean
}

export interface CoreBoxFocusFailurePayload {
  summonId: string
  code: 'COREBOX_FOCUS_REQUEST_FAILED' | 'COREBOX_FOCUS_INPUT_REQUEST_FAILED'
  documentFocused: boolean
  inputPresent: boolean
  inputFocused: boolean
}

export interface CoreBoxFocusNativeSnapshot {
  windowId?: number
  windowAlive: boolean
  visible: boolean
  windowFocused: boolean
  webContentsFocused: boolean
  pluginActive: boolean
  pluginFocused: boolean
  metaVisible: boolean
  metaFocused: boolean
}

export interface CoreBoxFocusTelemetryRecord extends Partial<CoreBoxFocusNativeSnapshot>, Partial<Omit<CoreBoxFocusProbeResponse, 'summonId' | 'sampleIndex'>> {
  kind: 'corebox-focus'
  summonId: string
  sampleIndex: number
  triggerSource: (typeof COREBOX_FOCUS_TRIGGER_SOURCES)[number]
  stage: CoreBoxFocusStage
  status: CoreBoxFocusStatus
  severity: 'info' | 'error'
  code: CoreBoxFocusCode
  elapsedMs: number
  plannedSampleCount: number
  completedSampleCount?: number
  failedSampleCount?: number
  cancelledSampleCount?: number
  reason?: (typeof COREBOX_FOCUS_REASONS)[number]
}
