import type { WritableComputedRef } from 'vue'
import { StorageList } from '@talex-touch/utils'
import { hasDocument } from '@talex-touch/utils/env'
import { createStorageProxy, TouchStorage } from '@talex-touch/utils/renderer/storage/base-storage'
import { useDark, usePreferredDark } from '@vueuse/core'
import { computed, watchEffect } from 'vue'
import {
  areThemeStylesEqual,
  createDefaultThemeStyle,
  normalizeThemeStyle,
  resolveThemeModeFromStyle,
  resolveThemeModeState,
  type ThemeMode,
  type ThemeModeState,
  type ThemeStyleState,
  type ResolvedTheme
} from './theme-style.utils'

export {
  normalizeWindowPreference,
  type ThemeMode,
  type ResolvedTheme,
  type ThemeStyleState,
  type ThemeTransitionRoute,
  type ThemeWindowPreference
} from './theme-style.utils'

const THEME_STYLE_STORAGE_SINGLETON_KEY = `storage:${StorageList.THEME_STYLE}`

class ThemeStyleStorage extends TouchStorage<ThemeStyleState> {
  constructor() {
    super(StorageList.THEME_STYLE, createDefaultThemeStyle())
    this.setAutoSave(true)

    void this.whenHydrated().then(() => {
      this.normalizeCurrentState()
    })
  }

  private normalizeCurrentState(): void {
    const current = normalizeThemeStyle(this.get())
    if (areThemeStylesEqual(this.get(), current)) {
      return
    }

    this.set(current)
  }
}

const themeStyleStorage = createStorageProxy(THEME_STYLE_STORAGE_SINGLETON_KEY, () => {
  return new ThemeStyleStorage()
})

export const themeStyle: WritableComputedRef<ThemeStyleState> = computed({
  get: () => themeStyleStorage.data as ThemeStyleState,
  set: (nextValue) => {
    themeStyleStorage.set(normalizeThemeStyle(nextValue))
  }
})

/**
 * Reactive dark mode state
 */
export const isDark = useDark()

/**
 * System dark mode preference
 */
export const systemDarkMode = usePreferredDark()

export const themeMode = computed<ThemeMode>(() =>
  resolveThemeModeFromStyle(themeStyle.value.theme.style)
)

export const resolvedTheme = computed<ResolvedTheme>(
  () => resolveThemeModeState(themeMode.value, systemDarkMode.value).resolvedTheme
)

function ensureThemeStyleStateNormalized(): void {
  const normalized = normalizeThemeStyle(themeStyle.value)
  if (areThemeStylesEqual(themeStyle.value, normalized)) {
    return
  }

  themeStyle.value = normalized
}

watchEffect(() => {
  ensureThemeStyleStateNormalized()
})

watchEffect(() => {
  syncResolvedTheme(resolveThemeModeState(themeMode.value, systemDarkMode.value))
})

/**
 * Applies the resolved theme to app-level DOM state.
 */
function updateDocumentTheme(resolved: ResolvedTheme): void {
  if (!hasDocument()) {
    return
  }

  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
}

function syncResolvedTheme(nextThemeState: ThemeModeState): void {
  const style = themeStyle.value.theme.style

  if (style.auto !== nextThemeState.auto) {
    style.auto = nextThemeState.auto
  }
  if (style.dark !== nextThemeState.dark) {
    style.dark = nextThemeState.dark
  }
  if (isDark.value !== nextThemeState.isDark) {
    isDark.value = nextThemeState.isDark
  }

  updateDocumentTheme(nextThemeState.resolvedTheme)
}

function applyThemeMode(mode: ThemeMode): ThemeModeState {
  const nextThemeState = resolveThemeModeState(mode, systemDarkMode.value)

  syncResolvedTheme(nextThemeState)
  return nextThemeState
}

/**
 * Triggers a theme transition with a circular animation effect
 *
 * @param pos - [x, y] coordinates for the center of the transition animation
 * @param mode - Theme mode to switch to: 'auto', 'dark', or 'light'
 */
export async function triggerThemeTransition(
  pos: [number, number],
  mode: ThemeMode
): Promise<void> {
  const [x, y] = pos
  const isChangingToDark = resolveThemeModeState(mode, systemDarkMode.value).isDark

  const viewTransitionDocument = document as Document & {
    startViewTransition?: (callback: () => void) => { ready: Promise<void> }
  }

  const startViewTransition =
    viewTransitionDocument.startViewTransition?.bind(viewTransitionDocument)
  if (!startViewTransition) {
    applyThemeMode(mode)
    return
  }

  const transition = startViewTransition(() => {
    applyThemeMode(mode)
  })

  // Calculate animation radius
  const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))

  // Animate the transition when ready
  transition.ready.then(() => {
    const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]

    // Determine direction of animation based on theme change
    const isReversed = isChangingToDark !== isDark.value
    const animationPath = isReversed ? clipPath.reverse() : clipPath
    // const pseudoElement = isReversed ?
    //   "::view-transition-old(root)" :
    //   "::view-transition-new(root)"

    // Apply animation
    const keyframes: Keyframe[] = [{ clipPath: animationPath[0] }, { clipPath: animationPath[1] }]
    const animationOptions: AnimationEffectTiming = {
      duration: 300,
      easing: 'ease-in'
    }
    document.documentElement.animate(keyframes, animationOptions)
  })
}
