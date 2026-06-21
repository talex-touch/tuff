import { describe, expect, it } from 'vitest'
import {
  applyThemeDocumentState,
  createDefaultThemeStyle,
  normalizeThemeStyle,
  resolveThemeModeFromStyle,
  resolveThemeModeState
} from './theme-style.utils'

function createThemeRootStub(): HTMLElement {
  const classes = new Set<string>()

  return {
    classList: {
      toggle(name: string, force?: boolean): boolean {
        if (force) {
          classes.add(name)
          return true
        }
        classes.delete(name)
        return false
      },
      contains(name: string): boolean {
        return classes.has(name)
      }
    },
    dataset: {},
    style: {}
  } as HTMLElement
}

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

  it('applies addon theme state to the document root', () => {
    const root = createThemeRootStub()

    applyThemeDocumentState(root, {
      resolvedTheme: 'dark',
      coloring: true,
      contrast: true
    })

    expect(root.classList.contains('dark')).toBe(true)
    expect(root.classList.contains('coloring')).toBe(true)
    expect(root.classList.contains('contrast')).toBe(true)
    expect(root.dataset.theme).toBe('dark')
    expect(root.dataset.txColoring).toBe('true')
    expect(root.dataset.txContrast).toBe('high')
    expect(root.style.colorScheme).toBe('dark')

    applyThemeDocumentState(root, {
      resolvedTheme: 'light',
      coloring: false,
      contrast: false
    })

    expect(root.classList.contains('dark')).toBe(false)
    expect(root.classList.contains('coloring')).toBe(false)
    expect(root.classList.contains('contrast')).toBe(false)
    expect(root.dataset.theme).toBe('light')
    expect(root.dataset.txColoring).toBe('false')
    expect(root.dataset.txContrast).toBe('normal')
    expect(root.style.colorScheme).toBe('light')
  })
})
