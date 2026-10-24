function ratio(drawn: number, laid: number): number {
  return drawn > 0 && laid > 0 ? drawn / laid : 1
}

/**
 * How much bigger `el` is drawn than it is laid out, along each axis: what a scaling transform on
 * an ancestor, or CSS zoom, does to it. Its rect is in viewport pixels and its offset size in its
 * own, so their ratio tells; 1 along an axis it has no size on.
 */
export function drawnScale(el: Element, rect: DOMRectReadOnly = el.getBoundingClientRect()): { x: number, y: number } {
  if (!(el instanceof HTMLElement))
    return { x: 1, y: 1 }
  return { x: ratio(rect.width, el.offsetWidth), y: ratio(rect.height, el.offsetHeight) }
}
