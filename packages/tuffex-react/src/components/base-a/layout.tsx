import type {
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
  TouchEvent,
  UIEvent,
} from 'react'
import type { TxIconSource } from './primitives'
import { hasWindow } from '@talex-touch/tuffex-core'
import {
  Children,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useControllableState } from '../../hooks/useControllableState'
import { cn, mergeRefs, toCssUnit } from '../../utils/cn'
import { TxSwitch } from '../TxSwitch'
import { TxIcon } from './primitives'

type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type TxResponsive<T> = Partial<Record<Breakpoint, T>>

const BP_ORDER: readonly Breakpoint[] = ['xs', 'sm', 'md', 'lg', 'xl']

function getBreakpoint(width: number): Breakpoint {
  if (width < 640)
    return 'xs'
  if (width < 768)
    return 'sm'
  if (width < 1024)
    return 'md'
  if (width < 1280)
    return 'lg'
  return 'xl'
}

function useViewportWidth(): number {
  const [width, setWidth] = useState<number>(() => (hasWindow() ? window.innerWidth : 1024))

  useEffect(() => {
    if (!hasWindow())
      return
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize, { passive: true })
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return width
}

function resolveResponsiveValue<T>(value: TxResponsive<T>, width: number): T | undefined {
  const start = BP_ORDER.indexOf(getBreakpoint(width))
  const smallerFirst = BP_ORDER.slice(0, start + 1).reverse()
  const largerAfter = BP_ORDER.slice(start + 1)
  for (const key of [...smallerFirst, ...largerAfter]) {
    const candidate = value[key]
    if (candidate !== undefined)
      return candidate
  }
  return undefined
}

// ============================================================================
// 1. container (TxContainer, TxHeader, TxAside, TxMain, TxFooter, TxRow, TxCol)
// ============================================================================

export type TxContainerPaddingPreset = 'small' | 'medium' | 'large'
export type TxContainerDirection = 'horizontal' | 'vertical'

export interface TxHeaderProps extends HTMLAttributes<HTMLElement> {
  height?: string | number
}

export const TxHeader = forwardRef<HTMLElement, TxHeaderProps>((
  { height = '60px', className, style, children, ...rest },
  ref,
) => (
  <header
    ref={ref}
    className={cn('tx-header', className)}
    style={{ height: toCssUnit(height, '60px'), ...style }}
    {...rest}
  >
    {children}
  </header>
))
TxHeader.displayName = 'TxHeader'

export interface TxAsideProps extends HTMLAttributes<HTMLElement> {
  width?: string | number
}

export const TxAside = forwardRef<HTMLElement, TxAsideProps>((
  { width = '240px', className, style, children, ...rest },
  ref,
) => (
  <aside
    ref={ref}
    className={cn('tx-aside', className)}
    style={{ width: toCssUnit(width, '240px'), ...style }}
    {...rest}
  >
    {children}
  </aside>
))
TxAside.displayName = 'TxAside'

export interface TxMainProps extends HTMLAttributes<HTMLElement> {}

export const TxMain = forwardRef<HTMLElement, TxMainProps>((
  { className, children, ...rest },
  ref,
) => (
  <main ref={ref} className={cn('tx-main', className)} {...rest}>
    {children}
  </main>
))
TxMain.displayName = 'TxMain'

export interface TxFooterProps extends HTMLAttributes<HTMLElement> {
  height?: string | number
}

export const TxFooter = forwardRef<HTMLElement, TxFooterProps>((
  { height = '60px', className, style, children, ...rest },
  ref,
) => (
  <footer
    ref={ref}
    className={cn('tx-footer', className)}
    style={{ height: toCssUnit(height, '60px'), ...style }}
    {...rest}
  >
    {children}
  </footer>
))
TxFooter.displayName = 'TxFooter'

export interface TxContainerProps extends HTMLAttributes<HTMLDivElement> {
  fluid?: boolean
  responsive?: boolean
  maxWidth?: string | number
  padding?: TxContainerPaddingPreset | number
  margin?: 'auto' | string | number
  direction?: TxContainerDirection
}

function paddingPresetToPx(value: TxContainerPaddingPreset | number): number {
  if (typeof value === 'number')
    return Math.max(0, value)
  if (value === 'small')
    return 12
  if (value === 'large')
    return 24
  return 16
}

export const TxContainer = forwardRef<HTMLDivElement, TxContainerProps>((
  {
    fluid = false,
    responsive = false,
    maxWidth = '1200px',
    padding = 'medium',
    margin = 'auto',
    direction,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const childList = Children.toArray(children)
  const hasShellChildren = childList.some(
    child => isValidElement(child)
      && (child.type === TxHeader || child.type === TxAside || child.type === TxMain || child.type === TxFooter || child.type === TxContainer),
  )
  const hasVerticalShell = childList.some(
    child => isValidElement(child) && (child.type === TxHeader || child.type === TxFooter),
  )
  const resolvedDirection: TxContainerDirection | undefined = direction
    ?? (hasShellChildren ? (hasVerticalShell ? 'vertical' : 'horizontal') : undefined)

  const pad = paddingPresetToPx(padding)
  const maxW = fluid ? 'none' : toCssUnit(maxWidth, '1200px')
  const resolvedMargin = margin === 'auto' ? '0 auto' : `0 ${toCssUnit(margin, '0px')}`

  const containerStyle = {
    '--tx-container-padding': `${pad}px`,
    '--tx-container-max-width': maxW,
    ...(hasShellChildren ? {} : { margin: resolvedMargin }),
    ...style,
  } as CSSProperties

  return (
    <div
      ref={ref}
      className={cn(
        'tx-container',
        {
          'is-fluid': fluid,
          'is-responsive': responsive,
          'tx-container--shell': hasShellChildren || Boolean(direction),
          'is-vertical': resolvedDirection === 'vertical',
          'is-horizontal': resolvedDirection === 'horizontal',
        },
        className,
      )}
      style={containerStyle}
      {...rest}
    >
      {children}
    </div>
  )
})
TxContainer.displayName = 'TxContainer'

export interface TxRowProps extends HTMLAttributes<HTMLDivElement> {
  gutter?: number | TxResponsive<number>
  align?: 'top' | 'middle' | 'bottom' | 'stretch'
  justify?: 'start' | 'end' | 'center' | 'space-around' | 'space-between' | 'space-evenly'
  wrap?: boolean
}

export const TxRow = forwardRef<HTMLDivElement, TxRowProps>((
  {
    gutter = 0,
    align = 'stretch',
    justify = 'start',
    wrap = true,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const width = useViewportWidth()
  const gutterPx = typeof gutter === 'number'
    ? Math.max(0, gutter)
    : Math.max(0, Number(resolveResponsiveValue(gutter, width) ?? 0))

  const alignMap: Record<string, string> = {
    top: 'flex-start',
    middle: 'center',
    bottom: 'flex-end',
    stretch: 'stretch',
  }
  const justifyMap: Record<string, string> = {
    'start': 'flex-start',
    'end': 'flex-end',
    'center': 'center',
    'space-around': 'space-around',
    'space-between': 'space-between',
    'space-evenly': 'space-evenly',
  }

  return (
    <div
      ref={ref}
      className={cn('tx-row', className)}
      style={{
        '--tx-row-gutter': `${gutterPx}px`,
        'alignItems': alignMap[align] ?? 'stretch',
        'justifyContent': justifyMap[justify] ?? 'flex-start',
        'flexWrap': wrap ? 'wrap' : 'nowrap',
        ...style,
      } as CSSProperties}
      {...rest}
    >
      {children}
    </div>
  )
})
TxRow.displayName = 'TxRow'

export interface TxColProps extends HTMLAttributes<HTMLDivElement> {
  span?: number
  offset?: number
  xs?: number
  sm?: number
  md?: number
  lg?: number
  xl?: number
}

export const TxCol = forwardRef<HTMLDivElement, TxColProps>((
  {
    span = 24,
    offset = 0,
    xs,
    sm,
    md,
    lg,
    xl,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const width = useViewportWidth()
  const responsiveSpan = resolveResponsiveValue({ xs, sm, md, lg, xl }, width) ?? span
  const clampedSpan = Number.isFinite(responsiveSpan) ? Math.min(24, Math.max(0, responsiveSpan)) : 24
  const clampedOffset = Math.min(24, Math.max(0, Number(offset ?? 0)))
  const basis = `${(clampedSpan / 24) * 100}%`

  return (
    <div
      ref={ref}
      className={cn('tx-col', className)}
      style={{
        paddingLeft: 'calc(var(--tx-row-gutter, 0px) / 2)',
        paddingRight: 'calc(var(--tx-row-gutter, 0px) / 2)',
        flex: `0 0 ${basis}`,
        maxWidth: basis,
        boxSizing: 'border-box',
        ...(clampedOffset ? { marginLeft: `${(clampedOffset / 24) * 100}%` } : {}),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
})
TxCol.displayName = 'TxCol'

// ============================================================================
// 2. flex (TxFlex)
// ============================================================================

export interface TxFlexProps extends HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'row-reverse' | 'column' | 'column-reverse'
  gap?: number | string
  align?: string
  justify?: string
  wrap?: 'nowrap' | 'wrap' | 'wrap-reverse'
  inline?: boolean
}

export const TxFlex = forwardRef<HTMLDivElement, TxFlexProps>((
  {
    direction = 'row',
    gap = 12,
    align = 'stretch',
    justify = 'flex-start',
    wrap = 'nowrap',
    inline = false,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => (
  <div
    ref={ref}
    className={cn('tx-flex', className)}
    style={{
      '--tx-flex-gap': toCssUnit(gap, '12px'),
      '--tx-flex-align': align,
      '--tx-flex-justify': justify,
      '--tx-flex-direction': direction,
      '--tx-flex-wrap': wrap,
      '--tx-flex-display': inline ? 'inline-flex' : 'flex',
      ...style,
    } as CSSProperties}
    {...rest}
  >
    {children}
  </div>
))
TxFlex.displayName = 'TxFlex'

// ============================================================================
// 3. grid (TxGrid, TxGridItem)
// ============================================================================

export type TxGridAlign = 'start' | 'end' | 'center' | 'stretch'
export type TxGridGap
  = | number
    | string
    | { row?: number | string, col?: number | string }
    | TxResponsive<number | string>

export interface TxGridProps extends HTMLAttributes<HTMLDivElement> {
  cols?: number | TxResponsive<number>
  rows?: number
  gap?: TxGridGap
  minItemWidth?: string
  justify?: TxGridAlign
  align?: TxGridAlign
}

export const TxGrid = forwardRef<HTMLDivElement, TxGridProps>((
  {
    cols = 0,
    rows = 0,
    gap = 16,
    minItemWidth = '',
    justify = 'stretch',
    align = 'stretch',
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const width = useViewportWidth()

  const resolvedCols = typeof cols === 'number'
    ? cols
    : Number(resolveResponsiveValue(cols, width) ?? 0)

  const resolvedGap = useMemo(() => {
    if (typeof gap === 'number' || typeof gap === 'string') {
      const s = toCssUnit(gap, '16px')
      return { row: s, col: s }
    }
    if (gap && typeof gap === 'object') {
      if ('row' in gap || 'col' in gap) {
        return {
          row: toCssUnit(gap.row ?? 16, '16px'),
          col: toCssUnit(gap.col ?? 16, '16px'),
        }
      }
      const v = resolveResponsiveValue(gap as TxResponsive<number | string>, width)
      const s = toCssUnit(v ?? 16, '16px')
      return { row: s, col: s }
    }
    return { row: '16px', col: '16px' }
  }, [gap, width])

  const templateCols = minItemWidth
    ? `repeat(auto-fit, minmax(${minItemWidth}, 1fr))`
    : resolvedCols > 0
      ? `repeat(${resolvedCols}, minmax(0, 1fr))`
      : undefined

  const templateRows = rows > 0 ? `repeat(${rows}, minmax(0, 1fr))` : undefined

  return (
    <div
      ref={ref}
      className={cn('tx-grid', className)}
      style={{
        display: 'grid',
        gridTemplateColumns: templateCols,
        gridTemplateRows: templateRows,
        rowGap: resolvedGap.row,
        columnGap: resolvedGap.col,
        justifyItems: justify,
        alignItems: align,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
})
TxGrid.displayName = 'TxGrid'

export interface TxGridItemProps extends HTMLAttributes<HTMLDivElement> {
  colSpan?: number
  rowSpan?: number
  justifySelf?: TxGridAlign
  alignSelf?: TxGridAlign
}

export const TxGridItem = forwardRef<HTMLDivElement, TxGridItemProps>((
  {
    colSpan = 1,
    rowSpan = 1,
    justifySelf,
    alignSelf,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const cSpan = Math.max(1, colSpan)
  const rSpan = Math.max(1, rowSpan)
  return (
    <div
      ref={ref}
      className={cn('tx-grid-item', className)}
      style={{
        gridColumn: `span ${cSpan} / span ${cSpan}`,
        gridRow: `span ${rSpan} / span ${rSpan}`,
        ...(justifySelf ? { justifySelf } : {}),
        ...(alignSelf ? { alignSelf } : {}),
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
})
TxGridItem.displayName = 'TxGridItem'

// ============================================================================
// 4. grid-layout (TxGridLayout)
// ============================================================================

export interface TxGridLayoutProps extends HTMLAttributes<HTMLDivElement> {
  minItemWidth?: string
  gap?: string | number
  maxColumns?: number
  interactive?: boolean
}

export const TxGridLayout = forwardRef<HTMLDivElement, TxGridLayoutProps>((
  {
    minItemWidth = '300px',
    gap = '1.5rem',
    maxColumns = 4,
    interactive = true,
    className,
    style,
    children,
    onMouseMove,
    onMouseLeave,
    ...rest
  },
  ref,
) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const frameIdRef = useRef<number | null>(null)

  const cancelFrame = useCallback(() => {
    if (frameIdRef.current !== null && hasWindow()) {
      window.cancelAnimationFrame(frameIdRef.current)
      frameIdRef.current = null
    }
  }, [])

  const clearSpotlight = useCallback(() => {
    cancelFrame()
    const el = containerRef.current
    if (!el)
      return
    el.querySelectorAll<HTMLElement>('.tx-grid-layout__item').forEach((item) => {
      item.style.setProperty('--tx-grid-op', '0')
    })
  }, [cancelFrame])

  const paintSpotlight = useCallback(() => {
    frameIdRef.current = null
    const container = containerRef.current
    if (!interactive || !container)
      return
    const items = Array.from(container.querySelectorAll<HTMLElement>('.tx-grid-layout__item'))
    const placed = items.map(item => ({ item, rect: item.getBoundingClientRect() }))
    for (const { item, rect } of placed) {
      item.style.setProperty('--tx-grid-op', '0.2')
      item.style.setProperty('--tx-grid-x', `${pointerRef.current.x - rect.left}px`)
      item.style.setProperty('--tx-grid-y', `${pointerRef.current.y - rect.top}px`)
    }
  }, [interactive])

  useEffect(() => {
    if (!interactive)
      clearSpotlight()
  }, [interactive, clearSpotlight])

  useEffect(() => cancelFrame, [cancelFrame])

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    onMouseMove?.(event)
    if (!interactive || !containerRef.current || !hasWindow())
      return
    pointerRef.current.x = event.pageX - window.scrollX
    pointerRef.current.y = event.pageY - window.scrollY
    if (frameIdRef.current === null)
      frameIdRef.current = window.requestAnimationFrame(paintSpotlight)
  }

  const handleMouseLeave = (event: MouseEvent<HTMLDivElement>) => {
    onMouseLeave?.(event)
    clearSpotlight()
  }

  return (
    <div
      ref={mergeRefs(ref, containerRef)}
      className={cn('tx-grid-layout', className)}
      style={{
        '--tx-grid-gap': toCssUnit(gap, '1.5rem'),
        '--tx-grid-min-width': minItemWidth,
        '--tx-grid-max-columns': String(maxColumns),
        ...style,
      } as CSSProperties}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...rest}
    >
      {children}
    </div>
  )
})
TxGridLayout.displayName = 'TxGridLayout'

// ============================================================================
// 5. stack (TxStack)
// ============================================================================

export type TxStackDirection = 'horizontal' | 'vertical'

export interface TxStackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: TxStackDirection
  gap?: number | string
  align?: string
  justify?: string
  wrap?: boolean
  inline?: boolean
}

export const TxStack = forwardRef<HTMLDivElement, TxStackProps>((
  {
    direction = 'vertical',
    gap = 12,
    align = 'stretch',
    justify = 'flex-start',
    wrap = false,
    inline = false,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => (
  <div
    ref={ref}
    className={cn('tx-stack', className)}
    style={{
      '--tx-stack-gap': toCssUnit(gap, '12px'),
      '--tx-stack-align': align,
      '--tx-stack-justify': justify,
      '--tx-stack-direction': direction === 'horizontal' ? 'row' : 'column',
      '--tx-stack-wrap': wrap ? 'wrap' : 'nowrap',
      '--tx-stack-display': inline ? 'inline-flex' : 'flex',
      ...style,
    } as CSSProperties}
    {...rest}
  >
    {children}
  </div>
))
TxStack.displayName = 'TxStack'

// ============================================================================
// 6. splitter (TxSplitter)
// ============================================================================

export type TxSplitterDirection = 'horizontal' | 'vertical'

export interface TxSplitterProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value?: number
  defaultValue?: number
  modelValue?: number
  direction?: TxSplitterDirection
  min?: number
  max?: number
  disabled?: boolean
  barSize?: number
  snap?: number
  paneA?: ReactNode
  paneB?: ReactNode
  onChange?: (ratio: number) => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

function clampRange(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val))
}

export const TxSplitter = forwardRef<HTMLDivElement, TxSplitterProps>((
  {
    value,
    defaultValue = 0.5,
    modelValue,
    direction = 'horizontal',
    min = 0.1,
    max = 0.9,
    disabled = false,
    barSize = 6,
    snap = 0,
    paneA,
    paneB,
    onChange,
    onDragStart,
    onDragEnd,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  const [ratio, setRatio] = useControllableState({
    value: value ?? modelValue,
    defaultValue,
    onChange,
  })

  const dir: TxSplitterDirection = direction === 'vertical' ? 'vertical' : 'horizontal'
  const clampedRatio = clampRange(Number.isFinite(ratio) ? ratio : 0.5, 0, 1)

  const commitRatio = useCallback((raw: number) => {
    const snapped = snap > 0 ? clampRange(Math.round(raw / snap) * snap, 0, 1) : raw
    const next = clampRange(snapped, min, max)
    setRatio(next)
  }, [max, min, setRatio, snap])

  const setByPointer = useCallback((clientX: number, clientY: number) => {
    const el = rootRef.current
    if (!el)
      return
    const rect = el.getBoundingClientRect()
    if (dir === 'horizontal') {
      const r = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5
      commitRatio(r)
    }
    else {
      const r = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5
      commitRatio(r)
    }
  }, [commitRatio, dir])

  const endDrag = useCallback(() => {
    if (!draggingRef.current)
      return
    draggingRef.current = false
    setDragging(false)
    onDragEnd?.()
  }, [onDragEnd])

  useEffect(() => {
    if (!dragging || !hasWindow())
      return
    const handleMove = (event: globalThis.PointerEvent) => {
      if (!draggingRef.current)
        return
      setByPointer(event.clientX, event.clientY)
    }
    const handleUp = () => endDrag()
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [dragging, setByPointer, endDrag])

  useEffect(() => {
    if (disabled)
      endDrag()
  }, [disabled, endDrag])

  const handleBarPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled)
      return
    draggingRef.current = true
    setDragging(true)
    onDragStart?.()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setByPointer(event.clientX, event.clientY)
  }

  const handleBarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled)
      return
    const step = 0.02
    if (dir === 'horizontal') {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        commitRatio(clampedRatio - step)
      }
      else if (event.key === 'ArrowRight') {
        event.preventDefault()
        commitRatio(clampedRatio + step)
      }
    }
    else {
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        commitRatio(clampedRatio - step)
      }
      else if (event.key === 'ArrowDown') {
        event.preventDefault()
        commitRatio(clampedRatio + step)
      }
    }
  }

  const childNodes = Children.toArray(children)
  const resolvedPaneA = paneA ?? childNodes[0]
  const resolvedPaneB = paneB ?? childNodes[1]

  return (
    <div
      ref={mergeRefs(ref, rootRef)}
      className={cn(
        'tx-splitter',
        `is-${dir}`,
        { 'is-disabled': disabled, 'is-dragging': dragging },
        className,
      )}
      style={{
        '--tx-splitter-bar-size': `${Math.max(6, barSize)}px`,
        '--tx-splitter-ratio': String(clampedRatio),
        ...style,
      } as CSSProperties}
      {...rest}
    >
      <div className="tx-splitter__pane tx-splitter__pane--a">
        {resolvedPaneA}
      </div>

      <div
        className="tx-splitter__bar"
        tabIndex={disabled ? -1 : 0}
        role="separator"
        aria-orientation={dir === 'horizontal' ? 'vertical' : 'horizontal'}
        aria-valuenow={Math.round(clampedRatio * 100)}
        aria-valuemin={Math.round(min * 100)}
        aria-valuemax={Math.round(max * 100)}
        aria-label="Resize"
        onPointerDown={handleBarPointerDown}
        onKeyDown={handleBarKeyDown}
      >
        <div className="tx-splitter__grip" aria-hidden="true" />
      </div>

      <div className="tx-splitter__pane tx-splitter__pane--b">
        {resolvedPaneB}
      </div>
    </div>
  )
})
TxSplitter.displayName = 'TxSplitter'

// ============================================================================
// 7. scroll (TxScroll)
// ============================================================================

export interface TxScrollPosition {
  scrollTop: number
  scrollLeft: number
}

export interface TxScrollProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onScroll'> {
  noPadding?: boolean
  native?: boolean
  scrollChaining?: boolean
  direction?: 'vertical' | 'horizontal' | 'both'
  scrollbar?: boolean
  scrollbarAlwaysVisible?: boolean
  scrollbarMinSize?: number
  height?: string | number
  maxHeight?: string | number
  header?: ReactNode
  footer?: ReactNode
  pullDownRefresh?: boolean
  pullDownThreshold?: number
  pullUpLoad?: boolean
  pullUpThreshold?: number
  onScroll?: (info: TxScrollPosition) => void
  onPullingDown?: () => void
  onPullingUp?: () => void
}

export const TxScroll = forwardRef<HTMLDivElement, TxScrollProps>((
  {
    noPadding = false,
    native = true,
    scrollChaining = false,
    direction = 'vertical',
    scrollbar = true,
    scrollbarAlwaysVisible = false,
    scrollbarMinSize = 18,
    height,
    maxHeight,
    header,
    footer,
    pullDownRefresh = false,
    pullDownThreshold = 70,
    pullUpLoad = false,
    pullUpThreshold = 0,
    onScroll,
    onPullingDown,
    onPullingUp,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const touchStartYRef = useRef<number | null>(null)
  const pullingUpRef = useRef(false)
  const isScrollX = direction === 'horizontal' || direction === 'both'
  const isScrollY = direction === 'vertical' || direction === 'both'

  const handleNativeScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    onScroll?.({ scrollTop: target.scrollTop, scrollLeft: target.scrollLeft })
    if (pullUpLoad && !pullingUpRef.current) {
      const distanceToBottom = target.scrollHeight - (target.scrollTop + target.clientHeight)
      if (distanceToBottom <= pullUpThreshold) {
        pullingUpRef.current = true
        onPullingUp?.()
      }
    }
  }

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!pullDownRefresh || !scrollRef.current || scrollRef.current.scrollTop > 0)
      return
    const y = event.touches[0]?.clientY
    if (typeof y === 'number')
      touchStartYRef.current = y
  }

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (!pullDownRefresh || !scrollRef.current || scrollRef.current.scrollTop > 0)
      return
    const startY = touchStartYRef.current
    touchStartYRef.current = null
    const endY = event.changedTouches[0]?.clientY
    if (typeof startY === 'number' && typeof endY === 'number' && endY - startY >= pullDownThreshold)
      onPullingDown?.()
  }

  const rootStyle: CSSProperties = {
    '--tx-scrollbar-min-size': `${scrollbarMinSize}px`,
    ...(height !== undefined ? { height: toCssUnit(height) } : {}),
    ...(maxHeight !== undefined ? { maxHeight: toCssUnit(maxHeight) } : {}),
    ...style,
  } as CSSProperties

  const viewportStyle: CSSProperties = {
    overflowY: isScrollY ? 'auto' : 'hidden',
    overflowX: isScrollX ? 'auto' : 'hidden',
    overscrollBehaviorY: isScrollY ? (scrollChaining ? 'auto' : 'contain') : 'auto',
    overscrollBehaviorX: isScrollX ? (scrollChaining ? 'auto' : 'contain') : 'auto',
  }

  const contentStyle: CSSProperties = {
    ...(noPadding ? { padding: 0 } : {}),
    ...(isScrollX ? { width: 'max-content' } : {}),
  }

  return (
    <div
      ref={ref}
      className={cn(
        'tx-scroll',
        {
          'is-native': native,
          'tx-scroll--no-scrollbar': !scrollbar,
          'tx-scroll--always-visible': scrollbarAlwaysVisible,
        },
        className,
      )}
      style={rootStyle}
      {...rest}
    >
      <div
        ref={scrollRef}
        className="tx-scroll__native"
        style={viewportStyle}
        onScroll={handleNativeScroll}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {header}
        <div className="tx-scroll__content" style={contentStyle}>
          {children}
          {footer}
        </div>
      </div>
    </div>
  )
})
TxScroll.displayName = 'TxScroll'

// ============================================================================
// 8. group-block (TxGroupBlock, TxBlockLine, TxBlockSlot, TxBlockSwitch)
// ============================================================================

type IconPropValue = TxIconSource | string | ReactNode | null | undefined

function renderBlockIcon(icon: IconPropValue, size: number): ReactNode {
  if (icon === undefined || icon === null || icon === '')
    return null
  if (typeof icon === 'string')
    return <TxIcon name={icon} size={size} />
  if (typeof icon === 'object' && 'type' in icon && 'value' in icon)
    return <TxIcon icon={icon as TxIconSource} size={size} />
  return icon
}

const GROUP_STORAGE_PREFIX = 'tuff-block-storage-'

export interface TxGroupBlockProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'onToggle'> {
  name?: string
  title?: string
  description?: ReactNode
  defaultIcon?: IconPropValue
  activeIcon?: IconPropValue
  icon?: ReactNode
  iconSize?: number
  collapsible?: boolean
  expanded?: boolean
  defaultExpanded?: boolean
  defaultExpand?: boolean
  collapsed?: boolean
  memoryName?: string
  headerExtra?: ReactNode
  onExpandedChange?: (expanded: boolean) => void
  onToggle?: (expanded: boolean) => void
}

export const TxGroupBlock = forwardRef<HTMLDivElement, TxGroupBlockProps>((
  {
    name,
    title,
    description = '',
    defaultIcon,
    activeIcon,
    icon,
    iconSize = 22,
    collapsible = true,
    expanded,
    defaultExpanded,
    defaultExpand,
    collapsed = false,
    memoryName = '',
    headerExtra,
    onExpandedChange,
    onToggle,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const initialExpanded = useMemo(() => {
    if (hasWindow() && memoryName) {
      try {
        const raw = window.localStorage.getItem(`${GROUP_STORAGE_PREFIX}${memoryName}`)
        if (raw) {
          const parsed = JSON.parse(raw) as { expand?: boolean }
          if (typeof parsed?.expand === 'boolean')
            return parsed.expand
        }
      }
      catch {}
    }
    if (typeof defaultExpanded === 'boolean')
      return defaultExpanded
    if (typeof defaultExpand === 'boolean')
      return defaultExpand
    return !collapsed
  }, [collapsed, defaultExpand, defaultExpanded, memoryName])

  const [isExpanded, setIsExpanded] = useControllableState({
    value: expanded,
    defaultValue: initialExpanded,
    onChange: (next) => {
      onExpandedChange?.(next)
      onToggle?.(next)
    },
  })

  const contentId = useId()
  const displayName = name ?? title ?? ''
  const headerIcon = isExpanded ? (activeIcon ?? defaultIcon) : (defaultIcon ?? activeIcon)

  const handleToggle = () => {
    if (!collapsible)
      return
    const next = !isExpanded
    setIsExpanded(next)
    if (hasWindow() && memoryName) {
      try {
        window.localStorage.setItem(`${GROUP_STORAGE_PREFIX}${memoryName}`, JSON.stringify({ expand: next }))
      }
      catch {}
    }
  }

  return (
    <div
      ref={ref}
      className={cn(
        'tx-group-block',
        { 'tx-group-block--expanded': isExpanded, 'expand': isExpanded },
        className,
      )}
      {...rest}
    >
      <div
        className={cn('tx-group-block__header fake-background index-fix', {
          'tx-group-block__header--static': !collapsible,
          'is-static': !collapsible,
        })}
      >
        {collapsible && (
          <button
            type="button"
            className="tx-group-block__trigger"
            aria-label={displayName || 'Toggle group'}
            aria-expanded={isExpanded}
            aria-controls={contentId}
            onClick={handleToggle}
          />
        )}

        <div className="tx-group-block__content">
          {icon ?? renderBlockIcon(headerIcon, iconSize)}
          <div className="tx-group-block__label">
            <h3 className="tx-group-block__name">{displayName}</h3>
            {description !== '' && description !== undefined && description !== null && (
              <p className="tx-group-block__description">{description}</p>
            )}
          </div>
        </div>

        {headerExtra !== undefined && headerExtra !== null && (
          <div className="tx-group-block__header-extra">{headerExtra}</div>
        )}

        {collapsible && (
          <TxIcon
            name="chevron-down"
            className={cn('tx-group-block__toggle', { 'is-expanded': isExpanded })}
          />
        )}
      </div>

      <div
        id={contentId}
        className="tx-group-block__body"
        hidden={!isExpanded}
      >
        {children}
      </div>
    </div>
  )
})
TxGroupBlock.displayName = 'TxGroupBlock'

export interface TxBlockLineProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode
  description?: ReactNode
  link?: boolean
}

export const TxBlockLine = forwardRef<HTMLElement, TxBlockLineProps>((
  {
    title = '',
    description = '',
    link = false,
    className,
    children,
    onClick,
    ...rest
  },
  ref,
) => {
  const descContent = children ?? description
  if (link) {
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        className={cn(
          'tx-block-line TBlockLine-Container fake-background index-fix tx-block-line--link link',
          className,
        )}
        onClick={onClick as React.MouseEventHandler<HTMLButtonElement>}
        {...(rest as HTMLAttributes<HTMLButtonElement>)}
      >
        <span className="tx-block-line__title TBlockLine-Title">{title}</span>
        <span className="tx-block-line__link-slot TBlockLine-LinkSlot">{descContent}</span>
      </button>
    )
  }

  return (
    <div
      ref={ref as React.Ref<HTMLDivElement>}
      className={cn('tx-block-line TBlockLine-Container fake-background index-fix', className)}
      onClick={onClick as React.MouseEventHandler<HTMLDivElement>}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      <span className="tx-block-line__title TBlockLine-Title">{title}</span>
      <div className="tx-block-line__description TBlockLine-Description">{descContent}</div>
    </div>
  )
})
TxBlockLine.displayName = 'TxBlockLine'

export interface TxBlockSlotProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  description?: ReactNode
  label?: ReactNode
  tags?: ReactNode
  icon?: ReactNode
  defaultIcon?: IconPropValue
  activeIcon?: IconPropValue
  iconSize?: number
  active?: boolean
  disabled?: boolean
  required?: boolean
  error?: string
}

export const TxBlockSlot = forwardRef<HTMLDivElement, TxBlockSlotProps>((
  {
    title = '',
    description = '',
    label,
    tags,
    icon,
    defaultIcon,
    activeIcon,
    iconSize = 20,
    active = false,
    disabled = false,
    required = false,
    error,
    className,
    children,
    onClick,
    onKeyDown,
    ...rest
  },
  ref,
) => {
  const interactive = Boolean(onClick)
  const currentIcon = active ? (activeIcon ?? defaultIcon) : (defaultIcon ?? activeIcon)

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled)
      return
    onClick?.(event)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.target !== event.currentTarget)
      return
    if (disabled || !interactive)
      return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick?.(event as unknown as MouseEvent<HTMLDivElement>)
    }
  }

  return (
    <div
      ref={ref}
      className={cn(
        'tx-block-slot fake-background index-fix',
        {
          'tx-block-slot--disabled': disabled,
          'disabled': disabled,
          'is-error': Boolean(error),
        },
        className,
      )}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive && !disabled ? 0 : undefined}
      aria-disabled={interactive && disabled ? true : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      <div className="tx-block-slot__content">
        {icon ?? renderBlockIcon(currentIcon, iconSize)}
        <div className="tx-block-slot__label">
          {label !== undefined
            ? (
                <>
                  {label}
                  {tags && <div className="tx-block-slot__tags tx-block-slot__tags--after">{tags}</div>}
                  {error && (
                    <p className="tx-block-slot__description tx-block-slot__description--error">{error}</p>
                  )}
                </>
              )
            : (
                <>
                  <div className="tx-block-slot__title-row">
                    <h5 className="tx-block-slot__title">
                      {title}
                      {required && <span className="tx-block-slot__required" aria-hidden="true">*</span>}
                    </h5>
                    {tags && <div className="tx-block-slot__tags">{tags}</div>}
                  </div>
                  {(error || description) && (
                    <p
                      className={cn('tx-block-slot__description', {
                        'tx-block-slot__description--error': Boolean(error),
                      })}
                    >
                      {error ?? description}
                    </p>
                  )}
                </>
              )}
        </div>
      </div>

      <div className="tx-block-slot__slot">{children}</div>
    </div>
  )
})
TxBlockSlot.displayName = 'TxBlockSlot'

export interface TxBlockSwitchProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'onChange'> {
  title: ReactNode
  description?: ReactNode
  checked?: boolean
  defaultChecked?: boolean
  modelValue?: boolean
  defaultIcon?: IconPropValue
  activeIcon?: IconPropValue
  tags?: ReactNode
  disabled?: boolean
  guidance?: boolean
  loading?: boolean
  required?: boolean
  onChange?: (checked: boolean) => void
}

export const TxBlockSwitch = forwardRef<HTMLDivElement, TxBlockSwitchProps>((
  {
    title,
    description = '',
    checked,
    defaultChecked = false,
    modelValue,
    defaultIcon,
    activeIcon,
    tags,
    disabled = false,
    guidance = false,
    loading = false,
    required = false,
    onChange,
    onClick,
    className,
    ...rest
  },
  ref,
) => {
  const [isActive, setIsActive] = useControllableState({
    value: checked ?? modelValue,
    defaultValue: defaultChecked,
    onChange,
  })

  return (
    <TxBlockSlot
      ref={ref}
      className={cn(
        'tx-block-switch',
        { 'tx-block-switch--loading': loading, 'tx-block-switch--disabled': disabled },
        className,
      )}
      title={title}
      description={description}
      defaultIcon={defaultIcon}
      activeIcon={activeIcon}
      tags={tags}
      active={isActive}
      disabled={disabled || loading}
      required={required}
      onClick={guidance ? onClick : undefined}
      {...rest}
    >
      {guidance
        ? <TxIcon name="chevron-right" className="tx-block-switch__guidance" />
        : (
            <div className="tx-block-switch__actions">
              <TxSwitch
                checked={isActive}
                disabled={disabled}
                loading={loading}
                ariaLabel={typeof title === 'string' ? title : 'Toggle'}
                onChange={setIsActive}
              />
            </div>
          )}
    </TxBlockSlot>
  )
})
TxBlockSwitch.displayName = 'TxBlockSwitch'

// ============================================================================
// 9. card-item (TxCardItem)
// ============================================================================

export type TxCardItemAvatarShape = 'circle' | 'rounded'

export interface TxCardItemProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  subtitle?: ReactNode
  description?: ReactNode
  avatar?: ReactNode
  iconClass?: string
  avatarText?: string
  avatarUrl?: string
  avatarSize?: number
  avatarShape?: TxCardItemAvatarShape
  right?: ReactNode
  clickable?: boolean
  active?: boolean
  disabled?: boolean
  align?: 'start' | 'center'
}

export const TxCardItem = forwardRef<HTMLDivElement, TxCardItemProps>((
  {
    role,
    tabIndex,
    title = '',
    subtitle = '',
    description = '',
    avatar,
    iconClass = '',
    avatarText = '',
    avatarUrl = '',
    avatarSize = 36,
    avatarShape = 'circle',
    right,
    clickable = false,
    active = false,
    disabled = false,
    align = 'start',
    className,
    children,
    onClick,
    onKeyDown,
    ...rest
  },
  ref,
) => {
  const hasLeft = Boolean(avatar || avatarUrl || iconClass || avatarText)
  const resolvedRight = right ?? children

  const avatarStyle = {
    '--tx-card-item-avatar-size': `${avatarSize}px`,
    '--tx-card-item-avatar-radius': avatarShape === 'circle' ? '999px' : '12px',
  } as CSSProperties

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled || !clickable)
      return
    onClick?.(event)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.target !== event.currentTarget)
      return
    if (disabled || !clickable)
      return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick?.(event as unknown as MouseEvent<HTMLDivElement>)
    }
  }

  return (
    <div
      ref={ref}
      className={cn(
        'tx-card-item',
        {
          'tx-card-item--clickable': clickable,
          'tx-card-item--active': active,
          'tx-card-item--disabled': disabled,
          'tx-card-item--no-left': !hasLeft,
          'tx-card-item--center': align === 'center',
        },
        className,
      )}
      role={role ?? (clickable ? 'button' : undefined)}
      tabIndex={tabIndex !== undefined ? tabIndex : (clickable && !disabled ? 0 : undefined)}
      aria-disabled={disabled ? true : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {hasLeft && (
        <div className="tx-card-item__left" style={avatarStyle}>
          {avatar ?? (
            avatarUrl
              ? (
                  <div className="tx-card-item__avatar" aria-hidden="true">
                    <img className="tx-card-item__avatar-img" src={avatarUrl} alt="" />
                  </div>
                )
              : iconClass
                ? (
                    <div className="tx-card-item__avatar tx-card-item__avatar--icon" aria-hidden="true">
                      <i className={iconClass} />
                    </div>
                  )
                : (
                    <div className="tx-card-item__avatar tx-card-item__avatar--text" aria-hidden="true">
                      {avatarText}
                    </div>
                  )
          )}
        </div>
      )}

      <div className="tx-card-item__main">
        <div className="tx-card-item__top">
          <div className="tx-card-item__title-area">
            <div className="tx-card-item__title">{title}</div>
            {subtitle !== '' && subtitle !== undefined && subtitle !== null && (
              <div className="tx-card-item__subtitle">{subtitle}</div>
            )}
          </div>

          {resolvedRight !== undefined && resolvedRight !== null && (
            <div className="tx-card-item__right">{resolvedRight}</div>
          )}
        </div>

        {description !== '' && description !== undefined && description !== null && (
          <div className="tx-card-item__desc">{description}</div>
        )}
      </div>
    </div>
  )
})
TxCardItem.displayName = 'TxCardItem'

// ============================================================================
// 10. layout-skeleton (TxLayoutSkeleton)
// ============================================================================

const SIDEBAR_LINE_WIDTHS = ['64%', '48%', '72%', '56%', '68%', '44%']
const CONTENT_LINE_WIDTHS = ['72%', '58%', '84%', '46%', '67%', '76%', '52%', '63%']

export interface TxLayoutSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  showHeader?: boolean
  showSidebar?: boolean
  rows?: number
}

export const TxLayoutSkeleton = forwardRef<HTMLDivElement, TxLayoutSkeletonProps>((
  {
    showHeader = true,
    showSidebar = true,
    rows,
    className,
    ...rest
  },
  ref,
) => {
  const lines = typeof rows === 'number' && rows > 0
    ? Array.from({ length: rows }, (_, i) => CONTENT_LINE_WIDTHS[i % CONTENT_LINE_WIDTHS.length]!)
    : CONTENT_LINE_WIDTHS

  return (
    <div
      ref={ref}
      className={cn('tx-layout-skeleton', className)}
      aria-hidden="true"
      {...rest}
    >
      <div className="tx-layout-skeleton__container">
        {showHeader && (
          <div className="tx-layout-skeleton__header">
            <div className="tx-layout-skeleton__circle tx-layout-skeleton__brand" />
            <div className="tx-layout-skeleton__line tx-layout-skeleton__header-line" />
            <div className="tx-layout-skeleton__header-actions">
              <div className="tx-layout-skeleton__line tx-layout-skeleton__pill" />
              <div className="tx-layout-skeleton__line tx-layout-skeleton__pill" />
              <div className="tx-layout-skeleton__circle tx-layout-skeleton__avatar" />
            </div>
          </div>
        )}

        <div className="tx-layout-skeleton__main">
          {showSidebar && (
            <div className="tx-layout-skeleton__sidebar">
              {SIDEBAR_LINE_WIDTHS.map((width, index) => (
                <div
                  key={index}
                  className={cn('tx-layout-skeleton__sidebar-item', {
                    'tx-layout-skeleton__sidebar-item--current': index === 0,
                  })}
                >
                  <div className="tx-layout-skeleton__circle" />
                  <div className="tx-layout-skeleton__line tx-layout-skeleton__sidebar-text" style={{ width }} />
                </div>
              ))}
            </div>
          )}

          <div className="tx-layout-skeleton__content">
            {lines.map((width, index) => (
              <div key={index} className="tx-layout-skeleton__content-line">
                <div className="tx-layout-skeleton__line" style={{ width }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
})
TxLayoutSkeleton.displayName = 'TxLayoutSkeleton'
