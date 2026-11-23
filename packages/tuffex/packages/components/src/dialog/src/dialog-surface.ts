import type { BaseSurfaceMode } from '../../base-surface/src/types'
import type { DialogSurfaceProps } from './types'
import { computed } from 'vue'

const SURFACE_MODES: readonly string[] = ['pure', 'mask', 'blur', 'glass', 'refraction', 'acrylic', 'mica', 'flat', 'plain']

/**
 * The material every dialog lays under its panel, resolved as TxModal resolves its own: refraction
 * unless another known material is asked for, over the theme's overlay colour. mask keeps a
 * near-opaque fill, and the other materials sit over the colour at half strength, so text stays
 * legible and the page still shows through to be blurred and refracted.
 */
export function useDialogSurface(props: Readonly<DialogSurfaceProps>) {
  const surfaceMode = computed<BaseSurfaceMode>(() =>
    props.surface && SURFACE_MODES.includes(props.surface) ? props.surface : 'refraction',
  )

  const surfaceColor = computed(() => props.surfaceColor || 'var(--tx-bg-color-overlay, var(--tx-bg-color, #fff))')

  const surfaceOpacity = computed(() => {
    const fallback = surfaceMode.value === 'mask' ? 0.96 : 0.5
    const value = typeof props.surfaceOpacity === 'number' ? props.surfaceOpacity : fallback
    if (!Number.isFinite(value))
      return fallback
    return Math.max(0, Math.min(1, value))
  })

  return { surfaceMode, surfaceColor, surfaceOpacity }
}

interface SavedAppStyle {
  transition: string
  transform: string
  opacity: string
}

let activeBlowBlurCount = 0
let mountedBlowBlurCount = 0
let savedAppStyle: SavedAppStyle | null = null

function restoreAppBlurStyle(app: HTMLElement | null): void {
  const snapshot = savedAppStyle
  savedAppStyle = null
  if (!app)
    return

  for (const prop of ['transition', 'transform', 'opacity'] as const) {
    const prev = snapshot?.[prop]
    if (prev)
      app.style.setProperty(prop, prev)
    else
      app.style.removeProperty(prop)
  }
}

/**
 * Coordinates the `#app` zoom/dim effect across stacked `TxBlowDialog` instances so the original
 * inline style snapshot is captured once when the first dialog opens and restored only when the
 * last dialog finishes closing or unmounts.
 */
export function createBlowBackgroundBlur() {
  let active = false
  let mounted = false

  function acquire(): void {
    if (mounted)
      return
    const isVitePress = !!document.querySelector('.VPApp')
    if (isVitePress)
      return

    const app = document.getElementById('app')
    if (!app)
      return

    if (mountedBlowBlurCount === 0) {
      savedAppStyle = {
        transition: app.style.getPropertyValue('transition'),
        transform: app.style.getPropertyValue('transform'),
        opacity: app.style.getPropertyValue('opacity'),
      }
    }

    if (activeBlowBlurCount === 0) {
      Object.assign(app.style, {
        transition: 'transform .75s, opacity .75s',
        transform: 'scale(1.25)',
        opacity: '.75',
      })
    }

    mounted = true
    active = true
    mountedBlowBlurCount += 1
    activeBlowBlurCount += 1
  }

  function beginRelease(): void {
    if (!active)
      return
    active = false
    activeBlowBlurCount = Math.max(0, activeBlowBlurCount - 1)

    if (activeBlowBlurCount === 0) {
      const app = document.getElementById('app')
      if (app) {
        Object.assign(app.style, {
          transform: 'scale(1)',
          opacity: '1',
        })
      }
    }
  }

  function finishRelease(): void {
    if (active)
      beginRelease()
    if (!mounted)
      return
    mounted = false
    mountedBlowBlurCount = Math.max(0, mountedBlowBlurCount - 1)

    if (mountedBlowBlurCount === 0) {
      restoreAppBlurStyle(document.getElementById('app'))
    }
  }

  return { acquire, beginRelease, finishRelease }
}
