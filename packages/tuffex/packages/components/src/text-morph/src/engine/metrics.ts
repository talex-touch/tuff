// Extracted from torph/src/lib/utils/animate.ts (https://github.com/lochie/torph).
// MIT License © lochie. Split out from the container-size transition so the FLIP,
// DOM and per-segment animation modules can share the measurement helpers without
// pulling in the carry machinery.

// A share of the morph, never a fixed length — a cap here leaves a character opaque
// and motionless for the rest of a long duration.
export function fadeDuration(duration: number, fraction: number): number {
  return duration * fraction
}

export function parseTranslate(element: HTMLElement): { tx: number, ty: number } {
  const transform = getComputedStyle(element).transform
  if (!transform || transform === 'none')
    return { tx: 0, ty: 0 }
  const match = transform.match(/matrix\(([^)]+)\)/)
  if (!match)
    return { tx: 0, ty: 0 }
  const v = match[1]!.split(',').map(Number)
  return { tx: v[4] || 0, ty: v[5] || 0 }
}

// The box a `width`/`height` write means. `getBoundingClientRect` is the visual box, so
// a rotated or scaled ancestor inflates it — and the container transition writes what it
// measures straight back, compounding every morph.
export function layoutSize(element: HTMLElement): { width: number, height: number } {
  const style = getComputedStyle(element)
  const width = Number.parseFloat(style.width)
  const height = Number.parseFloat(style.height)
  if (Number.isNaN(width) || Number.isNaN(height)) {
    const rect = element.getBoundingClientRect()
    return { width: rect.width, height: rect.height }
  }
  return { width, height }
}

/** Every `element.animate` call site goes through this so a jsdom-less env degrades. */
export function animateElement(
  element: HTMLElement,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: KeyframeAnimationOptions,
): Animation | null {
  if (typeof element.animate !== 'function')
    return null
  return element.animate(keyframes, options)
}

export function getAnimationsOf(element: HTMLElement): Animation[] {
  return typeof element.getAnimations === 'function' ? element.getAnimations() : []
}

export function cancelAnimations(element: HTMLElement): { tx: number, ty: number, opacity: number } {
  const { tx, ty } = parseTranslate(element)
  const opacity = Number(getComputedStyle(element).opacity) || 1
  getAnimationsOf(element).forEach(a => a.cancel())
  return { tx, ty, opacity }
}
