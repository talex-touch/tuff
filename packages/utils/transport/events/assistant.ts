import { defineEvent } from '../event/builder'

export interface AssistantRuntimeConfig {
  enabled: boolean
  language: string
  wakeWords: string[]
  cooldownMs: number
  continuous: boolean
  assistantName: string
  openPanelOnWake: boolean
}

export interface AssistantOpenVoicePanelPayload {
  source?: 'click' | 'wake-word'
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

export type AssistantScreenshotTranslateErrorCode =
  | AssistantClipboardImageTranslateErrorCode
  | 'SCREENSHOT_UNAVAILABLE'

export type AssistantScreenshotCaptureErrorCode =
  | 'ASSISTANT_DISABLED'
  | 'SCREENSHOT_UNAVAILABLE'

export interface AssistantClipboardImageTranslatePayload {
  targetLang?: string
}

export interface AssistantClipboardImageTranslateResponse {
  success: boolean
  translatedImageBase64?: string
  sourceText?: string
  targetText?: string
  error?: string
  code?: AssistantClipboardImageTranslateErrorCode
}

export type AssistantScreenshotTranslatePayload = AssistantClipboardImageTranslatePayload

export interface AssistantScreenshotCapturePayload {
  target?: 'cursor-display'
}

export interface AssistantScreenshotTranslateResponse {
  success: boolean
  translatedImageBase64?: string
  sourceText?: string
  targetText?: string
  error?: string
  code?: AssistantScreenshotTranslateErrorCode
}

export interface AssistantScreenshotCaptureResponse {
  success: boolean
  dataUrl?: string
  mimeType?: string
  width?: number
  height?: number
  displayName?: string
  wroteClipboard?: boolean
  error?: string
  code?: AssistantScreenshotCaptureErrorCode
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
      .define<AssistantFloatingBallPositionPayload, void>()
  },
  voice: {
    panelOpened: defineEvent('assistant')
      .module('voice-panel')
      .event('opened')
      .define<{ source?: string }, void>(),
    closePanel: defineEvent('assistant')
      .module('voice-panel')
      .event('close')
      .define<void, void>(),
    submitText: defineEvent('assistant')
      .module('voice-panel')
      .event('submit')
      .define<AssistantVoiceSubmitPayload, { accepted: boolean }>(),
    translateClipboardImage: translateClipboardImageEvent,
    captureScreenshot: defineEvent('assistant')
      .module('voice-panel')
      .event('capture-screenshot')
      .define<AssistantScreenshotCapturePayload | void, AssistantScreenshotCaptureResponse>(),
    translateScreenshot: defineEvent('assistant')
      .module('voice-panel')
      .event('translate-screenshot')
      .define<AssistantScreenshotTranslatePayload | void, AssistantScreenshotTranslateResponse>()
  }
} as const
