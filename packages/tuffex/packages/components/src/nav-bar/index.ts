import TxNavBar from './src/TxNavBar.vue'
import { withInstall } from '../../../utils/withInstall'
import type { NavBarEmits, NavBarProps } from './src/types'

const NavBar = withInstall(TxNavBar)

export { NavBar, TxNavBar }
export type { NavBarEmits, NavBarProps }
export type TxNavBarInstance = InstanceType<typeof TxNavBar>

export default NavBar
