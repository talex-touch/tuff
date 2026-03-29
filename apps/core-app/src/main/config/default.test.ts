import { describe, expect, it } from 'vitest'
import {
  AssistantFloatingBallWindowOption,
  AssistantVoicePanelWindowOption,
  BoxWindowOption,
  DivisionBoxWindowOption,
  MainWindowOption,
  OmniPanelWindowOption
} from './default'

const securedWindows = [
  ['main', MainWindowOption],
  ['core-box', BoxWindowOption],
  ['division-box', DivisionBoxWindowOption],
  ['assistant-floating', AssistantFloatingBallWindowOption],
  ['assistant-voice', AssistantVoicePanelWindowOption],
  ['omni-panel', OmniPanelWindowOption]
] as const

describe('window security defaults', () => {
  it.each(securedWindows)('uses hardened renderer prefs for %s', (_name, option) => {
    expect(option.webPreferences?.webSecurity).toBe(true)
    expect(option.webPreferences?.nodeIntegration).toBe(false)
    expect(option.webPreferences?.nodeIntegrationInSubFrames).toBe(false)
    expect(option.webPreferences?.contextIsolation).toBe(true)
    expect(option.webPreferences?.sandbox).toBe(false)
  })
})
