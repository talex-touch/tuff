import type { Ref, ShallowRef } from 'vue'
import type { LensParams, LensParamsInput } from './params'
import type { LensFieldImage } from './render'
import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { resolveLensParams } from './params'
import { renderLensField, renderLensRim, renderLensZoom } from './render'
import { supportsLensRefraction } from './support'

export type GlassLensInput = Omit<LensParamsInput, 'width' | 'height'>

export interface GlassLens {
  /** The params the images below were drawn for; null until a lens is ready. */
  params: ShallowRef<LensParams | null>
  field: ShallowRef<LensFieldImage | null>
  /** The magnification of the face; null when the lens does not magnify. */
  zoom: ShallowRef<LensFieldImage | null>
  rim: ShallowRef<string | null>
}

/**
 * Keeps the lens images in step with the element's size and the inputs. The size comes from layout
 * (a ResizeObserver's border box), never from `getBoundingClientRect`, so a transform on the element
 * or above it, the stretch of a drag included, does not count as a resize. Changes are applied once per
 * frame; the first one is applied on mount, ahead of the first paint. While `enabled` is false nothing
 * is measured, observed or drawn.
 */
export function useGlassLens(element: Ref<HTMLElement | null>, enabled: () => boolean, input: () => GlassLensInput): GlassLens {
  const params = shallowRef<LensParams | null>(null)
  const field = shallowRef<LensFieldImage | null>(null)
  const zoom = shallowRef<LensFieldImage | null>(null)
  const rim = shallowRef<string | null>(null)

  let mounted = false
  let supported: boolean | null = null
  let width = 0
  let height = 0
  let observer: ResizeObserver | null = null
  let frame = 0

  function clear(): void {
    params.value = null
    field.value = null
    zoom.value = null
    rim.value = null
  }

  function measure(box: { inlineSize: number, blockSize: number } | null): boolean {
    const target = element.value
    const nextWidth = Math.round(box ? box.inlineSize : target?.offsetWidth ?? 0)
    const nextHeight = Math.round(box ? box.blockSize : target?.offsetHeight ?? 0)
    if (nextWidth === width && nextHeight === height)
      return false
    width = nextWidth
    height = nextHeight
    return true
  }

  function observe(): void {
    if (observer || !element.value || typeof ResizeObserver === 'undefined')
      return
    observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (measure(entry?.borderBoxSize?.[0] ?? null))
        schedule()
    })
    observer.observe(element.value)
  }

  function rebuild(): void {
    frame = 0
    if (!mounted)
      return
    if (!enabled()) {
      clear()
      return
    }

    supported ??= supportsLensRefraction()
    // Without an observer, layout is read again at every rebuild; with one, it keeps width and height current.
    if (!observer)
      measure(null)
    observe()
    if (!supported || width < 1 || height < 1) {
      clear()
      return
    }

    const resolved = resolveLensParams({ ...input(), width, height })
    const ratio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const image = renderLensField(resolved, ratio)
    if (!image) {
      clear()
      return
    }
    params.value = resolved
    field.value = image
    zoom.value = renderLensZoom(resolved)
    rim.value = renderLensRim(resolved, ratio)
  }

  function schedule(): void {
    if (frame || !mounted)
      return
    if (typeof requestAnimationFrame === 'function')
      frame = requestAnimationFrame(rebuild)
    else
      rebuild()
  }

  onMounted(() => {
    mounted = true
    rebuild()
  })

  onBeforeUnmount(() => {
    mounted = false
    observer?.disconnect()
    observer = null
    if (frame && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(frame)
    frame = 0
  })

  watch(() => [enabled(), ...Object.values(input())], schedule)

  return { params, field, zoom, rim }
}
