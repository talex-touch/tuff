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
