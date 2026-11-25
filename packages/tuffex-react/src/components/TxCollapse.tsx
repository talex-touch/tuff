import type { HTMLAttributes, ReactNode } from 'react'
import { createContext, forwardRef, useCallback, useContext, useId, useMemo } from 'react'
import { useControllableState } from '../hooks/useControllableState'
import { cn } from '../utils/cn'
import { BuiltinIcon } from '../utils/icons'

interface CollapseContextValue {
  activeNames: string[]
  accordion: boolean
  toggleItem: (name: string) => void
}

const CollapseContext = createContext<CollapseContextValue | null>(null)

export interface TxCollapseProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> {
  accordion?: boolean
  value?: string | string[]
  defaultValue?: string | string[]
  onChange?: (value: string | string[]) => void
}

function normalizeNames(value: string | string[] | undefined): string[] {
  if (value === undefined)
    return []
  if (Array.isArray(value))
    return value
  return value === '' ? [] : [value]
}

export const TxCollapse = forwardRef<HTMLDivElement, TxCollapseProps>(function TxCollapse(
  {
    accordion = false,
    value,
    defaultValue,
    onChange,
    className,
    children,
    ...rest
  },
  ref,
) {
  const [rawValue, setRawValue] = useControllableState<string | string[]>({
    value,
    defaultValue: defaultValue ?? (accordion ? '' : []),
    onChange,
  })

  const activeNames = useMemo(() => normalizeNames(rawValue), [rawValue])

  const toggleItem = useCallback(
    (name: string) => {
      if (accordion) {
        const next = activeNames.includes(name) ? '' : name
        setRawValue(next)
        return
      }
      const next = activeNames.includes(name)
        ? activeNames.filter(item => item !== name)
        : [...activeNames, name]
      setRawValue(next)
    },
    [accordion, activeNames, setRawValue],
  )

  const ctx = useMemo<CollapseContextValue>(
    () => ({ activeNames, accordion, toggleItem }),
    [activeNames, accordion, toggleItem],
  )

  return (
    <CollapseContext.Provider value={ctx}>
      <div ref={ref} className={cn('tx-collapse', className)} {...rest}>
        {children}
      </div>
    </CollapseContext.Provider>
  )
})

export interface TxCollapseItemProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  name?: string
  disabled?: boolean
  arrowIcon?: string
}

export const TxCollapseItem = forwardRef<HTMLDivElement, TxCollapseItemProps>(function TxCollapseItem(
  {
    title,
    name,
    disabled = false,
    arrowIcon = 'chevron-down',
    className,
    children,
    ...rest
  },
  ref,
) {
  const collapse = useContext(CollapseContext)
  const contentId = useId()
  const itemName = name ?? (typeof title === 'string' ? title : contentId)
  const isActive = collapse ? collapse.activeNames.includes(itemName) : false

  const handleHeaderClick = () => {
    if (disabled || !collapse)
      return
    collapse.toggleItem(itemName)
  }

  return (
    <div ref={ref} className={cn('tx-collapse-item', className)} {...rest}>
      <button
        type="button"
        className={cn('tx-collapse-item__header', {
          'tx-collapse-item__header--active': isActive,
          'tx-collapse-item__header--disabled': disabled,
        })}
        disabled={disabled}
        aria-expanded={isActive}
        aria-controls={contentId}
        onClick={handleHeaderClick}
      >
        <span className="tx-collapse-item__title">{title}</span>
        <BuiltinIcon
          name={arrowIcon}
          className={cn('tx-collapse-item__arrow', {
            'tx-collapse-item__arrow--active': isActive,
          })}
          aria-hidden="true"
        />
      </button>

      {isActive && (
        <div id={contentId} className="tx-collapse-item__content">
          <div className="tx-collapse-item__content-inner">{children}</div>
        </div>
      )}
    </div>
  )
})
