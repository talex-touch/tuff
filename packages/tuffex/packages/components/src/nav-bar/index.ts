import type { NavBarEmits, NavBarProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxNavBar from './src/TxNavBar.vue'

const NavBar = withInstall(TxNavBar)

export { NavBar, TxNavBar }
export type { NavBarEmits, NavBarProps }
export type TxNavBarInstance = InstanceType<typeof TxNavBar>

export default NavBar
