export interface TooltipBoundaryBox {
  /** Box edges in container pixels. */
  left: number
  top: number
  right: number
  bottom: number
}

export interface TooltipPlacementInput {
  /** Pointer position in container pixels. */
  pointerX: number
  pointerY: number
  /** Measured tooltip size. */
  tooltipWidth: number
  tooltipHeight: number
  /** Container size (the fallback clamping boundary). */
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
  /**
   * Clamping boundary in container pixels — the intersection of the clipping
   * ancestors (and the viewport) the tooltip must stay inside, mirroring
   * ECharts' `confine` behavior. When omitted the container box is used.
   */
  boundary?: TooltipBoundaryBox
}

export interface TooltipPlacement {
  left: number
  top: number
}

/**
 * Prefers the right of / below the pointer, flips to the opposite side when
 * that would overflow, then clamps into the boundary (the container box by
 * default, or the intersection of the tooltip's clipping ancestors).
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
    boundary,
  } = input

  const bounds = boundary ?? {
    left: 0,
    top: 0,
    right: containerWidth,
    bottom: containerHeight,
  }

  let left = pointerX + offset
  if (left + tooltipWidth > bounds.right)
    left = pointerX - offset - tooltipWidth
  left = Math.max(bounds.left, Math.min(left, bounds.right - tooltipWidth))

  let top: number
  if (follow === 'x') {
    top = fixedY
  }
  else {
    top = pointerY + offset
    if (top + tooltipHeight > bounds.bottom)
      top = pointerY - offset - tooltipHeight
  }
  top = Math.max(bounds.top, Math.min(top, bounds.bottom - tooltipHeight))

  return { left, top }
}
