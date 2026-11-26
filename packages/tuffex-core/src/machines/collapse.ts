import type { ComputedRef } from '@vue/reactivity'
import { computed, shallowRef } from '@vue/reactivity'

export type CollapseKey = string | number

export interface CollapseMachineOptions {
  /** Only allow a single item open at a time. @default false */
  accordion?: boolean
  /** Initial expanded keys (uncontrolled). */
  defaultValue?: CollapseKey | CollapseKey[]
  /** Controlled getter for expanded keys. */
  value?: () => CollapseKey | CollapseKey[] | undefined
  /** Disabled keys or predicate. */
  isDisabled?: (key: CollapseKey) => boolean
  /** Fired whenever expanded keys change. */
  onChange?: (keys: CollapseKey[]) => void
}

export interface CollapseMachine {
  expandedKeys: ComputedRef<CollapseKey[]>
  isOpen: (key: CollapseKey) => boolean
  open: (key: CollapseKey) => boolean
  close: (key: CollapseKey) => boolean
  toggle: (key: CollapseKey) => boolean
  setValue: (keys: CollapseKey | CollapseKey[]) => void
}

function normalizeKeys(input: CollapseKey | CollapseKey[] | undefined, accordion: boolean): CollapseKey[] {
  if (input === undefined)
    return []
  const arr = Array.isArray(input) ? [...new Set(input)] : [input]
  return accordion ? arr.slice(0, 1) : arr
}

export function createCollapseMachine(options: CollapseMachineOptions = {}): CollapseMachine {
  const accordion = Boolean(options.accordion)
  const internalKeys = shallowRef<CollapseKey[]>(normalizeKeys(options.defaultValue, accordion))

  const expandedKeys = computed<CollapseKey[]>(() => {
    const controlled = options.value?.()
    if (controlled !== undefined)
      return normalizeKeys(controlled, accordion)
    return internalKeys.value
  })

  function commit(next: CollapseKey[]): boolean {
    const normalized = normalizeKeys(next, accordion)
    const current = expandedKeys.value
    if (current.length === normalized.length && current.every((k, i) => Object.is(k, normalized[i])))
      return false
    if (options.value?.() === undefined)
      internalKeys.value = normalized
    options.onChange?.(normalized)
    return true
  }

  function isOpen(key: CollapseKey): boolean {
    return expandedKeys.value.includes(key)
  }

  function open(key: CollapseKey): boolean {
    if (options.isDisabled?.(key))
      return false
    if (isOpen(key))
      return false
    return commit(accordion ? [key] : [...expandedKeys.value, key])
  }

  function close(key: CollapseKey): boolean {
    if (options.isDisabled?.(key))
      return false
    if (!isOpen(key))
      return false
    return commit(expandedKeys.value.filter(k => !Object.is(k, key)))
  }

  function toggle(key: CollapseKey): boolean {
    if (options.isDisabled?.(key))
      return false
    return isOpen(key) ? close(key) : open(key)
  }

  function setValue(keys: CollapseKey | CollapseKey[]): void {
    commit(normalizeKeys(keys, accordion))
  }

  return {
    expandedKeys,
    isOpen,
    open,
    close,
    toggle,
    setValue,
  }
}
