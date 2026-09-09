// Ported from torph/src/lib/text-morph/utils/number-animate.ts
// (https://github.com/lochie/torph). MIT License © lochie. Kept intentionally
// close to upstream so its fixes stay diffable; deviations are limited to
// tuffex lint style and routing `element.animate` through a guard so an
// environment without WAAPI settles straight to the end state.

import type { MorphSegmentKind } from './types'
import { moverOf } from './dom'
import { animateElement, cancelAnimations, getAnimationsOf, parseTranslate } from './metrics'

// Shares of the morph, not fixed lengths. The outgoing share is larger because a
// digit that has already left is a hole in the number.
const EXIT_FADE = 0.45
const ENTER_FADE = 0.25

/**
 * The slot takes the FLIP correction, the character inside it takes the slide and
 * fade. Keeping the slide off the slot is what lets a digit cross a whole line box
 * without the next morph measuring it as moved.
 */
export function animateNumberExit(
  slot: HTMLElement,
  options: { dx: number, dy: number, slideDistance: number, duration: number, ease: string },
) {
  const { dx, dy, slideDistance, duration, ease } = options
  const mover = moverOf(slot)

  animateElement(
    slot,
    { transform: `translate(${dx}px, ${dy}px)`, offset: 1 },
    { duration, easing: ease, fill: 'both' },
  )

  animateElement(
    mover,
    { transform: `translate(0px, ${slideDistance}px)`, offset: 1 },
    { duration, easing: ease, fill: 'both' },
  )

  const fadeAnimation = animateElement(
    mover,
    { opacity: 0, offset: 1 },
    { duration: duration * EXIT_FADE, easing: 'linear', fill: 'both' },
  )

  // The slot goes, not just its contents.
  if (fadeAnimation)
    fadeAnimation.onfinish = () => slot.remove()
  else
    slot.remove()
}

export function animateNumberEnter(
  slot: HTMLElement,
  options: {
    deltaX: number
    deltaY: number
    slideDistance: number
    kind: MorphSegmentKind
    duration: number
    ease: string
  },
) {
  const { deltaX, deltaY, slideDistance, kind, duration, ease } = options

  animateNumberPersist(slot, { deltaX, deltaY, duration, ease })

  const mover = moverOf(slot)
  const prev = cancelAnimations(mover)

  // Digits arrive from above, separators from below, so each reads as its own event.
  const from = kind === 'digit' ? -slideDistance : slideDistance

  animateElement(
    mover,
    { transform: `translate(0px, ${prev.ty + from}px)`, offset: 0 },
    { duration, easing: ease, fill: 'both' },
  )

  const startOpacity = prev.opacity >= 1 ? 0 : prev.opacity
  if (startOpacity < 1) {
    animateElement(
      mover,
      [{ opacity: startOpacity }, { opacity: 1 }],
      { duration: duration * ENTER_FADE, easing: 'linear', fill: 'both' },
    )
  }
}

export function animateNumberPersist(
  slot: HTMLElement,
  options: { deltaX: number, deltaY: number, duration: number, ease: string },
) {
  const { deltaX, deltaY, duration, ease } = options

  const { tx, ty } = parseTranslate(slot)
  getAnimationsOf(slot).forEach(a => a.cancel())

  const startX = deltaX + tx
  const startY = deltaY + ty

  if (startX === 0 && startY === 0)
    return

  animateElement(
    slot,
    { transform: `translate(${startX}px, ${startY}px)`, offset: 0 },
    { duration, easing: ease, fill: 'both' },
  )
}
