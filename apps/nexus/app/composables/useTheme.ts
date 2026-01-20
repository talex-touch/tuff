import { useColorMode } from '#imports'
import { hasDocument, hasWindow } from '@talex-touch/utils/env'

export function useTheme() {
  const color = useColorMode()
  const systemDarkMode = hasWindow() ? window.matchMedia('(prefers-color-scheme: dark)') : null

  const applyPreference = (mode: 'auto' | 'dark' | 'light') => {
    if (mode === 'auto')
      color.preference = 'auto'
    else
      color.preference = mode
  }

  const toggleDark = (mode: 'auto' | 'dark' | 'light', event?: { clientX: number, clientY: number }) => {
    if (!hasWindow() || !hasDocument()) {
      applyPreference(mode)
      return
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isAppearanceTransition = !prefersReducedMotion
      && ('startViewTransition' in document)
    const isChangingToDark = mode === 'dark' || (mode === 'auto' && systemDarkMode?.matches)

    if (!isAppearanceTransition || !event) {
      applyPreference(mode)
      return
    }

    const [x, y] = [event.clientX, event.clientY]

    const transition = document.startViewTransition(() => {
      applyPreference(mode)
    })

    transition.ready.then(() => {
      const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
      const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
      const animationPath = isChangingToDark ? clipPath : [...clipPath].reverse()
      const target = isChangingToDark ? '::view-transition-new(root)' : '::view-transition-old(root)'

      document.documentElement.animate(
        [{ clipPath: animationPath[0] }, { clipPath: animationPath[1] }],
        {
          duration: 300,
          easing: 'ease-in',
          pseudoElement: target,
        },
      )
    })
  }

  return {
    color,
    toggleDark,
  }
}
