import type { ContextMenuAnchorMode, ContextMenuDividerProps, ContextMenuItemProps, ContextMenuOpenTarget, ContextMenuPanelBackground, ContextMenuPanelProps, ContextMenuPanelShadow, ContextMenuPanelVariant, ContextMenuPoint, ContextMenuProps, ContextMenuSubmenuProps, ContextMenuTrigger } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxContextMenu from './src/TxContextMenu.vue'
import TxContextMenuDivider from './src/TxContextMenuDivider.vue'
import TxContextMenuItem from './src/TxContextMenuItem.vue'
import TxContextMenuPanel from './src/TxContextMenuPanel.vue'
import TxContextMenuSubmenu from './src/TxContextMenuSubmenu.vue'

const ContextMenu = withInstall(TxContextMenu)
const ContextMenuItem = withInstall(TxContextMenuItem)
const ContextMenuDivider = withInstall(TxContextMenuDivider)
const ContextMenuPanel = withInstall(TxContextMenuPanel)
const ContextMenuSubmenu = withInstall(TxContextMenuSubmenu)

export {
  ContextMenu,
  ContextMenuDivider,
  ContextMenuItem,
  ContextMenuPanel,
  ContextMenuSubmenu,
  TxContextMenu,
  TxContextMenuDivider,
  TxContextMenuItem,
  TxContextMenuPanel,
  TxContextMenuSubmenu,
}
export type { ContextMenuAnchorMode, ContextMenuDividerProps, ContextMenuItemProps, ContextMenuOpenTarget, ContextMenuPanelBackground, ContextMenuPanelProps, ContextMenuPanelShadow, ContextMenuPanelVariant, ContextMenuPoint, ContextMenuProps, ContextMenuSubmenuProps, ContextMenuTrigger }
export type TxContextMenuInstance = InstanceType<typeof TxContextMenu>
export type TxContextMenuDividerInstance = InstanceType<typeof TxContextMenuDivider>
export type TxContextMenuItemInstance = InstanceType<typeof TxContextMenuItem>
export type TxContextMenuPanelInstance = InstanceType<typeof TxContextMenuPanel>
export type TxContextMenuSubmenuInstance = InstanceType<typeof TxContextMenuSubmenu>

export default ContextMenu
