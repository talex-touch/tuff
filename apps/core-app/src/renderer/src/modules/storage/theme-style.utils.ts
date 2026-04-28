export type ThemeWindowPreference = 'pure' | 'refraction' | 'filter'
export type ThemeTransitionRoute = 'slide' | 'fade' | 'zoom'
export type ThemeMode = 'auto' | 'dark' | 'light'

export interface ThemeStyleState {
  theme: {
    window: ThemeWindowPreference
    style: {
      dark: boolean
      auto: boolean
    }
    addon: {
      contrast: boolean
      coloring: boolean
    }
    transition: {
      route: ThemeTransitionRoute
    }
  }
}

export interface ThemeModeState {
  auto: boolean
  dark: boolean
  isDark: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeTransitionRoute(
  value: unknown,
  fallback: ThemeTransitionRoute
): ThemeTransitionRoute {
  return value === 'slide' || value === 'fade' || value === 'zoom' ? value : fallback
}

export function createDefaultThemeStyle(): ThemeStyleState {
  return {
    theme: {
      window: 'refraction',
      style: {
        dark: false,
        auto: true
      },
      addon: {
        contrast: false,
        coloring: false
      },
      transition: {
        route: 'slide'
      }
    }
  }
}

export function normalizeWindowPreference(value: unknown): ThemeWindowPreference {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''

  if (normalized === 'pure' || normalized === 'default') {
    return 'pure'
  }
  if (normalized === 'refraction' || normalized === 'mica') {
    return 'refraction'
  }
  if (normalized === 'filter') {
    return 'filter'
  }

  return 'refraction'
}

export function normalizeThemeStyle(value: unknown): ThemeStyleState {
  const fallback = createDefaultThemeStyle()

  if (!isRecord(value)) {
    return fallback
  }

  const sourceTheme = isRecord(value.theme) ? value.theme : {}
  const sourceStyle = isRecord(sourceTheme.style) ? sourceTheme.style : {}
  const sourceAddon = isRecord(sourceTheme.addon) ? sourceTheme.addon : {}
  const sourceTransition = isRecord(sourceTheme.transition) ? sourceTheme.transition : {}

  return {
    theme: {
      window: normalizeWindowPreference(sourceTheme.window),
      style: {
        dark: normalizeBoolean(sourceStyle.dark, fallback.theme.style.dark),
        auto: normalizeBoolean(sourceStyle.auto, fallback.theme.style.auto)
      },
      addon: {
        contrast: normalizeBoolean(sourceAddon.contrast, fallback.theme.addon.contrast),
        coloring: normalizeBoolean(sourceAddon.coloring, fallback.theme.addon.coloring)
      },
      transition: {
        route: normalizeTransitionRoute(sourceTransition.route, fallback.theme.transition.route)
      }
    }
  }
}

export function areThemeStylesEqual(a: ThemeStyleState, b: ThemeStyleState): boolean {
  return (
    a.theme.window === b.theme.window &&
    a.theme.style.auto === b.theme.style.auto &&
    a.theme.style.dark === b.theme.style.dark &&
    a.theme.addon.contrast === b.theme.addon.contrast &&
    a.theme.addon.coloring === b.theme.addon.coloring &&
    a.theme.transition.route === b.theme.transition.route
  )
}

export function resolveThemeModeState(mode: ThemeMode, systemDark: boolean): ThemeModeState {
  if (mode === 'dark') {
    return {
      auto: false,
      dark: true,
      isDark: true
    }
  }

  if (mode === 'light') {
    return {
      auto: false,
      dark: false,
      isDark: false
    }
  }

  return {
    auto: true,
    dark: systemDark,
    isDark: systemDark
  }
}
