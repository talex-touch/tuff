import type { Ref } from 'vue'
import type { PreviewOrigin } from './flight'
import type { ImagePreviewOrigin } from './types'
import { onBeforeUnmount } from 'vue'
import { hasDocument } from '../../../../utils/env'
import { isOriginInView, resolveOrigin } from './flight'

// Origins. The host says where a picture sits on the page. It flies out of there on opening and
// back on closing, and the thumbnail it left stays hidden while it is in the air.

export interface PreviewOriginsOptions {
  /** The host's word on where picture `at` sits; nothing when the preview may not fly at all. */
  origin: () => ((at: number) => ImagePreviewOrigin | null | undefined) | null
  overlay: Readonly<Ref<HTMLElement | null>>
}

export interface PreviewOrigins {
  /**
   * Where picture `at` sits, in the stage's pixels, if the preview may fly it there: asked for, and
   * in view. A picture already in the air follows its thumbnail out of view too (`inView: false`).
   */
  zoomOrigin: (at: number, inView?: boolean) => PreviewOrigin | null
  /** Hides the thumbnail a picture flies out of, showing any other hidden before. */
  hideOrigin: (origin: PreviewOrigin) => void
  showOrigin: () => void
}

export function usePreviewOrigins(options: PreviewOriginsOptions): PreviewOrigins {
  let hiddenOrigin: { element: HTMLElement, opacity: string, transition: string } | null = null

  function zoomOrigin(at: number, inView = true): PreviewOrigin | null {
    const locate = options.origin()
    if (!locate || !hasDocument())
      return null
    const origin = resolveOrigin(locate(at))
    if (!origin || (inView && !isOriginInView(origin, { width: window.innerWidth, height: window.innerHeight })))
      return null
    const root = options.overlay.value?.getBoundingClientRect()
    if (root && (root.left || root.top)) {
      origin.box = { ...origin.box, x: origin.box.x - root.left, y: origin.box.y - root.top }
      if (origin.clip)
        origin.clip = { ...origin.clip, x: origin.clip.x - root.left, y: origin.clip.y - root.top }
    }
    return origin
  }

  function showOrigin(): void {
    const saved = hiddenOrigin
    hiddenOrigin = null
    if (!saved)
      return
    const { element } = saved
    element.style.opacity = saved.opacity
    // Back at once: a fade of its own would show the page through where the picture landed.
    void getComputedStyle(element).opacity
    element.style.transition = saved.transition
  }

  function hideOrigin(origin: PreviewOrigin): void {
    const element = origin.element
    if (hiddenOrigin?.element === element)
      return
    showOrigin()
    if (!element)
      return
    hiddenOrigin = { element, opacity: element.style.opacity, transition: element.style.transition }
    element.style.transition = 'none'
    element.style.opacity = '0'
  }

  onBeforeUnmount(showOrigin)

  return { zoomOrigin, hideOrigin, showOrigin }
}
