export interface AiComposerMotionSize {
  width: number
  height: number
}

export const AI_COMPOSER_SPRING_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'
export const AI_COMPOSER_SNAP_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
    return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function measureElementSize(el: HTMLElement | null): AiComposerMotionSize | null {
  if (!el || typeof el.getBoundingClientRect !== 'function')
    return null
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0)
    return null
  return { width: rect.width, height: rect.height }
}

/**
 * Smoothly bridge composer height/width changes (e.g. attachment tray or
 * dictation bar opening) without fighting user typing or reduced-motion rules.
 */
export function animateComposerBoxMorph(
  boxEl: HTMLElement | null,
  from: AiComposerMotionSize | null,
  to: AiComposerMotionSize | null,
  onSettled?: () => void,
): (() => void) | null {
  if (
    !boxEl
    || !from
    || !to
    || prefersReducedMotion()
    || typeof boxEl.animate !== 'function'
  ) {
    onSettled?.()
    return null
  }

  const deltaY = Math.abs(to.height - from.height)
  const deltaX = Math.abs(to.width - from.width)
  if (deltaY < 2 && deltaX < 2) {
    onSettled?.()
    return null
  }

  const anim = boxEl.animate(
    [
      { height: `${from.height}px` },
      { height: `${to.height}px` },
    ],
    {
      duration: 210,
      easing: AI_COMPOSER_SPRING_EASING,
    },
  )

  let stopped = false
  const finish = () => {
    if (stopped)
      return
    stopped = true
    onSettled?.()
  }

  anim.addEventListener('finish', finish, { once: true })
  anim.addEventListener('cancel', finish, { once: true })

  return () => {
    stopped = true
    anim.cancel()
  }
}

/**
 * Play CoreApp's crisp launch impulse when a message leaves the composer into the stream.
 */
export function animateComposerLaunch(
  boxEl: HTMLElement | null,
  ghostEl: HTMLElement | null,
): (() => void) | null {
  if (prefersReducedMotion())
    return null

  const cleanups: Array<() => void> = []

  if (boxEl && typeof boxEl.animate === 'function') {
    const boxAnim = boxEl.animate(
      [
        { transform: 'translateY(0px) scale(1)' },
        { transform: 'translateY(-3px) scale(0.996)', offset: 0.38 },
        { transform: 'translateY(0px) scale(1)' },
      ],
      {
        duration: 240,
        easing: AI_COMPOSER_SNAP_EASING,
      },
    )
    cleanups.push(() => boxAnim.cancel())
  }

  if (ghostEl && typeof ghostEl.animate === 'function') {
    const ghostAnim = ghostEl.animate(
      [
        { opacity: 0.7, transform: 'translateY(0px) scale(1)' },
        { opacity: 0, transform: 'translateY(-18px) scale(0.985)' },
      ],
      {
        duration: 220,
        easing: AI_COMPOSER_SPRING_EASING,
        fill: 'forwards',
      },
    )
    cleanups.push(() => ghostAnim.cancel())
  }

  if (!cleanups.length)
    return null

  return () => {
    for (const stop of cleanups)
      stop()
  }
}
