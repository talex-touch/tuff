import type { VoicePolishStrength } from '../../common/storage/entity/app-settings'
import { defineEvent } from '../event/builder'

export interface AssistantRuntimeConfig {
  enabled: boolean
  language: string
  polishEnabled: boolean
  /** Whether an enabled Intelligence `text.chat` runtime can perform optional cleanup. */
  polishAvailable: boolean
  polishStrength: VoicePolishStrength
}

export type AssistantVoiceCommandPayload
  = | {
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

export const AssistantEvents = {
  voice: {
    getRuntimeConfig: defineEvent('assistant')
      .module('voice-panel')
      .event('get-runtime-config')
      .define<void, AssistantRuntimeConfig>(),
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
    disableGlobeKeyAction: defineEvent('assistant')
      .module('voice-panel')
      .event('disable-globe-key-action')
      .define<void, AssistantGlobeKeyStatus>(),
    openKeyboardSettings: defineEvent('assistant')
      .module('voice-panel')
      .event('open-keyboard-settings')
      .define<void, boolean>(),
  },
} as const
