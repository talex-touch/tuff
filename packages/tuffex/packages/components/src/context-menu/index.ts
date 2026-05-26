import type { ContextMenuDividerProps, ContextMenuItemProps, ContextMenuPanelProps, ContextMenuProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxContextMenu from './src/TxContextMenu.vue'
import TxContextMenuDivider from './src/TxContextMenuDivider.vue'
import TxContextMenuItem from './src/TxContextMenuItem.vue'
import TxContextMenuPanel from './src/TxContextMenuPanel.vue'

const ContextMenu = withInstall(TxContextMenu)
const ContextMenuItem = withInstall(TxContextMenuItem)
const ContextMenuDivider = withInstall(TxContextMenuDivider)
const ContextMenuPanel = withInstall(TxContextMenuPanel)

export {
  ContextMenu,
  ContextMenuDivider,
  ContextMenuItem,
  ContextMenuPanel,
  TxContextMenu,
  TxContextMenuDivider,
  TxContextMenuItem,
  TxContextMenuPanel,
}
export type { ContextMenuDividerProps, ContextMenuItemProps, ContextMenuPanelProps, ContextMenuProps }
export type TxContextMenuInstance = InstanceType<typeof TxContextMenu>
export type TxContextMenuDividerInstance = InstanceType<typeof TxContextMenuDivider>
export type TxContextMenuItemInstance = InstanceType<typeof TxContextMenuItem>
export type TxContextMenuPanelInstance = InstanceType<typeof TxContextMenuPanel>

export default ContextMenu
