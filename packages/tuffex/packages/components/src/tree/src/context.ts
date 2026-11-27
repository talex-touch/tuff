import type { ComponentPublicInstance, ComputedRef, InjectionKey, Ref } from 'vue'
import type { TxIconSource } from '../../icon'
import type { TreeKey, TreeNode } from './types'

export interface TreeFlatItem {
  node: TreeNode
  level: number
  hasChildren: boolean
  expanded: boolean
  posInSet: number
  setSize: number
}

export interface TreeItemSlotProps {
  node: TreeNode
  level: number
  expanded: boolean
  hasChildren: boolean
  selected: boolean
  toggleExpand: () => void
  toggleSelect: () => void
  indent: number
}

export interface TreeContext {
  disabled: ComputedRef<boolean>
  selectable: ComputedRef<boolean>
  checkable: ComputedRef<boolean>
  indent: ComputedRef<number>
  expandLabel: ComputedRef<string>
  collapseLabel: ComputedRef<string>
  selectLabel: ComputedRef<string>
  morphing: Ref<boolean>
  effectiveExpanded: ComputedRef<Set<TreeKey>>
  selectedSet: ComputedRef<Set<TreeKey>>
  tabStopKey: ComputedRef<TreeKey | null>
  resolveIcon: (icon?: TreeNode['icon']) => TxIconSource | undefined
  setItemRef: (key: TreeKey, element: Element | ComponentPublicInstance | null) => void
  handleItemFocus: (item: TreeFlatItem) => void
  handleItemClick: (item: TreeFlatItem) => void
  handleItemKeydown: (event: KeyboardEvent, item: TreeFlatItem) => Promise<void>
  toggleExpand: (node: TreeNode) => void
  toggleSelect: (node: TreeNode) => void
  syncLabelTitle: (event: PointerEvent, label: string) => void
}

export const TREE_CONTEXT_KEY: InjectionKey<TreeContext> = Symbol('TxTreeContext')
