import type { HTMLAttributes } from 'react'
import { forwardRef } from 'react'
import { TxProgressBar } from './TxProgressBar'

export interface TxProgressProps extends HTMLAttributes<HTMLSpanElement> {
  percentage?: number
  status?: 'success' | 'error' | 'warning' | ''
  strokeWidth?: number
  showText?: boolean
  indeterminate?: boolean
  format?: (percentage: number) => string
  ariaLabel?: string
  onComplete?: () => void
}

export const TxProgress = forwardRef<HTMLSpanElement, TxProgressProps>(function TxProgress(
  {
    percentage = 0,
    status = '',
    strokeWidth = 6,
    showText = true,
    indeterminate = false,
    format,
    ariaLabel,
    onComplete,
    ...rest
  },
  ref,
) {
  return (
    <TxProgressBar
      ref={ref}
      percentage={percentage}
      status={status}
      indeterminate={indeterminate}
      height={`${strokeWidth}px`}
      showText={showText}
      textPlacement="outside"
      format={format}
      maskVariant="plain"
      ariaLabel={ariaLabel}
      onComplete={onComplete}
      {...rest}
    />
  )
})
