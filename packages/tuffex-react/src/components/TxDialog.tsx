import type { CSSProperties, HTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import { hasDocument } from '@talex-touch/tuffex-core'
import { forwardRef, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useControllableState } from '../hooks/useControllableState'
import { allocateZIndex, trapFocusInContainer, useFocusReturn } from '../hooks/useDismissableLayer'
import { cn, mergeRefs } from '../utils/cn'

export interface TxDialogProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  open?: boolean
  defaultOpen?: boolean
  visible?: boolean
  title?: ReactNode
  description?: ReactNode
  message?: ReactNode
  header?: ReactNode
  footer?: ReactNode
  width?: string
  fullscreen?: boolean
  showClose?: boolean
  closeLabel?: string
  closeOnClickMask?: boolean
  closeOnPressEscape?: boolean
  zIndex?: number
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
}

export const TxDialog = forwardRef<HTMLDivElement, TxDialogProps>((
  {
    open,
    defaultOpen = false,
    visible,
    title,
    description,
    message,
    header,
    footer,
    width = '480px',
    fullscreen = false,
    showClose = true,
    closeLabel = 'Close',
    closeOnClickMask = true,
    closeOnPressEscape = true,
    zIndex,
    onOpenChange,
    onClose,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const controlledOpen = open ?? visible
  const [isOpen, setIsOpen] = useControllableState({
    value: controlledOpen,
    defaultValue: defaultOpen,
    onChange: (next) => {
      onOpenChange?.(next)
      if (!next)
        onClose?.()
    },
  })

  const overlayRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  const descId = useId()
  const allocatedZRef = useRef<number>(zIndex ?? allocateZIndex())

  useEffect(() => {
    if (isOpen)
      allocatedZRef.current = zIndex ?? allocateZIndex()
  }, [isOpen, zIndex])

  useFocusReturn(isOpen, overlayRef)

  const close = () => {
    setIsOpen(false)
  }

  useEffect(() => {
    if (!isOpen || !closeOnPressEscape || !hasDocument())
      return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape')
        return
      event.preventDefault()
      setIsOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeOnPressEscape, setIsOpen])

  if (!isOpen || !hasDocument())
    return null

  const bodyDescription = description ?? message
  const hasHeader = Boolean(header || title || showClose)

  const handleOverlayKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab')
      trapFocusInContainer(event.nativeEvent, overlayRef.current)
  }

  return createPortal(
    <div
      ref={mergeRefs(ref, overlayRef)}
      className={cn(
        'tx-modal__overlay tx-dialog',
        { 'tx-modal__overlay--fullscreen': fullscreen },
        className,
      )}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      aria-labelledby={title || header ? titleId : undefined}
      aria-describedby={bodyDescription ? descId : undefined}
      style={{ zIndex: allocatedZRef.current, ...style } as CSSProperties}
      onClick={(event) => {
        if (event.target === event.currentTarget && closeOnClickMask)
          close()
      }}
      onKeyDown={handleOverlayKeyDown}
      {...rest}
    >
      <div
        className={cn('tx-modal__content tx-dialog__content', {
          'tx-modal__content--fullscreen': fullscreen,
        })}
        style={fullscreen ? undefined : { width }}
      >
        {hasHeader && (
          <header className="tx-modal__header">
            {header
              ? <div id={titleId}>{header}</div>
              : title !== undefined && title !== null && title !== ''
                ? <h3 id={titleId} className="tx-modal__title">{title}</h3>
                : <span />}
            {showClose && (
              <button
                type="button"
                className="tx-modal__close"
                aria-label={closeLabel}
                onClick={close}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </header>
        )}

        <section className="tx-modal__body">
          {bodyDescription && <p id={descId} className="tx-dialog__description">{bodyDescription}</p>}
          {children}
        </section>

        {footer !== undefined && footer !== null && (
          <footer className="tx-modal__footer">{footer}</footer>
        )}
      </div>
    </div>,
    document.body,
  )
})
