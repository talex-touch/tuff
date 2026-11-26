import type { CSSProperties, HTMLAttributes } from 'react'
import { forwardRef, useEffect, useRef } from 'react'
import { cn } from '../utils/cn'

export interface TxProgressSegment {
  value: number
  color?: string
  label?: string
}

export type TxProgressIndeterminateVariant = 'classic' | 'sweep' | 'bounce' | 'elastic' | 'split'
export type TxProgressFlowEffect = 'none' | 'shimmer' | 'wave' | 'stardust' | 'particles'
export type TxProgressIndicatorEffect = 'none' | 'sparkle'
export type TxProgressHoverEffect = 'none' | 'glow'

export interface TxProgressBarProps extends HTMLAttributes<HTMLSpanElement> {
  loading?: boolean
  indeterminate?: boolean
  indeterminateVariant?: TxProgressIndeterminateVariant
  error?: boolean
  success?: boolean
  status?: 'success' | 'error' | 'warning' | ''
  message?: string
  detail?: string
  ariaLabel?: string
  percentage?: number
  segments?: TxProgressSegment[]
  segmentsTotal?: number
  height?: string
  showText?: boolean
  textPlacement?: 'inside' | 'outside' | 'top' | 'bottom'
  format?: (percentage: number) => string
  flowEffect?: TxProgressFlowEffect
  indicatorEffect?: TxProgressIndicatorEffect
  hoverEffect?: TxProgressHoverEffect
  color?: string
  maskVariant?: 'solid' | 'dashed' | 'plain'
  maskBackground?: 'none' | 'blur' | 'glass' | 'mask'
  onComplete?: () => void
}

function heightToPx(height: string): number | null {
  const match = /^(\d+(?:\.\d+)?|\.\d+)(px|r?em)?$/.exec(height.trim())
  if (!match)
    return null
  return Number(match[1]) * (match[2]?.endsWith('em') ? 16 : 1)
}

export const TxProgressBar = forwardRef<HTMLSpanElement, TxProgressBarProps>((
  {
    loading = false,
    indeterminate = false,
    indeterminateVariant = 'sweep',
    error = false,
    success = false,
    status = '',
    message = '',
    detail = '',
    ariaLabel = '',
    percentage = 0,
    segments,
    segmentsTotal = 100,
    height = '5px',
    showText = false,
    textPlacement = 'inside',
    format,
    flowEffect = 'none',
    indicatorEffect = 'none',
    hoverEffect = 'none',
    color = '',
    maskVariant = 'plain',
    maskBackground = 'none',
    onComplete,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const segmentsSum = (segments ?? []).reduce(
    (acc, s) => acc + (Number.isFinite(s.value) ? Math.max(0, s.value) : 0),
    0,
  )
  const hasSegments = Boolean(segments?.length) && segmentsSum > 0

  const isIndeterminate = loading || indeterminate
  const resolvedPercentage = isIndeterminate
    ? 0
    : segments?.length
      ? Math.min(100, Math.max(0, (segmentsSum / Math.max(0.0001, segmentsTotal || 100)) * 100))
      : (() => {
          const raw = Math.min(100, Math.max(0, percentage ?? 0))
          if ((success || error) && raw === 0 && message)
            return 100
          return raw
        })()

  const resolvedStatus = error ? 'error' : success ? 'success' : status || ''

  const fillColor = color || (
    resolvedStatus === 'error'
      ? 'var(--tx-color-danger, #f56c6c)'
      : resolvedStatus === 'success'
        ? 'var(--tx-color-success, #67c23a)'
        : resolvedStatus === 'warning'
          ? 'var(--tx-color-warning, #e6a23c)'
          : 'var(--tx-color-primary, #409eff)'
  )

  const isGradient = fillColor.includes('gradient(')
  const accentColor = isGradient ? 'var(--tx-text-color-primary, #303133)' : fillColor
  const glowColor = isGradient ? '#fff' : fillColor
  const fillBackground = isGradient
    ? fillColor
    : `linear-gradient(90deg, color-mix(in srgb, ${fillColor} 58%, transparent), ${fillColor})`

  const resolvedFlow = flowEffect === 'particles' ? 'stardust' : flowEffect
  const showFlow = resolvedFlow !== 'none' && !isIndeterminate && !hasSegments

  const hasText = isIndeterminate ? Boolean(message) : Boolean(message) || Boolean(showText)
  const heightPx = heightToPx(height)
  const insideFits = heightPx === null || heightPx >= 16
  const resolvedPlacement = textPlacement === 'inside' && !insideFits ? 'bottom' : textPlacement

  const displayText = message || (format ? format(resolvedPercentage) : `${Math.round(resolvedPercentage)}%`)

  const completedRef = useRef(false)
  useEffect(() => {
    if (isIndeterminate)
      return
    if (resolvedPercentage >= 100 && !completedRef.current) {
      completedRef.current = true
      onComplete?.()
    }
    else if (resolvedPercentage < 100) {
      completedRef.current = false
    }
  }, [isIndeterminate, resolvedPercentage, onComplete])

  const segmentsResolved = hasSegments
    ? (segments ?? [])
        .filter(s => Number.isFinite(s.value) && s.value > 0)
        .map((s) => {
          const width = `${(s.value / Math.max(0.0001, segmentsSum)) * 100}%`
          const share = Math.round((s.value / Math.max(0.0001, segmentsTotal || 100)) * 100)
          return {
            width,
            color: s.color || fillColor,
            tip: s.label ? `${s.label} · ${share}%` : `${share}%`,
          }
        })
    : []

  const wrapperStyle = {
    '--tx-progress-height': height,
    '--tx-progress-width': `${resolvedPercentage}%`,
    '--tx-progress-color': fillColor,
    '--tx-progress-fill': fillBackground,
    '--tx-progress-accent': accentColor,
    '--tx-progress-glow': glowColor,
    ...style,
  } as CSSProperties

  const showTopText = hasText && resolvedPlacement === 'top'
  const showBottomText = hasText && resolvedPlacement === 'bottom'
  const showOutsideText = hasText && resolvedPlacement === 'outside'
  const showInsideText = hasText && resolvedPlacement === 'inside'

  return (
    <span
      ref={ref}
      className={cn(
        'tx-progress-bar-wrapper',
        `tx-progress-bar-wrapper--mask-${maskVariant}`,
        maskBackground !== 'none' ? `tx-progress-bar-wrapper--bg-${maskBackground}` : undefined,
        hoverEffect !== 'none' ? `tx-progress-bar-wrapper--hover-${hoverEffect}` : undefined,
        {
          'tx-progress-bar-wrapper--text-outside': showOutsideText,
          'tx-progress-bar-wrapper--text-top': showTopText,
          'tx-progress-bar-wrapper--text-bottom': showBottomText,
          'tx-progress-bar-wrapper--segmented': hasSegments,
        },
        className,
      )}
      style={wrapperStyle}
      {...rest}
    >
      {showTopText && (
        <span className="tx-progress-bar__head">
          <span className="tx-progress-bar__head-label">{displayText}</span>
          {detail && <span className="tx-progress-bar__head-detail">{detail}</span>}
        </span>
      )}

      <span className="tx-progress-bar__body">
        <span
          className="tx-progress-bar__track"
          role="progressbar"
          aria-valuenow={isIndeterminate ? undefined : resolvedPercentage}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={ariaLabel || message || 'Progress'}
        >
          {maskBackground !== 'none' && <span className="tx-progress-bar__mask" aria-hidden="true" />}

          <span
            className={cn(
              'tx-progress-bar',
              {
                'tx-progress-bar--indeterminate': isIndeterminate,
                [`tx-progress-bar--indeterminate-${indeterminateVariant}`]: isIndeterminate,
                [`tx-progress-bar--flow-${resolvedFlow}`]: showFlow,
                [`tx-progress-bar--status-${resolvedStatus}`]: Boolean(resolvedStatus),
                'tx-progress-bar--segmented': hasSegments,
              },
            )}
            aria-hidden="true"
          >
            {hasSegments && (
              <span className="tx-progress-bar__segments">
                {segmentsResolved.map((seg, idx) => (
                  <span key={idx} className="tx-progress-bar__segment" style={{ width: seg.width }} data-tip={seg.tip}>
                    <span className="tx-progress-bar__segment-fill" style={{ background: seg.color }} />
                  </span>
                ))}
              </span>
            )}
          </span>

          {indicatorEffect !== 'none' && !isIndeterminate && resolvedPercentage > 0 && (
            <span
              className={cn('tx-progress-bar__indicator', `tx-progress-bar__indicator--${indicatorEffect}`)}
              style={{ left: `${resolvedPercentage}%` }}
              aria-hidden="true"
            />
          )}

          {showInsideText && (
            <span className="tx-progress-bar__text">
              <span className="tx-progress-bar__label">{displayText}</span>
            </span>
          )}
        </span>
      </span>

      {showBottomText && (
        <span className="tx-progress-bar__head">
          <span className="tx-progress-bar__head-label">{displayText}</span>
          {detail && <span className="tx-progress-bar__head-detail">{detail}</span>}
        </span>
      )}

      {showOutsideText && <span className="tx-progress-bar__outside-text">{displayText}</span>}
    </span>
  )
})
