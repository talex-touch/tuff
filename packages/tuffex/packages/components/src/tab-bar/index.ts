import type { TabBarEmits, TabBarItem, TabBarProps, TabBarValue } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxTabBar from './src/TxTabBar.vue'

const TabBar = withInstall(TxTabBar)

export { TabBar, TxTabBar }
export type { TabBarEmits, TabBarItem, TabBarProps, TabBarValue }
export type TxTabBarInstance = InstanceType<typeof TxTabBar>

export default TabBar
