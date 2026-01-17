import type { DropdownItemProps, DropdownMenuProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxDropdownItem from './src/TxDropdownItem.vue'
import TxDropdownMenu from './src/TxDropdownMenu.vue'

const DropdownMenu = withInstall(TxDropdownMenu)
const DropdownItem = withInstall(TxDropdownItem)

export { DropdownItem, DropdownMenu, TxDropdownItem, TxDropdownMenu }
export type { DropdownItemProps, DropdownMenuProps }
export type TxDropdownMenuInstance = InstanceType<typeof TxDropdownMenu>
export type TxDropdownItemInstance = InstanceType<typeof TxDropdownItem>

export default DropdownMenu
