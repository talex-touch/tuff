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
  registerItem: (value: TxFlatRadioValue, el: HTMLElement) => void
  unregisterItem: (value: TxFlatRadioValue) => void
  select: (value: TxFlatRadioValue) => void
  isSelected: (value: TxFlatRadioValue) => boolean
}

export const FLAT_RADIO_KEY: InjectionKey<TxFlatRadioContext>
  = Symbol('TxFlatRadio')
