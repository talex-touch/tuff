import { describe, expect, it } from 'vitest'
import {
  resolveThemeModeFromStyle,
  resolveThemeModeState,
  resolveThemeStateFromStyle
} from './theme-mode'

describe('shared theme mode helpers', () => {
  it('keeps legacy storage flags compatible with the new theme mode', () => {
    expect(resolveThemeModeFromStyle(undefined)).toBe('auto')
    expect(resolveThemeModeFromStyle({ auto: true, dark: true })).toBe('auto')
    expect(resolveThemeModeFromStyle({ auto: false, dark: true })).toBe('dark')
    expect(resolveThemeModeFromStyle({ auto: false, dark: false })).toBe('light')
  })

  it('resolves system mode into concrete light and dark themes', () => {
    expect(resolveThemeModeState('auto', true)).toMatchObject({
      auto: true,
      dark: true,
      isDark: true,
      mode: 'auto',
      resolvedTheme: 'dark'
    })
    expect(resolveThemeModeState('auto', false)).toMatchObject({
      auto: true,
      dark: false,
      isDark: false,
      mode: 'auto',
      resolvedTheme: 'light'
    })
  })

  it('resolves stored style directly for main and renderer callers', () => {
    expect(resolveThemeStateFromStyle({ auto: false, dark: true }, false)).toMatchObject({
      mode: 'dark',
      resolvedTheme: 'dark'
    })
    expect(resolveThemeStateFromStyle({ auto: false, dark: false }, true)).toMatchObject({
      mode: 'light',
      resolvedTheme: 'light'
    })
  })
})
