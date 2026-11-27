import type {
  ButtonHTMLAttributes,
  CSSProperties,
  FormEvent,
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from 'react'
import type { FloatingPlacement } from '../../hooks/useFloating'
import { hasDocument, hasWindow } from '@talex-touch/tuffex-core'
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
} from 'react'
import { createPortal } from 'react-dom'
import { useControllableState } from '../../hooks/useControllableState'
import { allocateZIndex, useDismissableLayer } from '../../hooks/useDismissableLayer'
import { useFloatingPosition } from '../../hooks/useFloating'
import { cn, mergeRefs, toCssUnit } from '../../utils/cn'
import { BuiltinIcon } from '../../utils/icons'
import { TxSpinner } from '../TxSpinner'

function handleMenuKeyboardNavigation(event: KeyboardEvent<HTMLElement>, menuEl: HTMLElement | null): void {
  if (!menuEl)
    return
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
    return
  const items = Array.from(
    menuEl.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled]):not([aria-disabled="true"]), [role="menuitemcheckbox"]:not([disabled]), [role="menuitemradio"]:not([disabled])'),
  )
  if (items.length === 0)
    return
  event.preventDefault()
  const idx = items.findIndex(el => el === document.activeElement)
  if (event.key === 'Home') {
    items[0]?.focus()
  }
  else if (event.key === 'End') {
    items[items.length - 1]?.focus()
  }
  else if (event.key === 'ArrowDown') {
    items[idx < 0 ? 0 : (idx + 1) % items.length]?.focus()
  }
  else {
    items[idx < 0 ? items.length - 1 : (idx - 1 + items.length) % items.length]?.focus()
  }
}

// ============================================================================
// 21. TxContextMenu + TxContextMenuItem + TxContextMenuDivider (context-menu)
// ============================================================================

export type TxContextMenuTrigger = 'contextmenu' | 'click' | 'both' | 'manual'

interface ContextMenuContextValue {
  close: () => void
  closeOnSelect: boolean
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null)

export interface TxContextMenuProps extends Omit<HTMLAttributes<HTMLDivElement>, 'content'> {
  open?: boolean
  defaultOpen?: boolean
  x?: number
  y?: number
  width?: number
  minWidth?: number
  maxWidth?: number
  maxHeight?: number
  disabled?: boolean
  trigger?: TxContextMenuTrigger
  preventDefault?: boolean
  closeOnEsc?: boolean
  closeOnClickOutside?: boolean
  closeOnSelect?: boolean
  /** Menu items rendered inside the floating context menu panel. */
  menu?: ReactNode
  /** Alias for `menu` when `children` is the trigger target. */
  items?: ReactNode
  onOpenChange?: (open: boolean) => void
}

export const TxContextMenu = forwardRef<HTMLDivElement, TxContextMenuProps>((
  {
    open,
    defaultOpen = false,
    x,
    y,
    width,
    minWidth = 180,
    maxWidth = 320,
    maxHeight = 360,
    disabled = false,
    trigger = 'contextmenu',
    preventDefault = true,
    closeOnEsc = true,
    closeOnClickOutside = true,
    closeOnSelect = true,
    menu,
    items,
    onOpenChange,
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
    onChange: onOpenChange,
  })
  const [point, setPoint] = useState<{ x: number, y: number }>({ x: x ?? 0, y: y ?? 0 })
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const zIndexRef = useRef(allocateZIndex())

  const openAt = useCallback((clientX: number, clientY: number) => {
    if (disabled)
      return
    const vw = hasWindow() ? window.innerWidth : 1024
    const vh = hasWindow() ? window.innerHeight : 768
    const clampedX = Math.max(8, Math.min(clientX, vw - minWidth - 8))
    const clampedY = Math.max(8, Math.min(clientY, vh - 48))
    setPoint({ x: clampedX, y: clampedY })
    zIndexRef.current = allocateZIndex()
    setIsOpen(true)
  }, [disabled, minWidth, setIsOpen])

  const close = useCallback(() => setIsOpen(false), [setIsOpen])

  useDismissableLayer({
    open: isOpen,
    onDismiss: close,
    closeOnEscape: closeOnEsc,
    closeOnOutsideClick: closeOnClickOutside,
    containerRefs: [panelRef],
  })

  const ctx = useMemo<ContextMenuContextValue>(() => ({ close, closeOnSelect }), [close, closeOnSelect])
  const menuContent = menu ?? items

  const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled || (trigger !== 'contextmenu' && trigger !== 'both'))
      return
    if (preventDefault)
      event.preventDefault()
    openAt(event.clientX, event.clientY)
  }

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (disabled || (trigger !== 'click' && trigger !== 'both'))
      return
    openAt(event.clientX, event.clientY)
  }

  const resolvedX = x !== undefined ? x : point.x
  const resolvedY = y !== undefined ? y : point.y

  return (
    <ContextMenuContext.Provider value={ctx}>
      <div
        ref={mergeRefs(ref, triggerRef)}
        className={cn('tx-context-menu__trigger', { 'is-disabled': disabled }, className)}
        style={style}
        onContextMenu={handleContextMenu}
        onClick={handleClick}
        {...rest}
      >
        {children}
      </div>

      {isOpen && hasDocument() && createPortal(
        <div
          ref={panelRef}
          role="menu"
          className="tx-floating-panel tx-context-menu tx-context-menu-layer"
          style={{
            position: 'fixed',
            left: `${resolvedX}px`,
            top: `${resolvedY}px`,
            zIndex: zIndexRef.current,
            width: width ? `${width}px` : undefined,
            minWidth: `${minWidth}px`,
            maxWidth: `${maxWidth}px`,
            maxHeight: `${maxHeight}px`,
          } as CSSProperties}
          onKeyDown={e => handleMenuKeyboardNavigation(e, panelRef.current)}
        >
          {menuContent}
        </div>,
        document.body,
      )}
    </ContextMenuContext.Provider>
  )
})
TxContextMenu.displayName = 'TxContextMenu'

export interface TxContextMenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  disabled?: boolean
  danger?: boolean
  color?: string
  shortcut?: string
  icon?: ReactNode
  submenu?: boolean
  closeOnSelect?: boolean
  onSelect?: () => void
}

export const TxContextMenuItem = forwardRef<HTMLButtonElement, TxContextMenuItemProps>((
  {
    disabled = false,
    danger = false,
    color,
    shortcut,
    icon,
    submenu = false,
    closeOnSelect,
    onSelect,
    onClick,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const ctx = useContext(ContextMenuContext)
  const shouldClose = closeOnSelect ?? ctx?.closeOnSelect ?? true

  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        'tx-context-menu-item',
        { 'is-danger': danger, 'is-disabled': disabled },
        className,
      )}
      style={{
        ...(color ? { '--tx-context-menu-item-color': color } : {}),
        ...style,
      } as CSSProperties}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || disabled)
          return
        onSelect?.()
        if (shouldClose)
          ctx?.close()
      }}
      {...rest}
    >
      {icon && <span className="tx-context-menu-item__icon" aria-hidden="true">{icon}</span>}
      <span className="tx-context-menu-item__label">{children}</span>
      {shortcut && <span className="tx-context-menu-item__shortcut">{shortcut}</span>}
      {submenu && <span className="tx-context-menu-item__arrow" aria-hidden="true">›</span>}
    </button>
  )
})
TxContextMenuItem.displayName = 'TxContextMenuItem'

export interface TxContextMenuDividerProps extends HTMLAttributes<HTMLDivElement> {
  dashed?: boolean
  inset?: boolean
}

export const TxContextMenuDivider = forwardRef<HTMLDivElement, TxContextMenuDividerProps>((
  { dashed = false, inset = false, className, ...rest },
  ref,
) => (
  <div
    ref={ref}
    role="separator"
    className={cn('tx-context-menu-divider', { 'is-dashed': dashed, 'is-inset': inset }, className)}
    {...rest}
  />
))
TxContextMenuDivider.displayName = 'TxContextMenuDivider'

// ============================================================================
// 22. TxDropdownMenu + TxDropdownItem (dropdown-menu)
// ============================================================================

export type TxDropdownPlacement = FloatingPlacement

interface DropdownMenuContextValue {
  close: () => void
  closeOnSelect: boolean
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null)

export interface TxDropdownMenuProps extends Omit<HTMLAttributes<HTMLDivElement>, 'content'> {
  open?: boolean
  defaultOpen?: boolean
  placement?: TxDropdownPlacement
  trigger?: 'click' | 'hover'
  offset?: number
  closeOnSelect?: boolean
  minWidth?: number
  maxHeight?: number
  disabled?: boolean
  /** Trigger node when `children` holds `<TxDropdownItem>` entries. */
  reference?: ReactNode
  /** Label for an automatic trigger button when neither `reference` nor `content` is given. */
  label?: ReactNode
  /** Menu items when `children` is the trigger element. */
  content?: ReactNode
  onOpenChange?: (open: boolean) => void
}

export const TxDropdownMenu = forwardRef<HTMLDivElement, TxDropdownMenuProps>((
  {
    open,
    defaultOpen = false,
    placement = 'bottom-start',
    trigger = 'click',
    offset = 6,
    closeOnSelect = true,
    minWidth = 180,
    maxHeight = 320,
    disabled = false,
    reference,
    label,
    content,
    onOpenChange,
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
    onChange: onOpenChange,
  })
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const zIndexRef = useRef(allocateZIndex())
  const menuId = useId()

  const close = useCallback(() => setIsOpen(false), [setIsOpen])

  useDismissableLayer({
    open: isOpen,
    onDismiss: close,
    closeOnEscape: true,
    closeOnOutsideClick: trigger !== 'hover',
    containerRefs: [triggerRef, panelRef],
  })

  const floating = useFloatingPosition(triggerRef, panelRef, {
    open: isOpen,
    placement,
    offset,
  })

  const ctx = useMemo<DropdownMenuContextValue>(() => ({ close, closeOnSelect }), [close, closeOnSelect])

  const triggerNode = reference !== undefined
    ? reference
    : content !== undefined
      ? children
      : (
          <button type="button" className="tx-dropdown__trigger-btn" disabled={disabled}>
            <span>{label ?? 'Menu'}</span>
            <BuiltinIcon name="chevron-down" size={14} />
          </button>
        )

  const menuBody = content !== undefined ? content : children

  return (
    <DropdownMenuContext.Provider value={ctx}>
      <div
        ref={mergeRefs(ref, triggerRef)}
        className={cn('tx-dropdown', { 'is-open': isOpen, 'is-disabled': disabled }, className)}
        style={style}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => {
          if (trigger === 'click' && !disabled) {
            if (!isOpen)
              zIndexRef.current = allocateZIndex()
            setIsOpen(!isOpen)
          }
        }}
        onMouseEnter={() => {
          if (trigger === 'hover' && !disabled) {
            zIndexRef.current = allocateZIndex()
            setIsOpen(true)
          }
        }}
        onMouseLeave={() => {
          if (trigger === 'hover')
            setIsOpen(false)
        }}
        {...rest}
      >
        {triggerNode}
      </div>

      {isOpen && hasDocument() && createPortal(
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          className="tx-floating-panel tx-dropdown__panel"
          style={{
            position: floating.strategy,
            left: `${floating.x}px`,
            top: `${floating.y}px`,
            zIndex: zIndexRef.current,
            minWidth: `${minWidth}px`,
            maxHeight: `${maxHeight}px`,
          } as CSSProperties}
          onMouseEnter={() => {
            if (trigger === 'hover' && !disabled)
              setIsOpen(true)
          }}
          onMouseLeave={() => {
            if (trigger === 'hover')
              setIsOpen(false)
          }}
          onKeyDown={e => handleMenuKeyboardNavigation(e, panelRef.current)}
        >
          {menuBody}
        </div>,
        document.body,
      )}
    </DropdownMenuContext.Provider>
  )
})
TxDropdownMenu.displayName = 'TxDropdownMenu'

export interface TxDropdownItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  disabled?: boolean
  danger?: boolean
  arrow?: boolean
  closeOnSelect?: boolean
  checked?: boolean
  checkType?: 'checkbox' | 'radio'
  icon?: ReactNode
  shortcut?: string
  onSelect?: () => void
}

export const TxDropdownItem = forwardRef<HTMLButtonElement, TxDropdownItemProps>((
  {
    disabled = false,
    danger = false,
    arrow = false,
    closeOnSelect,
    checked,
    checkType = 'checkbox',
    icon,
    shortcut,
    onSelect,
    onClick,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const ctx = useContext(DropdownMenuContext)
  const shouldClose = closeOnSelect ?? ctx?.closeOnSelect ?? true
  const isCheckable = checked !== undefined
  const role = isCheckable ? (checkType === 'radio' ? 'menuitemradio' : 'menuitemcheckbox') : 'menuitem'

  return (
    <button
      ref={ref}
      type="button"
      role={role}
      aria-checked={isCheckable ? checked : undefined}
      disabled={disabled}
      className={cn(
        'tx-dropdown-item',
        { 'is-danger': danger, 'is-disabled': disabled, 'is-checked': Boolean(checked) },
        className,
      )}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || disabled)
          return
        onSelect?.()
        if (shouldClose)
          ctx?.close()
      }}
      {...rest}
    >
      {icon && <span className="tx-dropdown-item__icon" aria-hidden="true">{icon}</span>}
      <span className="tx-dropdown-item__label">{children}</span>
      {shortcut && <span className="tx-dropdown-item__shortcut">{shortcut}</span>}
      {isCheckable && checked && (
        <BuiltinIcon name="check" size={14} className="tx-dropdown-item__check" />
      )}
      {arrow && <span className="tx-dropdown-item__arrow" aria-hidden="true">›</span>}
    </button>
  )
})
TxDropdownItem.displayName = 'TxDropdownItem'

// ============================================================================
// 23. TxFlatDropdown (flat-dropdown)
// ============================================================================

export type TxFlatDropdownTrigger = 'hover' | 'click' | 'manual'

export interface TxFlatDropdownTriggerRenderProps {
  open: boolean
  toggle: () => void
  show: () => void
  hide: () => void
}

export interface TxFlatDropdownContentRenderProps {
  open: boolean
  close: () => void
  side: 'top' | 'bottom' | 'left' | 'right'
}

export interface TxFlatDropdownProps extends Omit<HTMLAttributes<HTMLDivElement>, 'content'> {
  open?: boolean
  defaultOpen?: boolean
  trigger?: TxFlatDropdownTrigger
  placement?: FloatingPlacement
  offset?: number
  openDelay?: number
  closeDelay?: number
  disabled?: boolean
  teleport?: boolean
  matchTriggerWidth?: boolean
  width?: number | string
  closeOnClickOutside?: boolean
  closeOnEsc?: boolean
  closeOnContentClick?: boolean
  panelClass?: string
  reference?: ReactNode | ((props: TxFlatDropdownTriggerRenderProps) => ReactNode)
  content?: ReactNode | ((props: TxFlatDropdownContentRenderProps) => ReactNode)
  onOpenChange?: (open: boolean) => void
}

export const TxFlatDropdown = forwardRef<HTMLDivElement, TxFlatDropdownProps>((
  {
    open,
    defaultOpen = false,
    trigger = 'hover',
    placement = 'bottom-start',
    offset = 10,
    openDelay = 0,
    closeDelay = 120,
    disabled = false,
    teleport = true,
    matchTriggerWidth = false,
    width,
    closeOnClickOutside = true,
    closeOnEsc = true,
    closeOnContentClick = false,
    panelClass,
    reference,
    content,
    onOpenChange,
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
    onChange: onOpenChange,
  })
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const zIndexRef = useRef(allocateZIndex())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  const show = useCallback(() => {
    if (disabled)
      return
    clearTimer()
    if (openDelay > 0 && trigger === 'hover') {
      timerRef.current = setTimeout(() => {
        zIndexRef.current = allocateZIndex()
        setIsOpen(true)
      }, openDelay)
    }
    else {
      zIndexRef.current = allocateZIndex()
      setIsOpen(true)
    }
  }, [clearTimer, disabled, openDelay, setIsOpen, trigger])

  const hide = useCallback(() => {
    clearTimer()
    if (closeDelay > 0 && trigger === 'hover') {
      timerRef.current = setTimeout(() => setIsOpen(false), closeDelay)
    }
    else {
      setIsOpen(false)
    }
  }, [clearTimer, closeDelay, setIsOpen, trigger])

  const toggle = useCallback(() => {
    if (disabled)
      return
    clearTimer()
    if (!isOpen)
      zIndexRef.current = allocateZIndex()
    setIsOpen(!isOpen)
  }, [clearTimer, disabled, isOpen, setIsOpen])

  useDismissableLayer({
    open: isOpen,
    onDismiss: () => setIsOpen(false),
    closeOnEscape: closeOnEsc,
    closeOnOutsideClick: closeOnClickOutside,
    containerRefs: [triggerRef, panelRef],
  })

  const floating = useFloatingPosition(triggerRef, panelRef, {
    open: isOpen,
    placement,
    offset,
    matchReferenceWidth: matchTriggerWidth && width === undefined,
  })

  const resolvedTrigger = typeof reference === 'function'
    ? reference({ open: isOpen, toggle, show, hide })
    : reference !== undefined
      ? reference
      : children

  const resolvedContent = typeof content === 'function'
    ? content({ open: isOpen, close: () => setIsOpen(false), side: floating.side })
    : content

  const panelNode = isOpen
    ? (
        <div
          ref={panelRef}
          className={cn('tx-floating-panel tx-flat-dropdown__panel', panelClass)}
          data-side={floating.side}
          style={{
            position: teleport ? floating.strategy : 'absolute',
            left: teleport ? `${floating.x}px` : 0,
            top: teleport ? `${floating.y}px` : '100%',
            zIndex: zIndexRef.current,
            width: width !== undefined ? toCssUnit(width) : undefined,
          } as CSSProperties}
          onMouseEnter={() => {
            if (trigger === 'hover')
              clearTimer()
          }}
          onMouseLeave={() => {
            if (trigger === 'hover')
              hide()
          }}
          onClick={() => {
            if (closeOnContentClick)
              setIsOpen(false)
          }}
        >
          {resolvedContent}
        </div>
      )
    : null

  return (
    <div
      ref={mergeRefs(ref, triggerRef)}
      className={cn('tx-flat-dropdown', { 'is-open': isOpen, 'is-disabled': disabled }, className)}
      style={style}
      onClick={() => {
        if (trigger === 'click')
          toggle()
      }}
      onMouseEnter={() => {
        if (trigger === 'hover')
          show()
      }}
      onMouseLeave={() => {
        if (trigger === 'hover')
          hide()
      }}
      {...rest}
    >
      {resolvedTrigger}
      {teleport && hasDocument() ? (panelNode ? createPortal(panelNode, document.body) : null) : panelNode}
    </div>
  )
})
TxFlatDropdown.displayName = 'TxFlatDropdown'

// ============================================================================
// 24. TxSelectionActions (selection-actions)
// ============================================================================

export interface TxSelectionPayload {
  text: string
  rects: Array<{ left: number, top: number, right: number, bottom: number, width: number, height: number }>
  range?: Range
}

export type TxSelectionActionState = 'idle' | 'thinking' | 'streaming' | 'result'

export interface TxSelectionActionItem {
  id: string
  label: string
  more?: boolean
  busyLabel?: string
}

export const TX_SELECTION_DEFAULT_ACTIONS: TxSelectionActionItem[] = [
  { id: 'explain', label: 'Explain', busyLabel: 'Explaining' },
  { id: 'improve', label: 'Improve', busyLabel: 'Improving' },
  { id: 'shorten', label: 'Shorten', more: true, busyLabel: 'Shortening' },
  { id: 'tone', label: 'Tone', more: true, busyLabel: 'Adjusting tone' },
  { id: 'grammar', label: 'Grammar', more: true, busyLabel: 'Checking grammar' },
]

export interface TxSelectionActionsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSubmit'> {
  selection?: TxSelectionPayload | null
  state?: TxSelectionActionState
  actions?: TxSelectionActionItem[]
  activeActionId?: string
  expanded?: boolean
  defaultExpanded?: boolean
  prompt?: string
  defaultPrompt?: string
  hidePrompt?: boolean
  placeholder?: string
  ariaLabel?: string
  keepLabel?: string
  discardLabel?: string
  retryLabel?: string
  sendLabel?: string
  expandLabel?: string
  collapseLabel?: string
  busyLabel?: string
  offset?: number
  inline?: boolean
  onAction?: (payload: { id: string, action: TxSelectionActionItem, selection: TxSelectionPayload }) => void
  onSubmit?: (payload: { prompt: string, selection: TxSelectionPayload }) => void
  onKeep?: () => void
  onDiscard?: () => void
  onRetry?: () => void
  onExpandedChange?: (expanded: boolean) => void
  onPromptChange?: (prompt: string) => void
}

export const TxSelectionActions = forwardRef<HTMLDivElement, TxSelectionActionsProps>((
  {
    selection = null,
    state = 'idle',
    actions = TX_SELECTION_DEFAULT_ACTIONS,
    activeActionId,
    expanded,
    defaultExpanded = false,
    prompt,
    defaultPrompt = '',
    hidePrompt = false,
    placeholder = 'Ask to edit...',
    ariaLabel = 'Selection actions',
    keepLabel = 'Keep',
    discardLabel = 'Discard',
    retryLabel = 'Retry',
    sendLabel = 'Send',
    expandLabel = 'More actions',
    collapseLabel = 'Fewer actions',
    busyLabel = 'Editing',
    offset = 8,
    inline = false,
    onAction,
    onSubmit,
    onKeep,
    onDiscard,
    onRetry,
    onExpandedChange,
    onPromptChange,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [isExpanded, setIsExpanded] = useControllableState({
    value: expanded,
    defaultValue: defaultExpanded,
    onChange: onExpandedChange,
  })
  const [promptValue, setPromptValue] = useControllableState({
    value: prompt,
    defaultValue: defaultPrompt,
    onChange: onPromptChange,
  })
  const zIndexRef = useRef(allocateZIndex())

  if (!selection && !inline)
    return null

  const activeSelection: TxSelectionPayload = selection ?? { text: '', rects: [] }
  const primaryActions = actions.filter(a => !a.more)
  const moreActions = actions.filter(a => a.more)
  const activeAction = actions.find(a => a.id === activeActionId)
  const currentBusyLabel = activeAction?.busyLabel ?? busyLabel

  const lastRect = activeSelection.rects[activeSelection.rects.length - 1]
  const anchorStyle: CSSProperties = !inline && lastRect
    ? {
        position: 'fixed',
        left: `${Math.max(8, lastRect.left)}px`,
        top: `${Math.max(8, lastRect.bottom + offset)}px`,
        zIndex: zIndexRef.current,
        ...style,
      }
    : { ...style }

  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = promptValue.trim()
    if (!trimmed)
      return
    onSubmit?.({ prompt: trimmed, selection: activeSelection })
    setPromptValue('')
  }

  const bar = (
    <div
      ref={ref}
      role="toolbar"
      aria-label={ariaLabel}
      className={cn(
        'tx-bui-selection-actions',
        `tx-bui-selection-actions--${state}`,
        { 'is-inline': inline },
        className,
      )}
      style={anchorStyle}
      {...rest}
    >
      <div className="tx-bui-selection-actions__content">
        {state === 'thinking' || state === 'streaming'
          ? (
              <div className="tx-bui-selection-actions__busy" role="status" aria-live="polite">
                <TxSpinner size={14} className="tx-bui-selection-actions__spinner" />
                <span className="tx-bui-selection-actions__busy-label">{currentBusyLabel}</span>
              </div>
            )
          : state === 'result'
            ? (
                <div className="tx-bui-selection-actions__primary">
                  <button type="button" className="tx-bui-selection-actions__control is-primary" onClick={onKeep}>
                    {keepLabel}
                  </button>
                  <button type="button" className="tx-bui-selection-actions__control" onClick={onRetry}>
                    {retryLabel}
                  </button>
                  <button type="button" className="tx-bui-selection-actions__control" onClick={onDiscard}>
                    {discardLabel}
                  </button>
                </div>
              )
            : (
                <>
                  <div className="tx-bui-selection-actions__primary">
                    {primaryActions.map(action => (
                      <button
                        key={action.id}
                        type="button"
                        className="tx-bui-selection-actions__control"
                        onClick={() => onAction?.({ id: action.id, action, selection: activeSelection })}
                      >
                        {action.label}
                      </button>
                    ))}

                    {moreActions.length > 0 && isExpanded && moreActions.map(action => (
                      <button
                        key={action.id}
                        type="button"
                        className="tx-bui-selection-actions__control"
                        onClick={() => onAction?.({ id: action.id, action, selection: activeSelection })}
                      >
                        {action.label}
                      </button>
                    ))}

                    {moreActions.length > 0 && (
                      <button
                        type="button"
                        className="tx-bui-selection-actions__icon-button tx-bui-selection-actions__chevron"
                        aria-label={isExpanded ? collapseLabel : expandLabel}
                        aria-expanded={isExpanded}
                        onClick={() => setIsExpanded(!isExpanded)}
                      >
                        {isExpanded ? '‹' : '›'}
                      </button>
                    )}
                  </div>

                  {!hidePrompt && (
                    <>
                      <span className="tx-bui-selection-actions__divider" aria-hidden="true" />
                      <form className="tx-bui-selection-actions__form" onSubmit={handleFormSubmit}>
                        <input
                          type="text"
                          className="tx-bui-selection-actions__input"
                          value={promptValue}
                          placeholder={placeholder}
                          aria-label={placeholder}
                          onChange={e => setPromptValue(e.target.value)}
                        />
                        <button
                          type="submit"
                          className="tx-bui-selection-actions__icon-button tx-bui-selection-actions__send"
                          aria-label={sendLabel}
                          disabled={!promptValue.trim()}
                        >
                          ↵
                        </button>
                      </form>
                    </>
                  )}
                </>
              )}
      </div>
    </div>
  )

  if (inline || !hasDocument())
    return bar

  return createPortal(bar, document.body)
})
TxSelectionActions.displayName = 'TxSelectionActions'
