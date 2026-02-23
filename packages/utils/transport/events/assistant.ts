import { defineRawEvent } from '../event/builder'

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
    getRuntimeConfig: defineRawEvent<void, AssistantRuntimeConfig>(
      'assistant:floating-ball:get-runtime-config'
    ),
    openVoicePanel: defineRawEvent<AssistantOpenVoicePanelPayload, void>(
      'assistant:floating-ball:open-voice-panel'
    ),
    updatePosition: defineRawEvent<AssistantFloatingBallPositionPayload, void>(
      'assistant:floating-ball:update-position'
    )
  },
  voice: {
    panelOpened: defineRawEvent<{ source?: string }, void>('assistant:voice-panel:opened'),
    closePanel: defineRawEvent<void, void>('assistant:voice-panel:close'),
    submitText: defineRawEvent<AssistantVoiceSubmitPayload, { accepted: boolean }>(
      'assistant:voice-panel:submit'
    )
  }
} as const
