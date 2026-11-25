import { computed, shallowRef, type ComputedRef, type Ref } from '@vue/reactivity'

export type TabsOrientation = 'horizontal' | 'vertical'
export type TabsActivationMode = 'automatic' | 'manual'

export interface TabDescriptor<T extends string | number = string> {
  value: T
  disabled?: boolean
}

export interface TabsMachineOptions<T extends string | number = string> {
  defaultValue?: T | null
  value?: () => T | null | undefined
  tabs?: () => Array<TabDescriptor<T>>
  orientation?: TabsOrientation
  activationMode?: TabsActivationMode
  loop?: boolean
  onChange?: (value: T) => void
}

export interface TabsMachine<T extends string | number = string> {
  activeValue: ComputedRef<T | null>
  focusedValue: Readonly<Ref<T | null>>
  select: (value: T) => boolean
  focus: (value: T | null) => void
  selectNext: () => T | null
  selectPrev: () => T | null
  selectFirst: () => T | null
  selectLast: () => T | null
  isSelected: (value: T) => boolean
  handleKeydown: (event: Pick<KeyboardEvent, 'key' | 'preventDefault'>) => boolean
  getTabProps: (value: T, disabled?: boolean) => Record<string, string | number | boolean | undefined>
}

export function createTabsMachine<T extends string | number = string>(
  options: TabsMachineOptions<T> = {},
): TabsMachine<T> {
  const internalValue = shallowRef<T | null>(options.defaultValue ?? null)
  const focusedValue = shallowRef<T | null>(options.defaultValue ?? null)
  const orientation = options.orientation ?? 'horizontal'
  const activationMode = options.activationMode ?? 'automatic'
  const loop = options.loop ?? true

  const enabledTabs = (): Array<TabDescriptor<T>> =>
    (options.tabs?.() ?? []).filter(tab => !tab.disabled)

  const activeValue = computed<T | null>(() => {
    const controlled = options.value?.()
    if (controlled !== undefined)
      return controlled
    if (internalValue.value !== null)
      return internalValue.value
    return enabledTabs()[0]?.value ?? null
  })

  function isDisabled(value: T): boolean {
    const tab = (options.tabs?.() ?? []).find(item => item.value === value)
    return Boolean(tab?.disabled)
  }

  function select(value: T): boolean {
    if (isDisabled(value))
      return false
    const current = activeValue.value
    focusedValue.value = value
    if (Object.is(current, value))
      return false
    if (options.value?.() === undefined)
      internalValue.value = value
    options.onChange?.(value)
    return true
  }

  function focus(value: T | null): void {
    focusedValue.value = value
  }

  function moveBy(delta: number): T | null {
    const list = enabledTabs()
    if (list.length === 0)
      return null
    const anchor = focusedValue.value ?? activeValue.value
    const idx = list.findIndex(item => Object.is(item.value, anchor))
    let nextIdx: number
    if (idx === -1) {
      nextIdx = delta >= 0 ? 0 : list.length - 1
    }
    else {
      nextIdx = idx + delta
      if (loop)
        nextIdx = ((nextIdx % list.length) + list.length) % list.length
      else
        nextIdx = Math.max(0, Math.min(list.length - 1, nextIdx))
    }
    const target = list[nextIdx]!.value
    focusedValue.value = target
    if (activationMode === 'automatic')
      select(target)
    return target
  }

  function selectNext(): T | null {
    return moveBy(1)
  }

  function selectPrev(): T | null {
    return moveBy(-1)
  }

  function selectFirst(): T | null {
    const first = enabledTabs()[0]?.value ?? null
    if (first === null)
      return null
    focusedValue.value = first
    if (activationMode === 'automatic')
      select(first)
    return first
  }

  function selectLast(): T | null {
    const list = enabledTabs()
    const last = list[list.length - 1]?.value ?? null
    if (last === null)
      return null
    focusedValue.value = last
    if (activationMode === 'automatic')
      select(last)
    return last
  }

  function handleKeydown(event: Pick<KeyboardEvent, 'key' | 'preventDefault'>): boolean {
    const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown'
    const prevKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp'

    if (event.key === nextKey) {
      event.preventDefault()
      return selectNext() !== null
    }
    if (event.key === prevKey) {
      event.preventDefault()
      return selectPrev() !== null
    }
    if (event.key === 'Home') {
      event.preventDefault()
      return selectFirst() !== null
    }
    if (event.key === 'End') {
      event.preventDefault()
      return selectLast() !== null
    }
    if ((event.key === 'Enter' || event.key === ' ') && activationMode === 'manual' && focusedValue.value !== null) {
      event.preventDefault()
      return select(focusedValue.value)
    }
    return false
  }

  function isSelected(value: T): boolean {
    return Object.is(activeValue.value, value)
  }

  function getTabProps(value: T, disabled = false): Record<string, string | number | boolean | undefined> {
    const selected = isSelected(value)
    return {
      role: 'tab',
      'aria-selected': selected,
      'aria-disabled': disabled || undefined,
      tabindex: selected ? 0 : -1,
      'data-state': selected ? 'active' : 'inactive',
    }
  }

  return {
    activeValue,
    focusedValue: computed(() => focusedValue.value),
    select,
    focus,
    selectNext,
    selectPrev,
    selectFirst,
    selectLast,
    isSelected,
    handleKeydown,
    getTabProps,
  }
}
