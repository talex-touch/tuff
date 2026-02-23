import type { ComputedRef, InjectionKey } from 'vue'
import type { BaseAnchorPanelCardProps } from '../../base-anchor/src/types'

export type TxSelectValue = string | number

export interface TxSelectProps {
  modelValue?: TxSelectValue
  placeholder?: string
  disabled?: boolean
  eager?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  editable?: boolean
  remote?: boolean
  dropdownMaxHeight?: number
  dropdownOffset?: number
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
  currentValue: ComputedRef<TxSelectValue>
  handleSelect: (value: TxSelectValue, label: string) => void
  registerOption: (value: TxSelectValue, label: string) => void
  searchQuery: ComputedRef<string>
}

export const SELECT_KEY: InjectionKey<TxSelectContext> = Symbol('TxSelect')
