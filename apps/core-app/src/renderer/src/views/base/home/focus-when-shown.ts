import { nextTick } from 'vue'

/**
 * The anchor keeps its panel at `visibility: hidden` until it has measured a position and the
 * entrance animation starts, a few frames after `open` flips — and a hidden element refuses focus,
 * silently. The composer's popovers place focus themselves, so they retry once per frame, bounded,
 * until it lands.
 */
export const FOCUS_RETRY_FRAMES = 30

/**
 * Focuses `target()` as soon as it can take focus. Stops when it has, when `wanted()` turns false
 * (the panel closed, a newer opening took over), or after {@link FOCUS_RETRY_FRAMES} frames.
 * `onFocused` runs once, with the element that took focus.
 */
export function focusWhenShown(
  target: () => HTMLElement | null | undefined,
  wanted: () => boolean,
  onFocused?: (element: HTMLElement) => void
): void {
  let attempts = 0
  const attempt = (): void => {
    if (!wanted()) return
    const element = target()
    element?.focus()
    if (element && document.activeElement === element) {
      onFocused?.(element)
      return
    }
    if (++attempts < FOCUS_RETRY_FRAMES) requestAnimationFrame(attempt)
  }
  void nextTick(attempt)
}
