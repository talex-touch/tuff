import type { ButtonHTMLAttributes, HTMLAttributes, KeyboardEvent, ReactElement, ReactNode } from 'react'
import { Children, createContext, forwardRef, isValidElement, useContext, useId, useMemo, useRef } from 'react'
import { useControllableState } from '../hooks/useControllableState'
import { cn } from '../utils/cn'

export type TxTabsPlacement = 'left' | 'right' | 'top' | 'bottom'
export type TxTabsIndicatorVariant = 'line' | 'pill' | 'block' | 'dot' | 'outline'

interface TabsContextValue {
  activeName: string
  setActiveName: (name: string) => void
  baseId: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

export interface TxTabItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'name'> {
  name: string
  label?: ReactNode
  icon?: ReactNode
  iconClass?: string
  disabled?: boolean
  active?: boolean
  children?: ReactNode
}

export const TxTabItem = forwardRef<HTMLButtonElement, TxTabItemProps>((
  {
    name,
    label,
    icon,
    iconClass = '',
    disabled = false,
    active: activeProp = false,
    onClick,
    className,
    children: _children,
    ...rest
  },
  ref,
) => {
  const ctx = useContext(TabsContext)
  const isActive = ctx ? ctx.activeName === name : activeProp

  const handleClick: ButtonHTMLAttributes<HTMLButtonElement>['onClick'] = (event) => {
    if (disabled)
      return
    ctx?.setActiveName(name)
    onClick?.(event)
  }

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={ctx ? `${ctx.baseId}-tab-${name}` : undefined}
      aria-selected={isActive}
      aria-controls={ctx ? `${ctx.baseId}-panel` : undefined}
      disabled={disabled}
      tabIndex={isActive ? 0 : -1}
      className={cn(
        'tx-tab-item fake-background',
        { 'is-active': isActive, 'is-disabled': disabled },
        className,
      )}
      onClick={handleClick}
      {...rest}
    >
      {(icon || iconClass) && (
        <span className="tx-tab-item__icon">
          {icon ?? <i className={iconClass} aria-hidden="true" />}
        </span>
      )}
      <span className="tx-tab-item__name">{label ?? name}</span>
    </button>
  )
})
TxTabItem.displayName = 'TxTabItem'

export interface TxTabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> {
  value?: string
  defaultValue?: string
  placement?: TxTabsPlacement
  navMinWidth?: number
  navMaxWidth?: number
  contentPadding?: number
  borderless?: boolean
  showIndicator?: boolean
  indicatorVariant?: TxTabsIndicatorVariant
  navRight?: ReactNode
  onChange?: (value: string) => void
}

function collectTabItems(children: ReactNode): Array<ReactElement<TxTabItemProps>> {
  const items: Array<ReactElement<TxTabItemProps>> = []
  Children.forEach(children, (child) => {
    if (isValidElement<TxTabItemProps>(child) && typeof child.props?.name === 'string')
      items.push(child)
  })
  return items
}

export const TxTabs = forwardRef<HTMLDivElement, TxTabsProps>((
  {
    value,
    defaultValue,
    placement = 'left',
    navMinWidth = 180,
    navMaxWidth = 320,
    contentPadding = 12,
    borderless = false,
    showIndicator = true,
    indicatorVariant = 'line',
    navRight,
    onChange,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const tabElements = collectTabItems(children)
  const firstEnabledName = tabElements.find(el => !el.props.disabled)?.props.name ?? tabElements[0]?.props.name ?? ''

  const [activeName, setActiveName] = useControllableState<string>({
    value,
    defaultValue: defaultValue ?? firstEnabledName,
    onChange,
  })

  const baseId = useId()
  const navInnerRef = useRef<HTMLDivElement | null>(null)
  const isVertical = placement === 'left' || placement === 'right'
  const activeTab = tabElements.find(el => el.props.name === activeName) ?? tabElements[0]

  const handleTablistKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = tabElements.filter(el => !el.props.disabled)
    if (!enabled.length)
      return

    const currentIndex = enabled.findIndex(el => el.props.name === activeName)
    let nextIndex = -1

    if (event.key === 'Home') {
      nextIndex = 0
    }
    else if (event.key === 'End') {
      nextIndex = enabled.length - 1
    }
    else if ((isVertical && event.key === 'ArrowDown') || (!isVertical && event.key === 'ArrowRight')) {
      nextIndex = (currentIndex + 1 + enabled.length) % enabled.length
    }
    else if ((isVertical && event.key === 'ArrowUp') || (!isVertical && event.key === 'ArrowLeft')) {
      nextIndex = (currentIndex - 1 + enabled.length) % enabled.length
    }

    if (nextIndex >= 0) {
      const target = enabled[nextIndex]
      if (target) {
        event.preventDefault()
        setActiveName(target.props.name)
        const btn = document.getElementById(`${baseId}-tab-${target.props.name}`)
        btn?.focus()
      }
    }
  }

  const ctx = useMemo<TabsContextValue>(
    () => ({
      activeName: activeTab?.props.name ?? activeName,
      setActiveName,
      baseId,
    }),
    [activeTab?.props.name, activeName, setActiveName, baseId],
  )

  const navStyle = isVertical ? { minWidth: `${navMinWidth}px`, maxWidth: `${navMaxWidth}px` } : undefined

  return (
    <TabsContext.Provider value={ctx}>
      <div
        ref={ref}
        className={cn(
          'tx-tabs',
          `tx-tabs--${placement}`,
          `tx-tabs--indicator-${indicatorVariant}`,
          {
            'tx-tabs--borderless': borderless,
            'tx-tabs--indicator-hidden': !showIndicator,
          },
          className,
        )}
        {...rest}
      >
        <div className="tx-tabs__nav" style={navStyle}>
          <div className="tx-tabs__nav-bar">
            <div
              ref={navInnerRef}
              className="tx-tabs__nav-inner"
              role="tablist"
              aria-orientation={isVertical ? 'vertical' : 'horizontal'}
              onKeyDown={handleTablistKeyDown}
            >
              {tabElements.map(el => (
                <TxTabItem
                  key={el.props.name}
                  {...el.props}
                  children={undefined}
                />
              ))}
            </div>
            {navRight && <div className="tx-tabs__nav-extra">{navRight}</div>}
          </div>
        </div>

        <div className="tx-tabs__main" style={{ padding: `${contentPadding}px` }}>
          <div
            className="tx-tabs__select-slot"
            role="tabpanel"
            id={`${baseId}-panel`}
            aria-labelledby={activeTab ? `${baseId}-tab-${activeTab.props.name}` : undefined}
          >
            {activeTab?.props.children}
          </div>
        </div>
      </div>
    </TabsContext.Provider>
  )
})
