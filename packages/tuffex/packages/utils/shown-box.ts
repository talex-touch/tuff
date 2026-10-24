import { drawnScale } from './drawn-scale'

// Where an element shows on the screen, for what flies out of it and home to it: the image
// preview's picture, the flip overlay's card.

/** A box in viewport pixels. */
export interface ScreenBox {
  x: number
  y: number
  width: number
  height: number
}

function px(value: string | undefined): number {
  const n = Number.parseFloat(value ?? '')
  return Number.isFinite(n) ? n : 0
}

/** The top-left corner's radius in pixels; a percentage is of the box's width. */
export function cornerRadius(style: CSSStyleDeclaration, width: number): number {
  const value = style.borderTopLeftRadius.split(' ')[0] ?? ''
  return value.endsWith('%') ? (px(value) / 100) * width : px(value)
}

/**
 * Where `target` shows: the part of `rect`, its box on the screen, inside every ancestor that clips
 * its overflow, and the corners of the cell it fills.
 */
export function shownBox(target: Element, rect: DOMRectReadOnly = target.getBoundingClientRect()): { clip: ScreenBox, radius: number } {
  let left = rect.left
  let top = rect.top
  let right = rect.right
  let bottom = rect.bottom
  let radius: number | null = null
  for (let parent = target.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    const clipsX = style.overflowX !== 'visible'
    const clipsY = style.overflowY !== 'visible'
    if (!clipsX && !clipsY)
      continue
    // Its padding box on the screen, where a transform scales its borders with it.
    const box = parent.getBoundingClientRect()
    const { x: sx, y: sy } = drawnScale(parent, box)
    const padLeft = box.left + parent.clientLeft * sx
    const padTop = box.top + parent.clientTop * sy
    const padRight = padLeft + parent.clientWidth * sx
    const padBottom = padTop + parent.clientHeight * sy
    // Only the first cell that clips the target, and that the target fills or overflows, says
    // anything about its corners: not one it sits small inside, nor a scroller further out.
    if (radius === null) {
      const fills = rect.left <= padLeft + 2 && rect.top <= padTop + 2 && rect.right >= padRight - 2 && rect.bottom >= padBottom - 2
      radius = fills ? Math.max(0, cornerRadius(style, box.width / sx) - px(style.borderTopWidth)) * sx : 0
    }
    if (clipsX) {
      left = Math.max(left, padLeft)
      right = Math.min(right, padRight)
    }
    if (clipsY) {
      top = Math.max(top, padTop)
      bottom = Math.min(bottom, padBottom)
    }
  }
  return {
    clip: { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) },
    radius: radius ?? 0,
  }
}
