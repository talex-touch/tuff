import type { HTMLAttributes } from 'react'
import { forwardRef } from 'react'
import { cn } from '../utils/cn'

export interface TxKbdProps extends HTMLAttributes<HTMLElement> {
  size?: 'sm' | 'md'
  tone?: 'default' | 'primary'
}

export const TxKbd = forwardRef<HTMLElement, TxKbdProps>(function TxKbd(
  { size = 'sm', tone = 'default', className, children, ...rest },
  ref,
) {
  return (
    <kbd
      ref={ref}
      className={cn('tx-kbd', `tx-kbd--${size}`, `tx-kbd--${tone}`, className)}
      {...rest}
    >
      {children}
    </kbd>
  )
})
