import { computed, shallowRef, type ComputedRef } from '@vue/reactivity'

export interface CheckboxMachineOptions {
  defaultChecked?: boolean
  checked?: () => boolean | undefined
  defaultIndeterminate?: boolean
  indeterminate?: () => boolean | undefined
  disabled?: () => boolean
  onChange?: (checked: boolean) => void
}

export interface CheckboxMachine {
  checked: ComputedRef<boolean>
  indeterminate: ComputedRef<boolean>
  ariaChecked: ComputedRef<'true' | 'false' | 'mixed'>
  setChecked: (next: boolean) => boolean
  setIndeterminate: (next: boolean) => void
  toggle: () => boolean
  handleKeydown: (event: Pick<KeyboardEvent, 'key' | 'preventDefault'>) => boolean
}

export function createCheckboxMachine(options: CheckboxMachineOptions = {}): CheckboxMachine {
  const internalChecked = shallowRef(Boolean(options.defaultChecked))
  const internalIndeterminate = shallowRef(Boolean(options.defaultIndeterminate))

  const checked = computed<boolean>(() => {
    const controlled = options.checked?.()
    return controlled !== undefined ? controlled : internalChecked.value
  })

  const indeterminate = computed<boolean>(() => {
    const controlled = options.indeterminate?.()
    return controlled !== undefined ? controlled : internalIndeterminate.value
  })

  const ariaChecked = computed<'true' | 'false' | 'mixed'>(() => {
    if (indeterminate.value)
      return 'mixed'
    return checked.value ? 'true' : 'false'
  })

  function setIndeterminate(next: boolean): void {
    if (options.indeterminate?.() === undefined)
      internalIndeterminate.value = next
  }

  function setChecked(next: boolean): boolean {
    if (options.disabled?.())
      return false
    if (indeterminate.value && options.indeterminate?.() === undefined)
      internalIndeterminate.value = false
    if (checked.value === next)
      return false
    if (options.checked?.() === undefined)
      internalChecked.value = next
    options.onChange?.(next)
    return true
  }

  function toggle(): boolean {
    if (options.disabled?.())
      return false
    if (indeterminate.value) {
      setIndeterminate(false)
      if (!checked.value)
        return setChecked(true)
      options.onChange?.(true)
      return true
    }
    return setChecked(!checked.value)
  }

  function handleKeydown(event: Pick<KeyboardEvent, 'key' | 'preventDefault'>): boolean {
    if (event.key !== ' ')
      return false
    event.preventDefault()
    return toggle()
  }

  return {
    checked,
    indeterminate,
    ariaChecked,
    setChecked,
    setIndeterminate,
    toggle,
    handleKeydown,
  }
}
