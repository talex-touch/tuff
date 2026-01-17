import type { DrawerEmits, DrawerProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxDrawer from './src/TxDrawer.vue'

/**
 * TxDrawer component with Vue plugin installation support.
 *
 * @example
 * ```ts
 * import { TxDrawer } from '@talex-touch/tuffex'
 *
 * // Use in template
 * <TxDrawer v-model:visible="visible" title="Settings">
 *   <p>Content</p>
 * </TxDrawer>
 * ```
 *
 * @public
 */
const Drawer = withInstall(TxDrawer)

export { Drawer, TxDrawer }
export type { DrawerEmits, DrawerProps }
export type TxDrawerInstance = InstanceType<typeof TxDrawer>

export default Drawer
