import type { ComputedRef, InjectionKey } from 'vue'
import type { BaseAnchorAnimationOptions, BaseAnchorPanelCardProps } from '../../base-anchor/src/types'

export type TxSelectValue = string | number
export type TxSelectModelValue = TxSelectValue | TxSelectValue[]
export type TxSelectOptionId = symbol

export interface TxSelectOption {
  value: TxSelectValue
  label: string
  disabled?: boolean
}

export interface TxSelectOptionGroup {
  label: string
  disabled?: boolean
  options: TxSelectOption[]
}

export type TxSelectOptionLike = TxSelectOption | TxSelectOptionGroup
export type TxSelectStatus = 'default' | 'error' | 'warning'

export interface TxSelectProps {
  modelValue?: TxSelectModelValue
  placeholder?: string
  disabled?: boolean
  multiple?: boolean
  status?: TxSelectStatus
  eager?: boolean
  options?: TxSelectOptionLike[]
  maxTagCount?: number
  maxTagTextLength?: number
  searchable?: boolean
  searchPlaceholder?: string
  editable?: boolean
  remote?: boolean
  allowCreate?: boolean
  createText?: string
  loading?: boolean
  loadingText?: string
  emptyText?: string
  searchDebounce?: number
  dropdownMaxHeight?: number
  dropdownOffset?: number
  contentPadding?: number
  optionPadding?: number
  animation?: BaseAnchorAnimationOptions
  duration?: number
  panelVariant?: 'solid' | 'dashed' | 'plain'
  panelBackground?: 'pure' | 'mask' | 'blur' | 'glass' | 'refraction'
  panelShadow?: 'none' | 'soft' | 'medium'
  panelRadius?: number
  panelPadding?: number
  panelCard?: BaseAnchorPanelCardProps
}

export interface TxSelectItemProps {
  value: TxSelectValue
  label?: string
  disabled?: boolean
}

export interface TxSelectContext {
  currentValue: ComputedRef<TxSelectModelValue>
  handleSelect: (value: TxSelectValue, label: string) => void
  registerOption: (id: TxSelectOptionId, value: TxSelectValue, label: string) => void
  unregisterOption: (id: TxSelectOptionId) => void
  isValueEqual: (optionValue: TxSelectValue, currentValue: unknown) => boolean
  isValueSelected: (optionValue: TxSelectValue) => boolean
  searchQuery: ComputedRef<string>
}

export const SELECT_KEY: InjectionKey<TxSelectContext> = Symbol('TxSelect')
