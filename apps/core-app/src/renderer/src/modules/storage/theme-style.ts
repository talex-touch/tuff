import type { RemovableRef } from '@vueuse/core'
import { useDark, usePreferredDark, useStorage } from '@vueuse/core'
import { watchEffect } from 'vue'

/**
 * Interface for theme style configuration
 */
interface IThemeStyle {
  theme: {
    window: string
    style: {
      dark: boolean
      auto: boolean
    }
    addon: {
      contrast: boolean
      coloring: boolean
    }
    transition: {
      route: 'slide' | 'fade' | 'zoom'
    }
  }
}

/**
 * Default theme style configuration
 */
const defaultThemeStyle: IThemeStyle = {
  theme: {
    window: 'Mica',
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

/**
 * Persistent storage for theme preferences
 */
export const themeStyle: RemovableRef<IThemeStyle> = useStorage<IThemeStyle>(
  'theme-style',
  defaultThemeStyle
)

/**
 * Reactive dark mode state
 */
export const isDark = useDark()

/**
 * System dark mode preference
 */
export const systemDarkMode = usePreferredDark()

// Automatically sync theme with system when in auto mode
watchEffect(() => {
  if (themeStyle.value.theme.style.auto) {
    const newDarkValue = systemDarkMode.value
    if (isDark.value !== newDarkValue) {
      isDark.value = newDarkValue
      updateDocumentClass(newDarkValue)
    }
  }
})

/**
 * Updates document class based on dark mode state
 * @param isDarkMode - Whether dark mode is active
 */
function updateDocumentClass(isDarkMode: boolean): void {
  const classList = document.documentElement.classList
  isDarkMode ? classList.add('dark') : classList.remove('dark')
}

/**
 * Theme mode type
 */
export type ThemeMode = 'auto' | 'dark' | 'light'

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
  const isChangingToDark = mode === 'dark' || (mode === 'auto' && systemDarkMode.value)

  // @ts-ignore - View Transitions API may not be recognized by TypeScript
  const transition = document.startViewTransition(() => {
    // Update theme settings
    themeStyle.value.theme.style.auto = mode === 'auto'

    // Set dark value based on mode
    if (mode === 'auto') {
      isDark.value = systemDarkMode.value
    } else {
      isDark.value = mode === 'dark'
    }

    // Update document class
    updateDocumentClass(isDark.value)
  })

  // Calculate animation radius
  // @ts-ignore - Math.hypot with these parameters is valid
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
