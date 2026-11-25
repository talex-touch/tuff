import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { forwardRef, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useControllableState } from '../hooks/useControllableState'
import { allocateZIndex, useDismissableLayer } from '../hooks/useDismissableLayer'
import type { FloatingPlacement } from '../hooks/useFloating'
import { useFloatingPosition } from '../hooks/useFloating'
import { cn, mergeRefs } from '../utils/cn'

export interface TxTooltipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'content'> {
  open?: boolean
  defaultOpen?: boolean
  content?: ReactNode
  disabled?: boolean
  trigger?: 'hover' | 'click' | 'focus' | 'manual'
  placement?: FloatingPlacement
  offset?: number
  openDelay?: number
  closeDelay?: number
  maxHeight?: number
  referenceFullWidth?: boolean
  interactive?: boolean
  closeOnClickOutside?: boolean
  closeOnEsc?: boolean
  role?: string
  unstyled?: boolean
  onOpenChange?: (open: boolean) => void
  onOpen?: () => void
  onClose?: () => void
}

export const TxTooltip = forwardRef<HTMLSpanElement, TxTooltipProps>(function TxTooltip(
  {
    open,
    defaultOpen = false,
    content,
    disabled = false,
    trigger = 'hover',
    placement = 'top',
    offset = 8,
    openDelay = 0,
    closeDelay = 0,
    maxHeight,
    referenceFullWidth = false,
    interactive = false,
    closeOnClickOutside,
    closeOnEsc = true,
    role = 'tooltip',
    unstyled = false,
    onOpenChange,
    onOpen,
    onClose,
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  const [isOpen, setIsOpen] = useControllableState({
    value: disabled ? false : open,
    defaultValue: disabled ? false : defaultOpen,
    onChange: (next) => {
      onOpenChange?.(next)
      if (next)
        onOpen?.()
      else
        onClose?.()
    },
  })

  const tooltipId = useId()
  const referenceRef = useRef<HTMLSpanElement | null>(null)
  const floatingRef = useRef<HTMLDivElement | null>(null)
  const zIndexRef = useRef<number>(allocateZIndex())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => clearTimer, [])

  const scheduleOpen = () => {
    if (disabled)
      return
    clearTimer()
    if (openDelay > 0) {
      timerRef.current = setTimeout(() => {
        zIndexRef.current = allocateZIndex()
        setIsOpen(true)
      }, openDelay)
    }
    else {
      zIndexRef.current = allocateZIndex()
      setIsOpen(true)
    }
  }

  const scheduleClose = () => {
    clearTimer()
    if (closeDelay > 0) {
      timerRef.current = setTimeout(() => {
        setIsOpen(false)
      }, closeDelay)
    }
    else {
      setIsOpen(false)
    }
  }

  const resolvedCloseOnClickOutside = closeOnClickOutside ?? (trigger === 'click')

  useDismissableLayer({
    open: isOpen,
    onDismiss: () => setIsOpen(false),
    closeOnEscape: closeOnEsc,
    closeOnOutsideClick: resolvedCloseOnClickOutside,
    containerRefs: [referenceRef, floatingRef],
  })

  const floating = useFloatingPosition(referenceRef, floatingRef, {
    open: isOpen,
    placement,
    offset,
  })

  const isTooltipRole = role === 'tooltip'

  const panelNode = isOpen && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={floatingRef}
          id={tooltipId}
          role={role}
          data-side={floating.side}
          className={cn(!unstyled && 'tx-floating-panel tx-tooltip')}
          style={{
            position: floating.strategy,
            left: `${floating.x}px`,
            top: `${floating.y}px`,
            zIndex: zIndexRef.current,
            maxHeight: maxHeight && maxHeight > 0 ? `${maxHeight}px` : undefined,
          } as CSSProperties}
          onMouseEnter={() => {
            if (trigger === 'hover' && interactive)
              clearTimer()
          }}
          onMouseLeave={() => {
            if (trigger === 'hover' && interactive)
              scheduleClose()
          }}
        >
          {unstyled ? content : <div className="tx-tooltip__content">{content}</div>}
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <span
        ref={mergeRefs(ref, referenceRef)}
        className={cn('tx-tooltip__reference', { 'is-full-width': referenceFullWidth }, className)}
        style={style}
        aria-describedby={isOpen && isTooltipRole ? tooltipId : undefined}
        onMouseEnter={() => {
          if (trigger === 'hover')
            scheduleOpen()
        }}
        onMouseLeave={() => {
          if (trigger === 'hover')
            scheduleClose()
        }}
        onFocus={() => {
          if (trigger === 'hover' || trigger === 'focus')
            scheduleOpen()
        }}
        onBlur={() => {
          if (trigger === 'hover' || trigger === 'focus')
            scheduleClose()
        }}
        onClick={() => {
          if (trigger === 'click' && !disabled) {
            if (!isOpen)
              zIndexRef.current = allocateZIndex()
            setIsOpen(!isOpen)
          }
        }}
        {...rest}
      >
        {children}
      </span>
      {panelNode}
    </>
  )
})
