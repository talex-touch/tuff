import type {
  CoreBoxImageTranslateRouteMetadata,
  IntelligenceErrorCode,
  NativeScreenshotDisplay,
  NativeScreenshotRegion,
} from './types'
import type { ScreenshotManagedResource } from './screenshot-session'
import { defineEvent } from '../event/builder'

export interface AssistantRuntimeConfig {
  enabled: boolean
  language: string
}

export interface AssistantOpenVoicePanelPayload {
  source?: 'click' | 'wake-word'
}

export type AssistantVoiceCommandPayload =
  | {
      action: 'start' | 'stop' | 'toggle'
      mode: 'hold' | 'toggle'
      source: 'command'
    }
  | {
      action: 'cancel'
      state: 'start' | 'reset'
      source: 'command'
    }

export interface AssistantVoiceCancelHoldPayload {
  state: 'start' | 'reset' | 'commit'
}

/**
 * Whether macOS still owns a lone Fn press.
 *
 * Nothing in the app can take it: the Globe action is fired by WindowServer below our event tap,
 * so the only switch is the user's own "Press the Globe key to" preference. This reports what
 * that preference currently says so the settings page can ask for it — it never changes it.
 */
export interface AssistantGlobeKeyStatus {
  /** False off macOS, where a lone Fn press has no system action to compete with. */
  applies: boolean
  /** The system opens Emoji / switches input source on a lone Fn press. */
  systemActionActive: boolean
}

export interface AssistantFloatingBallPositionPayload {
  x: number
  y: number
}

export interface AssistantVoiceSubmitPayload {
  text: string
  source?: 'voice' | 'manual'
}

export type AssistantClipboardImageTranslateErrorCode =
  | 'ASSISTANT_DISABLED'
  | 'IMAGE_UNAVAILABLE'
  | 'SCENE_UNAVAILABLE'
  | IntelligenceErrorCode

export type AssistantScreenshotTranslateErrorCode =
  | AssistantClipboardImageTranslateErrorCode
  | 'SCREENSHOT_PERMISSION_DENIED'
  | 'SCREENSHOT_UNSUPPORTED'
  | 'SCREENSHOT_UNAVAILABLE'
  | 'OCR_UNAVAILABLE'
  | 'TEXT_TRANSLATE_UNAVAILABLE'

export type AssistantScreenshotCaptureErrorCode =
  | 'ASSISTANT_DISABLED'
  | 'SCREENSHOT_PERMISSION_DENIED'
  | 'SCREENSHOT_UNSUPPORTED'
  | 'SCREENSHOT_UNAVAILABLE'

export type AssistantScreenshotSaveErrorCode = AssistantScreenshotCaptureErrorCode | 'SAVE_FAILED'

export interface AssistantClipboardImageTranslatePayload {
  targetLang?: string
}

export interface AssistantClipboardImageTranslateResponse {
  success: boolean
  translatedImageBase64?: string
  sourceText?: string
  targetText?: string
  metadata?: CoreBoxImageTranslateRouteMetadata
  error?: string
  reason?: string
  recovery?: string
  code?: AssistantClipboardImageTranslateErrorCode
}

export type AssistantScreenshotCaptureTarget = 'cursor-display' | 'display' | 'region' | 'resource'
export type AssistantScreenshotDisplay = NativeScreenshotDisplay

export interface AssistantScreenshotTargetPayload {
  target?: AssistantScreenshotCaptureTarget
  displayId?: string
  region?: NativeScreenshotRegion
  tfileUrl?: string
  resource?: ScreenshotManagedResource
}

export type AssistantScreenshotTranslatePayload = AssistantClipboardImageTranslatePayload &
  AssistantScreenshotTargetPayload

export type AssistantScreenshotCapturePayload = AssistantScreenshotTargetPayload
export type AssistantScreenshotSavePayload = AssistantScreenshotTargetPayload

export type AssistantScreenshotRegionSelectionErrorCode =
  | 'ASSISTANT_DISABLED'
  | 'SCREENSHOT_UNSUPPORTED'
  | 'REGION_SELECTION_UNAVAILABLE'

export interface AssistantScreenshotRegionSelectionPayload {
  target?: 'cursor-display' | 'display'
  displayId?: string
}

export interface AssistantScreenshotRegionSelectionResponse {
  success: boolean
  canceled?: boolean
  region?: NativeScreenshotRegion
  displayId?: string
  displayName?: string
  resource?: ScreenshotManagedResource
  error?: string
  code?: AssistantScreenshotRegionSelectionErrorCode
}

export type AssistantScreenshotTranslateMode = 'translated-image' | 'ocr-text'

export interface AssistantScreenshotFallbackStageMetadata {
  provider: string
  model: string
  traceId: string
  latencyMs: number
}

export type AssistantScreenshotFallbackReason = `IMAGE_TRANSLATE_${'SCENE_UNAVAILABLE' | IntelligenceErrorCode}`

export interface AssistantScreenshotTextFallbackMetadata {
  degradedReason: AssistantScreenshotFallbackReason
  ocr: AssistantScreenshotFallbackStageMetadata & { engine?: string }
  translation: AssistantScreenshotFallbackStageMetadata
}

export interface AssistantScreenshotTranslateResponse {
  success: boolean
  translatedImageBase64?: string
  sourceText?: string
  targetText?: string
  mode?: AssistantScreenshotTranslateMode
  fallback?: AssistantScreenshotTextFallbackMetadata
  metadata?: CoreBoxImageTranslateRouteMetadata

  error?: string
  reason?: string
  recovery?: string
  code?: AssistantScreenshotTranslateErrorCode
}

export interface AssistantScreenshotCaptureResponse {
  success: boolean
  tfileUrl?: string
  mimeType?: string
  width?: number
  height?: number
  displayName?: string
  wroteClipboard?: boolean
  error?: string
  code?: AssistantScreenshotCaptureErrorCode
}

export interface AssistantScreenshotSaveResponse {
  success: boolean
  canceled?: boolean
  mimeType?: string
  width?: number
  height?: number
  displayName?: string
  sizeBytes?: number
  error?: string
  code?: AssistantScreenshotSaveErrorCode
}

const translateClipboardImageEvent = defineEvent('assistant')
  .module('voice-panel')
  .event('translate-clipboard-image')
  .define<AssistantClipboardImageTranslatePayload | void, AssistantClipboardImageTranslateResponse>()

export const AssistantEvents = {
  floatingBall: {
    getRuntimeConfig: defineEvent('assistant')
      .module('floating-ball')
      .event('get-runtime-config')
      .define<void, AssistantRuntimeConfig>(),
    openVoicePanel: defineEvent('assistant')
      .module('floating-ball')
      .event('open-voice-panel')
      .define<AssistantOpenVoicePanelPayload, void>(),
    updatePosition: defineEvent('assistant')
      .module('floating-ball')
      .event('update-position')
      .define<AssistantFloatingBallPositionPayload, void>(),
  },
  voice: {
    panelOpened: defineEvent('assistant').module('voice-panel').event('opened').define<{ source?: string }, void>(),
    panelClosed: defineEvent('assistant').module('voice-panel').event('closed').define<void, void>(),
    command: defineEvent('assistant')
      .module('voice-panel')
      .event('command')
      .define<AssistantVoiceCommandPayload, void>(),
    cancelHold: defineEvent('assistant')
      .module('voice-panel')
      .event('cancel-hold')
      .define<AssistantVoiceCancelHoldPayload, void>(),
    closePanel: defineEvent('assistant').module('voice-panel').event('close').define<void, void>(),
    openIntelligenceSettings: defineEvent('assistant')
      .module('voice-panel')
      .event('open-intelligence-settings')
      .define<void, boolean>(),
    getGlobeKeyStatus: defineEvent('assistant')
      .module('voice-panel')
      .event('get-globe-key-status')
      .define<void, AssistantGlobeKeyStatus>(),
    openKeyboardSettings: defineEvent('assistant')
      .module('voice-panel')
      .event('open-keyboard-settings')
      .define<void, boolean>(),
    submitText: defineEvent('assistant')
      .module('voice-panel')
      .event('submit')
      .define<AssistantVoiceSubmitPayload, { accepted: boolean }>(),
    translateClipboardImage: translateClipboardImageEvent,
    listScreenshotDisplays: defineEvent('assistant')
      .module('voice-panel')
      .event('list-screenshot-displays')
      .define<void, AssistantScreenshotDisplay[]>(),
    selectScreenshotRegion: defineEvent('assistant')
      .module('voice-panel')
      .event('select-screenshot-region')
      .define<AssistantScreenshotRegionSelectionPayload | void, AssistantScreenshotRegionSelectionResponse>(),
    captureScreenshot: defineEvent('assistant')
      .module('voice-panel')
      .event('capture-screenshot')
      .define<AssistantScreenshotCapturePayload | void, AssistantScreenshotCaptureResponse>(),
    saveScreenshot: defineEvent('assistant')
      .module('voice-panel')
      .event('save-screenshot')
      .define<AssistantScreenshotSavePayload | void, AssistantScreenshotSaveResponse>(),
    translateScreenshot: defineEvent('assistant')
      .module('voice-panel')
      .event('translate-screenshot')
      .define<AssistantScreenshotTranslatePayload | void, AssistantScreenshotTranslateResponse>(),
  },
} as const
