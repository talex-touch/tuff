import type { DropdownItemProps, DropdownMenuProps, DropdownSubmenuProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxDropdownItem from './src/TxDropdownItem.vue'
import TxDropdownMenu from './src/TxDropdownMenu.vue'
import TxDropdownSubmenu from './src/TxDropdownSubmenu.vue'

const DropdownMenu = withInstall(TxDropdownMenu)
const DropdownItem = withInstall(TxDropdownItem)
const DropdownSubmenu = withInstall(TxDropdownSubmenu)

export { DropdownItem, DropdownMenu, DropdownSubmenu, TxDropdownItem, TxDropdownMenu, TxDropdownSubmenu }
export type { DropdownItemProps, DropdownMenuProps, DropdownSubmenuProps }
export type TxDropdownMenuInstance = InstanceType<typeof TxDropdownMenu>
export type TxDropdownItemInstance = InstanceType<typeof TxDropdownItem>
export type TxDropdownSubmenuInstance = InstanceType<typeof TxDropdownSubmenu>

export default DropdownMenu
