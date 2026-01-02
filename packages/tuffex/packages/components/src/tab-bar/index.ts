import TxTabBar from './src/TxTabBar.vue'
import { withInstall } from '../../../utils/withInstall'
import type { TabBarEmits, TabBarItem, TabBarProps } from './src/types'

const TabBar = withInstall(TxTabBar)

export { TabBar, TxTabBar }
export type { TabBarEmits, TabBarItem, TabBarProps }
export type TxTabBarInstance = InstanceType<typeof TxTabBar>

export default TabBar
