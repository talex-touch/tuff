export type PluginThemeListener = (isDark: boolean) => void

interface PluginThemeStyleConfig {
  dark?: boolean
  theme?: {
    style?: {
      dark?: boolean
      auto?: boolean
    }
  }
}

type PluginThemeWindow = Window & {
  $config?: {
    themeStyle?: unknown
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function getThemeStyleConfig(): PluginThemeStyleConfig | undefined {
  const value = (window as PluginThemeWindow).$config?.themeStyle
  if (!isRecord(value)) return undefined

  const theme = isRecord(value.theme) ? value.theme : undefined
  const style = theme && isRecord(theme.style) ? theme.style : undefined

  return {
    dark: typeof value.dark === 'boolean' ? value.dark : undefined,
    theme: style
      ? {
          style: {
            dark: typeof style.dark === 'boolean' ? style.dark : undefined,
            auto: typeof style.auto === 'boolean' ? style.auto : undefined,
          },
        }
      : undefined,
  }
}

function resolveDarkMode(config: PluginThemeStyleConfig | undefined, systemDark: boolean): boolean {
  const style = config?.theme?.style
  if (style) {
    return style.auto !== false ? systemDark : style.dark === true
  }

  return typeof config?.dark === 'boolean' ? config.dark : systemDark
}

function followsSystem(config: PluginThemeStyleConfig | undefined): boolean {
  const style = config?.theme?.style
  if (style) return style.auto !== false
  return typeof config?.dark !== 'boolean'
}

export function initializePluginTheme(listener?: PluginThemeListener): () => void {
  const root = document.documentElement
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  let lastDark: boolean | undefined

  const reflectRootTheme = (): void => {
    const isDark = root.classList.contains('dark')
    const theme = isDark ? 'dark' : 'light'
    root.dataset.theme = theme
    root.style.colorScheme = theme

    if (lastDark !== isDark) {
      lastDark = isDark
      listener?.(isDark)
    }
  }

  const syncFromConfig = (): void => {
    const isDark = resolveDarkMode(getThemeStyleConfig(), media?.matches === true)
    root.classList.toggle('dark', isDark)
    reflectRootTheme()
  }

  const handleSystemThemeChange = (): void => {
    if (followsSystem(getThemeStyleConfig())) {
      syncFromConfig()
    }
  }

  syncFromConfig()

  const observer = new MutationObserver(reflectRootTheme)
  observer.observe(root, { attributes: true, attributeFilter: ['class'] })
  media?.addEventListener?.('change', handleSystemThemeChange)

  return () => {
    observer.disconnect()
    media?.removeEventListener?.('change', handleSystemThemeChange)
  }
}
