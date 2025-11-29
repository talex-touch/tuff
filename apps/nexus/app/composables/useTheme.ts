import { useColorMode } from '#imports'

export function useTheme() {
  const color = useColorMode()
  const systemDarkMode = window.matchMedia('(prefers-color-scheme: dark)')

  const toggleDark = (mode: 'auto' | 'dark' | 'light', event?: { clientX: number; clientY: number }) => {
    const isAppearanceTransition = typeof document !== 'undefined'
      // @ts-expect-error: Transition API
      && !!document.startViewTransition
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!isAppearanceTransition || !event) {
      if (mode === 'auto')
        color.preference = 'auto'
      else
        color.preference = mode
      return
    }

    const [x, y] = [event.clientX, event.clientY]
    const isChangingToDark = mode === 'dark' || (mode === 'auto' && systemDarkMode.matches)

    const transition = document.startViewTransition(() => {
      if (mode === 'auto')
        color.preference = 'auto'
      else
        color.preference = mode
    })

    transition.ready.then(() => {
      const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
      const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
      const isReversed = isChangingToDark !== (color.value === 'dark')
      const animationPath = isReversed ? clipPath.reverse() : clipPath

      document.documentElement.animate(
        [{ clipPath: animationPath[0] }, { clipPath: animationPath[1] }],
        {
          duration: 300,
          easing: 'ease-in',
        },
      )
    })
  }

  return {
    color,
    toggleDark,
  }
}
