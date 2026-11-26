import type { ComputedRef } from '@vue/reactivity'
import { computed, shallowRef } from '@vue/reactivity'

export interface SwitchMachineOptions {
  defaultChecked?: boolean
  checked?: () => boolean | undefined
  disabled?: () => boolean
  loading?: () => boolean
  onChange?: (checked: boolean) => void
}

export interface SwitchMachine {
  checked: ComputedRef<boolean>
  isDisabled: ComputedRef<boolean>
  setChecked: (next: boolean) => boolean
  toggle: () => boolean
  handleKeydown: (event: Pick<KeyboardEvent, 'key' | 'preventDefault'>) => boolean
  getAriaProps: () => Record<string, string | boolean | undefined>
}

export function createSwitchMachine(options: SwitchMachineOptions = {}): SwitchMachine {
  const internalChecked = shallowRef(Boolean(options.defaultChecked))

  const checked = computed<boolean>(() => {
    const controlled = options.checked?.()
    return controlled !== undefined ? controlled : internalChecked.value
  })

  const isInteractiveDisabled = (): boolean =>
    Boolean(options.disabled?.() || options.loading?.())

  const isDisabled = computed<boolean>(isInteractiveDisabled)

  function setChecked(next: boolean): boolean {
    if (isInteractiveDisabled())
      return false
    if (checked.value === next)
      return false
    if (options.checked?.() === undefined)
      internalChecked.value = next
    options.onChange?.(next)
    return true
  }

  function toggle(): boolean {
    return setChecked(!checked.value)
  }

  function handleKeydown(event: Pick<KeyboardEvent, 'key' | 'preventDefault'>): boolean {
    if (event.key !== ' ' && event.key !== 'Enter')
      return false
    event.preventDefault()
    return toggle()
  }

  function getAriaProps(): Record<string, string | boolean | undefined> {
    return {
      'role': 'switch',
      'aria-checked': checked.value,
      'aria-disabled': isInteractiveDisabled() || undefined,
      'aria-busy': options.loading?.() || undefined,
    }
  }

  return {
    checked,
    isDisabled,
    setChecked,
    toggle,
    handleKeydown,
    getAriaProps,
  }
}
