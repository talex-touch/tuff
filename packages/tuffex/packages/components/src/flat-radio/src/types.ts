import type { InjectionKey, Ref } from 'vue'

export type TxFlatRadioValue = string | number

export type TxFlatRadioSize = 'sm' | 'md' | 'lg'

export interface TxFlatRadioProps {
  modelValue: TxFlatRadioValue | TxFlatRadioValue[]
  multiple?: boolean
  disabled?: boolean
  size?: TxFlatRadioSize
  bordered?: boolean
}

export interface TxFlatRadioItemProps {
  value: TxFlatRadioValue
  label?: string
  icon?: string
  disabled?: boolean
}

export interface TxFlatRadioContext {
  modelValue: Ref<TxFlatRadioValue | TxFlatRadioValue[]>
  multiple: Ref<boolean>
  disabled: Ref<boolean>
  size: Ref<TxFlatRadioSize>
  /** Virtual-focus cursor for multi-select keyboard navigation. */
  focusedValue: Ref<TxFlatRadioValue | null>
  registerItem: (value: TxFlatRadioValue, el: HTMLElement) => void
  unregisterItem: (value: TxFlatRadioValue) => void
  select: (value: TxFlatRadioValue) => void
  isSelected: (value: TxFlatRadioValue) => boolean
  /** Stable per-value element id so the container can point aria-activedescendant at it. */
  getItemId: (value: TxFlatRadioValue) => string
}

export const FLAT_RADIO_KEY: InjectionKey<TxFlatRadioContext>
  = Symbol('TxFlatRadio')
