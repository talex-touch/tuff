// Ported from torph/src/lib/text-morph/utils/animate.ts
// (https://github.com/lochie/torph). MIT License © lochie. Kept intentionally
// close to upstream so its fixes stay diffable; deviations are limited to
// tuffex lint style and routing `element.animate` through a guard so an
// environment without WAAPI settles straight to the end state.

import { animateElement, cancelAnimations, fadeDuration } from './metrics'

export function animateExit(
  child: HTMLElement,
  options: { dx: number, dy: number, duration: number, ease: string, scale: boolean },
) {
  const { dx, dy, duration, ease, scale } = options

  animateElement(
    child,
    {
      transform: scale
        ? `translate(${dx}px, ${dy}px) scale(0.95)`
        : `translate(${dx}px, ${dy}px)`,
      offset: 1,
    },
    { duration, easing: ease, fill: 'both' },
  )

  const fadeAnimation = animateElement(
    child,
    { opacity: 0, offset: 1 },
    { duration: fadeDuration(duration, 0.25), easing: 'linear', fill: 'both' },
  )

  if (fadeAnimation)
    fadeAnimation.onfinish = () => child.remove()
  else
    child.remove()
}

export function animateEnterOrPersist(
  child: HTMLElement,
  options: { deltaX: number, deltaY: number, isNew: boolean, duration: number, ease: string },
) {
  const { deltaX, deltaY, isNew, duration, ease } = options

  const prev = cancelAnimations(child)

  const startX = deltaX + prev.tx
  const startY = deltaY + prev.ty
  const startOpacity = isNew && prev.opacity >= 1 ? 0 : prev.opacity

  animateElement(
    child,
    [
      { transform: `translate(${startX}px, ${startY}px) scale(${isNew ? 0.95 : 1})` },
      { transform: 'none' },
    ],
    { duration, easing: ease, fill: 'both' },
  )

  if (startOpacity < 1) {
    animateElement(
      child,
      [{ opacity: startOpacity }, { opacity: 1 }],
      {
        duration: fadeDuration(duration, isNew ? 0.5 : 0.25),
        delay: isNew ? fadeDuration(duration, 0.25) : 0,
        easing: 'linear',
        fill: 'both',
      },
    )
  }
}
