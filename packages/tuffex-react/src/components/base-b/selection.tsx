import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent,
  ReactNode,
} from 'react'
import type { FloatingPlacement } from '../../hooks/useFloating'
import { hasDocument } from '@talex-touch/tuffex-core'
import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
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
import { cn, mergeRefs } from '../../utils/cn'
import { BuiltinIcon } from '../../utils/icons'
import { TxCheckbox } from '../TxCheckbox'
import { TxInput } from '../TxInput'
import { TxSpinner } from '../TxSpinner'

// ============================================================================
// 9. TxFlatRadio + TxFlatRadioItem (flat-radio)
// ============================================================================

export type TxFlatRadioValue = string | number
export type TxFlatRadioSize = 'sm' | 'md' | 'lg' | 'xl'

interface FlatRadioContextValue {
  multiple: boolean
  disabled: boolean
  size: TxFlatRadioSize
  isSelected: (value: TxFlatRadioValue) => boolean
  select: (value: TxFlatRadioValue) => void
}

const FlatRadioContext = createContext<FlatRadioContextValue | null>(null)

export interface TxFlatRadioProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: TxFlatRadioValue | TxFlatRadioValue[]
  defaultValue?: TxFlatRadioValue | TxFlatRadioValue[]
  multiple?: boolean
  disabled?: boolean
  size?: TxFlatRadioSize
  bordered?: boolean
  onChange?: (value: TxFlatRadioValue | TxFlatRadioValue[]) => void
}

export const TxFlatRadio = forwardRef<HTMLDivElement, TxFlatRadioProps>((
  {
    value,
    defaultValue,
    multiple = false,
    disabled = false,
    size = 'md',
    bordered = true,
    onChange,
    onKeyDown,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const [currentValue, setCurrentValue] = useControllableState<TxFlatRadioValue | TxFlatRadioValue[]>({
    value,
    defaultValue: defaultValue ?? (multiple ? [] : ''),
    onChange,
  })
  const groupRef = useRef<HTMLDivElement | null>(null)

  const isSelected = useCallback((val: TxFlatRadioValue) => {
    if (multiple)
      return Array.isArray(currentValue) && currentValue.includes(val)
    return currentValue === val
  }, [currentValue, multiple])

  const select = useCallback((val: TxFlatRadioValue) => {
    if (disabled)
      return
    if (!multiple) {
      setCurrentValue(val)
      return
    }
    const arr = Array.isArray(currentValue) ? [...currentValue] : []
    const idx = arr.indexOf(val)
    if (idx >= 0)
      arr.splice(idx, 1)
    else
      arr.push(val)
    setCurrentValue(arr)
  }, [currentValue, disabled, multiple, setCurrentValue])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (disabled || !groupRef.current)
      return
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
      return
    const items = Array.from(groupRef.current.querySelectorAll<HTMLButtonElement>('button.tx-flat-radio-item:not([disabled])'))
    if (items.length === 0)
      return
    const idx = items.findIndex(el => el === document.activeElement)
    const dir = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    const nextIdx = idx < 0 ? 0 : (idx + dir + items.length) % items.length
    const target = items[nextIdx]
    if (target) {
      event.preventDefault()
      target.focus()
      if (!multiple)
        target.click()
    }
  }

  const ctx = useMemo<FlatRadioContextValue>(
    () => ({ multiple, disabled, size, isSelected, select }),
    [disabled, isSelected, multiple, select, size],
  )

  return (
    <FlatRadioContext.Provider value={ctx}>
      <div
        ref={mergeRefs(ref, groupRef)}
        role={multiple ? 'listbox' : 'radiogroup'}
        aria-multiselectable={multiple || undefined}
        aria-disabled={disabled || undefined}
        className={cn(
          'tx-flat-radio',
          `tx-flat-radio--${size}`,
          { 'is-bordered': bordered, 'is-disabled': disabled, 'is-multiple': multiple },
          className,
        )}
        style={style}
        onKeyDown={handleKeyDown}
        {...rest}
      >
        {children}
      </div>
    </FlatRadioContext.Provider>
  )
})
TxFlatRadio.displayName = 'TxFlatRadio'

export interface TxFlatRadioItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'type'> {
  value: TxFlatRadioValue
  label?: ReactNode
  icon?: string
  disabled?: boolean
}

export const TxFlatRadioItem = forwardRef<HTMLButtonElement, TxFlatRadioItemProps>((
  {
    value,
    label,
    icon,
    disabled = false,
    onClick,
    className,
    children,
    ...rest
  },
  ref,
) => {
  const ctx = useContext(FlatRadioContext)
  const isDisabled = Boolean(ctx?.disabled) || disabled
  const isActive = ctx?.isSelected(value) ?? false
  const isMultiple = Boolean(ctx?.multiple)

  return (
    <button
      ref={ref}
      type="button"
      role={isMultiple ? 'option' : 'radio'}
      aria-checked={isMultiple ? undefined : isActive}
      aria-selected={isMultiple ? isActive : undefined}
      disabled={isDisabled}
      className={cn(
        'tx-flat-radio-item',
        { 'is-active': isActive, 'is-disabled': isDisabled },
        className,
      )}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented && !isDisabled)
          ctx?.select(value)
      }}
      {...rest}
    >
      {icon && <i className={cn('tx-flat-radio-item__icon', icon)} aria-hidden="true" />}
      <span className="tx-flat-radio-item__label">{children ?? label ?? String(value)}</span>
    </button>
  )
})
TxFlatRadioItem.displayName = 'TxFlatRadioItem'

// ============================================================================
// 10. TxFlatSelect + TxFlatSelectItem (flat-select)
// ============================================================================

export type TxFlatSelectValue = string | number

export interface TxFlatSelectOption {
  value: TxFlatSelectValue
  label: string
  disabled?: boolean
}

interface FlatSelectContextValue {
  currentValue: TxFlatSelectValue | undefined
  select: (value: TxFlatSelectValue, label: string) => void
}

const FlatSelectContext = createContext<FlatSelectContextValue | null>(null)

export interface TxFlatSelectItemProps extends HTMLAttributes<HTMLDivElement> {
  value: TxFlatSelectValue
  label?: string
  disabled?: boolean
}

export const TxFlatSelectItem = forwardRef<HTMLDivElement, TxFlatSelectItemProps>((
  { value, label, disabled = false, onClick, className, children, ...rest },
  ref,
) => {
  const ctx = useContext(FlatSelectContext)
  const resolvedLabel = label ?? (typeof children === 'string' || typeof children === 'number' ? String(children) : String(value))
  const isSelected = ctx?.currentValue === value

  return (
    <div
      ref={ref}
      role="option"
      tabIndex={-1}
      aria-selected={isSelected}
      aria-disabled={disabled || undefined}
      className={cn('tx-flat-select-item', { 'is-selected': isSelected, 'is-disabled': disabled }, className)}
      onClick={(e) => {
        onClick?.(e)
        if (!disabled)
          ctx?.select(value, resolvedLabel)
      }}
      {...rest}
    >
      <span className="tx-flat-select-item__label">{children ?? resolvedLabel}</span>
      {isSelected && <BuiltinIcon name="check" size={14} className="tx-flat-select-item__check" />}
    </div>
  )
})
TxFlatSelectItem.displayName = 'TxFlatSelectItem'

export interface TxFlatSelectProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: TxFlatSelectValue
  defaultValue?: TxFlatSelectValue
  options?: TxFlatSelectOption[]
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  ariaLabelledby?: string
  open?: boolean
  defaultOpen?: boolean
  onChange?: (value: TxFlatSelectValue) => void
  onOpenChange?: (open: boolean) => void
}

function collectFlatSelectLabels(children: ReactNode, options?: TxFlatSelectOption[]): Map<TxFlatSelectValue, string> {
  const map = new Map<TxFlatSelectValue, string>()
  if (options) {
    for (const opt of options)
      map.set(opt.value, opt.label)
  }
  Children.forEach(children, (child) => {
    if (isValidElement<TxFlatSelectItemProps>(child) && child.props && 'value' in child.props) {
      const { value, label, children: inner } = child.props
      const text = label ?? (typeof inner === 'string' || typeof inner === 'number' ? String(inner) : String(value))
      map.set(value, text)
    }
  })
  return map
}

export const TxFlatSelect = forwardRef<HTMLDivElement, TxFlatSelectProps>((
  {
    value,
    defaultValue,
    options,
    placeholder = 'Select...',
    disabled = false,
    ariaLabel,
    ariaLabelledby,
    open,
    defaultOpen = false,
    onChange,
    onOpenChange,
    className,
    style,
    children,
    ...rest
  },
  ref,
) => {
  const [currentValue, setCurrentValue] = useControllableState<TxFlatSelectValue | undefined>({
    value,
    defaultValue,
    onChange: (next) => {
      if (next !== undefined)
        onChange?.(next)
    },
  })
  const [isOpen, setIsOpen] = useControllableState({
    value: disabled ? false : open,
    defaultValue: disabled ? false : defaultOpen,
    onChange: onOpenChange,
  })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const zIndexRef = useRef(allocateZIndex())
  const listId = useId()

  const labelMap = useMemo(() => collectFlatSelectLabels(children, options), [children, options])
  const selectedLabel = currentValue !== undefined && currentValue !== ''
    ? (labelMap.get(currentValue) ?? String(currentValue))
    : ''

  useDismissableLayer({
    open: isOpen,
    onDismiss: () => setIsOpen(false),
    containerRefs: [triggerRef, panelRef],
  })

  const floating = useFloatingPosition(triggerRef, panelRef, {
    open: isOpen,
    placement: 'bottom-start',
    offset: 6,
    matchReferenceWidth: true,
  })

  const select = useCallback((nextVal: TxFlatSelectValue) => {
    if (disabled)
      return
    setCurrentValue(nextVal)
    setIsOpen(false)
  }, [disabled, setCurrentValue, setIsOpen])

  const ctx = useMemo<FlatSelectContextValue>(() => ({ currentValue, select }), [currentValue, select])

  return (
    <FlatSelectContext.Provider value={ctx}>
      <div
        ref={ref}
        className={cn('tx-flat-select', { 'is-open': isOpen, 'is-disabled': disabled }, className)}
        style={style}
        {...rest}
      >
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          disabled={disabled}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={isOpen ? listId : undefined}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledby}
          className="tx-flat-select__trigger"
          onClick={() => {
            if (disabled)
              return
            if (!isOpen)
              zIndexRef.current = allocateZIndex()
            setIsOpen(!isOpen)
          }}
        >
          <span className={cn('tx-flat-select__text', { 'is-placeholder': !selectedLabel })}>
            {selectedLabel || placeholder}
          </span>
          <BuiltinIcon name="chevron-down" size={14} className="tx-flat-select__arrow" />
        </button>

        {isOpen && hasDocument() && createPortal(
          <div
            ref={panelRef}
            id={listId}
            role="listbox"
            className="tx-floating-panel tx-flat-select__dropdown"
            style={{
              position: floating.strategy,
              left: `${floating.x}px`,
              top: `${floating.y}px`,
              zIndex: zIndexRef.current,
            } as CSSProperties}
          >
            {options && options.length > 0
              ? options.map(opt => (
                  <TxFlatSelectItem key={String(opt.value)} value={opt.value} label={opt.label} disabled={opt.disabled} />
                ))
              : children}
          </div>,
          document.body,
        )}
      </div>
    </FlatSelectContext.Provider>
  )
})
TxFlatSelect.displayName = 'TxFlatSelect'

// ============================================================================
// 11. TxSearchSelect (search-select)
// ============================================================================

export interface TxSearchSelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

export interface TxSearchSelectProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange' | 'onSelect'> {
  value?: string | number
  defaultValue?: string | number
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
  options?: TxSearchSelectOption[]
  loading?: boolean
  remote?: boolean
  searchDebounce?: number
  dropdownMaxHeight?: number
  dropdownOffset?: number
  emptyText?: string
  onChange?: (value: string | number) => void
  onSearch?: (query: string) => void
  onSelect?: (option: TxSearchSelectOption) => void
  onOpen?: () => void
  onClose?: () => void
}

export const TxSearchSelect = forwardRef<HTMLDivElement, TxSearchSelectProps>((
  {
    value,
    defaultValue = '',
    placeholder = 'Search and select...',
    disabled = false,
    clearable = true,
    options = [],
    loading = false,
    remote = false,
    searchDebounce = 200,
    dropdownMaxHeight = 260,
    dropdownOffset = 6,
    emptyText = 'No matches',
    onChange,
    onSearch,
    onSelect,
    onOpen,
    onClose,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [selectedValue, setSelectedValue] = useControllableState<string | number>({
    value,
    defaultValue,
    onChange,
  })
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [isEditingQuery, setIsEditingQuery] = useState(false)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const zIndexRef = useRef(allocateZIndex())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listId = useId()

  useEffect(() => () => {
    if (timerRef.current !== null)
      clearTimeout(timerRef.current)
  }, [])

  const setOpenWithEvents = useCallback((next: boolean) => {
    setOpen((prev) => {
      if (prev === next)
        return prev
      if (next) {
        zIndexRef.current = allocateZIndex()
        onOpen?.()
      }
      else {
        setIsEditingQuery(false)
        onClose?.()
      }
      return next
    })
  }, [onClose, onOpen])

  useDismissableLayer({
    open,
    onDismiss: () => setOpenWithEvents(false),
    containerRefs: [triggerRef, panelRef],
  })

  const floating = useFloatingPosition(triggerRef, panelRef, {
    open,
    placement: 'bottom-start',
    offset: dropdownOffset,
    matchReferenceWidth: true,
  })

  const selectedOption = useMemo(
    () => options.find(opt => opt.value === selectedValue),
    [options, selectedValue],
  )

  const filteredOptions = useMemo(() => {
    if (remote)
      return options
    const q = query.trim().toLowerCase()
    if (!q || !isEditingQuery)
      return options
    return options.filter(opt => opt.label.toLowerCase().includes(q))
  }, [isEditingQuery, options, query, remote])

  const displayInput = isEditingQuery ? query : (selectedOption?.label ?? (selectedValue !== '' ? String(selectedValue) : ''))

  const triggerSearch = (text: string) => {
    if (timerRef.current !== null)
      clearTimeout(timerRef.current)
    if (searchDebounce > 0 && remote) {
      timerRef.current = setTimeout(() => onSearch?.(text), searchDebounce)
    }
    else {
      onSearch?.(text)
    }
  }

  return (
    <div
      ref={mergeRefs(ref, triggerRef)}
      className={cn('tx-search-select', { 'is-open': open, 'is-disabled': disabled }, className)}
      style={style}
      {...rest}
    >
      <div className="tx-search-select__reference">
        <TxInput
          value={displayInput}
          placeholder={placeholder}
          disabled={disabled}
          clearable={clearable}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          prefix={<BuiltinIcon name="search" size={14} className="tx-search-select__icon" />}
          suffix={loading ? <TxSpinner size={14} className="tx-search-select__loading" /> : undefined}
          onFocus={() => {
            if (!disabled) {
              setIsEditingQuery(true)
              setQuery(selectedOption?.label ?? '')
              setOpenWithEvents(true)
            }
          }}
          onChange={(val) => {
            const text = String(val)
            setIsEditingQuery(true)
            setQuery(text)
            setOpenWithEvents(true)
            triggerSearch(text)
          }}
          onClear={() => {
            setQuery('')
            setIsEditingQuery(false)
            setSelectedValue('')
            onSearch?.('')
          }}
        />
      </div>

      {open && hasDocument() && createPortal(
        <div
          ref={panelRef}
          className="tx-floating-panel tx-search-select__panel"
          style={{
            position: floating.strategy,
            left: `${floating.x}px`,
            top: `${floating.y}px`,
            zIndex: zIndexRef.current,
            maxHeight: `${dropdownMaxHeight}px`,
          } as CSSProperties}
        >
          <div id={listId} role="listbox" className="tx-search-select__list">
            {loading
              ? (
                  <div className="tx-search-select__empty" role="status">
                    <TxSpinner size={14} />
                    <span>Loading...</span>
                  </div>
                )
              : filteredOptions.length === 0
                ? <div className="tx-search-select__empty">{emptyText}</div>
                : filteredOptions.map((opt) => {
                    const isSelected = opt.value === selectedValue
                    return (
                      <button
                        key={String(opt.value)}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={opt.disabled}
                        className={cn('tx-search-select__item', {
                          'is-selected': isSelected,
                          'is-disabled': opt.disabled,
                        })}
                        onClick={() => {
                          if (opt.disabled)
                            return
                          setSelectedValue(opt.value)
                          setIsEditingQuery(false)
                          setQuery(opt.label)
                          onSelect?.(opt)
                          setOpenWithEvents(false)
                        }}
                      >
                        <span className="tx-search-select__item-label">{opt.label}</span>
                        {isSelected && <BuiltinIcon name="check" size={14} />}
                      </button>
                    )
                  })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
})
TxSearchSelect.displayName = 'TxSearchSelect'

// ============================================================================
// 12. TxCascader (cascader)
// ============================================================================

export type TxCascaderKey = string | number
export type TxCascaderPath = TxCascaderKey[]
export type TxCascaderValue = TxCascaderPath | TxCascaderPath[] | undefined

export interface TxCascaderNode {
  value: TxCascaderKey
  label: string
  disabled?: boolean
  leaf?: boolean
  children?: TxCascaderNode[]
}

export interface TxCascaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: TxCascaderValue
  defaultValue?: TxCascaderValue
  options?: TxCascaderNode[]
  multiple?: boolean
  disabled?: boolean
  placeholder?: string
  searchable?: boolean
  clearable?: boolean
  placement?: FloatingPlacement
  dropdownOffset?: number
  dropdownMaxHeight?: number
  expandTrigger?: 'click' | 'hover' | 'both'
  load?: (node: TxCascaderNode | null, level: number) => Promise<TxCascaderNode[]>
  onChange?: (value: TxCascaderValue) => void
  onOpen?: () => void
  onClose?: () => void
  onLoadError?: (payload: { path: TxCascaderPath, error: unknown }) => void
}

function pathKey(path: TxCascaderPath): string {
  return path.map(String).join('\u0000')
}

function collectCascaderLeafPaths(
  nodes: TxCascaderNode[],
  prefixValues: TxCascaderPath = [],
  prefixLabels: string[] = [],
): Array<{ path: TxCascaderPath, labels: string[], disabled: boolean }> {
  const results: Array<{ path: TxCascaderPath, labels: string[], disabled: boolean }> = []
  for (const node of nodes) {
    const nextPath = [...prefixValues, node.value]
    const nextLabels = [...prefixLabels, node.label]
    if (node.children && node.children.length > 0) {
      results.push(...collectCascaderLeafPaths(node.children, nextPath, nextLabels))
    }
    else {
      results.push({ path: nextPath, labels: nextLabels, disabled: Boolean(node.disabled) })
    }
  }
  return results
}

function resolveCascaderLabels(nodes: TxCascaderNode[], path: TxCascaderPath): string[] {
  const labels: string[] = []
  let current = nodes
  for (const key of path) {
    const found = current.find(n => n.value === key)
    if (!found) {
      labels.push(String(key))
      break
    }
    labels.push(found.label)
    current = found.children ?? []
  }
  return labels
}

export const TxCascader = forwardRef<HTMLDivElement, TxCascaderProps>((
  {
    value,
    defaultValue,
    options = [],
    multiple = false,
    disabled = false,
    placeholder = 'Please select',
    searchable = false,
    clearable = false,
    placement = 'bottom-start',
    dropdownOffset = 6,
    dropdownMaxHeight = 280,
    expandTrigger = 'click',
    load,
    onChange,
    onOpen,
    onClose,
    onLoadError,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [currentValue, setCurrentValue] = useControllableState<TxCascaderValue>({
    value,
    defaultValue: defaultValue ?? (multiple ? [] : undefined),
    onChange,
  })
  const [open, setOpen] = useState(false)
  const [activePath, setActivePath] = useState<TxCascaderPath>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loadedMap, setLoadedMap] = useState<Record<string, TxCascaderNode[]>>({})
  const [loadingKeys, setLoadingKeys] = useState<Record<string, boolean>>({})

  const triggerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const zIndexRef = useRef(allocateZIndex())

  const setOpenState = useCallback((next: boolean) => {
    setOpen((prev) => {
      if (prev === next)
        return prev
      if (next) {
        zIndexRef.current = allocateZIndex()
        onOpen?.()
      }
      else {
        setSearchQuery('')
        onClose?.()
      }
      return next
    })
  }, [onClose, onOpen])

  useDismissableLayer({
    open,
    onDismiss: () => setOpenState(false),
    containerRefs: [triggerRef, panelRef],
  })

  const floating = useFloatingPosition(triggerRef, panelRef, {
    open,
    placement,
    offset: dropdownOffset,
  })

  const getChildren = useCallback((node: TxCascaderNode, path: TxCascaderPath): TxCascaderNode[] | undefined => {
    if (node.children)
      return node.children
    return loadedMap[pathKey(path)]
  }, [loadedMap])

  const columns = useMemo<TxCascaderNode[][]>(() => {
    const cols: TxCascaderNode[][] = [options]
    let currentList = options
    const prefix: TxCascaderPath = []
    for (const key of activePath) {
      const node = currentList.find(n => n.value === key)
      if (!node)
        break
      prefix.push(node.value)
      const kids = getChildren(node, prefix)
      if (kids && kids.length > 0) {
        cols.push(kids)
        currentList = kids
      }
      else {
        break
      }
    }
    return cols
  }, [activePath, getChildren, options])

  const selectedPaths: TxCascaderPath[] = useMemo(() => {
    if (!currentValue)
      return []
    if (multiple)
      return Array.isArray(currentValue[0]) ? (currentValue as TxCascaderPath[]) : []
    return Array.isArray(currentValue) && currentValue.length > 0 && !Array.isArray(currentValue[0])
      ? [currentValue as TxCascaderPath]
      : []
  }, [currentValue, multiple])

  const isPathSelected = useCallback((path: TxCascaderPath) => {
    const targetKey = pathKey(path)
    return selectedPaths.some(p => pathKey(p) === targetKey)
  }, [selectedPaths])

  const commitPath = useCallback((path: TxCascaderPath) => {
    if (disabled)
      return
    if (!multiple) {
      setCurrentValue(path)
      setOpenState(false)
      return
    }
    const targetKey = pathKey(path)
    const exists = selectedPaths.some(p => pathKey(p) === targetKey)
    const next = exists
      ? selectedPaths.filter(p => pathKey(p) !== targetKey)
      : [...selectedPaths, path]
    setCurrentValue(next)
  }, [disabled, multiple, selectedPaths, setCurrentValue, setOpenState])

  const expandNode = useCallback(async (node: TxCascaderNode, level: number) => {
    if (node.disabled)
      return
    const nextPath = [...activePath.slice(0, level), node.value]
    setActivePath(nextPath)
    const existingChildren = getChildren(node, nextPath)
    if (!existingChildren && !node.leaf && load) {
      const key = pathKey(nextPath)
      if (loadingKeys[key])
        return
      setLoadingKeys(prev => ({ ...prev, [key]: true }))
      try {
        const children = await load(node, level + 1)
        setLoadedMap(prev => ({ ...prev, [key]: children }))
      }
      catch (error) {
        onLoadError?.({ path: nextPath, error })
      }
      finally {
        setLoadingKeys(prev => ({ ...prev, [key]: false }))
      }
    }
  }, [activePath, getChildren, load, loadingKeys, onLoadError])

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!searchable || !q)
      return []
    return collectCascaderLeafPaths(options).filter(item =>
      item.labels.join(' / ').toLowerCase().includes(q),
    )
  }, [options, searchQuery, searchable])

  const hasValue = selectedPaths.length > 0

  return (
    <div
      ref={mergeRefs(ref, triggerRef)}
      className={cn('tx-cascader', { 'is-open': open, 'is-disabled': disabled }, className)}
      style={style}
      {...rest}
    >
      <div
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-disabled={disabled || undefined}
        className="tx-cascader__value"
        onClick={() => {
          if (!disabled)
            setOpenState(!open)
        }}
        onKeyDown={(e) => {
          if (disabled)
            return
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault()
            setOpenState(true)
          }
        }}
      >
        {!hasValue
          ? <span className="tx-cascader__placeholder">{placeholder}</span>
          : multiple
            ? (
                <div className="tx-cascader__tags">
                  {selectedPaths.map(p => (
                    <span key={pathKey(p)} className="tx-cascader__tag">
                      {resolveCascaderLabels(options, p).join(' / ')}
                    </span>
                  ))}
                </div>
              )
            : <span className="tx-cascader__text">{resolveCascaderLabels(options, selectedPaths[0]!).join(' / ')}</span>}

        {clearable && hasValue && !disabled && (
          <button
            type="button"
            className="tx-cascader__clear"
            aria-label="Clear selection"
            onClick={(e) => {
              e.stopPropagation()
              setCurrentValue(multiple ? [] : undefined)
              setActivePath([])
            }}
          >
            <BuiltinIcon name="close" size={12} />
          </button>
        )}
        <BuiltinIcon name="chevron-down" size={14} className="tx-cascader__arrow" />
      </div>

      {open && hasDocument() && createPortal(
        <div
          ref={panelRef}
          className="tx-floating-panel tx-cascader__panel"
          style={{
            position: floating.strategy,
            left: `${floating.x}px`,
            top: `${floating.y}px`,
            zIndex: zIndexRef.current,
            maxHeight: `${dropdownMaxHeight}px`,
          } as CSSProperties}
        >
          {searchable && (
            <div className="tx-cascader__search">
              <TxInput
                value={searchQuery}
                placeholder="Filter..."
                clearable
                onChange={v => setSearchQuery(String(v))}
              />
            </div>
          )}

          {searchable && searchQuery.trim()
            ? (
                <div className="tx-cascader__search-list" role="listbox">
                  {searchMatches.length === 0
                    ? <div className="tx-cascader__empty">No matches</div>
                    : searchMatches.map(match => (
                        <button
                          key={pathKey(match.path)}
                          type="button"
                          role="option"
                          aria-selected={isPathSelected(match.path)}
                          disabled={match.disabled}
                          className={cn('tx-cascader__search-item', { 'is-selected': isPathSelected(match.path) })}
                          onClick={() => commitPath(match.path)}
                        >
                          <span className="tx-cascader__search-label">{match.labels.join(' / ')}</span>
                        </button>
                      ))}
                </div>
              )
            : (
                <div className="tx-cascader__columns" role="listbox">
                  {columns.map((col, level) => (
                    <div key={level} className="tx-cascader__column">
                      {col.map((node) => {
                        const nodePath = [...activePath.slice(0, level), node.value]
                        const kids = getChildren(node, nodePath)
                        const hasChildren = Boolean((kids && kids.length > 0) || (!node.leaf && load))
                        const isActive = activePath[level] === node.value
                        const isSelected = isPathSelected(nodePath)
                        const isLoadingNode = Boolean(loadingKeys[pathKey(nodePath)])

                        return (
                          <button
                            key={String(node.value)}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            disabled={node.disabled}
                            className={cn('tx-cascader__option', {
                              'is-active': isActive,
                              'is-selected': isSelected,
                              'is-disabled': node.disabled,
                            })}
                            onMouseEnter={() => {
                              if ((expandTrigger === 'hover' || expandTrigger === 'both') && hasChildren)
                                void expandNode(node, level)
                            }}
                            onClick={() => {
                              if (node.disabled)
                                return
                              if (hasChildren)
                                void expandNode(node, level)
                              else
                                commitPath(nodePath)
                            }}
                          >
                            <span className="tx-cascader__option-label">{node.label}</span>
                            {isLoadingNode
                              ? <TxSpinner size={12} />
                              : hasChildren
                                ? <span className="tx-cascader__option-arrow" aria-hidden="true">›</span>
                                : isSelected
                                  ? <BuiltinIcon name="check" size={14} />
                                  : null}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
        </div>,
        document.body,
      )}
    </div>
  )
})
TxCascader.displayName = 'TxCascader'

// ============================================================================
// 13. TxTree (tree)
// ============================================================================

export type TxTreeKey = string | number

export interface TxTreeNode {
  key: TxTreeKey
  label: string
  children?: TxTreeNode[]
  leaf?: boolean
  disabled?: boolean
  icon?: string
}

export type TxTreeValue = TxTreeKey | TxTreeKey[]

export interface TxTreeNodeRenderContext {
  node: TxTreeNode
  level: number
  expanded: boolean
  selected: boolean
  hasChildren: boolean
  toggle: () => void
  select: () => void
}

export interface TxTreeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange' | 'onSelect' | 'onToggle'> {
  nodes?: TxTreeNode[]
  value?: TxTreeValue
  defaultValue?: TxTreeValue
  defaultSelectedKeys?: TxTreeKey[]
  expandedKeys?: TxTreeKey[]
  defaultExpandedKeys?: TxTreeKey[]
  multiple?: boolean
  selectable?: boolean
  checkable?: boolean
  disabled?: boolean
  indent?: number
  filterText?: string
  filterMethod?: (node: TxTreeNode, query: string) => boolean
  emptyText?: string
  expandLabel?: string
  collapseLabel?: string
  selectLabel?: string
  renderNode?: (context: TxTreeNodeRenderContext) => ReactNode
  onChange?: (value: TxTreeValue) => void
  onSelect?: (payload: { key: TxTreeKey, node: TxTreeNode }) => void
  onToggle?: (payload: { key: TxTreeKey, expanded: boolean }) => void
  onExpandedKeysChange?: (keys: TxTreeKey[]) => void
}

function filterTreeNodes(
  nodes: TxTreeNode[],
  query: string,
  predicate: (node: TxTreeNode, q: string) => boolean,
): TxTreeNode[] {
  const result: TxTreeNode[] = []
  for (const node of nodes) {
    const filteredChildren = node.children ? filterTreeNodes(node.children, query, predicate) : []
    if (predicate(node, query) || filteredChildren.length > 0) {
      result.push({
        ...node,
        ...(node.children ? { children: filteredChildren } : {}),
      })
    }
  }
  return result
}

export const TxTree = forwardRef<HTMLDivElement, TxTreeProps>((
  {
    nodes = [],
    value,
    defaultValue,
    defaultSelectedKeys,
    expandedKeys,
    defaultExpandedKeys = [],
    multiple = false,
    selectable = true,
    checkable = false,
    disabled = false,
    indent = 18,
    filterText = '',
    filterMethod,
    emptyText = 'No results',
    expandLabel = 'Expand',
    collapseLabel = 'Collapse',
    selectLabel = 'Select',
    renderNode,
    onChange,
    onSelect,
    onToggle,
    onExpandedKeysChange,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const initialSelected: TxTreeValue = defaultValue
    ?? (defaultSelectedKeys
      ? (multiple || checkable ? defaultSelectedKeys : (defaultSelectedKeys[0] ?? ''))
      : (multiple || checkable ? [] : ''))

  const [selectedValue, setSelectedValue] = useControllableState<TxTreeValue>({
    value,
    defaultValue: initialSelected,
    onChange,
  })

  const [currentExpanded, setCurrentExpanded] = useControllableState<TxTreeKey[]>({
    value: expandedKeys,
    defaultValue: defaultExpandedKeys,
    onChange: onExpandedKeysChange,
  })

  const isMultiMode = multiple || checkable
  const selectedSet = useMemo(() => {
    if (Array.isArray(selectedValue))
      return new Set<TxTreeKey>(selectedValue)
    return selectedValue !== '' && selectedValue !== undefined ? new Set<TxTreeKey>([selectedValue]) : new Set<TxTreeKey>()
  }, [selectedValue])

  const expandedSet = useMemo(() => new Set<TxTreeKey>(currentExpanded), [currentExpanded])

  const visibleNodes = useMemo(() => {
    const q = filterText.trim()
    if (!q)
      return nodes
    const matcher = filterMethod ?? ((n: TxTreeNode, text: string) => n.label.toLowerCase().includes(text.toLowerCase()))
    return filterTreeNodes(nodes, q, matcher)
  }, [filterMethod, filterText, nodes])

  const toggleNode = useCallback((key: TxTreeKey) => {
    const isExpanded = expandedSet.has(key)
    const next = isExpanded
      ? currentExpanded.filter(k => k !== key)
      : [...currentExpanded, key]
    setCurrentExpanded(next)
    onToggle?.({ key, expanded: !isExpanded })
  }, [currentExpanded, expandedSet, onToggle, setCurrentExpanded])

  const selectNode = useCallback((node: TxTreeNode) => {
    if (disabled || node.disabled || (!selectable && !checkable))
      return
    if (isMultiMode) {
      const list = Array.isArray(selectedValue) ? [...selectedValue] : []
      const idx = list.indexOf(node.key)
      if (idx >= 0)
        list.splice(idx, 1)
      else
        list.push(node.key)
      setSelectedValue(list)
    }
    else {
      setSelectedValue(node.key)
    }
    onSelect?.({ key: node.key, node })
  }, [checkable, disabled, isMultiMode, onSelect, selectable, selectedValue, setSelectedValue])

  const renderBranch = (list: TxTreeNode[], level: number): ReactNode => (
    <ul role={level === 0 ? 'tree' : 'group'} className="tx-tree__list">
      {list.map((node) => {
        const hasChildren = Boolean(node.children && node.children.length > 0)
        const isExpanded = expandedSet.has(node.key) || Boolean(filterText.trim() && hasChildren)
        const isSelected = selectedSet.has(node.key)
        const isNodeDisabled = disabled || Boolean(node.disabled)

        return (
          <li
            key={String(node.key)}
            role="treeitem"
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-selected={isSelected}
            aria-disabled={isNodeDisabled || undefined}
            className="tx-tree__item"
          >
            <div
              className={cn('tx-tree__row', {
                'is-selected': isSelected,
                'is-disabled': isNodeDisabled,
                'is-expanded': isExpanded,
              })}
              style={{ paddingLeft: `${level * indent}px` }}
            >
              {hasChildren
                ? (
                    <button
                      type="button"
                      className={cn('tx-tree__caret', { 'is-expanded': isExpanded })}
                      aria-label={isExpanded ? collapseLabel : expandLabel}
                      onClick={() => toggleNode(node.key)}
                    >
                      <BuiltinIcon name="chevron-down" size={12} />
                    </button>
                  )
                : <span className="tx-tree__caret-placeholder" aria-hidden="true" />}

              {checkable && (
                <TxCheckbox
                  checked={isSelected}
                  disabled={isNodeDisabled}
                  ariaLabel={`${selectLabel} ${node.label}`}
                  onChange={() => selectNode(node)}
                />
              )}

              {renderNode
                ? renderNode({
                    node,
                    level,
                    expanded: isExpanded,
                    selected: isSelected,
                    hasChildren,
                    toggle: () => toggleNode(node.key),
                    select: () => selectNode(node),
                  })
                : (
                    <button
                      type="button"
                      className="tx-tree__label"
                      disabled={isNodeDisabled}
                      onClick={() => selectNode(node)}
                    >
                      {node.icon && <i className={cn('tx-tree__icon', node.icon)} aria-hidden="true" />}
                      <span>{node.label}</span>
                    </button>
                  )}
            </div>

            {hasChildren && isExpanded && renderBranch(node.children!, level + 1)}
          </li>
        )
      })}
    </ul>
  )

  return (
    <div
      ref={ref}
      className={cn('tx-tree', { 'is-disabled': disabled }, className)}
      style={style}
      {...rest}
    >
      {visibleNodes.length === 0
        ? <div className="tx-tree__empty">{emptyText}</div>
        : renderBranch(visibleNodes, 0)}
    </div>
  )
})
TxTree.displayName = 'TxTree'

// ============================================================================
// 14. TxTreeSelect (tree-select)
// ============================================================================

export type TxTreeSelectKey = TxTreeKey
export type TxTreeSelectNode = TxTreeNode
export type TxTreeSelectValue = TxTreeSelectKey | TxTreeSelectKey[] | undefined

export interface TxTreeSelectProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: TxTreeSelectValue
  defaultValue?: TxTreeSelectValue
  nodes?: TxTreeSelectNode[]
  multiple?: boolean
  disabled?: boolean
  placeholder?: string
  searchable?: boolean
  clearable?: boolean
  placement?: FloatingPlacement
  dropdownOffset?: number
  dropdownWidth?: number
  dropdownMaxWidth?: number
  dropdownMaxHeight?: number
  defaultExpandedKeys?: TxTreeSelectKey[]
  onChange?: (value: TxTreeSelectValue) => void
  onOpen?: () => void
  onClose?: () => void
}

function indexTreeLabels(nodes: TxTreeSelectNode[], map = new Map<TxTreeSelectKey, string>()): Map<TxTreeSelectKey, string> {
  for (const n of nodes) {
    map.set(n.key, n.label)
    if (n.children)
      indexTreeLabels(n.children, map)
  }
  return map
}

export const TxTreeSelect = forwardRef<HTMLDivElement, TxTreeSelectProps>((
  {
    value,
    defaultValue,
    nodes = [],
    multiple = false,
    disabled = false,
    placeholder = 'Select node',
    searchable = false,
    clearable = false,
    placement = 'bottom-start',
    dropdownOffset = 6,
    dropdownWidth,
    dropdownMaxWidth,
    dropdownMaxHeight = 280,
    defaultExpandedKeys = [],
    onChange,
    onOpen,
    onClose,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [currentValue, setCurrentValue] = useControllableState<TxTreeSelectValue>({
    value,
    defaultValue: defaultValue ?? (multiple ? [] : undefined),
    onChange,
  })
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const zIndexRef = useRef(allocateZIndex())

  const setOpenState = useCallback((next: boolean) => {
    setOpen((prev) => {
      if (prev === next)
        return prev
      if (next) {
        zIndexRef.current = allocateZIndex()
        onOpen?.()
      }
      else {
        setSearchQuery('')
        onClose?.()
      }
      return next
    })
  }, [onClose, onOpen])

  useDismissableLayer({
    open,
    onDismiss: () => setOpenState(false),
    containerRefs: [triggerRef, panelRef],
  })

  const floating = useFloatingPosition(triggerRef, panelRef, {
    open,
    placement,
    offset: dropdownOffset,
    matchReferenceWidth: !dropdownWidth,
  })

  const labelsMap = useMemo(() => indexTreeLabels(nodes), [nodes])
  const selectedKeys: TxTreeSelectKey[] = useMemo(() => {
    if (currentValue === undefined || currentValue === '')
      return []
    return Array.isArray(currentValue) ? currentValue : [currentValue]
  }, [currentValue])

  const hasValue = selectedKeys.length > 0

  return (
    <div
      ref={mergeRefs(ref, triggerRef)}
      className={cn('tx-tree-select', { 'is-open': open, 'is-disabled': disabled }, className)}
      style={style}
      {...rest}
    >
      <div
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-expanded={open}
        aria-haspopup="tree"
        aria-disabled={disabled || undefined}
        className="tx-tree-select__value"
        onClick={() => {
          if (!disabled)
            setOpenState(!open)
        }}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown')) {
            e.preventDefault()
            setOpenState(true)
          }
        }}
      >
        {!hasValue
          ? <span className="tx-tree-select__placeholder">{placeholder}</span>
          : multiple
            ? (
                <div className="tx-tree-select__tags">
                  {selectedKeys.map(k => (
                    <span key={String(k)} className="tx-tree-select__tag">{labelsMap.get(k) ?? String(k)}</span>
                  ))}
                </div>
              )
            : <span className="tx-tree-select__text">{labelsMap.get(selectedKeys[0]!) ?? String(selectedKeys[0])}</span>}

        {clearable && hasValue && !disabled && (
          <button
            type="button"
            className="tx-tree-select__clear"
            aria-label="Clear selection"
            onClick={(e) => {
              e.stopPropagation()
              setCurrentValue(multiple ? [] : undefined)
            }}
          >
            <BuiltinIcon name="close" size={12} />
          </button>
        )}
        <BuiltinIcon name="chevron-down" size={14} className="tx-tree-select__arrow" />
      </div>

      {open && hasDocument() && createPortal(
        <div
          ref={panelRef}
          className="tx-floating-panel tx-tree-select__panel"
          style={{
            position: floating.strategy,
            left: `${floating.x}px`,
            top: `${floating.y}px`,
            zIndex: zIndexRef.current,
            width: dropdownWidth ? `${dropdownWidth}px` : undefined,
            maxWidth: dropdownMaxWidth ? `${dropdownMaxWidth}px` : undefined,
            maxHeight: `${dropdownMaxHeight}px`,
          } as CSSProperties}
        >
          {searchable && (
            <div className="tx-tree-select__search">
              <TxInput
                value={searchQuery}
                placeholder="Search tree..."
                clearable
                onChange={v => setSearchQuery(String(v))}
              />
            </div>
          )}
          <TxTree
            nodes={nodes}
            value={currentValue ?? (multiple ? [] : '')}
            multiple={multiple}
            checkable={multiple}
            defaultExpandedKeys={defaultExpandedKeys}
            filterText={searchQuery}
            onChange={(next) => {
              setCurrentValue(next)
              if (!multiple)
                setOpenState(false)
            }}
          />
        </div>,
        document.body,
      )}
    </div>
  )
})
TxTreeSelect.displayName = 'TxTreeSelect'

// ============================================================================
// 15. TxDatePicker (date-picker)
// ============================================================================

export type TxDatePickerVariant = 'picker' | 'field' | 'adaptive'
export type TxDateRangeValue = [string, string]
export type TxDatePickerValue = string | TxDateRangeValue

export interface TxDatePickerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: TxDatePickerValue
  defaultValue?: TxDatePickerValue
  open?: boolean
  visible?: boolean
  defaultOpen?: boolean
  popup?: boolean
  variant?: TxDatePickerVariant
  title?: string
  placeholder?: string
  min?: string
  max?: string
  disabled?: boolean
  showToolbar?: boolean
  confirmText?: string
  cancelText?: string
  closeOnClickMask?: boolean
  weekStartsOn?: 0 | 1
  range?: boolean
  rangeSeparator?: string
  onChange?: (value: TxDatePickerValue) => void
  onOpenChange?: (open: boolean) => void
  onConfirm?: (value: TxDatePickerValue) => void
  onCancel?: () => void
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDateIso(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`
}

function parseIsoDate(iso: string | undefined): { year: number, month: number, day: number } | null {
  if (!iso || typeof iso !== 'string')
    return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!match)
    return null
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  }
}

const WEEKDAY_LABELS_SUN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const WEEKDAY_LABELS_MON = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const TxDatePicker = forwardRef<HTMLDivElement, TxDatePickerProps>((
  {
    value,
    defaultValue,
    open,
    visible,
    defaultOpen = false,
    popup = false,
    variant = 'field',
    title = 'Select date',
    placeholder = 'Select date',
    min,
    max,
    disabled = false,
    showToolbar = false,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    closeOnClickMask = true,
    weekStartsOn = 0,
    range = false,
    rangeSeparator = ' – ',
    onChange,
    onOpenChange,
    onConfirm,
    onCancel,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const [currentValue, setCurrentValue] = useControllableState<TxDatePickerValue>({
    value,
    defaultValue: defaultValue ?? (range ? ['', ''] : ''),
    onChange,
  })
  const [isOpen, setIsOpen] = useControllableState({
    value: disabled ? false : (open ?? visible),
    defaultValue: disabled ? false : defaultOpen,
    onChange: onOpenChange,
  })

  const seedIso = Array.isArray(currentValue) ? currentValue[0] : currentValue
  const seed = parseIsoDate(seedIso) ?? { year: 2026, month: 0, day: 1 }
  const [viewYear, setViewYear] = useState(seed.year)
  const [viewMonth, setViewMonth] = useState(seed.month)
  const [pendingStart, setPendingStart] = useState<string | null>(null)

  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const zIndexRef = useRef(allocateZIndex())

  useDismissableLayer({
    open: isOpen && variant !== 'picker' && !popup,
    onDismiss: () => setIsOpen(false),
    containerRefs: [triggerRef, panelRef],
  })

  const floating = useFloatingPosition(triggerRef, panelRef, {
    open: isOpen && variant !== 'picker' && !popup,
    placement: 'bottom-start',
    offset: 6,
  })

  const days = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()
    const offset = weekStartsOn === 1 ? (firstWeekday + 6) % 7 : firstWeekday
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate()
    const cells: Array<{ iso: string | null, day: number | null }> = []
    for (let i = 0; i < offset; i += 1)
      cells.push({ iso: null, day: null })
    for (let d = 1; d <= totalDays; d += 1)
      cells.push({ iso: formatDateIso(viewYear, viewMonth, d), day: d })
    return cells
  }, [viewMonth, viewYear, weekStartsOn])

  const isDateDisabled = (iso: string) => {
    if (disabled)
      return true
    if (min && iso < min)
      return true
    if (max && iso > max)
      return true
    return false
  }

  const pickDay = (iso: string) => {
    if (isDateDisabled(iso))
      return
    if (!range) {
      setCurrentValue(iso)
      if (!showToolbar && variant !== 'picker')
        setIsOpen(false)
      return
    }
    if (!pendingStart) {
      setPendingStart(iso)
    }
    else {
      const pair: TxDateRangeValue = pendingStart <= iso ? [pendingStart, iso] : [iso, pendingStart]
      setPendingStart(null)
      setCurrentValue(pair)
      if (!showToolbar && variant !== 'picker')
        setIsOpen(false)
    }
  }

  const stepMonth = (delta: number) => {
    let nextMonth = viewMonth + delta
    let nextYear = viewYear
    while (nextMonth < 0) {
      nextMonth += 12
      nextYear -= 1
    }
    while (nextMonth > 11) {
      nextMonth -= 12
      nextYear += 1
    }
    setViewYear(nextYear)
    setViewMonth(nextMonth)
  }

  const formattedDisplay = Array.isArray(currentValue)
    ? (currentValue[0] && currentValue[1] ? `${currentValue[0]}${rangeSeparator}${currentValue[1]}` : '')
    : currentValue

  const rangeStart = Array.isArray(currentValue) ? currentValue[0] : ''
  const rangeEnd = Array.isArray(currentValue) ? currentValue[1] : ''

  const calendarNode = (
    <div className="tx-date-picker-calendar">
      <div className="tx-date-picker-calendar__header">
        <button
          type="button"
          className="tx-date-picker-calendar__nav"
          aria-label="Previous month"
          onClick={() => stepMonth(-1)}
        >
          ‹
        </button>
        <span className="tx-date-picker-calendar__title">
          {MONTH_NAMES[viewMonth]}
          {' '}
          {viewYear}
        </span>
        <button
          type="button"
          className="tx-date-picker-calendar__nav"
          aria-label="Next month"
          onClick={() => stepMonth(1)}
        >
          ›
        </button>
      </div>

      <div className="tx-date-picker-calendar__weekdays">
        {(weekStartsOn === 1 ? WEEKDAY_LABELS_MON : WEEKDAY_LABELS_SUN).map(wd => (
          <span key={wd} className="tx-date-picker-calendar__weekday">{wd}</span>
        ))}
      </div>

      <div className="tx-date-picker-calendar__grid" role="grid">
        {days.map((cell, idx) => {
          if (!cell.iso || cell.day === null)
            return <span key={`empty-${idx}`} className="tx-date-picker-calendar__cell is-empty" />
          const iso = cell.iso
          const cellDisabled = isDateDisabled(iso)
          const isSelected = range
            ? iso === pendingStart || iso === rangeStart || iso === rangeEnd
            : iso === currentValue
          const inRange = range && !pendingStart && Boolean(rangeStart && rangeEnd && iso > rangeStart && iso < rangeEnd)

          return (
            <button
              key={iso}
              type="button"
              disabled={cellDisabled}
              data-date={iso}
              aria-pressed={isSelected}
              className={cn('tx-date-picker-calendar__cell', {
                'is-selected': isSelected,
                'is-in-range': inRange,
                'is-disabled': cellDisabled,
              })}
              onClick={() => pickDay(iso)}
            >
              {cell.day}
            </button>
          )
        })}
      </div>

      {(showToolbar || popup) && (
        <div className="tx-date-picker-calendar__footer">
          <button
            type="button"
            className="tx-picker__btn"
            onClick={() => {
              onCancel?.()
              setIsOpen(false)
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className="tx-picker__btn tx-picker__btn--confirm"
            onClick={() => {
              onConfirm?.(currentValue)
              setIsOpen(false)
            }}
          >
            {confirmText}
          </button>
        </div>
      )}
    </div>
  )

  if (variant === 'picker' && !popup) {
    return (
      <div ref={ref} className={cn('tx-date-picker', 'tx-date-picker--inline', className)} style={style} {...rest}>
        {calendarNode}
      </div>
    )
  }

  return (
    <div ref={ref} className={cn('tx-date-picker', { 'is-disabled': disabled }, className)} style={style} {...rest}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="tx-date-picker-field"
        onClick={() => {
          if (disabled)
            return
          if (!isOpen)
            zIndexRef.current = allocateZIndex()
          setIsOpen(!isOpen)
        }}
      >
        <span className={cn('tx-date-picker-field__value', { 'is-placeholder': !formattedDisplay })}>
          {formattedDisplay || placeholder}
        </span>
        <span className="tx-date-picker-field__icon" aria-hidden="true">📅</span>
      </button>

      {isOpen && hasDocument() && createPortal(
        popup
          ? (
              <div className="tx-picker-popup" style={{ zIndex: zIndexRef.current }}>
                <div
                  className="tx-picker-popup__mask"
                  onClick={() => {
                    if (closeOnClickMask)
                      setIsOpen(false)
                  }}
                />
                <div ref={panelRef} role="dialog" aria-label={title} className="tx-picker-popup__panel">
                  {calendarNode}
                </div>
              </div>
            )
          : (
              <div
                ref={panelRef}
                role="dialog"
                aria-label={title}
                className="tx-floating-panel tx-date-picker-popover"
                style={{
                  position: floating.strategy,
                  left: `${floating.x}px`,
                  top: `${floating.y}px`,
                  zIndex: zIndexRef.current,
                } as CSSProperties}
              >
                {calendarNode}
              </div>
            ),
        document.body,
      )}
    </div>
  )
})
TxDatePicker.displayName = 'TxDatePicker'

// ============================================================================
// 16. TxPicker (picker)
// ============================================================================

export type TxPickerPrimitive = string | number

export interface TxPickerOption {
  value: TxPickerPrimitive
  label: string
  disabled?: boolean
}

export interface TxPickerColumn {
  key?: string
  options: TxPickerOption[]
}

export type TxPickerValue = TxPickerPrimitive[]

export interface TxPickerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  value?: TxPickerValue
  defaultValue?: TxPickerValue
  columns?: TxPickerColumn[]
  open?: boolean
  visible?: boolean
  defaultOpen?: boolean
  popup?: boolean
  title?: string
  showToolbar?: boolean
  confirmText?: string
  cancelText?: string
  disabled?: boolean
  itemHeight?: number
  visibleItemCount?: number
  closeOnClickMask?: boolean
  onChange?: (value: TxPickerValue) => void
  onOpenChange?: (open: boolean) => void
  onConfirm?: (value: TxPickerValue) => void
  onCancel?: () => void
}

export const TxPicker = forwardRef<HTMLDivElement, TxPickerProps>((
  {
    value,
    defaultValue,
    columns = [],
    open,
    visible,
    defaultOpen = false,
    popup = false,
    title = '',
    showToolbar = true,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    disabled = false,
    itemHeight = 40,
    visibleItemCount = 5,
    closeOnClickMask = true,
    onChange,
    onOpenChange,
    onConfirm,
    onCancel,
    className,
    style,
    ...rest
  },
  ref,
) => {
  const initialValues = useMemo<TxPickerValue>(
    () => defaultValue ?? columns.map(col => col.options.find(o => !o.disabled)?.value ?? ''),
    [columns, defaultValue],
  )
  const [currentValue, setCurrentValue] = useControllableState<TxPickerValue>({
    value,
    defaultValue: initialValues,
    onChange,
  })
  const [isOpen, setIsOpen] = useControllableState({
    value: open ?? visible,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  })
  const zIndexRef = useRef(allocateZIndex())

  const selectOption = (colIndex: number, option: TxPickerOption) => {
    if (disabled || option.disabled)
      return
    const next = columns.map((col, i) => {
      if (i === colIndex)
        return option.value
      return currentValue[i] ?? col.options[0]?.value ?? ''
    })
    setCurrentValue(next)
  }

  const pickerBody = (
    <div
      ref={ref}
      className={cn('tx-picker', { 'is-disabled': disabled }, className)}
      style={{
        '--tx-picker-item-height': `${itemHeight}px`,
        '--tx-picker-visible-count': visibleItemCount,
        ...style,
      } as CSSProperties}
      {...rest}
    >
      {showToolbar && (
        <div className="tx-picker__toolbar">
          <button
            type="button"
            className="tx-picker__btn"
            disabled={disabled}
            onClick={() => {
              onCancel?.()
              if (popup)
                setIsOpen(false)
            }}
          >
            {cancelText}
          </button>
          {title && <span className="tx-picker__title">{title}</span>}
          <button
            type="button"
            className="tx-picker__btn tx-picker__btn--confirm"
            disabled={disabled}
            onClick={() => {
              onConfirm?.(currentValue)
              if (popup)
                setIsOpen(false)
            }}
          >
            {confirmText}
          </button>
        </div>
      )}

      <div className="tx-picker__columns">
        {columns.map((col, colIdx) => {
          const activeVal = currentValue[colIdx]
          return (
            <div key={col.key ?? colIdx} className="tx-picker__col" role="listbox">
              <div className="tx-picker__wheel">
                {col.options.map((opt) => {
                  const isActive = opt.value === activeVal
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      disabled={disabled || opt.disabled}
                      className={cn('tx-picker__item', {
                        'is-active': isActive,
                        'is-disabled': disabled || opt.disabled,
                      })}
                      onClick={() => selectOption(colIdx, opt)}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  if (!popup)
    return pickerBody

  if (!isOpen || !hasDocument())
    return null

  return createPortal(
    <div className="tx-picker-popup" style={{ zIndex: zIndexRef.current }}>
      <div
        className="tx-picker-popup__mask"
        onClick={() => {
          if (closeOnClickMask)
            setIsOpen(false)
        }}
      />
      <div className="tx-picker-popup__panel" role="dialog" aria-modal="true" aria-label={title || 'Picker'}>
        {pickerBody}
      </div>
    </div>,
    document.body,
  )
})
TxPicker.displayName = 'TxPicker'
