interface ThemeStyleConfig {
  dark?: boolean
  theme?: {
    style?: {
      dark?: boolean
      auto?: boolean
    }
  }
}

function getThemeStyleConfig(): ThemeStyleConfig | undefined {
  const config = window.$config?.themeStyle
  return config && typeof config === 'object' ? config : undefined
}

function resolveDarkMode(config: ThemeStyleConfig | undefined, systemDark: boolean): boolean {
  const style = config?.theme?.style
  if (style) {
    if (style.auto !== false) {
      return systemDark
    }
    return style.dark === true
  }

  if (typeof config?.dark === 'boolean') {
    return config.dark
  }

  return systemDark
}

function applyDarkMode(isDark: boolean): void {
  const root = document.documentElement
  const theme = isDark ? 'dark' : 'light'
  root.classList.toggle('dark', isDark)
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

export function initializeClipboardTheme(): void {
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  const syncTheme = (): void => {
    applyDarkMode(resolveDarkMode(getThemeStyleConfig(), media?.matches === true))
  }

  syncTheme()

  media?.addEventListener?.('change', syncTheme)
}
