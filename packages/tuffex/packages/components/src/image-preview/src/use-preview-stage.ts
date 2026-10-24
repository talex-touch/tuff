import type { Ref } from 'vue'
import type { PreviewBox, PreviewPoint, PreviewSize } from './zoom'
import { onBeforeUnmount, shallowRef, watch } from 'vue'

// The stage. The fit box is an invisible element the stylesheet places, so the room the chrome
// takes, the safe areas and the phone layout are all CSS; this only reads it back.

export interface PreviewStageOptions {
  overlay: Readonly<Ref<HTMLElement | null>>
  stage: Readonly<Ref<HTMLElement | null>>
  /** The fit box's element. */
  fit: Readonly<Ref<HTMLElement | null>>
}

export interface PreviewStage {
  stageSize: Readonly<Ref<PreviewSize>>
  /** Where a picture is fitted, in the stage's pixels. */
  fitBox: Readonly<Ref<PreviewBox>>
  /** A point in the overlay's pixels, which are the stage's. */
  overlayPoint: (event: { clientX: number, clientY: number }) => PreviewPoint
}

export function usePreviewStage(options: PreviewStageOptions): PreviewStage {
  const stageSize = shallowRef<PreviewSize>({ width: 0, height: 0 })
  const fitBox = shallowRef<PreviewBox>({ x: 0, y: 0, width: 0, height: 0 })
  let resizeObserver: ResizeObserver | undefined

  function measure(): void {
    const stage = options.stage.value
    const fit = options.fit.value
    if (!stage || !fit)
      return
    const size = stageSize.value
    if (size.width !== stage.clientWidth || size.height !== stage.clientHeight)
      stageSize.value = { width: stage.clientWidth, height: stage.clientHeight }
    const box = fitBox.value
    if (box.x !== fit.offsetLeft || box.y !== fit.offsetTop || box.width !== fit.offsetWidth || box.height !== fit.offsetHeight)
      fitBox.value = { x: fit.offsetLeft, y: fit.offsetTop, width: fit.offsetWidth, height: fit.offsetHeight }
  }

  watch(options.stage, (stage) => {
    resizeObserver?.disconnect()
    resizeObserver = undefined
    if (!stage)
      return
    measure()
    if (typeof ResizeObserver === 'undefined')
      return
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(stage)
    if (options.fit.value)
      resizeObserver.observe(options.fit.value)
  }, { flush: 'post' })

  onBeforeUnmount(() => resizeObserver?.disconnect())

  function overlayPoint(event: { clientX: number, clientY: number }): PreviewPoint {
    const rect = options.overlay.value?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }

  return { stageSize, fitBox, overlayPoint }
}
