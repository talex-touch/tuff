import type { CSSProperties, HTMLAttributes, MouseEvent, ReactNode } from 'react'
import type { TxSelectModelValue } from '../TxSelect'
import { hasDocument } from '@talex-touch/tuffex-core'
import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react'
import { useControllableState } from '../../hooks/useControllableState'
import { cn } from '../../utils/cn'
import { TxSelect } from '../TxSelect'
import { TxIcon, TxIconChip } from './primitives'

// ============================================================================
// 25. breadcrumb (TxBreadcrumb, TxBreadcrumbItem)
// ============================================================================

export interface TxBreadcrumbItemData {
  label: string
  href?: string
  icon?: string
  disabled?: boolean
}

interface BreadcrumbContextValue {
  separatorIcon: string
  separator?: ReactNode
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  separatorIcon: 'chevron-right',
})

export interface TxBreadcrumbItemProps extends Omit<HTMLAttributes<HTMLLIElement>, 'onClick'> {
  href?: string
  icon?: string
  current?: boolean
  disabled?: boolean
  isLast?: boolean
  onClick?: (event: MouseEvent<HTMLElement>) => void
}

export const TxBreadcrumbItem = forwardRef<HTMLLIElement, TxBreadcrumbItemProps>((
  {
    href,
    icon,
    current = false,
    disabled = false,
    isLast = false,
    onClick,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const ctx = useContext(BreadcrumbContext)
  const isLink = Boolean(href) && !disabled && !current
  const isButton = !href && !disabled && !current && Boolean(onClick)

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (disabled || current)
      return
    onClick?.(event)
  }

  const linkClasses = cn('tx-breadcrumb__link', {
    'tx-breadcrumb__link--current': current,
    'tx-breadcrumb__link--disabled': disabled,
  })

  const inner = (
    <>
      {icon && <TxIcon name={icon} className="tx-breadcrumb__icon" />}
      {children}
    </>
  )

  return (
    <li ref={ref} className={cn('tx-breadcrumb__item', className)} {...rest}>
      {isLink
        ? (
            <a
              href={href}
              className={linkClasses}
              onClick={handleClick}
            >
              {inner}
            </a>
          )
        : isButton
          ? (
              <button
                type="button"
                className={linkClasses}
                onClick={handleClick}
              >
                {inner}
              </button>
            )
          : (
              <span
                className={linkClasses}
                aria-current={current ? 'page' : undefined}
                aria-disabled={disabled ? 'true' : undefined}
              >
                {inner}
              </span>
            )}

      {!isLast && (
        <span className="tx-breadcrumb__separator" aria-hidden="true">
          {ctx.separator ?? <TxIcon name={ctx.separatorIcon} />}
        </span>
      )}
    </li>
  )
})
TxBreadcrumbItem.displayName = 'TxBreadcrumbItem'

export interface TxBreadcrumbProps extends Omit<HTMLAttributes<HTMLElement>, 'onClick'> {
  items?: TxBreadcrumbItemData[]
  separatorIcon?: string
  separator?: ReactNode
  ariaLabel?: string
  onItemClick?: (item: TxBreadcrumbItemData, index: number) => void
}

export const TxBreadcrumb = forwardRef<HTMLElement, TxBreadcrumbProps>((
  {
    items,
    separatorIcon = 'chevron-right',
    separator,
    ariaLabel = 'Breadcrumb',
    onItemClick,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const ctxValue = useMemo<BreadcrumbContextValue>(
    () => ({ separatorIcon, separator }),
    [separatorIcon, separator],
  )

  const renderContent = () => {
    if (items && items.length > 0) {
      return items.map((item, index) => {
        const isCurrent = index === items.length - 1
        return (
          <TxBreadcrumbItem
            key={`${item.label}-${index}`}
            href={item.href}
            icon={item.icon}
            current={isCurrent}
            disabled={item.disabled}
            isLast={isCurrent}
            onClick={!item.href && !isCurrent && !item.disabled
              ? () => onItemClick?.(item, index)
              : undefined}
          >
            {item.label}
          </TxBreadcrumbItem>
        )
      })
    }

    const childNodes = Children.toArray(children)
    return childNodes.map((child, index) => {
      if (isValidElement<TxBreadcrumbItemProps>(child) && child.type === TxBreadcrumbItem) {
        const isLast = index === childNodes.length - 1
        return (
          <TxBreadcrumbItem
            key={child.key ?? index}
            {...child.props}
            current={child.props.current ?? isLast}
            isLast={child.props.isLast ?? isLast}
          />
        )
      }
      return child
    })
  }

  return (
    <BreadcrumbContext.Provider value={ctxValue}>
      <nav
        ref={ref}
        className={cn('tx-breadcrumb', className)}
        aria-label={ariaLabel}
        {...rest}
      >
        <ol className="tx-breadcrumb__list">
          {renderContent()}
        </ol>
      </nav>
    </BreadcrumbContext.Provider>
  )
})
TxBreadcrumb.displayName = 'TxBreadcrumb'

// ============================================================================
// 26. nav-bar (TxNavBar)
// ============================================================================

export interface TxNavBarProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode
  fixed?: boolean
  safeAreaTop?: boolean
  showBack?: boolean
  disabled?: boolean
  zIndex?: number
  backLabel?: string
  leftLabel?: string
  rightLabel?: string
  left?: ReactNode
  right?: ReactNode
  onBack?: () => void
  onClickLeft?: () => void
  onClickRight?: () => void
}

export const TxNavBar = forwardRef<HTMLElement, TxNavBarProps>((
  {
    title = '',
    fixed = false,
    safeAreaTop = true,
    showBack = false,
    disabled = false,
    zIndex = 2000,
    backLabel = 'Back',
    leftLabel = 'Navigation left action',
    rightLabel = 'Navigation right action',
    left,
    right,
    onBack,
    onClickLeft,
    onClickRight,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const hasLeftSlot = left !== undefined && left !== null
  const hasRightSlot = right !== undefined && right !== null
  const leftInteractive = showBack || hasLeftSlot
  const rightInteractive = hasRightSlot

  const leftAriaLabel = hasLeftSlot ? undefined : (showBack ? backLabel : leftLabel)
  const rightAriaLabel = hasRightSlot ? undefined : rightLabel

  const handleLeftAction = () => {
    if (disabled)
      return
    if (showBack && !hasLeftSlot) {
      onBack?.()
      onClickLeft?.()
    }
    else {
      onClickLeft?.()
    }
  }

  const handleRightAction = () => {
    if (disabled)
      return
    onClickRight?.()
  }

  return (
    <header
      ref={ref}
      className={cn('tx-nav-bar', { 'is-fixed': fixed, 'is-disabled': disabled }, className)}
      style={{ '--tx-nav-bar-z-index': String(zIndex), ...style } as CSSProperties}
      {...rest}
    >
      {safeAreaTop && <div className="tx-nav-bar__safe" aria-hidden="true" />}

      <div className="tx-nav-bar__inner">
        <button
          type="button"
          className="tx-nav-bar__left"
          disabled={disabled || !leftInteractive}
          aria-label={leftAriaLabel}
          onClick={handleLeftAction}
        >
          {hasLeftSlot
            ? left
            : showBack
              ? (
                  <span className="tx-nav-bar__back" aria-hidden="true">
                    <TxIcon name="arrow-left" />
                  </span>
                )
              : null}
        </button>

        <div className="tx-nav-bar__center">
          <div className="tx-nav-bar__title">
            {children ?? title}
          </div>
        </div>

        <button
          type="button"
          className="tx-nav-bar__right"
          disabled={disabled || !rightInteractive}
          aria-label={rightAriaLabel}
          onClick={handleRightAction}
        >
          {right}
        </button>
      </div>
    </header>
  )
})
TxNavBar.displayName = 'TxNavBar'

// ============================================================================
// 27. sidebar-nav (TxSidebarNav)
// ============================================================================

export type TxSidebarNavValue = string | number

export interface TxSidebarNavItemAction {
  label: string
}

export interface TxSidebarNavItem {
  value: TxSidebarNavValue
  label: string
  group?: string
  icon?: string
  badge?: string | number
  action?: TxSidebarNavItemAction
  disabled?: boolean
}

export interface TxSidebarNavGroup {
  key: string
  label: string
}

export interface TxSidebarNavWorkspace {
  name: string
  description?: string
  initials?: string
}

export interface TxSidebarNavProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange' | 'onSelect'> {
  items: TxSidebarNavItem[]
  groups?: TxSidebarNavGroup[]
  value?: TxSidebarNavValue
  defaultValue?: TxSidebarNavValue
  modelValue?: TxSidebarNavValue
  query?: string
  defaultQuery?: string
  workspace?: TxSidebarNavWorkspace
  workspaceLabel?: string
  workspaceSlot?: ReactNode
  searchPlaceholder?: string
  searchLabel?: string
  searchHint?: string
  actionLabel?: string
  filter?: (items: TxSidebarNavItem[], query: string) => TxSidebarNavItem[]
  ariaLabel?: string
  footer?: ReactNode
  renderItemIcon?: (item: TxSidebarNavItem, active: boolean) => ReactNode
  onChange?: (value: TxSidebarNavValue) => void
  onQueryChange?: (query: string) => void
  onSelect?: (item: TxSidebarNavItem) => void
  onAction?: () => void
  onItemAction?: (item: TxSidebarNavItem) => void
  onWorkspaceClick?: () => void
}

function defaultSidebarFilter(items: TxSidebarNavItem[], query: string): TxSidebarNavItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle)
    return items
  return items.filter(item => item.label.toLowerCase().includes(needle))
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement))
    return false
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
    return true
  return target.isContentEditable || Boolean(target.closest('[contenteditable]:not([contenteditable="false"])'))
}

export const TxSidebarNav = forwardRef<HTMLElement, TxSidebarNavProps>((
  {
    items,
    groups = [],
    value,
    defaultValue,
    modelValue,
    query,
    defaultQuery = '',
    workspace,
    workspaceLabel = 'Switch workspace',
    workspaceSlot,
    searchPlaceholder,
    searchLabel,
    searchHint,
    actionLabel,
    filter,
    ariaLabel = 'Workspace',
    footer,
    renderItemIcon,
    onChange,
    onQueryChange,
    onSelect,
    onAction,
    onItemAction,
    onWorkspaceClick,
    className,
    ...rest
  },
  ref,
) => {
  const uid = useId()
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [activeValue, setActiveValue] = useControllableState<TxSidebarNavValue | undefined>({
    value: value ?? modelValue,
    defaultValue,
    onChange: (next) => {
      if (next !== undefined)
        onChange?.(next)
    },
  })
  const [queryValue, setQueryValue] = useControllableState<string>({
    value: query,
    defaultValue: defaultQuery,
    onChange: onQueryChange,
  })

  const shortcutKey = searchHint && searchHint.length === 1 ? searchHint : null

  useEffect(() => {
    if (!shortcutKey || !searchPlaceholder || !hasDocument())
      return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
        return
      if (event.key !== shortcutKey || isTypingTarget(event.target))
        return
      event.preventDefault()
      searchInputRef.current?.focus()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [shortcutKey, searchPlaceholder])

  const visibleItems = useMemo(
    () => (filter ?? defaultSidebarFilter)(items, queryValue),
    [filter, items, queryValue],
  )

  const renderedGroups = useMemo(() => {
    const known = new Set(groups.map(g => g.key))
    const loose = visibleItems.filter(item => !item.group || !known.has(item.group))
    const result: Array<{ key: string, label: string, items: TxSidebarNavItem[] }> = []
    if (loose.length > 0)
      result.push({ key: '__ungrouped', label: '', items: loose })
    for (const group of groups) {
      const grouped = visibleItems.filter(item => item.group === group.key)
      if (grouped.length > 0)
        result.push({ key: group.key, label: group.label, items: grouped })
    }
    return result
  }, [groups, visibleItems])

  const handleSelect = (item: TxSidebarNavItem) => {
    if (item.disabled)
      return
    setActiveValue(item.value)
    onSelect?.(item)
  }

  return (
    <nav
      ref={ref}
      className={cn('tx-bui-sidebar-nav tx-sidebar-nav', className)}
      aria-label={ariaLabel}
      {...rest}
    >
      {workspaceSlot ?? (workspace && (
        <button
          type="button"
          className="tx-bui-sidebar-nav__workspace"
          aria-label={workspaceLabel}
          onClick={() => onWorkspaceClick?.()}
        >
          <TxIconChip size={32} tone="ink" fontSize={13}>
            {workspace.initials ?? workspace.name.slice(0, 1)}
          </TxIconChip>
          <span className="tx-bui-sidebar-nav__workspace-text">
            <span className="tx-bui-sidebar-nav__workspace-name">{workspace.name}</span>
            {workspace.description && (
              <span className="tx-bui-sidebar-nav__workspace-desc">{workspace.description}</span>
            )}
          </span>
          <svg
            className="tx-bui-sidebar-nav__workspace-chevron"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
          </svg>
        </button>
      ))}

      {searchPlaceholder && (
        <label className="tx-bui-sidebar-nav__search">
          <svg
            className="tx-bui-sidebar-nav__search-icon"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={searchInputRef}
            className="tx-bui-sidebar-nav__search-input"
            type="text"
            value={queryValue}
            placeholder={searchPlaceholder}
            aria-label={searchLabel || searchPlaceholder}
            onChange={event => setQueryValue(event.target.value)}
          />
          {searchHint && (
            <kbd className="tx-bui-sidebar-nav__search-hint" aria-hidden="true">
              {searchHint}
            </kbd>
          )}
        </label>
      )}

      {actionLabel && (
        <button
          type="button"
          className="tx-bui-sidebar-nav__action"
          onClick={() => onAction?.()}
        >
          <span className="tx-bui-sidebar-nav__action-label">{actionLabel}</span>
          <span className="tx-bui-sidebar-nav__action-plus" aria-hidden="true">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        </button>
      )}

      <div className="tx-bui-sidebar-nav__body">
        {renderedGroups.map((group) => {
          const groupLabelId = `${uid}-group-${group.key}`
          return (
            <div key={group.key} className="tx-bui-sidebar-nav__group">
              {group.label && (
                <div id={groupLabelId} className="tx-bui-sidebar-nav__group-label">
                  {group.label}
                </div>
              )}
              <ul
                className="tx-bui-sidebar-nav__list"
                aria-labelledby={group.label ? groupLabelId : undefined}
              >
                {group.items.map((item) => {
                  const isActive = activeValue !== undefined && item.value === activeValue
                  return (
                    <li
                      key={String(item.value)}
                      className={cn('tx-bui-sidebar-nav__item', { 'is-active': isActive })}
                    >
                      <button
                        type="button"
                        className="tx-bui-sidebar-nav__row"
                        disabled={item.disabled}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => handleSelect(item)}
                      >
                        <span className="tx-bui-sidebar-nav__icon">
                          {renderItemIcon
                            ? renderItemIcon(item, isActive)
                            : item.icon
                              ? <TxIcon name={item.icon} />
                              : null}
                        </span>
                        <span className="tx-bui-sidebar-nav__label">{item.label}</span>
                        {item.badge !== undefined && (
                          <span className="tx-bui-sidebar-nav__badge">{item.badge}</span>
                        )}
                      </button>

                      {item.action && (
                        <button
                          type="button"
                          className="tx-bui-sidebar-nav__item-action"
                          aria-label={item.action.label}
                          disabled={item.disabled}
                          onClick={() => onItemAction?.(item)}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                            <path d="M12 5v14M5 12h14" />
                          </svg>
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>

      {footer}
    </nav>
  )
})
TxSidebarNav.displayName = 'TxSidebarNav'

// ============================================================================
// 28. tab-bar (TxTabBar)
// ============================================================================

export type TxTabBarValue = string | number
export type TxTabBarIndicator = 'none' | 'pill' | 'line' | 'block' | 'dot'
export type TxTabBarSize = 'sm' | 'md' | 'lg'

export interface TxTabBarItem {
  value: TxTabBarValue
  label: string
  iconClass?: string
  icon?: ReactNode
  badge?: string | number
  disabled?: boolean
}

export interface TxTabBarProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  value?: TxTabBarValue
  defaultValue?: TxTabBarValue
  modelValue?: TxTabBarValue
  items?: TxTabBarItem[]
  fixed?: boolean
  safeAreaBottom?: boolean
  disabled?: boolean
  zIndex?: number
  indicator?: TxTabBarIndicator
  size?: TxTabBarSize
  ariaLabel?: string
  onChange?: (value: TxTabBarValue) => void
}

const TAB_BAR_GEOMETRY: Record<TxTabBarSize, { height: string, iconSize: string, labelSize: string, gap: string, pillRadius: string }> = {
  sm: { height: '44px', iconSize: '17px', labelSize: '10px', gap: '1px', pillRadius: '10px' },
  md: { height: '56px', iconSize: '20px', labelSize: '11px', gap: '2px', pillRadius: '14px' },
  lg: { height: '64px', iconSize: '23px', labelSize: '12px', gap: '3px', pillRadius: '16px' },
}

export const TxTabBar = forwardRef<HTMLElement, TxTabBarProps>((
  {
    value,
    defaultValue,
    modelValue,
    items = [],
    fixed = false,
    safeAreaBottom = true,
    disabled = false,
    zIndex = 2000,
    indicator = 'pill',
    size = 'md',
    ariaLabel = 'Tab navigation',
    onChange,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [activeValue, setActiveValue] = useControllableState<TxTabBarValue>({
    value: value ?? modelValue,
    defaultValue: defaultValue ?? items[0]?.value ?? '',
    onChange,
  })

  const geom = TAB_BAR_GEOMETRY[size] ?? TAB_BAR_GEOMETRY.md
  const rootStyle = {
    '--tx-tab-bar-z-index': String(zIndex),
    '--tx-tab-bar-height': geom.height,
    '--tx-tab-bar-icon-size': geom.iconSize,
    '--tx-tab-bar-label-size': geom.labelSize,
    '--tx-tab-bar-item-gap': geom.gap,
    '--tx-tab-bar-pill-radius': geom.pillRadius,
    ...style,
  } as CSSProperties

  return (
    <nav
      ref={ref}
      className={cn(
        'tx-tab-bar',
        `tx-tab-bar--indicator-${indicator}`,
        { 'is-fixed': fixed, 'is-disabled': disabled },
        className,
      )}
      style={rootStyle}
      aria-label={ariaLabel}
      {...rest}
    >
      <div className="tx-tab-bar__inner">
        {items.map((item) => {
          const isActive = activeValue === item.value
          const isItemDisabled = disabled || Boolean(item.disabled)
          return (
            <button
              key={String(item.value)}
              type="button"
              className={cn('tx-tab-bar__item', {
                'is-active': isActive,
                'is-item-disabled': Boolean(item.disabled),
              })}
              disabled={isItemDisabled}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                if (!isItemDisabled)
                  setActiveValue(item.value)
              }}
            >
              <div className="tx-tab-bar__icon">
                {item.icon ?? (item.iconClass ? <i className={item.iconClass} aria-hidden="true" /> : null)}
                {item.badge !== undefined && item.badge !== null && item.badge !== '' && (
                  <span className="tx-tab-bar__badge">{item.badge}</span>
                )}
              </div>
              <div className="tx-tab-bar__label">{item.label}</div>
            </button>
          )
        })}
      </div>

      {safeAreaBottom && <div className="tx-tab-bar__safe" aria-hidden="true" />}
    </nav>
  )
})
TxTabBar.displayName = 'TxTabBar'

// ============================================================================
// 29. pagination (TxPagination)
// ============================================================================

export interface TxPaginationProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  currentPage?: number
  defaultCurrentPage?: number
  pageSize?: number
  defaultPageSize?: number
  pageSizes?: number[]
  pageSizeLabel?: string
  total?: number
  totalPages?: number
  prevIcon?: string
  nextIcon?: string
  showInfo?: boolean
  showFirstLast?: boolean
  ariaLabel?: string
  firstLabel?: string
  prevLabel?: string
  nextLabel?: string
  lastLabel?: string
  renderInfo?: (info: { currentPage: number, totalPages: number, total?: number }) => ReactNode
  onPageChange?: (page: number) => void
  onChange?: (page: number) => void
  onPageSizeChange?: (size: number) => void
}

export const TxPagination = forwardRef<HTMLElement, TxPaginationProps>((
  {
    currentPage,
    defaultCurrentPage = 1,
    pageSize,
    defaultPageSize = 10,
    pageSizes = [],
    pageSizeLabel = 'Items per page',
    total,
    totalPages: totalPagesProp,
    prevIcon = '',
    nextIcon = '',
    showInfo = false,
    showFirstLast = false,
    ariaLabel = 'Pagination',
    firstLabel = 'First page',
    prevLabel = 'Previous page',
    nextLabel = 'Next page',
    lastLabel = 'Last page',
    renderInfo,
    onPageChange,
    onChange,
    onPageSizeChange,
    className,
    ...rest
  },
  ref,
) => {
  const [page, setPage] = useControllableState({
    value: currentPage,
    defaultValue: defaultCurrentPage,
    onChange: (next) => {
      onPageChange?.(next)
      onChange?.(next)
    },
  })

  const [size, setSize] = useControllableState({
    value: pageSize,
    defaultValue: defaultPageSize,
    onChange: onPageSizeChange,
  })

  const computedTotalPages = useMemo(() => {
    if (typeof total === 'number' && total > 0)
      return Math.max(1, Math.ceil(total / Math.max(1, size)))
    return Math.max(1, totalPagesProp || 1)
  }, [total, size, totalPagesProp])

  const safePage = Math.min(Math.max(page, 1), computedTotalPages)

  const visiblePages = useMemo<Array<number | '...'>>(() => {
    const pages: Array<number | '...'> = []
    if (computedTotalPages <= 7) {
      for (let i = 1; i <= computedTotalPages; i++)
        pages.push(i)
    }
    else if (safePage <= 4) {
      for (let i = 1; i <= 5; i++)
        pages.push(i)
      pages.push('...', computedTotalPages)
    }
    else if (safePage >= computedTotalPages - 3) {
      pages.push(1, '...')
      for (let i = computedTotalPages - 4; i <= computedTotalPages; i++)
        pages.push(i)
    }
    else {
      pages.push(1, '...', safePage - 1, safePage, safePage + 1, '...', computedTotalPages)
    }
    return pages
  }, [safePage, computedTotalPages])

  const pageSizeOptions = useMemo(() => {
    const valid = new Set(pageSizes.filter(s => Number.isInteger(s) && s > 0))
    if (valid.size === 0)
      return []
    if (Number.isInteger(size) && size > 0)
      valid.add(size)
    return Array.from(valid).sort((a, b) => a - b).map(v => ({ value: v, label: String(v) }))
  }, [pageSizes, size])

  const pageSizeLabelId = useId()

  const goToPage = (target: number) => {
    if (target < 1 || target > computedTotalPages || target === safePage)
      return
    setPage(target)
  }

  const handleSizeSelect = (val: TxSelectModelValue) => {
    const nextSize = Number(val)
    if (!Number.isInteger(nextSize) || nextSize <= 0 || nextSize === size)
      return
    setSize(nextSize)
  }

  return (
    <nav
      ref={ref}
      className={cn('tx-pagination', { 'has-page-size': pageSizeOptions.length > 0 }, className)}
      aria-label={ariaLabel}
      {...rest}
    >
      <ul className="tx-pagination__list">
        {showFirstLast && (
          <li className="tx-pagination__item">
            <button
              type="button"
              className={cn('tx-pagination__button', { 'tx-pagination__button--disabled': safePage <= 1 })}
              disabled={safePage <= 1}
              aria-label={firstLabel}
              onClick={() => goToPage(1)}
            >
              &laquo;
            </button>
          </li>
        )}

        <li className="tx-pagination__item">
          <button
            type="button"
            className={cn('tx-pagination__button', { 'tx-pagination__button--disabled': safePage <= 1 })}
            disabled={safePage <= 1}
            aria-label={prevLabel}
            onClick={() => goToPage(safePage - 1)}
          >
            {prevIcon
              ? <TxIcon name={prevIcon} />
              : (
                  <svg className="tx-pagination__chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="m10 3-5 5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
          </button>
        </li>

        {visiblePages.map((entry, idx) => (
          <li key={`${entry}-${idx}`} className="tx-pagination__item">
            {entry === '...'
              ? <span className="tx-pagination__ellipsis">...</span>
              : (
                  <button
                    type="button"
                    className={cn('tx-pagination__button', {
                      'tx-pagination__button--active': entry === safePage,
                    })}
                    aria-current={entry === safePage ? 'page' : undefined}
                    onClick={() => goToPage(entry)}
                  >
                    {entry}
                  </button>
                )}
          </li>
        ))}

        <li className="tx-pagination__item">
          <button
            type="button"
            className={cn('tx-pagination__button', { 'tx-pagination__button--disabled': safePage >= computedTotalPages })}
            disabled={safePage >= computedTotalPages}
            aria-label={nextLabel}
            onClick={() => goToPage(safePage + 1)}
          >
            {nextIcon
              ? <TxIcon name={nextIcon} />
              : (
                  <svg className="tx-pagination__chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
          </button>
        </li>

        {showFirstLast && (
          <li className="tx-pagination__item">
            <button
              type="button"
              className={cn('tx-pagination__button', { 'tx-pagination__button--disabled': safePage >= computedTotalPages })}
              disabled={safePage >= computedTotalPages}
              aria-label={lastLabel}
              onClick={() => goToPage(computedTotalPages)}
            >
              &raquo;
            </button>
          </li>
        )}
      </ul>

      {pageSizeOptions.length > 0 && (
        <div className="tx-pagination__size">
          <span id={pageSizeLabelId} className="tx-pagination__size-label">{pageSizeLabel}</span>
          <TxSelect
            aria-labelledby={pageSizeLabelId}
            value={size}
            options={pageSizeOptions}
            style={{ width: 88 }}
            onChange={handleSizeSelect}
          />
        </div>
      )}

      {showInfo && (
        <div className="tx-pagination__info">
          {renderInfo
            ? renderInfo({ currentPage: safePage, totalPages: computedTotalPages, total })
            : (
                <>
                  Page
                  {' '}
                  {safePage}
                  {' '}
                  of
                  {' '}
                  {computedTotalPages}
                  {typeof total === 'number' && total > 0 && (
                    <span>
                      {' '}
                      (
                      {total}
                      {' '}
                      items)
                    </span>
                  )}
                </>
              )}
        </div>
      )}
    </nav>
  )
})
TxPagination.displayName = 'TxPagination'

// ============================================================================
// 30. steps (TxSteps, TxStep)
// ============================================================================

export type TxStepsDirection = 'horizontal' | 'vertical'
export type TxStepsSize = 'small' | 'medium' | 'large'
export type TxStepStatus = 'wait' | 'active' | 'completed' | 'error'

interface StepsContextValue {
  direction: TxStepsDirection
  size: TxStepsSize
  activeStep: number | string
  setActiveStep: (step: number | string) => void
}

interface StepSlotIndex {
  index: number
  isLast: boolean
}

const StepsContext = createContext<StepsContextValue | null>(null)
const StepIndexContext = createContext<StepSlotIndex>({ index: 0, isLast: true })

export interface TxStepsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  direction?: TxStepsDirection
  size?: TxStepsSize
  active?: number | string
  defaultActive?: number | string
  onChange?: (step: number | string) => void
  onActiveChange?: (step: number | string) => void
}

export const TxSteps = forwardRef<HTMLDivElement, TxStepsProps>((
  {
    direction = 'horizontal',
    size = 'medium',
    active,
    defaultActive = 0,
    onChange,
    onActiveChange,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const [activeStep, setActiveStep] = useControllableState<number | string>({
    value: active,
    defaultValue: defaultActive,
    onChange: (next) => {
      onChange?.(next)
      onActiveChange?.(next)
    },
  })

  const ctxValue = useMemo<StepsContextValue>(
    () => ({ direction, size, activeStep, setActiveStep }),
    [direction, size, activeStep, setActiveStep],
  )

  const items = Children.toArray(children)

  return (
    <StepsContext.Provider value={ctxValue}>
      <div
        ref={ref}
        className={cn('tx-steps', `tx-steps--${direction}`, `tx-steps--${size}`, className)}
        role="list"
        {...rest}
      >
        {items.map((child, index) => (
          <StepIndexContext.Provider
            key={isValidElement(child) && child.key !== null ? child.key : index}
            value={{ index, isLast: index === items.length - 1 }}
          >
            {child}
          </StepIndexContext.Provider>
        ))}
      </div>
    </StepsContext.Provider>
  )
})
TxSteps.displayName = 'TxSteps'

export interface TxStepProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  description?: ReactNode
  icon?: string
  status?: TxStepStatus
  step?: number | string
  clickable?: boolean
  disabled?: boolean
  showLine?: boolean
  completedIcon?: string
}

export const TxStep = forwardRef<HTMLDivElement, TxStepProps>((
  {
    title,
    description,
    icon,
    status: statusProp = 'wait',
    step,
    clickable = true,
    disabled = false,
    showLine = true,
    completedIcon = 'check',
    className,
    style,
    children,
    onClick,
    ...rest
  },
  ref,
) => {
  const steps = useContext(StepsContext)
  const { index: orderIndex, isLast } = useContext(StepIndexContext)
  const titleId = useId()
  const descId = useId()

  const direction = steps?.direction ?? 'horizontal'
  const size = steps?.size ?? 'medium'
  const effectiveStep = step ?? orderIndex
  const isActive = steps !== null && steps.activeStep === effectiveStep
  const isCompleted = statusProp === 'completed' || (
    steps !== null
    && typeof effectiveStep === 'number'
    && typeof steps.activeStep === 'number'
    && effectiveStep < steps.activeStep
  )
  const resolvedStatus: TxStepStatus = isActive ? 'active' : isCompleted ? 'completed' : statusProp
  const stepNumber = typeof effectiveStep === 'number' ? effectiveStep + 1 : orderIndex + 1

  const handleHeadClick = (event: MouseEvent<HTMLElement>) => {
    if (disabled)
      return
    if (clickable && steps)
      steps.setActiveStep(effectiveStep)
    onClick?.(event as unknown as MouseEvent<HTMLDivElement>)
  }

  const glyph = resolvedStatus === 'completed'
    ? <TxIcon name={completedIcon} />
    : icon
      ? <TxIcon name={icon} />
      : <span className="tx-step__number">{stepNumber}</span>

  const descContent = description ?? children

  return (
    <div
      ref={ref}
      className={cn(
        'tx-step',
        `tx-step--${direction}`,
        `tx-step--${size}`,
        {
          'tx-step--active': isActive,
          'tx-step--completed': isCompleted,
          'tx-step--clickable': clickable && !disabled,
          'tx-step--disabled': disabled,
        },
        className,
      )}
      style={{ '--tx-step-index': orderIndex, ...style } as CSSProperties}
      role="listitem"
      {...rest}
    >
      {clickable
        ? (
            <button
              type="button"
              className="tx-step__head"
              disabled={disabled}
              aria-current={isActive ? 'step' : undefined}
              aria-labelledby={title ? titleId : undefined}
              aria-describedby={descContent ? descId : undefined}
              onClick={handleHeadClick}
            >
              <div className={cn('tx-step__icon', `tx-step__icon--${resolvedStatus}`)}>
                <span className="tx-step__glyph">{glyph}</span>
              </div>
            </button>
          )
        : (
            <div
              className="tx-step__head"
              aria-current={isActive ? 'step' : undefined}
            >
              <div className={cn('tx-step__icon', `tx-step__icon--${resolvedStatus}`)}>
                <span className="tx-step__glyph">{glyph}</span>
              </div>
            </div>
          )}

      {showLine && !isLast && (
        <div
          className={cn('tx-step__line', { 'tx-step__line--completed': isCompleted })}
          aria-hidden="true"
        >
          <span className="tx-step__line-fill" />
        </div>
      )}

      <div className="tx-step__content">
        {title !== undefined && title !== null && (
          <div id={titleId} className="tx-step__title">{title}</div>
        )}
        {descContent !== undefined && descContent !== null && descContent !== '' && (
          <div id={descId} className="tx-step__description">{descContent}</div>
        )}
      </div>
    </div>
  )
})
TxStep.displayName = 'TxStep'
