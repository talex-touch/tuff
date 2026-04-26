import type { WritableComputedRef } from 'vue'
import { StorageList } from '@talex-touch/utils'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { createStorageProxy, TouchStorage } from '@talex-touch/utils/renderer/storage/base-storage'
import { useDark, usePreferredDark } from '@vueuse/core'
import { computed, watchEffect } from 'vue'
import {
  areThemeStylesEqual,
  createDefaultThemeStyle,
  normalizeThemeStyle,
  parseLegacyThemeStyle,
  resolveThemeModeState,
  type ThemeMode,
  type ThemeModeState,
  type ThemeStyleState
} from './theme-style.utils'

export {
  normalizeWindowPreference,
  type ThemeMode,
  type ThemeStyleState,
  type ThemeTransitionRoute,
  type ThemeWindowPreference
} from './theme-style.utils'

const THEME_STYLE_STORAGE_SINGLETON_KEY = `storage:${StorageList.THEME_STYLE}`
const LEGACY_THEME_STYLE_LOCAL_STORAGE_KEY = 'theme-style'

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

export async function migrateLegacyThemeStyleStorage(): Promise<void> {
  await themeStyleStorage.whenHydrated()

  if (!hasWindow() || !window.localStorage) {
    return
  }

  let rawLegacyValue: string | null = null
  try {
    rawLegacyValue = window.localStorage.getItem(LEGACY_THEME_STYLE_LOCAL_STORAGE_KEY)
    if (rawLegacyValue === null) {
      return
    }
    window.localStorage.removeItem(LEGACY_THEME_STYLE_LOCAL_STORAGE_KEY)
  } catch {
    return
  }

  const migrated = parseLegacyThemeStyle(rawLegacyValue)
  if (!migrated) {
    return
  }

  const current = normalizeThemeStyle(themeStyleStorage.get())
  const fallback = createDefaultThemeStyle()
  if (areThemeStylesEqual(current, fallback)) {
    themeStyleStorage.set(migrated)
  }
}

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

// Automatically sync theme with system when in auto mode
watchEffect(() => {
  const style = themeStyle.value.theme.style
  if (!style.auto) {
    return
  }

  const autoState = resolveThemeModeState('auto', systemDarkMode.value)

  if (style.dark !== autoState.dark) {
    style.dark = autoState.dark
  }
  if (isDark.value !== autoState.isDark) {
    isDark.value = autoState.isDark
  }

  updateDocumentClass(autoState.isDark)
})

/**
 * Updates document class based on dark mode state
 * @param isDarkMode - Whether dark mode is active
 */
function updateDocumentClass(isDarkMode: boolean): void {
  if (!hasDocument()) {
    return
  }

  const classList = document.documentElement.classList
  isDarkMode ? classList.add('dark') : classList.remove('dark')
}

function applyThemeMode(mode: ThemeMode): ThemeModeState {
  const nextThemeState = resolveThemeModeState(mode, systemDarkMode.value)

  themeStyle.value.theme.style.auto = nextThemeState.auto
  themeStyle.value.theme.style.dark = nextThemeState.dark

  if (isDark.value !== nextThemeState.isDark) {
    isDark.value = nextThemeState.isDark
  }

  updateDocumentClass(nextThemeState.isDark)
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
