import TxContextMenu from './src/TxContextMenu.vue'
import TxContextMenuItem from './src/TxContextMenuItem.vue'
import { withInstall } from '../../../utils/withInstall'
import type { ContextMenuProps } from './src/types'

const ContextMenu = withInstall(TxContextMenu)
const ContextMenuItem = withInstall(TxContextMenuItem)

export { ContextMenu, ContextMenuItem, TxContextMenu, TxContextMenuItem }
export type { ContextMenuProps }
export type TxContextMenuInstance = InstanceType<typeof TxContextMenu>
export type TxContextMenuItemInstance = InstanceType<typeof TxContextMenuItem>

export default ContextMenu
