import type { ThemeTransitionOptions } from '../utils/theme-transition'
import { useColorMode } from '#imports'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'
import { applyThemeTransition } from '../utils/theme-transition'

export function useTheme() {
  const color = useColorMode()

  const applyPreference = (mode: 'auto' | 'dark' | 'light') => {
    if (mode === 'auto')
      color.preference = 'auto'
    else
      color.preference = mode
  }

  const toggleDark = (
    mode: 'auto' | 'dark' | 'light',
    event?: { clientX: number, clientY: number } | MouseEvent,
    options?: Partial<ThemeTransitionOptions>,
  ) => {
    if (!hasWindow() || !hasDocument()) {
      applyPreference(mode)
      return
    }

    applyThemeTransition(
      () => applyPreference(mode),
      {
        origin: event,
        variant: 'circle-blur',
        ...options,
      },
    )
  }

  return {
    color,
    toggleDark,
  }
}
