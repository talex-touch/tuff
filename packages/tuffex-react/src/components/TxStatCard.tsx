import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { forwardRef, useId } from 'react'
import { cn } from '../utils/cn'

export type TxStatCardInsightType = 'percent' | 'delta'
export type TxStatCardVariant = 'default' | 'progress'

export interface TxStatCardInsight {
  from: number
  to: number
  type?: TxStatCardInsightType
  color?: 'success' | 'danger' | 'warning' | 'info' | string
  iconClass?: string
  suffix?: string
  precision?: number
}

export interface TxStatCardProps extends HTMLAttributes<HTMLDivElement> {
  value: number | string
  label: ReactNode
  iconClass?: string
  clickable?: boolean
  insight?: TxStatCardInsight
  variant?: TxStatCardVariant
  progress?: number
  meta?: ReactNode
  ariaLabel?: string
}

function resolveInsightColor(color?: string): string | null {
  if (!color)
    return null
  const map: Record<string, string> = {
    success: 'var(--tx-color-success, #67c23a)',
    danger: 'var(--tx-color-danger, #f56c6c)',
    warning: 'var(--tx-color-warning, #e6a23c)',
    info: 'var(--tx-color-info, #909399)',
  }
  return map[color] ?? color
}

function formatNumber(val: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 20 }).format(val)
}

export const TxStatCard = forwardRef<HTMLDivElement, TxStatCardProps>(function TxStatCard(
  {
    value,
    label,
    iconClass = '',
    clickable = false,
    insight,
    variant = 'default',
    progress,
    meta,
    ariaLabel,
    className,
    ...rest
  },
  ref,
) {
  const labelId = useId()
  const isProgressVariant = variant === 'progress' || typeof progress === 'number'
  const numericValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && Number.isFinite(Number(value))
      ? Number(value)
      : null

  const hasInsight = !isProgressVariant && Boolean(insight) && Number.isFinite(insight?.from) && Number.isFinite(insight?.to)

  let insightVal: number | null = null
  if (hasInsight && insight) {
    const { from, to, type = 'percent', precision } = insight
    const delta = to - from
    let raw = type === 'delta' ? delta : (from === 0 ? 0 : (delta / from) * 100)
    if (!Number.isFinite(raw))
      raw = 0
    const digits = precision ?? (type === 'percent' ? 1 : 0)
    if (Number.isFinite(digits))
      raw = Number(raw.toFixed(Math.max(0, digits)))
    insightVal = raw
  }

  const insightPrefix = hasInsight && insightVal !== null && insightVal > 0 ? '+' : ''
  const insightSuffix = hasInsight
    ? (insight?.suffix != null ? insight.suffix : insight?.type === 'delta' ? '' : '%')
    : ''
  const insightColor = hasInsight
    ? (resolveInsightColor(insight?.color) ?? resolveInsightColor((insightVal ?? 0) >= 0 ? 'success' : 'danger'))
    : null
  const insightTrendDown = (insightVal ?? 0) < 0

  const rawProgress = isProgressVariant
    ? (typeof progress === 'number' ? progress : (numericValue !== null && numericValue <= 100 ? numericValue : 0))
    : null
  const progressPercent = rawProgress !== null ? Math.max(0, Math.min(100, rawProgress)) : null

  const displayText = typeof value === 'number' ? formatNumber(value) : String(value)

  return (
    <div
      ref={ref}
      className={cn(
        'tx-stat-card fake-background',
        {
          'tx-stat-card--clickable': clickable,
          'tx-stat-card--insight': hasInsight,
          'tx-stat-card--progress': isProgressVariant,
        },
        className,
      )}
      role="group"
      aria-label={ariaLabel || undefined}
      aria-labelledby={ariaLabel ? undefined : labelId}
      {...rest}
    >
      {iconClass && !isProgressVariant && (
        <div className="tx-stat-card__glyph" aria-hidden="true">
          <i className={cn('tx-stat-card__icon', iconClass)} />
        </div>
      )}

      {isProgressVariant && (
        <div
          className="tx-stat-card__progress"
          style={{ '--tx-stat-card-progress': `${progressPercent ?? 0}%` } as CSSProperties}
          aria-hidden="true"
        >
          <span className="tx-stat-card__progress-ring" />
          <span className="tx-stat-card__progress-inner">
            {iconClass && <i className={cn('tx-stat-card__progress-icon', iconClass)} />}
          </span>
        </div>
      )}

      <div className="tx-stat-card__content">
        {(hasInsight || isProgressVariant) && (
          <div id={labelId} className="tx-stat-card__label tx-stat-card__label--top">{label}</div>
        )}

        <div className="tx-stat-card__value">
          <span>{displayText}</span>
        </div>

        {!hasInsight && !isProgressVariant && (
          <div id={labelId} className="tx-stat-card__label">{label}</div>
        )}

        {hasInsight && (
          <div className="tx-stat-card__insight" style={{ color: insightColor ?? undefined }}>
            {insight?.iconClass
              ? <i className={cn('tx-stat-card__insight-icon', insight.iconClass)} aria-hidden="true" />
              : (
                  <svg className="tx-stat-card__insight-icon tx-stat-card__insight-icon--trend" viewBox="0 0 16 16" aria-hidden="true">
                    {insightTrendDown
                      ? <path d="M4.5 4.5l7 7M11.5 6v5.5H6" />
                      : <path d="M4.5 11.5l7-7M6 4.5h5.5V10" />}
                  </svg>
                )}
            <span className="tx-stat-card__insight-text">
              {insightPrefix && <span className="tx-stat-card__insight-prefix">{insightPrefix}</span>}
              {insightVal !== null && <span className="tx-stat-card__insight-value">{formatNumber(insightVal)}</span>}
              {insightSuffix && <span className="tx-stat-card__insight-suffix">{insightSuffix}</span>}
            </span>
          </div>
        )}

        {meta !== undefined && meta !== null && meta !== '' && (
          <div className="tx-stat-card__meta">{meta}</div>
        )}
      </div>
    </div>
  )
})
