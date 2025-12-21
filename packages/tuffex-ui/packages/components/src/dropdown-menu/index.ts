import TxDropdownMenu from './src/TxDropdownMenu.vue'
import TxDropdownItem from './src/TxDropdownItem.vue'
import { withInstall } from '../../../utils/withInstall'
import type { DropdownItemProps, DropdownMenuProps } from './src/types'

const DropdownMenu = withInstall(TxDropdownMenu)
const DropdownItem = withInstall(TxDropdownItem)

export { DropdownMenu, DropdownItem, TxDropdownMenu, TxDropdownItem }
export type { DropdownMenuProps, DropdownItemProps }
export type TxDropdownMenuInstance = InstanceType<typeof TxDropdownMenu>
export type TxDropdownItemInstance = InstanceType<typeof TxDropdownItem>

export default DropdownMenu
