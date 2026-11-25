import type { CSSProperties, HTMLAttributes, KeyboardEvent, ReactElement, ReactNode } from 'react'
import { hasDocument } from '@talex-touch/tuffex-core'
import { Children, createContext, forwardRef, isValidElement, useCallback, useContext, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useControllableState } from '../hooks/useControllableState'
import { allocateZIndex, useDismissableLayer } from '../hooks/useDismissableLayer'
import { useFloatingPosition } from '../hooks/useFloating'
import { cn, mergeRefs } from '../utils/cn'
import { TxInput } from './TxInput'
import { TxSpinner } from './TxSpinner'

export type TxSelectValue = string | number
export type TxSelectModelValue = TxSelectValue | TxSelectValue[]

export interface TxSelectOption {
  value: TxSelectValue
  label: string
  disabled?: boolean
  icon?: string
  description?: string
}

export interface TxSelectOptionGroup {
  label: string
  disabled?: boolean
  options: TxSelectOption[]
}

export type TxSelectOptionLike = TxSelectOption | TxSelectOptionGroup
export type TxSelectStatus = 'default' | 'error' | 'warning'

interface SelectContextValue {
  isValueSelected: (optionValue: TxSelectValue) => boolean
  selectOption: (value: TxSelectValue, label: string) => void
  searchQuery: string
}

const SelectContext = createContext<SelectContextValue | null>(null)

function isOptionGroup(opt: TxSelectOptionLike): opt is TxSelectOptionGroup {
  return Array.isArray((opt as TxSelectOptionGroup).options)
}

function flattenOptions(options: TxSelectOptionLike[]): TxSelectOption[] {
  const result: TxSelectOption[] = []
  for (const opt of options) {
    if (isOptionGroup(opt))
      result.push(...opt.options.map(item => ({ ...item, disabled: item.disabled || opt.disabled })))
    else
      result.push(opt)
  }
  return result
}

function isSelectValueEqual(a: TxSelectValue, b: unknown): boolean {
  if (a === b)
    return true
  if ((typeof a === 'string' || typeof a === 'number') && (typeof b === 'string' || typeof b === 'number')) {
    if (typeof a === 'string' && a.trim() === '')
      return false
    if (typeof b === 'string' && b.trim() === '')
      return false
    const na = Number(a)
    const nb = Number(b)
    if (Number.isFinite(na) && Number.isFinite(nb))
      return na === nb
  }
  return false
}

export interface TxSelectItemProps extends HTMLAttributes<HTMLDivElement> {
  value: TxSelectValue
  label?: string
  disabled?: boolean
  icon?: string
  description?: string
  children?: ReactNode
}

export const TxSelectItem = forwardRef<HTMLDivElement, TxSelectItemProps>((
  {
    value,
    label,
    disabled = false,
    icon,
    description,
    onClick,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const ctx = useContext(SelectContext)
  const resolvedLabel = label ?? (typeof children === 'string' || typeof children === 'number' ? String(children) : String(value))
  const isSelected = ctx?.isValueSelected(value) ?? false

  const query = (ctx?.searchQuery ?? '').trim().toLowerCase()
  if (query && !resolvedLabel.toLowerCase().includes(query))
    return null

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    onClick?.(event)
    if (disabled)
      return
    ctx?.selectOption(value, resolvedLabel)
  }

  return (
    <div
      ref={ref}
      role="option"
      tabIndex={-1}
      aria-selected={isSelected}
      aria-disabled={disabled || undefined}
      className={cn(
        'tuff-select-item',
        { 'is-selected': isSelected, 'is-disabled': disabled },
        className,
      )}
      onClick={handleClick}
      {...rest}
    >
      <div className="tuff-select-item__body">
        {icon && <i className={icon} aria-hidden="true" />}
        <span className="tuff-select-item__label">{children ?? resolvedLabel}</span>
        {description && <div className="tuff-select-item__desc">{description}</div>}
      </div>
      {isSelected && (
        <span className="tuff-select__check" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M10 15.172L19.192 5.979L20.607 7.393L10 18L3.636 11.636L5.05 10.222L10 15.172Z" />
          </svg>
        </span>
      )}
    </div>
  )
})
TxSelectItem.displayName = 'TxSelectItem'

export interface TxSelectProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'> {
  value?: TxSelectModelValue
  defaultValue?: TxSelectModelValue
  open?: boolean
  defaultOpen?: boolean
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  multiple?: boolean
  status?: TxSelectStatus
  options?: TxSelectOptionLike[]
  maxTagCount?: number
  maxTagTextLength?: number
  searchable?: boolean
  searchThreshold?: number
  searchPlaceholder?: string
  allowCreate?: boolean
  createText?: string
  loading?: boolean
  loadingText?: string
  emptyText?: string
  dropdownMaxHeight?: number
  dropdownOffset?: number
  onChange?: (value: TxSelectModelValue) => void
  onOpenChange?: (open: boolean) => void
  onSearch?: (query: string) => void
  onCreate?: (option: TxSelectOption) => void
}

function extractChildOptions(children: ReactNode): TxSelectOption[] {
  const result: TxSelectOption[] = []
  Children.forEach(children, (child) => {
    if (isValidElement<TxSelectItemProps>(child) && child.props && 'value' in child.props) {
      const { value, label, disabled, icon, description, children: inner } = child.props
      const resolvedLabel = label ?? (typeof inner === 'string' || typeof inner === 'number' ? String(inner) : String(value))
      result.push({ value, label: resolvedLabel, disabled, icon, description })
    }
  })
  return result
}

export const TxSelect = forwardRef<HTMLDivElement, TxSelectProps>((
  {
    value,
    defaultValue,
    open,
    defaultOpen = false,
    placeholder = 'Please select',
    disabled = false,
    readOnly = false,
    multiple = false,
    status = 'default',
    options = [],
    maxTagCount,
    maxTagTextLength,
    searchable,
    searchThreshold = 8,
    searchPlaceholder = 'Search',
    allowCreate = false,
    createText = 'Add item',
    loading = false,
    loadingText = 'Loading...',
    emptyText = 'No results',
    dropdownMaxHeight = 280,
    dropdownOffset = 6,
    onChange,
    onOpenChange,
    onSearch,
    onCreate,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const [currentValue, setCurrentValue] = useControllableState<TxSelectModelValue>({
    value,
    defaultValue: defaultValue ?? (multiple ? [] : ''),
    onChange,
  })

  const [isOpen, setIsOpen] = useControllableState({
    value: disabled || readOnly ? false : open,
    defaultValue: disabled || readOnly ? false : defaultOpen,
    onChange: onOpenChange,
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [createdOptions, setCreatedOptions] = useState<TxSelectOption[]>([])
  const listId = useId()
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const zIndexRef = useRef<number>(allocateZIndex())

  const hasPropOptions = options.length > 0
  const childOptions = useMemo(() => extractChildOptions(children), [children])
  const allOptions = useMemo<TxSelectOption[]>(() => {
    const base = hasPropOptions ? flattenOptions(options) : childOptions
    return [...base, ...createdOptions]
  }, [hasPropOptions, options, childOptions, createdOptions])

  const effectiveSearchable = searchable ?? (searchThreshold > 0 && allOptions.length >= searchThreshold)

  const isValueSelected = useCallback(
    (optionValue: TxSelectValue): boolean => {
      if (!multiple)
        return isSelectValueEqual(optionValue, currentValue)
      const arr = Array.isArray(currentValue) ? currentValue : []
      return arr.some(item => isSelectValueEqual(optionValue, item))
    },
    [multiple, currentValue],
  )

  const selectOption = useCallback(
    (optionValue: TxSelectValue, _label: string) => {
      if (disabled || readOnly)
        return
      if (!multiple) {
        setCurrentValue(optionValue)
        setIsOpen(false)
        setSearchQuery('')
        return
      }
      const arr = Array.isArray(currentValue) ? [...currentValue] : []
      const idx = arr.findIndex(item => isSelectValueEqual(optionValue, item))
      if (idx >= 0)
        arr.splice(idx, 1)
      else
        arr.push(optionValue)
      setCurrentValue(arr)
    },
    [disabled, readOnly, multiple, currentValue, setCurrentValue, setIsOpen],
  )

  const removeSelected = (optionValue: TxSelectValue) => {
    if (disabled || readOnly || !multiple)
      return
    const arr = Array.isArray(currentValue) ? currentValue : []
    setCurrentValue(arr.filter(item => !isSelectValueEqual(optionValue, item)))
  }

  const resolveLabel = (val: TxSelectValue): string => {
    const match = allOptions.find(opt => isSelectValueEqual(opt.value, val))
    return match ? match.label : String(val)
  }

  const selectedLabel = !multiple && currentValue !== '' && !Array.isArray(currentValue)
    ? resolveLabel(currentValue)
    : ''

  const selectedList = multiple && Array.isArray(currentValue)
    ? currentValue.map(v => ({ value: v, label: resolveLabel(v) }))
    : []

  const visibleSelected = typeof maxTagCount === 'number' && maxTagCount >= 0
    ? selectedList.slice(0, maxTagCount)
    : selectedList
  const hiddenCount = Math.max(0, selectedList.length - visibleSelected.length)

  const formatTag = (label: string) => {
    if (typeof maxTagTextLength === 'number' && maxTagTextLength > 0 && label.length > maxTagTextLength)
      return `${label.slice(0, maxTagTextLength)}...`
    return label
  }

  const queryLower = searchQuery.trim().toLowerCase()
  const filteredPropOptions = useMemo(() => {
    if (!hasPropOptions)
      return []
    const groups: Array<{ key: string, label?: string, options: TxSelectOption[] }> = []
    for (const opt of options) {
      if (isOptionGroup(opt)) {
        const list = opt.options
          .map(item => ({ ...item, disabled: item.disabled || opt.disabled }))
          .filter(item => !queryLower || item.label.toLowerCase().includes(queryLower))
        if (list.length)
          groups.push({ key: `group:${opt.label}`, label: opt.label, options: list })
      }
      else if (!queryLower || opt.label.toLowerCase().includes(queryLower)) {
        groups.push({ key: `opt:${String(opt.value)}`, options: [opt] })
      }
    }
    for (const extra of createdOptions) {
      if (!queryLower || extra.label.toLowerCase().includes(queryLower))
        groups.push({ key: `created:${String(extra.value)}`, options: [extra] })
    }
    return groups
  }, [hasPropOptions, options, createdOptions, queryLower])

  const visibleChildCount = !hasPropOptions
    ? childOptions.filter(opt => !queryLower || opt.label.toLowerCase().includes(queryLower)).length + createdOptions.length
    : 0
  const hasVisibleOptions = hasPropOptions
    ? filteredPropOptions.some(g => g.options.length > 0)
    : visibleChildCount > 0

  const canCreate = allowCreate && !disabled && searchQuery.trim().length > 0
    && !allOptions.some(opt => opt.label === searchQuery.trim() || isSelectValueEqual(opt.value, searchQuery.trim()))

  const handleCreate = () => {
    const label = searchQuery.trim()
    if (!label)
      return
    const created: TxSelectOption = { value: label, label }
    setCreatedOptions(prev => [...prev, created])
    onCreate?.(created)
    selectOption(created.value, created.label)
    setSearchQuery('')
  }

  useDismissableLayer({
    open: isOpen,
    onDismiss: () => setIsOpen(false),
    closeOnEscape: true,
    closeOnOutsideClick: true,
    containerRefs: [triggerRef, panelRef],
  })

  const floating = useFloatingPosition(triggerRef, panelRef, {
    open: isOpen,
    placement: 'bottom-start',
    offset: dropdownOffset,
    matchReferenceWidth: true,
  })

  const toggleOpen = () => {
    if (disabled || readOnly)
      return
    if (!isOpen)
      zIndexRef.current = allocateZIndex()
    setIsOpen(!isOpen)
  }

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (disabled || readOnly)
      return
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      if (!isOpen) {
        event.preventDefault()
        zIndexRef.current = allocateZIndex()
        setIsOpen(true)
      }
    }
    else if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      setIsOpen(false)
    }
  }

  const ctx = useMemo<SelectContextValue>(
    () => ({ isValueSelected, selectOption, searchQuery }),
    [isValueSelected, selectOption, searchQuery],
  )

  const panel = isOpen && hasDocument()
    ? createPortal(
        <div
          ref={panelRef}
          className="tx-floating-panel tuff-select__panel"
          style={{
            position: floating.strategy,
            left: `${floating.x}px`,
            top: `${floating.y}px`,
            zIndex: zIndexRef.current,
            maxHeight: `${dropdownMaxHeight}px`,
          } as CSSProperties}
        >
          {effectiveSearchable && (
            <div className="tuff-select__search">
              <TxInput
                value={searchQuery}
                placeholder={searchPlaceholder}
                clearable
                onChange={(val) => {
                  const s = String(val)
                  setSearchQuery(s)
                  onSearch?.(s)
                }}
              />
            </div>
          )}

          <div id={listId} className="tuff-select__list" role="listbox" aria-multiselectable={multiple || undefined}>
            {hasPropOptions
              ? filteredPropOptions.map(group => (
                  <div key={group.key}>
                    {group.label && <div className="tuff-select__group-label">{group.label}</div>}
                    {group.options.map(opt => (
                      <TxSelectItem
                        key={String(opt.value)}
                        value={opt.value}
                        label={opt.label}
                        disabled={opt.disabled}
                        icon={opt.icon}
                        description={opt.description}
                      />
                    ))}
                  </div>
                ))
              : (
                  <>
                    {children as ReactElement}
                    {createdOptions.map(opt => (
                      <TxSelectItem
                        key={`created:${String(opt.value)}`}
                        value={opt.value}
                        label={opt.label}
                      />
                    ))}
                  </>
                )}

            {loading
              ? (
                  <div className="tuff-select__status tuff-select__status--loading" role="status">
                    <TxSpinner size={14} />
                    <span>{loadingText}</span>
                  </div>
                )
              : !hasVisibleOptions
                  ? <div className="tuff-select__status">{emptyText}</div>
                  : null}
          </div>

          {canCreate && (
            <div className="tuff-select__footer">
              <button type="button" className="tuff-select__create" onClick={handleCreate}>
                <span aria-hidden="true">+</span>
                <span>{createText}</span>
              </button>
            </div>
          )}
        </div>,
        document.body,
      )
    : null

  return (
    <SelectContext.Provider value={ctx}>
      <div
        ref={mergeRefs(ref, triggerRef)}
        className={cn(
          'tuff-select',
          {
            'is-open': isOpen,
            'is-disabled': disabled,
            'is-status-error': status === 'error',
            'is-status-warning': status === 'warning',
          },
          className,
        )}
        style={style}
        {...rest}
      >
        <div className="tuff-select__trigger" onClick={toggleOpen}>
          {multiple
            ? (
                <div
                  className={cn('tuff-select__multi-trigger', { 'is-disabled': disabled, 'is-readonly': readOnly })}
                  role="combobox"
                  tabIndex={disabled ? -1 : 0}
                  aria-haspopup="listbox"
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? listId : undefined}
                  aria-readonly={readOnly || undefined}
                  onKeyDown={handleTriggerKeyDown}
                >
                  {selectedList.length > 0
                    ? (
                        <div className="tuff-select__tags">
                          {visibleSelected.map(opt => (
                            <span key={String(opt.value)} className="tuff-select__tag">
                              <span className="tuff-select__tag-label">{formatTag(opt.label)}</span>
                              {!disabled && !readOnly && (
                                <button
                                  type="button"
                                  className="tuff-select__tag-remove"
                                  aria-label="Remove selected option"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    removeSelected(opt.value)
                                  }}
                                >
                                  <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                                    <path fill="currentColor" d="M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95 1.414-1.414z" />
                                  </svg>
                                </button>
                              )}
                            </span>
                          ))}
                          {hiddenCount > 0 && (
                            <span className="tuff-select__tag tuff-select__tag--summary">
                              +
                              {hiddenCount}
                              {' '}
                              ...
                            </span>
                          )}
                        </div>
                      )
                    : <span className="tuff-select__placeholder">{placeholder}</span>}

                  <span className="tuff-select__arrow" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                      <path fill="currentColor" d="M12 4.9994L7.7573 9.242L9.1715 10.6563L12 7.8278L14.8284 10.6563L16.2426 9.242L12 4.9994ZM12 19.0006L7.7573 14.758L9.1715 13.3438L12 16.1722L14.8284 13.3438L16.2426 14.758L12 19.0006Z" />
                    </svg>
                  </span>
                </div>
              )
            : (
                <TxInput
                  value={selectedLabel}
                  placeholder={placeholder}
                  readOnly
                  disabled={disabled}
                  invalid={status === 'error'}
                  role="combobox"
                  aria-haspopup="listbox"
                  aria-expanded={isOpen}
                  aria-controls={isOpen ? listId : undefined}
                  onKeyDown={handleTriggerKeyDown}
                  suffix={(
                    <span className="tuff-select__arrow" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M12 4.9994L7.7573 9.242L9.1715 10.6563L12 7.8278L14.8284 10.6563L16.2426 9.242L12 4.9994ZM12 19.0006L7.7573 14.758L9.1715 13.3438L12 16.1722L14.8284 13.3438L16.2426 14.758L12 19.0006Z" />
                      </svg>
                    </span>
                  )}
                />
              )}
        </div>
      </div>
      {panel}
    </SelectContext.Provider>
  )
})
