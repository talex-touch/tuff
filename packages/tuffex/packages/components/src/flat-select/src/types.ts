import type { ComputedRef, InjectionKey, Ref } from 'vue'

export type TxFlatSelectValue = string | number

export interface TxFlatSelectProps {
  modelValue?: TxFlatSelectValue
  placeholder?: string
  disabled?: boolean
}

export interface TxFlatSelectItemProps {
  value: TxFlatSelectValue
  label?: string
  disabled?: boolean
}

export interface TxFlatSelectContext {
  currentValue: ComputedRef<TxFlatSelectValue>
  isOpen: Ref<boolean>
  handleSelect: (value: TxFlatSelectValue, label: string) => void
  registerItem: (value: TxFlatSelectValue, label: string, el: HTMLElement) => void
  unregisterItem: (value: TxFlatSelectValue) => void
}

export const FLAT_SELECT_KEY: InjectionKey<TxFlatSelectContext> = Symbol('TxFlatSelect')
