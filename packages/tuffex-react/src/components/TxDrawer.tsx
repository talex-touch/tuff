import type { CSSProperties, HTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import { hasDocument } from '@talex-touch/tuffex-core'
import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useControllableState } from '../hooks/useControllableState'
import { allocateZIndex, trapFocusInContainer, useFocusReturn } from '../hooks/useDismissableLayer'
import { cn, mergeRefs } from '../utils/cn'
import { TxDivider } from './TxDivider'

export type TxDrawerDirection = 'left' | 'right' | 'top' | 'bottom'
export type TxDrawerSize = number | string | 'full'
export type TxDrawerMaskEffect = 'blur' | 'opacity' | 'transparent'

export interface TxDrawerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  open?: boolean
  defaultOpen?: boolean
  visible?: boolean
  title?: ReactNode
  size?: TxDrawerSize
  full?: boolean
  direction?: TxDrawerDirection
  showHeader?: boolean
  showFooter?: boolean
  showClose?: boolean
  closeLabel?: string
  closeOnClickMask?: boolean
  closeOnPressEscape?: boolean
  maskEffect?: TxDrawerMaskEffect
  panelTransparent?: boolean
  header?: ReactNode
  footer?: ReactNode
  zIndex?: number
  lazy?: boolean
  onOpenChange?: (open: boolean) => void
  onOpen?: () => void
  onClose?: () => void
}

function normalizeDrawerSize(size: TxDrawerSize | undefined): string {
  if (typeof size === 'number')
    return `${size}px`
  const normalized = `${size ?? '60%'}`.trim()
  if (!normalized)
    return '60%'
  return normalized.toLowerCase() === 'full' ? '100%' : normalized
}

export const TxDrawer = forwardRef<HTMLDivElement, TxDrawerProps>((
  {
    open,
    defaultOpen = false,
    visible,
    title = 'Drawer',
    size,
    full = false,
    direction = 'right',
    showHeader = true,
    showFooter = true,
    showClose = true,
    closeLabel = 'Close drawer',
    closeOnClickMask = true,
    closeOnPressEscape = true,
    maskEffect = 'blur',
    panelTransparent = false,
    header,
    footer,
    zIndex,
    lazy = true,
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
  const controlledOpen = open ?? visible
  const [isOpen, setIsOpen] = useControllableState({
    value: controlledOpen,
    defaultValue: defaultOpen,
    onChange: (next) => {
      onOpenChange?.(next)
      if (next)
        onOpen?.()
      else
        onClose?.()
    },
  })

  const [hasEverOpened, setHasEverOpened] = useState(isOpen)
  const drawerRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()
  const zIndexRef = useRef<number>(zIndex ?? allocateZIndex())

  useEffect(() => {
    if (isOpen) {
      setHasEverOpened(true)
      zIndexRef.current = zIndex ?? allocateZIndex()
    }
  }, [isOpen, zIndex])

  useFocusReturn(isOpen, drawerRef)

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

  if (!hasDocument())
    return null

  const shouldRenderContent = !lazy || hasEverOpened
  const resolvedSize = normalizeDrawerSize(full ? 'full' : size)
  const isHorizontal = direction === 'left' || direction === 'right'
  const shouldRenderHeader = shouldRenderContent && showHeader && Boolean(header || title || showClose)
  const shouldRenderFooter = shouldRenderContent && showFooter && Boolean(footer)

  const drawerStyle = {
    '--tx-drawer-size': resolvedSize,
    '--tx-drawer-width': isHorizontal ? resolvedSize : '100%',
    '--tx-drawer-height': isHorizontal ? '100%' : resolvedSize,
    '--tx-drawer-z-index': zIndex ?? zIndexRef.current,
    ...style,
  } as CSSProperties

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab')
      trapFocusInContainer(event.nativeEvent, drawerRef.current)
  }

  return createPortal(
    <div
      ref={mergeRefs(ref, drawerRef)}
      className={cn(
        'tx-drawer',
        `tx-drawer--${direction}`,
        `tx-drawer--mask-${maskEffect}`,
        {
          'tx-drawer--visible': isOpen,
          'tx-drawer--panel-transparent': panelTransparent,
        },
        className,
      )}
      style={drawerStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby={shouldRenderHeader ? titleId : undefined}
      aria-label={!shouldRenderHeader && typeof title === 'string' ? title : undefined}
      aria-hidden={!isOpen}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      <div
        className="tx-drawer__mask"
        aria-hidden="true"
        onClick={() => {
          if (closeOnClickMask)
            setIsOpen(false)
        }}
      />

      <div className="tx-drawer__panel">
        {shouldRenderHeader && (
          <>
            <header className="tx-drawer__header">
              {header
                ? <div id={titleId} className="tx-drawer__header-content">{header}</div>
                : (
                    <>
                      <h2 id={titleId} className="tx-drawer__title">{title}</h2>
                      {showClose && (
                        <button
                          type="button"
                          className="tx-drawer__close"
                          aria-label={closeLabel}
                          onClick={() => setIsOpen(false)}
                        >
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </>
                  )}
            </header>
            <TxDivider className="tx-drawer__divider" />
          </>
        )}

        <div className="tx-drawer__body">
          {shouldRenderContent ? children : null}
        </div>

        {shouldRenderFooter && (
          <>
            <TxDivider className="tx-drawer__divider" />
            <footer className="tx-drawer__footer">{footer}</footer>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
})
