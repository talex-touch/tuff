import type { CSSProperties, FocusEvent, HTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import { hasDocument } from '@talex-touch/tuffex-core'
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { useControllableState } from '../../hooks/useControllableState'
import { allocateZIndex, trapFocusInContainer, useFocusReturn } from '../../hooks/useDismissableLayer'
import { cn, mergeRefs } from '../../utils/cn'
import { TxSpinner } from '../TxSpinner'
import { TxIcon } from './primitives'

// ============================================================================
// 31. loading-overlay (TxLoadingOverlay)
// ============================================================================

export interface TxLoadingOverlayProps extends HTMLAttributes<HTMLDivElement> {
  loading?: boolean
  fullscreen?: boolean
  text?: ReactNode
  spinnerSize?: number
  background?: string
  zIndex?: number
}

export const TxLoadingOverlay = forwardRef<HTMLDivElement, TxLoadingOverlayProps>((
  {
    loading = false,
    fullscreen = false,
    text = '',
    spinnerSize = 18,
    background = 'color-mix(in srgb, var(--tx-bg-color, #fff) 70%, transparent)',
    zIndex,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const [mounted, setMounted] = useState(false)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const allocatedZRef = useRef<number>(zIndex ?? allocateZIndex())

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (loading && fullscreen)
      allocatedZRef.current = zIndex ?? allocateZIndex()
  }, [loading, fullscreen, zIndex])

  useFocusReturn(mounted && loading && fullscreen, overlayRef)

  const overlayStyle = {
    '--tx-loading-overlay-bg': background,
    ...(fullscreen ? { zIndex: allocatedZRef.current } : {}),
    ...style,
  } as CSSProperties

  const handleFullscreenKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab')
      event.preventDefault()
  }

  if (fullscreen) {
    if (!mounted || !loading || !hasDocument())
      return null

    return createPortal(
      <div
        ref={mergeRefs(ref, overlayRef)}
        className={cn('tx-loading-overlay tx-loading-overlay--fullscreen', className)}
        style={overlayStyle}
        role="status"
        aria-live="polite"
        aria-busy="true"
        tabIndex={-1}
        onKeyDown={handleFullscreenKeyDown}
        {...rest}
      >
        <div className="tx-loading-overlay__inner">
          <TxSpinner size={spinnerSize} />
          {text !== '' && text !== undefined && text !== null && (
            <div className="tx-loading-overlay__text">{text}</div>
          )}
        </div>
      </div>,
      document.body,
    )
  }

  return (
    <div
      ref={ref}
      className={cn('tx-loading-overlay__container', className)}
      aria-busy={loading || undefined}
      {...rest}
    >
      {children}
      {loading && (
        <div
          className="tx-loading-overlay"
          style={overlayStyle}
          role="status"
          aria-live="polite"
        >
          <div className="tx-loading-overlay__inner">
            <TxSpinner size={spinnerSize} />
            {text !== '' && text !== undefined && text !== null && (
              <div className="tx-loading-overlay__text">{text}</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
TxLoadingOverlay.displayName = 'TxLoadingOverlay'

// ============================================================================
// 32. modal (TxModal)
// ============================================================================

export type TxModalCloseReason = 'escape' | 'mask' | 'close'
export type TxModalSurfaceMode = 'pure' | 'mask' | 'blur' | 'glass' | 'refraction' | 'acrylic' | 'mica' | 'flat' | 'plain'

export interface TxModalProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  open?: boolean
  defaultOpen?: boolean
  modelValue?: boolean
  visible?: boolean
  title?: ReactNode
  header?: ReactNode
  footer?: ReactNode
  width?: string
  fullscreen?: boolean
  showClose?: boolean
  closeLabel?: string
  closeOnClickMask?: boolean
  closeOnPressEscape?: boolean
  surface?: TxModalSurfaceMode
  surfaceColor?: string
  surfaceOpacity?: number
  zIndex?: number
  beforeClose?: (reason: TxModalCloseReason) => boolean | void | Promise<boolean | void>
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
}

export const TxModal = forwardRef<HTMLDivElement, TxModalProps>((
  {
    open,
    defaultOpen = false,
    modelValue,
    visible,
    title = '',
    header,
    footer,
    width = '480px',
    fullscreen = false,
    showClose = true,
    closeLabel = 'Close',
    closeOnClickMask = true,
    closeOnPressEscape = true,
    surface = 'refraction',
    surfaceColor,
    surfaceOpacity,
    zIndex,
    beforeClose,
    onOpenChange,
    onClose,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const controlledOpen = open ?? modelValue ?? visible
  const [isOpen, setIsOpen] = useControllableState({
    value: controlledOpen,
    defaultValue: defaultOpen,
    onChange: (next) => {
      onOpenChange?.(next)
      if (!next)
        onClose?.()
    },
  })

  const [mounted, setMounted] = useState(false)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const closingRef = useRef(false)
  const titleId = useId()
  const allocatedZRef = useRef<number>(zIndex ?? allocateZIndex())

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen)
      allocatedZRef.current = zIndex ?? allocateZIndex()
  }, [isOpen, zIndex])

  useFocusReturn(mounted && isOpen, overlayRef)

  const requestClose = useCallback(async (reason: TxModalCloseReason) => {
    if (!isOpen || closingRef.current)
      return
    if (beforeClose) {
      closingRef.current = true
      try {
        const result = await beforeClose(reason)
        if (result === false)
          return
      }
      finally {
        closingRef.current = false
      }
    }
    setIsOpen(false)
  }, [beforeClose, isOpen, setIsOpen])

  useEffect(() => {
    if (!isOpen || !closeOnPressEscape || !hasDocument())
      return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape')
        return
      event.preventDefault()
      void requestClose('escape')
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, closeOnPressEscape, requestClose])

  if (!mounted || !isOpen || !hasDocument())
    return null

  const hasHeader = Boolean(header || title || showClose)

  const handleOverlayKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab')
      trapFocusInContainer(event.nativeEvent, overlayRef.current)
  }

  const contentStyle: CSSProperties = {
    ...(fullscreen ? {} : { width }),
    ...(surfaceColor ? { '--tx-modal-surface-color': surfaceColor } as CSSProperties : {}),
    ...(typeof surfaceOpacity === 'number' ? { '--tx-modal-surface-opacity': String(surfaceOpacity) } as CSSProperties : {}),
  }

  return createPortal(
    <div
      ref={mergeRefs(ref, overlayRef)}
      className={cn(
        'tx-modal__overlay',
        `tx-modal__overlay--surface-${surface}`,
        { 'tx-modal__overlay--fullscreen': fullscreen },
        className,
      )}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      aria-labelledby={title || header ? titleId : undefined}
      style={{ zIndex: allocatedZRef.current, ...style } as CSSProperties}
      onClick={(event) => {
        if (event.target === event.currentTarget && closeOnClickMask)
          void requestClose('mask')
      }}
      onKeyDown={handleOverlayKeyDown}
      {...rest}
    >
      <div
        className={cn('tx-modal__content', { 'tx-modal__content--fullscreen': fullscreen })}
        style={contentStyle}
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
                onClick={() => void requestClose('close')}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </header>
        )}

        <section className="tx-modal__body">{children}</section>

        {footer !== undefined && footer !== null && (
          <footer className="tx-modal__footer">{footer}</footer>
        )}
      </div>
    </div>,
    document.body,
  )
})
TxModal.displayName = 'TxModal'

// ============================================================================
// 33. toast (TxToast, TxToastHost, txToast)
// ============================================================================

export type TxToastVariant = 'default' | 'info' | 'success' | 'warning' | 'danger'
export type TxToastPosition
  = | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right'

export interface TxToastAction {
  label: string
  onClick?: (id: string) => void
  dismiss?: boolean
}

export interface TxToastItem {
  id: string
  title?: string
  description?: string
  variant: TxToastVariant
  duration: number
  action?: TxToastAction
  createdAt: number
}

export interface TxToastOptions {
  id?: string
  title?: string
  description?: string
  variant?: TxToastVariant
  duration?: number
  action?: TxToastAction
}

const DEFAULT_TOAST_DURATION = 2600

interface DismissTimer {
  handle: ReturnType<typeof globalThis.setTimeout> | null
  remaining: number
  dueAt: number
}

let toastItemsSnapshot: readonly TxToastItem[] = []
let toastPaused = false
const toastTimers = new Map<string, DismissTimer>()
const toastListeners = new Set<() => void>()
const hostClaims: symbol[] = []

function emitToastStore() {
  for (const listener of toastListeners)
    listener()
}

function subscribeToastStore(listener: () => void): () => void {
  toastListeners.add(listener)
  return () => toastListeners.delete(listener)
}

function getToastSnapshot(): readonly TxToastItem[] {
  return toastItemsSnapshot
}

const EMPTY_TOASTS: readonly TxToastItem[] = []

function getServerToastSnapshot(): readonly TxToastItem[] {
  return EMPTY_TOASTS
}

function startToastTimer(id: string, timer: DismissTimer) {
  timer.dueAt = Date.now() + timer.remaining
  timer.handle = globalThis.setTimeout(() => {
    dismissToast(id)
  }, timer.remaining)
}

function stopToastTimer(timer: DismissTimer) {
  if (timer.handle !== null) {
    globalThis.clearTimeout(timer.handle)
    timer.handle = null
  }
}

function clearToastTimer(id: string) {
  const timer = toastTimers.get(id)
  if (timer) {
    stopToastTimer(timer)
    toastTimers.delete(id)
  }
}

export function dismissToast(id: string): void {
  clearToastTimer(id)
  if (!toastItemsSnapshot.some(t => t.id === id))
    return
  toastItemsSnapshot = toastItemsSnapshot.filter(t => t.id !== id)
  emitToastStore()
}

export function clearToasts(): void {
  toastTimers.forEach(stopToastTimer)
  toastTimers.clear()
  toastPaused = false
  if (toastItemsSnapshot.length === 0)
    return
  toastItemsSnapshot = []
  emitToastStore()
}

export function pauseToasts(): void {
  if (toastPaused)
    return
  toastPaused = true
  const now = Date.now()
  toastTimers.forEach((timer) => {
    if (timer.handle === null)
      return
    timer.remaining = Math.max(0, timer.dueAt - now)
    stopToastTimer(timer)
  })
}

export function resumeToasts(): void {
  if (!toastPaused)
    return
  toastPaused = false
  toastTimers.forEach((timer, id) => {
    if (timer.handle !== null)
      return
    startToastTimer(id, timer)
  })
}

function pushToast(input: TxToastOptions | string): string {
  const options: TxToastOptions = typeof input === 'string' ? { title: input } : input
  const id = options.id ?? `tx-toast-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const duration = options.duration ?? DEFAULT_TOAST_DURATION

  clearToastTimer(id)
  const filtered = toastItemsSnapshot.filter(t => t.id !== id)
  const item: TxToastItem = {
    id,
    title: options.title,
    description: options.description,
    variant: options.variant ?? 'default',
    duration,
    action: options.action,
    createdAt: Date.now(),
  }
  toastItemsSnapshot = [...filtered, item]

  if (duration > 0) {
    const timer: DismissTimer = { handle: null, remaining: duration, dueAt: 0 }
    toastTimers.set(id, timer)
    if (!toastPaused)
      startToastTimer(id, timer)
  }

  emitToastStore()
  return id
}

function createVariantToast(variant: TxToastVariant) {
  return (input: Omit<TxToastOptions, 'variant'> | string): string => {
    const opts = typeof input === 'string' ? { title: input } : input
    return pushToast({ ...opts, variant })
  }
}

export interface TxToastHelper {
  (input: TxToastOptions | string): string
  info: (input: Omit<TxToastOptions, 'variant'> | string) => string
  success: (input: Omit<TxToastOptions, 'variant'> | string) => string
  warning: (input: Omit<TxToastOptions, 'variant'> | string) => string
  danger: (input: Omit<TxToastOptions, 'variant'> | string) => string
  error: (input: Omit<TxToastOptions, 'variant'> | string) => string
  dismiss: (id: string) => void
  clear: () => void
  pause: () => void
  resume: () => void
  getItems: () => readonly TxToastItem[]
}

export const txToast: TxToastHelper = Object.assign(pushToast, {
  info: createVariantToast('info'),
  success: createVariantToast('success'),
  warning: createVariantToast('warning'),
  danger: createVariantToast('danger'),
  error: createVariantToast('danger'),
  dismiss: dismissToast,
  clear: clearToasts,
  pause: pauseToasts,
  resume: resumeToasts,
  getItems: getToastSnapshot,
})

const TOAST_GLYPHS: Record<TxToastVariant, string> = {
  default: '',
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  danger: 'x-circle',
}

export interface TxToastHostProps extends HTMLAttributes<HTMLDivElement> {
  position?: TxToastPosition
  visibleToasts?: number
  expand?: boolean
  gap?: number
  offset?: number
  ariaLabel?: string
  closeLabel?: string
}

export const TxToastHost = forwardRef<HTMLDivElement, TxToastHostProps>((
  {
    position = 'bottom-right',
    visibleToasts = 3,
    expand = false,
    gap = 14,
    offset = 16,
    ariaLabel = 'Notifications',
    closeLabel = 'Dismiss notification',
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [mounted, setMounted] = useState(false)
  const tokenRef = useRef<symbol | null>(null)
  if (!tokenRef.current)
    tokenRef.current = Symbol('tx-toast-host')
  const items = useSyncExternalStore(subscribeToastStore, getToastSnapshot, getServerToastSnapshot)
  const zIndexRef = useRef<number>(allocateZIndex())

  useEffect(() => {
    setMounted(true)
    const token = tokenRef.current!
    if (!hostClaims.includes(token))
      hostClaims.push(token)
    return () => {
      const idx = hostClaims.indexOf(token)
      if (idx !== -1)
        hostClaims.splice(idx, 1)
      resumeToasts()
    }
  }, [])

  if (!mounted || !hasDocument())
    return null

  const owns = hostClaims.length === 0 || hostClaims[0] === tokenRef.current
  const activeItems = owns ? items : EMPTY_TOASTS
  const isTop = position.startsWith('top')

  return createPortal(
    <div
      ref={ref}
      className={cn('tx-toast-host', className)}
      role="region"
      aria-label={ariaLabel}
      aria-live="polite"
      aria-atomic="false"
      data-position={position}
      data-expanded={expand ? 'true' : 'false'}
      style={{
        'zIndex': zIndexRef.current,
        '--tx-toast-gap': `${gap}px`,
        '--tx-toast-edge': `${offset}px`,
        '--tx-toast-shift': isTop ? '-100%' : '100%',
        ...style,
      } as CSSProperties}
      onMouseEnter={() => pauseToasts()}
      onMouseLeave={() => resumeToasts()}
      {...rest}
    >
      {activeItems.map((item, idx) => {
        const depth = activeItems.length - 1 - idx
        const isVisible = depth < visibleToasts
        const glyph = TOAST_GLYPHS[item.variant]
        return (
          <div
            key={item.id}
            className={cn('tx-toast', `tx-toast--${item.variant}`)}
            data-front={depth === 0 ? 'true' : 'false'}
            data-visible={isVisible ? 'true' : 'false'}
            role={item.variant === 'danger' ? 'alert' : 'status'}
            style={{
              'zIndex': activeItems.length - depth,
              '--tx-toast-y': `${(isTop ? 1 : -1) * depth * gap}px`,
              '--tx-toast-scale': expand ? 1 : Math.max(0, 1 - depth * 0.05),
            } as CSSProperties}
          >
            <div className="tx-toast__inner">
              {glyph && (
                <span className="tx-toast__icon">
                  <TxIcon name={glyph} />
                </span>
              )}
              <div className="tx-toast__content">
                {item.title && <div className="tx-toast__title">{item.title}</div>}
                {item.description && <div className="tx-toast__desc">{item.description}</div>}
              </div>
              {item.action && (
                <button
                  type="button"
                  className="tx-toast__action"
                  onClick={() => {
                    item.action?.onClick?.(item.id)
                    if (item.action?.dismiss !== false)
                      dismissToast(item.id)
                  }}
                >
                  {item.action.label}
                </button>
              )}
              <button
                type="button"
                className="tx-toast__close"
                aria-label={closeLabel}
                onClick={() => dismissToast(item.id)}
              >
                <TxIcon name="close" />
              </button>
            </div>
          </div>
        )
      })}
    </div>,
    document.body,
  )
})
TxToastHost.displayName = 'TxToastHost'

export interface TxToastProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Render the global portal host bound to `txToast(...)`. */
  host?: boolean
  position?: TxToastPosition
  visibleToasts?: number
  expand?: boolean
  gap?: number
  offset?: number
  ariaLabel?: string
  /** Standalone declarative toast props. */
  open?: boolean
  defaultOpen?: boolean
  title?: ReactNode
  description?: ReactNode
  variant?: TxToastVariant
  closable?: boolean
  closeLabel?: string
  duration?: number
  action?: TxToastAction
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
}

export const TxToast = forwardRef<HTMLDivElement, TxToastProps>((
  {
    host = false,
    position,
    visibleToasts,
    expand,
    gap,
    offset,
    ariaLabel,
    open,
    defaultOpen = true,
    title,
    description,
    variant = 'default',
    closable = true,
    closeLabel = 'Dismiss notification',
    duration = 0,
    action,
    onOpenChange,
    onClose,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const [isOpen, setIsOpen] = useControllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: (next) => {
      onOpenChange?.(next)
      if (!next)
        onClose?.()
    },
  })

  useEffect(() => {
    if (host || !isOpen || duration <= 0)
      return
    const timer = globalThis.setTimeout(() => {
      setIsOpen(false)
    }, duration)
    return () => globalThis.clearTimeout(timer)
  }, [host, isOpen, duration, setIsOpen])

  if (host) {
    return (
      <TxToastHost
        ref={ref}
        position={position}
        visibleToasts={visibleToasts}
        expand={expand}
        gap={gap}
        offset={offset}
        ariaLabel={ariaLabel}
        closeLabel={closeLabel}
        className={className}
        {...rest}
      />
    )
  }

  if (!isOpen)
    return null

  const glyph = TOAST_GLYPHS[variant]

  return (
    <div
      ref={ref}
      className={cn('tx-toast tx-toast--inline', `tx-toast--${variant}`, className)}
      role={variant === 'danger' ? 'alert' : 'status'}
      aria-live={variant === 'danger' ? 'assertive' : 'polite'}
      {...rest}
    >
      <div className="tx-toast__inner">
        {glyph && (
          <span className="tx-toast__icon">
            <TxIcon name={glyph} />
          </span>
        )}
        <div className="tx-toast__content">
          {title !== undefined && title !== null && title !== '' && (
            <div className="tx-toast__title">{title}</div>
          )}
          {(description !== undefined && description !== null && description !== '') && (
            <div className="tx-toast__desc">{description}</div>
          )}
          {children}
        </div>
        {action && (
          <button
            type="button"
            className="tx-toast__action"
            onClick={() => {
              action.onClick?.('inline')
              if (action.dismiss !== false)
                setIsOpen(false)
            }}
          >
            {action.label}
          </button>
        )}
        {closable && (
          <button
            type="button"
            className="tx-toast__close"
            aria-label={closeLabel}
            onClick={() => setIsOpen(false)}
          >
            <TxIcon name="close" />
          </button>
        )}
      </div>
    </div>
  )
})
TxToast.displayName = 'TxToast'

// ============================================================================
// 34. toast-panel (TxToastPanel)
// ============================================================================

export type TxToastPanelSide = 'below' | 'above'

export interface TxToastPanelProps extends HTMLAttributes<HTMLDivElement> {
  open?: boolean
  tether?: boolean
  tetherLength?: number
  tetherSlot?: ReactNode
  side?: TxToastPanelSide
  stack?: number
  ariaLabel?: string
  live?: 'polite' | 'off'
}

function focusableAncestor(root: HTMLElement): HTMLElement | null {
  for (let el = root.parentElement; el && el !== document.body; el = el.parentElement) {
    if (el.hasAttribute('tabindex') && !el.closest('[inert]'))
      return el
  }
  return null
}

function moveFocusTo(root: HTMLElement, target: HTMLElement | null): boolean {
  if (!target?.isConnected || root.contains(target) || target.closest('[inert]'))
    return false
  target.focus({ preventScroll: true })
  return document.activeElement === target
}

export const TxToastPanel = forwardRef<HTMLDivElement, TxToastPanelProps>((
  {
    open = true,
    tether = true,
    tetherLength = 28,
    tetherSlot,
    side = 'below',
    stack = 1,
    ariaLabel = 'Latest item',
    live = 'polite',
    className,
    style,
    children,
    onFocus,
    ...rest
  },
  ref,
) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const focusOriginRef = useRef<HTMLElement | null>(null)
  const prevOpenRef = useRef(open)

  const requestedStack = Math.trunc(stack)
  const stackLayers = Math.max(0, Math.min(2, Number.isFinite(requestedStack) ? requestedStack : 0))

  const releaseFocus = useCallback(() => {
    const root = rootRef.current
    if (!root || !hasDocument() || !root.contains(document.activeElement))
      return
    if (!moveFocusTo(root, focusOriginRef.current))
      moveFocusTo(root, focusableAncestor(root))
  }, [])

  useEffect(() => {
    if (prevOpenRef.current && !open)
      releaseFocus()
    prevOpenRef.current = open
  }, [open, releaseFocus])

  useEffect(() => releaseFocus, [releaseFocus])

  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    onFocus?.(event)
    const from = event.relatedTarget
    if (from instanceof Node && rootRef.current?.contains(from))
      return
    focusOriginRef.current = from instanceof HTMLElement ? from : null
  }

  return (
    <div
      ref={mergeRefs(ref, rootRef)}
      className={cn('tx-toast-panel', `is-${side}`, { 'is-open': open }, className)}
      style={{ '--tx-toast-panel-tether': `${Math.max(0, tetherLength)}px`, ...style } as CSSProperties}
      role="status"
      aria-live={live === 'off' ? undefined : 'polite'}
      aria-label={ariaLabel}
      onFocus={handleFocus}
      {...rest}
    >
      {tetherSlot ?? (tether && <span className="tx-toast-panel__tether" aria-hidden="true" />)}

      <div className="tx-toast-panel__deck">
        {Array.from({ length: stackLayers }, (_, idx) => {
          const depth = idx + 1
          return (
            <span
              key={depth}
              className="tx-toast-panel__layer"
              style={{ '--tx-toast-panel-depth': depth } as CSSProperties}
              aria-hidden="true"
            />
          )
        })}
        <div className="tx-toast-panel__card" inert={!open || undefined}>
          {children}
        </div>
      </div>
    </div>
  )
})
TxToastPanel.displayName = 'TxToastPanel'

// ============================================================================
// 35. timeline (TxTimeline, TxTimelineItem)
// ============================================================================

export type TxTimelineLayout = 'vertical' | 'horizontal'
export type TxTimelineItemColor = 'default' | 'primary' | 'success' | 'warning' | 'error'

interface TimelineContextValue {
  layout: TxTimelineLayout
}

const TimelineContext = createContext<TimelineContextValue>({ layout: 'vertical' })

export interface TxTimelineProps extends HTMLAttributes<HTMLDivElement> {
  layout?: TxTimelineLayout
}

export const TxTimeline = forwardRef<HTMLDivElement, TxTimelineProps>((
  { layout = 'vertical', className, children, ...rest },
  ref,
) => {
  const ctxValue = useMemo<TimelineContextValue>(() => ({ layout }), [layout])
  return (
    <TimelineContext.Provider value={ctxValue}>
      <div
        ref={ref}
        className={cn('tx-timeline', `tx-timeline--${layout}`, className)}
        role="list"
        {...rest}
      >
        {children}
      </div>
    </TimelineContext.Provider>
  )
})
TxTimeline.displayName = 'TxTimeline'

export interface TxTimelineItemProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  time?: ReactNode
  icon?: string
  color?: TxTimelineItemColor
  active?: boolean
}

export const TxTimelineItem = forwardRef<HTMLDivElement, TxTimelineItemProps>((
  {
    title,
    time,
    icon,
    color = 'default',
    active = false,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const { layout } = useContext(TimelineContext)
  return (
    <div
      ref={ref}
      className={cn(
        'tx-timeline-item',
        `tx-timeline-item--${layout}`,
        { 'tx-timeline-item--active': active },
        className,
      )}
      role="listitem"
      {...rest}
    >
      <div
        className={cn(
          'tx-timeline-item__dot',
          `tx-timeline-item__dot--${color}`,
          { 'tx-timeline-item__dot--active': active },
        )}
        aria-hidden="true"
      >
        {icon && <TxIcon name={icon} className="tx-timeline-item__icon" />}
      </div>

      <div className="tx-timeline-item__content">
        {(title || time) && (
          <div className="tx-timeline-item__header">
            {title && <div className="tx-timeline-item__title">{title}</div>}
            {time && <div className="tx-timeline-item__time">{time}</div>}
          </div>
        )}
        {children !== undefined && children !== null && (
          <div className="tx-timeline-item__description">{children}</div>
        )}
      </div>
    </div>
  )
})
TxTimelineItem.displayName = 'TxTimelineItem'
