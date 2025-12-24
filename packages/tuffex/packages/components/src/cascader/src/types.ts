import type { PopoverPlacement } from '../../popover/src/types'

export type CascaderKey = string | number
export type CascaderPath = CascaderKey[]
export type CascaderValue = CascaderPath | CascaderPath[] | undefined

export interface CascaderNode {
  value: CascaderKey
  label: string
  disabled?: boolean
  leaf?: boolean
  children?: CascaderNode[]
}

export interface CascaderProps {
  modelValue?: CascaderValue
  options?: CascaderNode[]
  multiple?: boolean
  disabled?: boolean
  placeholder?: string
  searchable?: boolean
  clearable?: boolean
  placement?: PopoverPlacement
  dropdownOffset?: number
  dropdownWidth?: number
  dropdownMaxWidth?: number
  dropdownMaxHeight?: number
  expandTrigger?: 'click' | 'hover' | 'both'
  load?: (node: CascaderNode | null, level: number) => Promise<CascaderNode[]>
}

export interface CascaderEmits {
  (e: 'update:modelValue', v: CascaderValue): void
  (e: 'change', v: CascaderValue): void
  (e: 'open'): void
  (e: 'close'): void
}
