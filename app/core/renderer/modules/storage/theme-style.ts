import { RemovableRef, useDark, useStorage } from '@vueuse/core'

const IThemeStyle = {
  theme: {
    window: 'Mica',
    style: {
      dark: false,
      auto: true,
    },
    addon: {
      contrast: false,
      coloring: false,
    }
  }
}

export const themeStyle: RemovableRef<typeof IThemeStyle> = useStorage<typeof IThemeStyle>('theme-style', IThemeStyle)

export const isDark = useDark()

export async function triggerThemeTransition(pos: [number, number], mode: string) {
  const [x, y] = pos
  // @ts-ignore
  const transition = document.startViewTransition(() => {
     if (mode === 'auto') {
      themeStyle.value.theme.style.auto = true
      themeStyle.value.theme.style.dark = isDark.value
    } else {
      themeStyle.value.theme.style.auto = false
      themeStyle.value.theme.style.dark = mode === 'dark'
    }
    const l = document.body.parentElement.classList
    mode === 'dark' ? l.add('dark') : l.remove('dark')
  })

  // @ts-ignore
  const endRadius = Math.hypot(
    Math.max(x, innerWidth - x),
    Math.max(y, innerHeight - y)
  );

  transition.ready.then(() => {
    const clipPath = [
      `circle(0px at ${x}px ${y}px)`,
      `circle(${endRadius}px at ${x}px ${y}px)`
    ]

    if (mode !== 'dark') {
      document.documentElement.animate(
        {
          clipPath: !isDark.value ? clipPath.reverse() : clipPath,
        },
        {
          duration: 500,
          easing: "ease-in",
          pseudoElement: !isDark.value ? "::view-transition-old(root)" : "::view-transition-new(root)",
        }
      );
    } else

      document.documentElement.animate(
        {
          clipPath: isDark.value ? clipPath.reverse() : clipPath,
        },
        {
          duration: 500,
          easing: "ease-in",
          pseudoElement: isDark.value ? "::view-transition-old(root)" : "::view-transition-new(root)",
        }
      );
  })
}