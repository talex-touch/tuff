import type { AnchorHTMLAttributes, CSSProperties, HTMLAttributes, MouseEvent, PointerEvent, ReactNode, TransitionEvent } from 'react'
import { hasWindow } from '@talex-touch/tuffex-core'
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn, mergeRefs } from '../../utils/cn'

// ============================================================================
// TxIcon
// ============================================================================

export type TxIconType = 'emoji' | 'url' | 'file' | 'class' | 'builtin'
export type TxIconStatus = 'normal' | 'loading' | 'error'

export interface TxIconSource {
  type: TxIconType
  value: string
  status?: TxIconStatus
  color?: string
  colorful?: boolean
  error?: string
}

export interface TxIconProps extends HTMLAttributes<HTMLSpanElement> {
  icon?: TxIconSource | null
  name?: string
  alt?: string
  size?: number | string
  color?: string
  empty?: string
  emptyFallback?: ReactNode
  colorful?: boolean
  urlResolver?: (url: string, type: 'url' | 'file') => string
  svgFetcher?: (url: string) => Promise<string>
}

interface BuiltinGlyphSpec {
  viewBox: string
  path: string
  stroke?: number
}

const TX_BUILTIN_ICONS: Record<string, BuiltinGlyphSpec> = {
  'check': {
    viewBox: '0 0 24 24',
    path: 'M10 15.172L19.192 5.979L20.607 7.393L10 18L3.636 11.636L5.05 10.222L10 15.172Z',
  },
  'chevron-down': {
    viewBox: '0 0 24 24',
    path: 'M6 9.5 12 15.5 18 9.5',
    stroke: 1.75,
  },
  'chevron-right': {
    viewBox: '0 0 24 24',
    path: 'M9.5 6 15.5 12 9.5 18',
    stroke: 1.75,
  },
  'chevron-left': {
    viewBox: '0 0 24 24',
    path: 'M14.5 6 8.5 12 14.5 18',
    stroke: 1.75,
  },
  'arrow-left': {
    viewBox: '0 0 24 24',
    path: 'M19 12H5M11 6 5 12 11 18',
    stroke: 1.75,
  },
  'arrow-up': {
    viewBox: '0 0 24 24',
    path: 'M12 19V5M6 11 12 5 18 11',
    stroke: 1.75,
  },
  'arrow-down': {
    viewBox: '0 0 24 24',
    path: 'M12 5V19M6 13 12 19 18 13',
    stroke: 1.75,
  },
  'plus': {
    viewBox: '0 0 24 24',
    path: 'M12 5V19M5 12H19',
    stroke: 1.75,
  },
  'close': {
    viewBox: '0 0 24 24',
    path: 'M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95L7.05 5.636z',
  },
  'search': {
    viewBox: '0 0 24 24',
    path: 'M10 2a8 8 0 105.293 14.293l4.707 4.707 1.414-1.414-4.707-4.707A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z',
  },
  'user': {
    viewBox: '0 0 24 24',
    path: 'M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5z',
  },
  'star': {
    viewBox: '0 0 24 24',
    path: 'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.62L12 2 9.19 8.62 2 9.24l5.46 4.73L5.82 21z',
  },
  'star-half': {
    viewBox: '0 0 24 24',
    path: 'M12 2v15.77L6.08 21l1.82-7.03L2 9.24l7.19-.62L12 2z',
  },
  'info': {
    viewBox: '0 0 24 24',
    path: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm-1 3h2v2h-2V7zm0 4h2v6h-2v-6z',
  },
  'check-circle': {
    viewBox: '0 0 24 24',
    path: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm-1.3 12.3L6.4 12l1.4-1.4 2.9 2.9 5.6-5.6 1.4 1.4z',
  },
  'x-circle': {
    viewBox: '0 0 24 24',
    path: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm3.5 4.1L12 11.6 8.5 8.1 7.1 9.5l3.5 3.5-3.5 3.5 1.4 1.4 3.5-3.5 3.5 3.5 1.4-1.4-3.5-3.5 3.5-3.5z',
  },
  'alert-triangle': {
    viewBox: '0 0 24 24',
    path: 'M12 2 1.5 20.5h21zm0 4.2L19 18.5H5zm-1 3.8h2v4.5h-2zm0 5.8h2v2h-2z',
  },
}

const ERROR_GLYPH = 'M2.992 21A.993.993 0 0 1 2 20.007V3.993A1 1 0 0 1 2.992 3h18.016c.548 0 .992.445.992.993v16.014a1 1 0 0 1-.992.993zM20 15V5H4v14L14 9zm0 2.828l-6-6L6.828 19H20zM8 11a2 2 0 1 1 0-4a2 2 0 0 1 0 4'

function isSvgSource(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized)
    return false
  if (normalized.startsWith('data:image/svg+xml'))
    return true
  const [path] = normalized.split(/[?#]/)
  return path?.endsWith('.svg') ?? false
}

function decodeSvgDataUrl(url: string): string | null {
  const match = /^data:image\/svg\+xml(?:;[^,]*)?,(.*)$/i.exec(url)
  if (!match?.[1])
    return null
  try {
    if (/^data:image\/svg\+xml(?:;[^,]*)?;base64,/i.test(url))
      return typeof atob === 'function' ? atob(match[1]) : null
    return decodeURIComponent(match[1])
  }
  catch {
    return match[1]
  }
}

export const TxIcon = forwardRef<HTMLSpanElement, TxIconProps>((
  {
    icon = null,
    name = '',
    alt = '',
    size,
    color,
    empty = '',
    emptyFallback,
    colorful = false,
    urlResolver,
    svgFetcher,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const safeIcon = useMemo<TxIconSource>(() => {
    if (icon)
      return icon
    const trimmed = name.trim()
    if (!trimmed)
      return { type: 'emoji', value: '' }
    if (trimmed.startsWith('i-'))
      return { type: 'class', value: trimmed }
    if (trimmed in TX_BUILTIN_ICONS)
      return { type: 'builtin', value: trimmed }
    return { type: 'class', value: trimmed }
  }, [icon, name])

  const isLoading = safeIcon.status === 'loading'
  const isError = safeIcon.status === 'error'
  const isAddressable = safeIcon.type === 'url' || safeIcon.type === 'file'

  const resolvedUrl = useMemo(() => {
    if (!isAddressable || !safeIcon.value)
      return safeIcon.value
    if (urlResolver)
      return urlResolver(safeIcon.value, safeIcon.type as 'url' | 'file')
    return safeIcon.value
  }, [isAddressable, safeIcon.type, safeIcon.value, urlResolver])

  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageLoadFailed, setImageLoadFailed] = useState(false)
  const [svgContent, setSvgContent] = useState('')

  useEffect(() => {
    setImageLoaded(false)
    setImageLoadFailed(false)
  }, [resolvedUrl])

  const shouldPreserveColor = colorful || safeIcon.colorful === true
  const shouldFetchSvg = isAddressable && !shouldPreserveColor && isSvgSource(resolvedUrl)

  useEffect(() => {
    if (!shouldFetchSvg || !resolvedUrl) {
      setSvgContent('')
      return
    }
    const inlineSvg = decodeSvgDataUrl(resolvedUrl)
    if (inlineSvg !== null) {
      setSvgContent(inlineSvg)
      return
    }
    if (!svgFetcher) {
      setSvgContent('')
      return
    }
    let cancelled = false
    svgFetcher(resolvedUrl)
      .then((content) => {
        if (!cancelled)
          setSvgContent(content)
      })
      .catch(() => {
        if (!cancelled)
          setSvgContent('')
      })
    return () => {
      cancelled = true
    }
  }, [shouldFetchSvg, resolvedUrl, svgFetcher])

  const builtinSpec = safeIcon.type === 'builtin' ? TX_BUILTIN_ICONS[safeIcon.value] : undefined
  const resolvedFontSize = size !== undefined ? (typeof size === 'number' ? `${size}px` : size) : undefined
  const iconColor = color ?? safeIcon.color ?? 'var(--icon-color, currentColor)'

  const rootStyle: CSSProperties = {
    fontSize: resolvedFontSize,
    color: iconColor,
    ...style,
  }

  let content: ReactNode
  if (children !== undefined && children !== null) {
    content = children
  }
  else if (!safeIcon.value || (isAddressable && imageLoadFailed)) {
    content = (
      <span className="tuff-icon__empty">
        {emptyFallback ?? (empty ? <img alt={alt} src={empty} /> : null)}
      </span>
    )
  }
  else if (isError) {
    content = (
      <span className="tuff-icon__error">
        <svg viewBox="0 0 24 24" width="1em" height="1em" xmlns="http://www.w3.org/2000/svg">
          <path d={ERROR_GLYPH} fill="currentColor" />
        </svg>
      </span>
    )
  }
  else if (isLoading) {
    content = (
      <span className="tuff-icon__loading">
        <span className="tuff-icon__loading-skeleton">
          <span className="tuff-icon__loading-shimmer" />
        </span>
      </span>
    )
  }
  else if (safeIcon.type === 'emoji') {
    content = <span className="tuff-icon__emoji">{safeIcon.value || '⚠️'}</span>
  }
  else if (safeIcon.type === 'class') {
    content = (
      <span className="tuff-icon__class">
        <i className={safeIcon.value} />
      </span>
    )
  }
  else if (safeIcon.type === 'builtin' && builtinSpec) {
    content = (
      <span className="tuff-icon__builtin">
        <svg viewBox={builtinSpec.viewBox} width="1em" height="1em" fill="none" xmlns="http://www.w3.org/2000/svg">
          {builtinSpec.stroke
            ? (
                <path
                  d={builtinSpec.path}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={builtinSpec.stroke}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )
            : <path d={builtinSpec.path} fill="currentColor" />}
        </svg>
      </span>
    )
  }
  else if (isAddressable) {
    if (shouldFetchSvg && svgContent) {
      const encoded = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent).replace(/'/g, '%27')}`
      content = (
        <span
          className="tuff-icon__svg-mask"
          style={{
            WebkitMaskImage: `url('${encoded}')`,
            maskImage: `url('${encoded}')`,
          }}
        />
      )
    }
    else {
      content = (
        <>
          {!imageLoaded && (
            <span className="tuff-icon__loading" aria-hidden="true">
              <span className="tuff-icon__loading-skeleton">
                <span className="tuff-icon__loading-shimmer" />
              </span>
            </span>
          )}
          <img
            alt={alt}
            src={resolvedUrl}
            style={imageLoaded ? undefined : { display: 'none' }}
            onLoad={() => {
              setImageLoaded(true)
              setImageLoadFailed(false)
            }}
            onError={() => {
              setImageLoaded(false)
              setImageLoadFailed(true)
            }}
          />
        </>
      )
    }
  }
  else {
    content = (
      <span className="tuff-icon__error">
        <svg viewBox="0 0 24 24" width="1em" height="1em" xmlns="http://www.w3.org/2000/svg">
          <path d={ERROR_GLYPH} fill="currentColor" />
        </svg>
      </span>
    )
  }

  return (
    <span
      ref={ref}
      className={cn('tuff-icon tx-icon', className)}
      title={alt || undefined}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      data-icon-type={safeIcon.type}
      data-icon-value={safeIcon.value}
      style={rootStyle}
      {...rest}
    >
      {content}
    </span>
  )
})
TxIcon.displayName = 'TxIcon'

// ============================================================================
// TxIconChip
// ============================================================================

export type TxIconChipTone = 'neutral' | 'ink' | 'accent' | 'green' | 'orange' | 'red'
export type TxIconChipVariant = 'solid' | 'soft'
export type TxIconChipShape = 'square' | 'circle'

export interface TxIconChipProps extends HTMLAttributes<HTMLSpanElement> {
  size?: number
  radius?: number | string
  tone?: TxIconChipTone
  variant?: TxIconChipVariant
  shape?: TxIconChipShape
  label?: string
  fontSize?: number
  ariaLabel?: string
}

export const TxIconChip = forwardRef<HTMLSpanElement, TxIconChipProps>((
  {
    size = 14,
    radius,
    tone = 'neutral',
    variant = 'solid',
    shape = 'square',
    label,
    fontSize,
    ariaLabel,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const hasChildren = children !== undefined && children !== null
  const resolvedRadius = shape === 'circle'
    ? '999px'
    : radius !== undefined
      ? (typeof radius === 'number' ? `${radius}px` : radius)
      : `${Math.round(size / 4)}px`
  const resolvedFontSize = fontSize !== undefined ? fontSize : Math.max(7, Math.round(size * 0.4))
  const isWide = !hasChildren && (label?.length ?? 0) > 3

  const chipStyle = {
    '--tx-bui-icon-chip-size': `${size}px`,
    '--tx-bui-icon-chip-radius': resolvedRadius,
    '--tx-bui-icon-chip-font-size': `${resolvedFontSize}px`,
    ...style,
  } as CSSProperties

  return (
    <span
      ref={ref}
      className={cn(
        'tx-bui-icon-chip tx-icon-chip',
        `is-${tone}`,
        `is-${variant}`,
        { 'is-circle': shape === 'circle', 'is-wide': isWide },
        className,
      )}
      style={chipStyle}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel || undefined}
      aria-hidden={ariaLabel ? undefined : true}
      {...rest}
    >
      {hasChildren ? children : label}
    </span>
  )
})
TxIconChip.displayName = 'TxIconChip'

// ============================================================================
// TxCellLink
// ============================================================================

export type TxCellLinkUnderline = 'always' | 'hover'

export interface TxCellLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  label?: string
  external?: boolean
  muted?: boolean
  underline?: TxCellLinkUnderline
  ariaLabel?: string
  onOpen?: (payload: { href: string, event: MouseEvent<HTMLAnchorElement> }) => void
}

export const TxCellLink = forwardRef<HTMLAnchorElement, TxCellLinkProps>((
  {
    href,
    label,
    external = false,
    muted = false,
    underline = 'hover',
    ariaLabel,
    onOpen,
    onClick,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    onOpen?.({ href, event })
    onClick?.(event)
  }

  return (
    <a
      ref={ref}
      href={href}
      aria-label={ariaLabel}
      className={cn(
        'tx-bui-cell-link tx-cell-link',
        `is-underline-${underline}`,
        { 'is-muted': muted, 'is-external': external },
        className,
      )}
      onClick={handleClick}
      {...rest}
    >
      <span className="tx-bui-cell-link__text">
        {children ?? label ?? href}
      </span>
      {external && (
        <span className="tx-bui-cell-link__arrow" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 17 17 7M9 7h8v8" />
          </svg>
        </span>
      )}
    </a>
  )
})
TxCellLink.displayName = 'TxCellLink'

// ============================================================================
// TxText
// ============================================================================

export type TxTextOverflow = 'start' | 'middle' | 'end'
export type TxTextScroll = 'none' | 'auto' | 'hover' | 'loop'
export type TxTextLoopEdge = 'gap' | 'clip' | 'fade' | 'wrap'

export interface TxTextProps extends HTMLAttributes<HTMLSpanElement> {
  text?: string
  overflow?: TxTextOverflow
  scroll?: TxTextScroll
  loopEdge?: TxTextLoopEdge
}

const AUTO_SPEED = 40
const HOVER_SPEED = 60
const LOOP_SPEED = 40
const LOOP_CLIP_EM = 2
const ELLIPSIS = '…'

export const TxText = forwardRef<HTMLSpanElement, TxTextProps>((
  {
    text,
    overflow = 'end',
    scroll = 'none',
    loopEdge = 'gap',
    className,
    style,
    children,
    onPointerEnter,
    onPointerLeave,
    onPointerUp,
    ...rest
  },
  ref,
) => {
  const resolvedText = text ?? (typeof children === 'string' || typeof children === 'number' ? String(children) : '')
  const rootRef = useRef<HTMLSpanElement | null>(null)
  const measureRef = useRef<HTMLSpanElement | null>(null)
  const trackRef = useRef<HTMLSpanElement | null>(null)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const [reducedMotion, setReducedMotion] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const [travel, setTravel] = useState(0)
  const [loopDistance, setLoopDistance] = useState(0)
  const [loopGap, setLoopGap] = useState(0)
  const [displayText, setDisplayText] = useState(resolvedText)
  const [phase, setPhase] = useState<'idle' | 'entering' | 'revealed' | 'leaving'>('idle')

  const scrollMode: TxTextScroll = reducedMotion ? 'none' : scroll
  const showTrack = scrollMode === 'auto' || scrollMode === 'loop' || phase !== 'idle'
  const animated = scrollMode === 'auto' && overflowing
  const looping = scrollMode === 'loop' && overflowing
  const truncating = scrollMode === 'none' || scrollMode === 'hover'

  const loopSeconds = Math.max(travel / AUTO_SPEED / 0.38, 4)
  const slideSeconds = Math.min(3, Math.max(0.35, travel / HOVER_SPEED))

  const measureText = useCallback((content: string): number => {
    const el = measureRef.current
    if (!el)
      return 0
    el.textContent = content
    return el.getBoundingClientRect().width
  }, [])

  const cut = useCallback((chars: string[], kept: number): string => {
    if (overflow === 'start')
      return `${ELLIPSIS}${chars.slice(chars.length - kept).join('')}`
    const head = Math.ceil(kept / 2)
    return `${chars.slice(0, head).join('')}${ELLIPSIS}${chars.slice(chars.length - (kept - head)).join('')}`
  }, [overflow])

  const fit = useCallback((chars: string[], available: number): string => {
    let low = 0
    let high = chars.length - 1
    let best = cut(chars, 0)
    while (low <= high) {
      const mid = (low + high) >> 1
      const candidate = cut(chars, mid)
      if (measureText(candidate) <= available) {
        best = candidate
        low = mid + 1
      }
      else {
        high = mid - 1
      }
    }
    return best
  }, [cut, measureText])

  const layout = useCallback(() => {
    const root = rootRef.current
    if (!root || !hasWindow()) {
      setDisplayText(resolvedText)
      return
    }
    const available = root.clientWidth
    const width = measureText(resolvedText)
    const extra = width - available
    const isOverflowing = extra > 0.5
    setOverflowing(isOverflowing)
    setTravel(isOverflowing ? extra : 0)
    const fontPx = Number.parseFloat(window.getComputedStyle(root).fontSize) || 16
    const nextGap = loopEdge === 'gap' ? available : loopEdge === 'wrap' ? 0 : LOOP_CLIP_EM * fontPx
    setLoopGap(nextGap)
    setLoopDistance(width + nextGap)
    setDisplayText(
      isOverflowing && truncating && overflow !== 'end'
        ? fit(Array.from(resolvedText), available)
        : resolvedText,
    )
  }, [resolvedText, overflow, loopEdge, truncating, measureText, fit])

  useEffect(() => {
    layout()
  }, [layout])

  useEffect(() => {
    if (!hasWindow())
      return
    let mq: MediaQueryList | undefined
    const handleMotion = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    if (typeof window.matchMedia === 'function') {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)')
      setReducedMotion(mq.matches)
      mq.addEventListener?.('change', handleMotion)
    }

    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined' && rootRef.current) {
      ro = new ResizeObserver(() => layout())
      ro.observe(rootRef.current)
    }
    layout()
    return () => {
      if (settleTimerRef.current !== undefined)
        clearTimeout(settleTimerRef.current)
      ro?.disconnect()
      mq?.removeEventListener?.('change', handleMotion)
    }
  }, [layout])

  useEffect(() => {
    if (settleTimerRef.current !== undefined)
      clearTimeout(settleTimerRef.current)
    setPhase('idle')
  }, [scrollMode])

  const enterHover = () => {
    if (scrollMode !== 'hover' || !overflowing)
      return
    if (settleTimerRef.current !== undefined)
      clearTimeout(settleTimerRef.current)
    setPhase('revealed')
  }

  const leaveHover = () => {
    if (phase === 'idle')
      return
    setPhase('leaving')
    if (settleTimerRef.current !== undefined)
      clearTimeout(settleTimerRef.current)
    settleTimerRef.current = setTimeout(() => {
      setPhase('idle')
    }, slideSeconds * 1000 + 120)
  }

  const handlePointerEnter = (event: PointerEvent<HTMLSpanElement>) => {
    onPointerEnter?.(event)
    if (event.pointerType !== 'touch')
      enterHover()
  }

  const handlePointerLeave = (event: PointerEvent<HTMLSpanElement>) => {
    onPointerLeave?.(event)
    if (event.pointerType !== 'touch')
      leaveHover()
  }

  const handlePointerUp = (event: PointerEvent<HTMLSpanElement>) => {
    onPointerUp?.(event)
    if (event.pointerType !== 'touch')
      return
    if (phase === 'idle' || phase === 'leaving')
      enterHover()
    else
      leaveHover()
  }

  const handleTrackTransitionEnd = (event: TransitionEvent<HTMLSpanElement>) => {
    if (event.propertyName === 'transform' && phase === 'leaving') {
      if (settleTimerRef.current !== undefined)
        clearTimeout(settleTimerRef.current)
      setPhase('idle')
    }
  }

  const atStart = overflow === 'start'
  const cssVars = {
    '--tx-text-travel': `${-travel}px`,
    '--tx-text-rest': atStart ? `${-travel}px` : '0px',
    '--tx-text-target': atStart ? '0px' : `${-travel}px`,
    '--tx-text-loop': `${loopSeconds}s`,
    '--tx-text-slide': `${slideSeconds}s`,
    '--tx-text-gap': `${loopGap}px`,
    '--tx-text-loop-shift': `${-loopDistance}px`,
    '--tx-text-loop-duration': `${Math.max(loopDistance / LOOP_SPEED, 0.1)}s`,
    ...style,
  } as CSSProperties

  return (
    <span
      ref={mergeRefs(ref, rootRef)}
      className={cn(
        'tx-text',
        `tx-text--overflow-${overflow}`,
        `tx-text--scroll-${scrollMode}`,
        `tx-text--edge-${loopEdge}`,
        { 'is-overflowing': overflowing },
        className,
      )}
      title={overflowing ? resolvedText : undefined}
      style={cssVars}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerUp={handlePointerUp}
      {...rest}
    >
      {showTrack
        ? (
            <span
              ref={trackRef}
              className={cn('tx-text__track', {
                'is-animated': animated,
                'is-looping': looping,
                'is-revealed': phase === 'revealed',
              })}
              aria-hidden="true"
              onTransitionEnd={handleTrackTransitionEnd}
            >
              {looping
                ? (
                    <>
                      <span className="tx-text__copy">{resolvedText}</span>
                      <span className="tx-text__gap" />
                      <span className="tx-text__copy">{resolvedText}</span>
                    </>
                  )
                : resolvedText}
            </span>
          )
        : (
            <span className="tx-text__value" aria-hidden="true">
              {text !== undefined ? displayText : (children ?? displayText)}
            </span>
          )}
      <span className="tx-text__sr">{resolvedText || children}</span>
      <span className="tx-text__measure-box" aria-hidden="true">
        <span ref={measureRef} className="tx-text__measure" />
      </span>
    </span>
  )
})
TxText.displayName = 'TxText'
