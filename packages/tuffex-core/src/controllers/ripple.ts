import { hasDocument, hasWindow } from '../utils/env'

export interface RippleOptions {
  /** Ripple fill color. Defaults to `'currentColor'`. */
  color?: string
  /** Opacity when wave starts expanding. @default 0.22 */
  initialOpacity?: number
  /** Opacity at full expansion before fade-out. @default 0.08 */
  finalOpacity?: number
  /** Expansion duration in ms. @default 420 */
  duration?: number
  /** CSS easing curve. @default 'cubic-bezier(0.23, 1, 0.32, 1)' */
  easing?: string
  /** Disabled flag or getter. */
  disabled?: boolean | (() => boolean)
}

export interface RippleTriggerPoint {
  clientX: number
  clientY: number
}

export interface RippleEffect {
  attach: (el: HTMLElement) => void
  detach: () => void
  trigger: (point?: RippleTriggerPoint) => void
  setOptions: (next: Partial<RippleOptions>) => void
  destroy: () => void
}

function isReducedMotion(): boolean {
  return hasWindow() && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

function isElementDisabled(el: HTMLElement, optionDisabled?: boolean | (() => boolean)): boolean {
  if (typeof optionDisabled === 'function' ? optionDisabled() : optionDisabled)
    return true
  if ((el as HTMLButtonElement).disabled)
    return true
  return el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled') || el.classList.contains('is-disabled')
}

/**
 * Pure DOM tactile ripple/wave effect (replaces Vue-only `v-wave`).
 * Works identically in Vue, React, Web Components, and Shadow DOM.
 */
export function createRippleEffect(initialOptions: RippleOptions = {}): RippleEffect {
  let opts: RippleOptions = { ...initialOptions }
  let host: HTMLElement | null = null
  const activeTimers = new Set<ReturnType<typeof setTimeout>>()
  const activeWaves = new Set<HTMLElement>()

  function cleanupWave(container: HTMLElement): void {
    activeWaves.delete(container)
    if (container.parentNode)
      container.parentNode.removeChild(container)
  }

  function trigger(point?: RippleTriggerPoint): void {
    if (!host || !hasDocument() || isReducedMotion() || isElementDisabled(host, opts.disabled))
      return

    const rect = host.getBoundingClientRect()
    const width = rect.width || host.offsetWidth || 80
    const height = rect.height || host.offsetHeight || 32

    const localX = point ? point.clientX - rect.left : width / 2
    const localY = point ? point.clientY - rect.top : height / 2

    const dx = Math.max(localX, width - localX)
    const dy = Math.max(localY, height - localY)
    const radius = Math.max(12, Math.hypot(dx, dy))
    const size = radius * 2

    const doc = host.ownerDocument ?? document
    const container = doc.createElement('span')
    container.className = 'tx-ripple-container'
    container.setAttribute('data-v-wave-container-internal', '')
    container.setAttribute('aria-hidden', 'true')
    Object.assign(container.style, {
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
      borderRadius: 'inherit',
      pointerEvents: 'none',
      zIndex: '0',
    })

    const wave = doc.createElement('span')
    wave.className = 'tx-ripple-wave'
    const duration = opts.duration ?? 420
    const easing = opts.easing ?? 'cubic-bezier(0.23, 1, 0.32, 1)'
    const initialOpacity = opts.initialOpacity ?? 0.22
    const finalOpacity = opts.finalOpacity ?? 0.08
    const color = opts.color ?? 'currentColor'

    Object.assign(wave.style, {
      position: 'absolute',
      left: `${localX - radius}px`,
      top: `${localY - radius}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '9999px',
      backgroundColor: color,
      opacity: String(initialOpacity),
      transform: 'scale(0)',
      transformOrigin: 'center center',
      pointerEvents: 'none',
      willChange: 'transform, opacity',
    })

    container.appendChild(wave)

    const computedPosition = hasWindow() && typeof getComputedStyle === 'function'
      ? getComputedStyle(host).position
      : ''
    if (computedPosition === 'static')
      host.style.position = 'relative'

    host.appendChild(container)
    activeWaves.add(container)

    if (typeof wave.animate === 'function') {
      const animation = wave.animate(
        [
          { transform: 'scale(0)', opacity: initialOpacity },
          { transform: 'scale(1)', opacity: finalOpacity, offset: 0.72 },
          { transform: 'scale(1)', opacity: 0 },
        ],
        {
          duration,
          easing,
          fill: 'forwards',
        },
      )
      const finish = () => cleanupWave(container)
      animation.addEventListener('finish', finish, { once: true })
      animation.addEventListener('cancel', finish, { once: true })
      return
    }

    wave.style.transition = `transform ${duration}ms ${easing}, opacity ${duration}ms ${easing}`
    void wave.offsetWidth
    wave.style.transform = 'scale(1)'
    wave.style.opacity = '0'

    const timer = setTimeout(() => {
      activeTimers.delete(timer)
      cleanupWave(container)
    }, duration + 32)
    activeTimers.add(timer)
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 && event.pointerType === 'mouse')
      return
    trigger({ clientX: event.clientX, clientY: event.clientY })
  }

  function detach(): void {
    if (host) {
      host.removeEventListener('pointerdown', onPointerDown)
      host = null
    }
  }

  function attach(el: HTMLElement): void {
    if (host === el)
      return
    detach()
    host = el
    host.addEventListener('pointerdown', onPointerDown)
  }

  function setOptions(next: Partial<RippleOptions>): void {
    opts = { ...opts, ...next }
  }

  function destroy(): void {
    detach()
    for (const timer of activeTimers)
      clearTimeout(timer)
    activeTimers.clear()
    for (const container of Array.from(activeWaves))
      cleanupWave(container)
  }

  return {
    attach,
    detach,
    trigger,
    setOptions,
    destroy,
  }
}

/**
 * Convenience helper: attaches a ripple effect to `el` and returns a teardown function.
 */
export function attachRipple(el: HTMLElement, options: RippleOptions = {}): () => void {
  const ripple = createRippleEffect(options)
  ripple.attach(el)
  return () => ripple.destroy()
}
