import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import type { FloatingPlacement } from '../hooks/useFloating'
import { hasDocument } from '@talex-touch/tuffex-core'
import { forwardRef, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useControllableState } from '../hooks/useControllableState'
import { allocateZIndex, useDismissableLayer } from '../hooks/useDismissableLayer'
import { useFloatingPosition } from '../hooks/useFloating'
import { cn, mergeRefs } from '../utils/cn'

export type TxPopoverPlacement = FloatingPlacement

export interface TxPopoverProps extends Omit<HTMLAttributes<HTMLDivElement>, 'content'> {
  open?: boolean
  defaultOpen?: boolean
  disabled?: boolean
  placement?: TxPopoverPlacement
  offset?: number
  width?: number
  minWidth?: number
  maxWidth?: number
  maxHeight?: number
  referenceFullWidth?: boolean
  matchReferenceWidth?: boolean
  trigger?: 'click' | 'hover' | 'manual'
  openDelay?: number
  closeDelay?: number
  closeOnClickOutside?: boolean
  closeOnEsc?: boolean
  panelRadius?: number
  panelPadding?: number
  /** Trigger element when `children` is used as popover content. */
  reference?: ReactNode
  /** Popover content when `children` is used as trigger element. */
  content?: ReactNode
  onOpenChange?: (open: boolean) => void
  onOpen?: () => void
  onClose?: () => void
}

export const TxPopover = forwardRef<HTMLDivElement, TxPopoverProps>((
  {
    open,
    defaultOpen = false,
    disabled = false,
    placement = 'bottom-start',
    offset = 6,
    width = 0,
    minWidth = 0,
    maxWidth = 360,
    maxHeight = 420,
    referenceFullWidth = false,
    matchReferenceWidth,
    trigger = 'click',
    openDelay = 0,
    closeDelay = 0,
    closeOnClickOutside = true,
    closeOnEsc = true,
    panelRadius = 18,
    panelPadding = 10,
    reference,
    content,
    onOpenChange,
    onOpen,
    onClose,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
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

  const panelId = useId()
  const referenceRef = useRef<HTMLDivElement | null>(null)
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
      timerRef.current = setTimeout(() => setIsOpen(false), closeDelay)
    }
    else {
      setIsOpen(false)
    }
  }

  useDismissableLayer({
    open: isOpen,
    onDismiss: () => setIsOpen(false),
    closeOnEscape: closeOnEsc,
    closeOnOutsideClick: trigger === 'hover' ? false : closeOnClickOutside,
    containerRefs: [referenceRef, floatingRef],
  })

  const shouldMatchRefWidth = matchReferenceWidth ?? (width <= 0)
  const floating = useFloatingPosition(referenceRef, floatingRef, {
    open: isOpen,
    placement,
    offset,
    matchReferenceWidth: shouldMatchRefWidth,
  })

  const triggerNode = reference !== undefined ? reference : children
  const bodyNode = reference !== undefined ? children : content

  const panelStyle = {
    'position': floating.strategy,
    'left': `${floating.x}px`,
    'top': `${floating.y}px`,
    'zIndex': zIndexRef.current,
    'width': width > 0 ? `${width}px` : undefined,
    'minWidth': minWidth > 0 ? `${minWidth}px` : undefined,
    'maxWidth': maxWidth > 0 ? `${maxWidth}px` : undefined,
    'maxHeight': maxHeight > 0 ? `${maxHeight}px` : undefined,
    'overflowY': maxHeight > 0 ? 'auto' : undefined,
    '--tx-floating-radius': `${panelRadius}px`,
    '--tx-floating-padding': `${panelPadding}px`,
  } as CSSProperties

  const panel = isOpen && hasDocument()
    ? createPortal(
        <div
          ref={floatingRef}
          id={panelId}
          className="tx-floating-panel tx-popover__panel"
          role="dialog"
          data-side={floating.side}
          style={panelStyle}
          onMouseEnter={() => {
            if (trigger === 'hover')
              clearTimer()
          }}
          onMouseLeave={() => {
            if (trigger === 'hover')
              scheduleClose()
          }}
        >
          <div className="tx-popover__content">{bodyNode}</div>
        </div>,
        document.body,
      )
    : null

  return (
    <>
      <div
        ref={mergeRefs(ref, referenceRef)}
        className={cn('tx-popover__reference', { 'is-full-width': referenceFullWidth }, className)}
        style={style}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={() => {
          if (trigger === 'click' && !disabled) {
            if (!isOpen)
              zIndexRef.current = allocateZIndex()
            setIsOpen(!isOpen)
          }
        }}
        onMouseEnter={() => {
          if (trigger === 'hover')
            scheduleOpen()
        }}
        onMouseLeave={() => {
          if (trigger === 'hover')
            scheduleClose()
        }}
        {...rest}
      >
        {triggerNode}
      </div>
      {panel}
    </>
  )
})
