import type { ComputedRef, Ref } from '@vue/reactivity'
import { computed, readonly, shallowRef } from '@vue/reactivity'

export type SelectPrimitiveValue = string | number

export interface SelectOptionItem<T extends SelectPrimitiveValue = SelectPrimitiveValue> {
  value: T
  label: string
  disabled?: boolean
}

export interface SelectMachineOptions<T extends SelectPrimitiveValue = SelectPrimitiveValue> {
  options: () => Array<SelectOptionItem<T>>
  multiple?: boolean
  disabled?: () => boolean
  defaultValue?: T | T[] | null
  value?: () => T | T[] | null | undefined
  defaultOpen?: boolean
  open?: () => boolean | undefined
  filterable?: boolean
  filterFn?: (option: SelectOptionItem<T>, query: string) => boolean
  onChange?: (value: T | T[] | null) => void
  onOpenChange?: (open: boolean) => void
}

export interface SelectMachine<T extends SelectPrimitiveValue = SelectPrimitiveValue> {
  isOpen: ComputedRef<boolean>
  selectedValues: ComputedRef<T[]>
  selectedValue: ComputedRef<T | T[] | null>
  selectedOptions: ComputedRef<Array<SelectOptionItem<T>>>
  filteredOptions: ComputedRef<Array<SelectOptionItem<T>>>
  highlightedIndex: Readonly<Ref<number>>
  searchQuery: Readonly<Ref<string>>
  isSelected: (value: T) => boolean
  openMenu: () => void
  closeMenu: () => void
  toggleMenu: () => void
  setSearchQuery: (query: string) => void
  select: (value: T) => boolean
  clear: () => void
  highlightNext: () => number
  highlightPrev: () => number
  handleKeydown: (event: Pick<KeyboardEvent, 'key' | 'preventDefault'>) => boolean
}

function toArray<T>(input: T | T[] | null | undefined): T[] {
  if (input === undefined || input === null)
    return []
  return Array.isArray(input) ? [...input] : [input]
}

export function createSelectMachine<T extends SelectPrimitiveValue = SelectPrimitiveValue>(
  options: SelectMachineOptions<T>,
): SelectMachine<T> {
  const multiple = Boolean(options.multiple)
  const internalOpen = shallowRef(Boolean(options.defaultOpen))
  const internalValues = shallowRef<T[]>(toArray(options.defaultValue))
  const searchQuery = shallowRef('')
  const highlightedIndex = shallowRef(-1)

  const isDisabled = () => Boolean(options.disabled?.())

  const isOpen = computed<boolean>(() => {
    const controlled = options.open?.()
    return controlled !== undefined ? controlled : internalOpen.value
  })

  const selectedValues = computed<T[]>(() => {
    const controlled = options.value?.()
    if (controlled !== undefined)
      return toArray(controlled)
    return internalValues.value
  })

  const selectedValue = computed<T | T[] | null>(() => {
    if (multiple)
      return selectedValues.value
    return selectedValues.value[0] ?? null
  })

  const selectedOptions = computed<Array<SelectOptionItem<T>>>(() => {
    const all = options.options()
    const set = new Set(selectedValues.value)
    return all.filter(item => set.has(item.value))
  })

  const filteredOptions = computed<Array<SelectOptionItem<T>>>(() => {
    const all = options.options()
    const q = searchQuery.value.trim().toLowerCase()
    if (!options.filterable || !q)
      return all
    const matcher = options.filterFn ?? ((opt, query) => opt.label.toLowerCase().includes(query))
    return all.filter(opt => matcher(opt, q))
  })

  function setOpen(next: boolean): void {
    if (next && isDisabled())
      return
    if (isOpen.value === next)
      return
    if (options.open?.() === undefined)
      internalOpen.value = next
    if (next) {
      const list = filteredOptions.value
      const currentIdx = list.findIndex(opt => !opt.disabled && selectedValues.value.includes(opt.value))
      highlightedIndex.value = currentIdx >= 0 ? currentIdx : list.findIndex(opt => !opt.disabled)
    }
    else {
      highlightedIndex.value = -1
    }
    options.onOpenChange?.(next)
  }

  function openMenu(): void {
    setOpen(true)
  }

  function closeMenu(): void {
    setOpen(false)
  }

  function toggleMenu(): void {
    setOpen(!isOpen.value)
  }

  function setSearchQuery(query: string): void {
    searchQuery.value = query
    const list = filteredOptions.value
    highlightedIndex.value = list.findIndex(opt => !opt.disabled)
  }

  function commitValues(nextValues: T[]): void {
    if (options.value?.() === undefined)
      internalValues.value = nextValues
    options.onChange?.(multiple ? nextValues : (nextValues[0] ?? null))
  }

  function select(value: T): boolean {
    if (isDisabled())
      return false
    const opt = options.options().find(item => Object.is(item.value, value))
    if (!opt || opt.disabled)
      return false

    if (multiple) {
      const current = selectedValues.value
      const exists = current.includes(value)
      const next = exists ? current.filter(v => !Object.is(v, value)) : [...current, value]
      commitValues(next)
      return true
    }

    commitValues([value])
    closeMenu()
    return true
  }

  function clear(): void {
    if (isDisabled())
      return
    commitValues([])
  }

  function moveHighlight(step: 1 | -1): number {
    const list = filteredOptions.value
    if (list.length === 0) {
      highlightedIndex.value = -1
      return -1
    }
    let idx = highlightedIndex.value
    for (let tried = 0; tried < list.length; tried++) {
      idx = idx < 0
        ? (step > 0 ? 0 : list.length - 1)
        : ((idx + step) % list.length + list.length) % list.length
      if (!list[idx]?.disabled) {
        highlightedIndex.value = idx
        return idx
      }
    }
    highlightedIndex.value = -1
    return -1
  }

  function highlightNext(): number {
    return moveHighlight(1)
  }

  function highlightPrev(): number {
    return moveHighlight(-1)
  }

  function isSelected(value: T): boolean {
    return selectedValues.value.includes(value)
  }

  function handleKeydown(event: Pick<KeyboardEvent, 'key' | 'preventDefault'>): boolean {
    if (isDisabled())
      return false

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!isOpen.value) {
        openMenu()
        return true
      }
      highlightNext()
      return true
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen.value) {
        openMenu()
        return true
      }
      highlightPrev()
      return true
    }

    if (event.key === 'Home' && isOpen.value) {
      event.preventDefault()
      highlightedIndex.value = filteredOptions.value.findIndex(opt => !opt.disabled)
      return true
    }

    if (event.key === 'End' && isOpen.value) {
      event.preventDefault()
      const list = filteredOptions.value
      for (let i = list.length - 1; i >= 0; i--) {
        if (!list[i]?.disabled) {
          highlightedIndex.value = i
          break
        }
      }
      return true
    }

    if (event.key === 'Enter' || event.key === ' ') {
      if (!isOpen.value) {
        event.preventDefault()
        openMenu()
        return true
      }
      const target = filteredOptions.value[highlightedIndex.value]
      if (target && !target.disabled) {
        event.preventDefault()
        return select(target.value)
      }
      return false
    }

    if (event.key === 'Escape' && isOpen.value) {
      event.preventDefault()
      closeMenu()
      return true
    }

    return false
  }

  return {
    isOpen,
    selectedValues,
    selectedValue,
    selectedOptions,
    filteredOptions,
    highlightedIndex: readonly(highlightedIndex),
    searchQuery: readonly(searchQuery),
    isSelected,
    openMenu,
    closeMenu,
    toggleMenu,
    setSearchQuery,
    select,
    clear,
    highlightNext,
    highlightPrev,
    handleKeydown,
  }
}
