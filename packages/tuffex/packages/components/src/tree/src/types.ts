import type { TxIconSource } from '../../icon'

export type TreeKey = string | number

export interface TreeNode {
  key: TreeKey
  label: string
  children?: TreeNode[]
  leaf?: boolean
  disabled?: boolean
  icon?: TxIconSource | string
}

export type TreeValue = TreeKey | TreeKey[]

export interface TreeProps {
  nodes?: TreeNode[]
  modelValue?: TreeValue
  multiple?: boolean
  selectable?: boolean
  checkable?: boolean
  disabled?: boolean
  defaultExpandedKeys?: TreeKey[]
  /**
   * Seeds the selection the tree keeps for itself. Ignored while `modelValue`
   * is bound — then the host owns it, the same split `expandedKeys` has.
   */
  defaultSelectedKeys?: TreeKey[]
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
