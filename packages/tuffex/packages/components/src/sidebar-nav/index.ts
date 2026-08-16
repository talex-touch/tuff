import type {
  SidebarNavEmits,
  SidebarNavGroup,
  SidebarNavItem,
  SidebarNavItemAction,
  SidebarNavProps,
  SidebarNavValue,
  SidebarNavWorkspace,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxSidebarNav from './src/TxSidebarNav.vue'

/**
 * TxSidebarNav — vertical workspace navigation: switcher, quick search,
 * primary action and grouped destinations under one travelling highlight.
 *
 * @example
 * ```ts
 * import { TxSidebarNav } from '@talex-touch/tuffex'
 *
 * // <TxSidebarNav v-model="active" :items="items" :groups="groups" />
 * ```
 *
 * @public
 */
const SidebarNav = withInstall(TxSidebarNav)

export { SidebarNav, TxSidebarNav }
// Exported for other moving-indicator surfaces (a horizontal segmented control
// reads `left`/`width` from the same measurement) — same shape as
// conversation-stream re-exporting `useStickToBottom`.
export { useIndicatorBox } from './src/use-indicator-box'
export type { IndicatorBox, UseIndicatorBoxOptions, UseIndicatorBoxReturn } from './src/use-indicator-box'
export type {
  SidebarNavEmits,
  SidebarNavGroup,
  SidebarNavItem,
  SidebarNavItemAction,
  SidebarNavProps,
  SidebarNavValue,
  SidebarNavWorkspace,
}
export type TxSidebarNavInstance = InstanceType<typeof TxSidebarNav>

export default SidebarNav
