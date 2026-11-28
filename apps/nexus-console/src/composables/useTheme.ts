import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { computed, ref } from 'vue'

export type ThemePreference = 'light' | 'dark' | 'system'

const THEME_STORAGE_KEY = 'tuff-console-theme'
const preference = ref<ThemePreference>(readInitialPreference())

function readInitialPreference(): ThemePreference {
  if (!hasWindow())
    return 'system'
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system')
      return saved
  }
  catch {
    // Ignore storage errors.
  }
  return 'system'
}

function resolveDark(pref: ThemePreference): boolean {
  if (pref === 'dark')
    return true
  if (pref === 'light')
    return false
  if (!hasWindow())
    return false
  const matcher = window.matchMedia
  if (typeof matcher !== 'function')
    return false
  return matcher('(prefers-color-scheme: dark)').matches
}

export function applyTheme(pref: ThemePreference = preference.value) {
  const dark = resolveDark(pref)
  if (hasDocument()) {
    document.documentElement.classList.toggle('dark', dark)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }
}

export function useTheme() {
  const isDark = computed(() => resolveDark(preference.value))

  function setTheme(next: ThemePreference) {
    preference.value = next
    if (hasWindow()) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next)
      }
      catch {
        // Ignore storage errors.
      }
    }
    applyTheme(next)
  }

  function toggleTheme() {
    setTheme(isDark.value ? 'light' : 'dark')
  }

  return {
    preference,
    isDark,
    setTheme,
    toggleTheme,
  }
}
