export type ThemeMode = 'auto' | 'dark' | 'light'
export type ResolvedTheme = 'dark' | 'light'

export interface ThemeModeStyle {
  auto?: boolean
  dark?: boolean
}

export interface ThemeModeState {
  auto: boolean
  dark: boolean
  isDark: boolean
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
}

export function resolveThemeModeFromStyle(style: ThemeModeStyle | null | undefined): ThemeMode {
  if (style?.auto !== false) {
    return 'auto'
  }

  return style.dark ? 'dark' : 'light'
}

export function resolveThemeModeState(mode: ThemeMode, systemDark: boolean): ThemeModeState {
  if (mode === 'dark') {
    return {
      auto: false,
      dark: true,
      isDark: true,
      mode,
      resolvedTheme: 'dark'
    }
  }

  if (mode === 'light') {
    return {
      auto: false,
      dark: false,
      isDark: false,
      mode,
      resolvedTheme: 'light'
    }
  }

  return {
    auto: true,
    dark: systemDark,
    isDark: systemDark,
    mode,
    resolvedTheme: systemDark ? 'dark' : 'light'
  }
}

export function resolveThemeStateFromStyle(
  style: ThemeModeStyle | null | undefined,
  systemDark: boolean
): ThemeModeState {
  return resolveThemeModeState(resolveThemeModeFromStyle(style), systemDark)
}
