import TxContextMenu from './src/TxContextMenu.vue'
import { withInstall } from '../../../utils/withInstall'
import type { ContextMenuProps } from './src/types'

const ContextMenu = withInstall(TxContextMenu)

export { ContextMenu, TxContextMenu }
export type { ContextMenuProps }
export type TxContextMenuInstance = InstanceType<typeof TxContextMenu>

export default ContextMenu
