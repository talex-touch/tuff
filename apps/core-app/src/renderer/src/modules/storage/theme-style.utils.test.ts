import { describe, expect, it } from 'vitest'
import {
  createDefaultThemeStyle,
  normalizeThemeStyle,
  resolveThemeModeState
} from './theme-style.utils'

describe('theme-style utils', () => {
  it('maps theme mode to auto/dark flags consistently', () => {
    expect(resolveThemeModeState('light', true)).toEqual({
      auto: false,
      dark: false,
      isDark: false
    })

    expect(resolveThemeModeState('dark', false)).toEqual({
      auto: false,
      dark: true,
      isDark: true
    })

    expect(resolveThemeModeState('auto', true)).toEqual({
      auto: true,
      dark: true,
      isDark: true
    })

    expect(resolveThemeModeState('auto', false)).toEqual({
      auto: true,
      dark: false,
      isDark: false
    })
  })

  it('normalizes partial theme state with defaults', () => {
    const normalized = normalizeThemeStyle({
      theme: {
        window: 'mica',
        style: {
          auto: false
        }
      }
    })

    expect(normalized.theme.window).toBe('refraction')
    expect(normalized.theme.style.auto).toBe(false)
    expect(normalized.theme.style.dark).toBe(false)
    expect(normalized.theme.addon).toEqual(createDefaultThemeStyle().theme.addon)
    expect(normalized.theme.transition).toEqual(createDefaultThemeStyle().theme.transition)
  })
})
