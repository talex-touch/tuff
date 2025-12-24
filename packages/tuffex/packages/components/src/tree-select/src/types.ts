import type { PopoverPlacement } from '../../popover/src/types'

export type TreeSelectKey = string | number

export interface TreeSelectNode {
  key: TreeSelectKey
  label: string
  disabled?: boolean
  children?: TreeSelectNode[]
}

export type TreeSelectValue = TreeSelectKey | TreeSelectKey[] | undefined

export interface TreeSelectProps {
  modelValue?: TreeSelectValue
  nodes?: TreeSelectNode[]
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
  defaultExpandedKeys?: TreeSelectKey[]
}

export interface TreeSelectEmits {
  (e: 'update:modelValue', v: TreeSelectValue): void
  (e: 'change', v: TreeSelectValue): void
  (e: 'open'): void
  (e: 'close'): void
}
