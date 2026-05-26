import { describe, expect, it } from 'vitest'
import {
  createDefaultThemeStyle,
  normalizeThemeStyle,
  resolveThemeModeFromStyle,
  resolveThemeModeState
} from './theme-style.utils'

describe('theme-style utils', () => {
  it('maps theme mode to auto/dark flags consistently', () => {
    expect(resolveThemeModeState('light', true)).toEqual({
      auto: false,
      dark: false,
      isDark: false,
      mode: 'light',
      resolvedTheme: 'light'
    })

    expect(resolveThemeModeState('dark', false)).toEqual({
      auto: false,
      dark: true,
      isDark: true,
      mode: 'dark',
      resolvedTheme: 'dark'
    })

    expect(resolveThemeModeState('auto', true)).toEqual({
      auto: true,
      dark: true,
      isDark: true,
      mode: 'auto',
      resolvedTheme: 'dark'
    })

    expect(resolveThemeModeState('auto', false)).toEqual({
      auto: true,
      dark: false,
      isDark: false,
      mode: 'auto',
      resolvedTheme: 'light'
    })
  })

  it('resolves legacy auto/dark style flags into a single mode', () => {
    expect(resolveThemeModeFromStyle(undefined)).toBe('auto')
    expect(resolveThemeModeFromStyle({ auto: true, dark: false })).toBe('auto')
    expect(resolveThemeModeFromStyle({ auto: false, dark: true })).toBe('dark')
    expect(resolveThemeModeFromStyle({ auto: false, dark: false })).toBe('light')
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
