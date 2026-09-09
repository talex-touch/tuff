import type { InjectionKey } from 'vue'
import type { CascaderNode, CascaderPath } from './types'

/**
 * What a level needs from the cascader that owns it.
 *
 * Levels are recursive and each one renders inside its parent's floating panel,
 * so the tree can be arbitrarily deep — threading a dozen props through every
 * hop would mean every level re-declaring state it only forwards. These are
 * getters rather than refs so a level reads the live value during render
 * without the cascader having to hand out its internals.
 *
 * Internal: not exported from the package barrel.
 */
export interface CascaderLevelContext {
  multiple: () => boolean
  disabled: () => boolean
  expandTrigger: () => 'click' | 'hover' | 'both'
  /** Sizing for a child panel; the root panel is sized by the cascader itself. */
  panelMinWidth: () => number
  panelMaxWidth: () => number
  panelMaxHeight: () => number
  isLeaf: (node: CascaderNode, path: CascaderPath) => boolean
  childrenOf: (node: CascaderNode, path: CascaderPath) => CascaderNode[]
  ensureChildren: (node: CascaderNode, path: CascaderPath, level: number) => Promise<void>
  isLoading: (path: CascaderPath) => boolean
  isChecked: (path: CascaderPath) => boolean
  /** True when `path` is the active path or a prefix of it: the trail stays lit. */
  isOnActivePath: (path: CascaderPath) => boolean
  select: (path: CascaderPath) => void
  setActivePath: (path: CascaderPath) => void
  pathKey: (path: CascaderPath) => string
}

export const CASCADER_CONTEXT: InjectionKey<CascaderLevelContext> = Symbol('tx-cascader')
