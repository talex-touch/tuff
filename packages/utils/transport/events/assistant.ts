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
      .define<AssistantVoiceSubmitPayload, { accepted: boolean }>()
  }
} as const
