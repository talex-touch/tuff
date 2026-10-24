import type { Ref } from 'vue'
import type { FlightPose, PreviewFlight, PreviewOrigin } from './flight'
import type { ImagePreviewItem } from './types'
import type { PreviewOrigins } from './use-preview-origin'
import type { PreviewPictures } from './use-preview-pictures'
import type { PreviewTransition } from './use-preview-transition'
import type { PreviewSize } from './zoom'
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { hasDocument } from '../../../../utils/env'
import { createFocusReturn } from '../../../../utils/focus-trap'
import { useZIndexAllocator } from '../../../../utils/z-index-manager'
import { originPose, uprightAngle } from './flight'

// Opening and closing. The current picture flies out of its thumbnail when the host gives one in
// view and the picture is ready to draw within a moment, and the preview fades in otherwise; it
// goes the same way, home from wherever the picture is drawn, or turning round mid-air. Focus
// comes in with it and goes back to where it was.

/** How long an opening waits for its picture before it fades in instead (ms). */
const PICTURE_WAIT_MS = 150

export interface PreviewPresenceOptions {
  /** The host's model, which an empty list closes. */
  open: Ref<boolean>
  items: () => readonly ImagePreviewItem[]
  /** The current picture's index, which an opening brings inside the list. */
  current: Ref<number>
  clampIndex: (value: number) => number
  overlay: Readonly<Ref<HTMLElement | null>>
  stage: Readonly<Ref<HTMLElement | null>>
  transition: PreviewTransition
  pictures: PreviewPictures
  origins: PreviewOrigins
  /** The current picture as drawn now, `size` big: the flight home leaves from there. */
  drawnPose: (size: PreviewSize) => FlightPose
  /** An opening, once it no longer closes. */
  onEnter: () => void
  /** A closing, before it begins. */
  onLeave: () => void
  /** The gestures back at rest. */
  resetGestures: () => void
  /** Gone at last. */
  onGone: () => void
  /** The person closed it (see requestClose). */
  onClose: () => void
}

export interface PreviewPresence {
  /** In the page: from the opening until the last of the closing. */
  rendered: Readonly<Ref<boolean>>
  closing: Readonly<Ref<boolean>>
  /** The preview has begun to come in; a flight first waits a moment for its picture. */
  arrived: Readonly<Ref<boolean>>
  /** The picture in the air, if one is. */
  flight: Readonly<Ref<PreviewFlight | null>>
  zIndex: Readonly<Ref<number>>
  enter: () => void
  leave: () => void
  /**
   * The person closed it: the close button, Escape, the backdrop, or a drag away (`velocity`, in
   * px/s). Returns whether the picture flies home, rather than gliding on as thrown.
   */
  requestClose: (velocity?: [number, number]) => boolean
  /**
   * A hand reaching for the picture flying out lands it at once. A wheel or a key does not: the
   * flight lands on whatever they do to it, and Escape turns it round.
   */
  settleOpen: () => void
}

/** A throw's speed (px/s) as the flight home's (progress/s): its share along the way there. */
function flightSpeed(velocity: [number, number] | null, from: FlightPose, to: FlightPose): number | undefined {
  if (!velocity)
    return undefined
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = dx * dx + dy * dy
  if (distance < 1)
    return 0
  return Math.min(0.5, Math.max(-10, (velocity[0] * dx + velocity[1] * dy) / distance))
}

type Leaving =
  | { kind: 'turn' }
  | { kind: 'home', origin: PreviewOrigin, size: PreviewSize }
  | { kind: 'fade' }

export function usePreviewPresence(options: PreviewPresenceOptions): PreviewPresence {
  const { open, current, transition, pictures, origins } = options
  const { sizes, standIns, isFailed } = pictures
  // Resolved in setup: inject is only valid here, while allocation happens on opening.
  const zIndexAllocator = useZIndexAllocator()

  const flight = shallowRef<PreviewFlight | null>(null)
  const rendered = ref(false)
  const closing = ref(false)
  const arrived = ref(false)
  const zIndex = ref(zIndexAllocator.get())
  const focusReturn = createFocusReturn()
  /** Every opening and closing bumps it, so an opening still waiting for its picture gives up. */
  let openToken = 0
  /** How fast a drag threw the picture away (px/s), for its flight home. */
  let pendingVelocity: [number, number] | null = null

  function currentItem(): ImagePreviewItem | null {
    return options.items()[current.value] ?? null
  }

  function settleOpen(): void {
    if (flight.value && !closing.value)
      transition.finish()
  }

  /** The flight out has landed: the thumbnail shows again, under the mask. */
  function landed(): void {
    flight.value = null
    origins.showOrigin()
  }

  // The page can move under a picture in the air. On the way home the dialog is inert and a wheel
  // scrolls the page behind it; on the way out a scroll already under way runs on. The picture
  // flies to and from its thumbnail where it is now, not where it was when the flight began.
  function followOrigin(): void {
    const shown = flight.value
    const origin = shown ? origins.zoomOrigin(shown.index, false) : null
    if (!shown || !origin)
      return
    origins.hideOrigin(origin)
    flight.value = { ...shown, from: { ...originPose(shown.size, origin), angle: shown.from.angle } }
  }

  watch(() => flight.value !== null, (flying, _, onCleanup) => {
    if (!flying || !hasDocument())
      return
    // Scroll events do not bubble; capturing them on the window hears every scroller's.
    window.addEventListener('scroll', followOrigin, { capture: true, passive: true })
    window.addEventListener('resize', followOrigin, { passive: true })
    onCleanup(() => {
      window.removeEventListener('scroll', followOrigin, { capture: true })
      window.removeEventListener('resize', followOrigin)
    })
  })

  /** Waits up to `ms` for the current picture to be ready to draw, so a flight never starts empty. */
  function pictureReady(ms: number): Promise<void> {
    const image = options.stage.value?.querySelector<HTMLImageElement>('.tx-image-preview__slide:not([aria-hidden]) .tx-image-preview__image')
    if (!image || typeof image.decode !== 'function')
      return Promise.resolve()
    return Promise.race([
      image.decode().catch(() => {}),
      new Promise<void>(resolve => setTimeout(resolve, ms)),
    ]).then(() => {
      if (image.complete && image.naturalWidth > 0)
        pictures.markLoaded(image)
    })
  }

  async function startOpen(token: number): Promise<void> {
    const at = current.value
    const item = options.items()[at]
    let origin = item && !isFailed(item.url) ? origins.zoomOrigin(at) : null
    if (item && origin) {
      pictures.adoptOrigin(item, origin)
      if (!standIns.value.has(item.url)) {
        await pictureReady(PICTURE_WAIT_MS)
        if (token !== openToken)
          return
        // The page may have scrolled on while the picture got ready.
        origin = origins.zoomOrigin(at)
      }
    }
    arrived.value = true
    const size = item ? sizes.value.get(item.url) ?? standIns.value.get(item.url)?.size : undefined
    if (!item || !origin || !size || isFailed(item.url) || current.value !== at) {
      transition.enter('fade')
      return
    }
    flight.value = { index: at, from: originPose(size, origin), to: null, size }
    origins.hideOrigin(origin)
    transition.enter('zoom', landed)
  }

  function enter(): void {
    if (options.items().length === 0) {
      open.value = false
      return
    }
    focusReturn.save(options.overlay.value)
    zIndex.value = zIndexAllocator.next()
    current.value = options.clampIndex(current.value)
    const reopening = rendered.value && closing.value
    closing.value = false
    options.onEnter()
    const token = ++openToken
    const shown = flight.value
    if (reopening && shown?.index === current.value && transition.kind.value === 'zoom') {
      // Opened again on its way home: it turns round and flies back out, landing on its fit.
      options.resetGestures()
      flight.value = { ...shown, to: null }
      transition.enter('zoom', landed)
    }
    else if (reopening && !shown && transition.kind.value === 'fade') {
      options.resetGestures()
      transition.enter('fade')
    }
    else {
      origins.showOrigin()
      flight.value = null
      transition.reset()
      options.resetGestures()
      arrived.value = false
      if (!rendered.value) {
        rendered.value = true
        pictures.armSkeleton()
      }
      nextTick(() => {
        if (token === openToken)
          void startOpen(token)
      })
    }
    nextTick(() => {
      options.overlay.value?.focus({ preventScroll: true })
    })
  }

  /** How the preview would go now: back the way a flight still coming in came, home from where the picture is drawn, or a fade. */
  function leaving(): Leaving {
    const shown = flight.value
    // A picture paged away from mid-air lands beside at once, and the current one goes (see leave).
    const aside = shown !== null && shown.index !== current.value
    if (shown && !aside && transition.kind.value === 'zoom')
      return { kind: 'turn' }
    if (!aside && (transition.running.value || transition.presence.value !== 1))
      return { kind: 'fade' }
    const item = currentItem()
    const size = item && !isFailed(item.url) ? sizes.value.get(item.url) ?? standIns.value.get(item.url)?.size : undefined
    const origin = size ? origins.zoomOrigin(current.value) : null
    return origin && size ? { kind: 'home', origin, size } : { kind: 'fade' }
  }

  function finishLeave(): void {
    origins.showOrigin()
    flight.value = null
    rendered.value = false
    closing.value = false
    arrived.value = false
    pictures.clearSkeletonTimer()
    options.resetGestures()
    transition.reset()
    pictures.clearStandIns()
    options.onGone()
  }

  function leave(): void {
    if (!rendered.value || closing.value)
      return
    const plan = leaving()
    openToken++
    const velocity = pendingVelocity
    pendingVelocity = null
    options.onLeave()
    closing.value = true
    focusReturn.restore()
    if (plan.kind === 'turn') {
      // Closed while still flying out: it turns round and goes home the way it came, keeping its speed.
      transition.leave('zoom', finishLeave)
      return
    }
    // Still in the air, the picture paged away from lands beside, out of the way of this one's going.
    if (flight.value)
      transition.finish()
    if (plan.kind === 'home') {
      // Home from where it is drawn: zoomed, turned, paged part-way or pulled down. The gestures
      // are left as they are, so a closing drag's fade carries on from where it was let go.
      const to = options.drawnPose(plan.size)
      const from = { ...originPose(plan.size, plan.origin), angle: uprightAngle(to.angle) }
      flight.value = { index: current.value, from, to, size: plan.size }
      origins.hideOrigin(plan.origin)
      transition.leave('zoom', finishLeave, flightSpeed(velocity, from, to))
      return
    }
    // A picture thrown away keeps flying while everything fades; anything still held goes back.
    transition.leave('fade', finishLeave)
  }

  function requestClose(velocity?: [number, number]): boolean {
    if (!open.value)
      return false
    // Decided first: with a v-model the preview hears of the close a moment later.
    const flies = !closing.value && rendered.value && leaving().kind !== 'fade'
    pendingVelocity = velocity ?? null
    open.value = false
    options.onClose()
    return flies
  }

  onBeforeUnmount(() => {
    if (rendered.value && !closing.value)
      focusReturn.restore()
  })

  return { rendered, closing, arrived, flight, zIndex, enter, leave, requestClose, settleOpen }
}
