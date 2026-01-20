import type { TxIconSource } from '../../icon'

export type TreeKey = string | number

export interface TreeNode {
  key: TreeKey
  label: string
  children?: TreeNode[]
  disabled?: boolean
  icon?: TxIconSource | string
}

export type TreeValue = TreeKey | TreeKey[]

export interface TreeProps {
  nodes: TreeNode[]
  modelValue?: TreeValue
  multiple?: boolean
  selectable?: boolean
  checkable?: boolean
  disabled?: boolean
  defaultExpandedKeys?: TreeKey[]
  expandedKeys?: TreeKey[]
  indent?: number
  filterText?: string
  filterMethod?: (node: TreeNode, query: string) => boolean
}

export interface TreeEmits {
  (e: 'update:modelValue', value: TreeValue): void
  (e: 'select', payload: { key: TreeKey, node: TreeNode }): void
  (e: 'toggle', payload: { key: TreeKey, expanded: boolean }): void
  (e: 'update:expandedKeys', value: TreeKey[]): void
}
