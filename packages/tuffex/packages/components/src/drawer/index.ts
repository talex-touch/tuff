import TxDrawer from './src/TxDrawer.vue'
import { withInstall } from '../../../utils/withInstall'
import type { DrawerProps, DrawerEmits } from './src/types'

/**
 * TxDrawer component with Vue plugin installation support.
 *
 * @example
 * ```ts
 * import { TxDrawer } from '@talex-touch/tuff-ui'
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
export type { DrawerProps, DrawerEmits }
export type TxDrawerInstance = InstanceType<typeof TxDrawer>

export default Drawer
