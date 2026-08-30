export interface TooltipPlacementInput {
  /** Pointer position in container pixels. */
  pointerX: number
  pointerY: number
  /** Measured tooltip size. */
  tooltipWidth: number
  tooltipHeight: number
  /** Container size (the clamping boundary). */
  containerWidth: number
  containerHeight: number
  /** Gap between pointer and tooltip. */
  offset: number
  /**
   * `both`: track the pointer on both axes. `x`: track horizontally only,
   * pinning the tooltip to `fixedY` — keeps it out of the data and avoids
   * vertical jitter (the kumo `tooltipFollowCursor="x"` behavior).
   */
  follow: 'both' | 'x'
  /** Top position used when `follow` is `x`. @default 0 */
  fixedY?: number
}

export interface TooltipPlacement {
  left: number
  top: number
}

/**
 * Prefers the right of / below the pointer, flips to the opposite side when
 * that would overflow, then clamps into the container.
 */
export function placeTooltip(input: TooltipPlacementInput): TooltipPlacement {
  const {
    pointerX,
    pointerY,
    tooltipWidth,
    tooltipHeight,
    containerWidth,
    containerHeight,
    offset,
    follow,
    fixedY = 0,
  } = input

  let left = pointerX + offset
  if (left + tooltipWidth > containerWidth)
    left = pointerX - offset - tooltipWidth
  left = Math.max(0, Math.min(left, containerWidth - tooltipWidth))

  let top: number
  if (follow === 'x') {
    top = fixedY
  }
  else {
    top = pointerY + offset
    if (top + tooltipHeight > containerHeight)
      top = pointerY - offset - tooltipHeight
  }
  top = Math.max(0, Math.min(top, containerHeight - tooltipHeight))

  return { left, top }
}
