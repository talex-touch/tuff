import TxTabs from './src/TxTabs.vue'
import TxTabItem from './src/TxTabItem.vue'
import TxTabHeader from './src/TxTabHeader.vue'
import TxTabItemGroup from './src/TxTabItemGroup.vue'
import { withInstall } from '../../../utils/withInstall'
import type { TabsEmits, TabsProps, TabHeaderProps, TabItemGroupProps, TabItemProps } from './src/types'

const Tabs = withInstall(TxTabs)
const TabItem = withInstall(TxTabItem)
const TabHeader = withInstall(TxTabHeader)
const TabItemGroup = withInstall(TxTabItemGroup)

export {
  Tabs,
  TabItem,
  TabHeader,
  TabItemGroup,
  TxTabs,
  TxTabItem,
  TxTabHeader,
  TxTabItemGroup,
}

export type {
  TabsProps,
  TabsEmits,
  TabItemProps,
  TabHeaderProps,
  TabItemGroupProps,
}

export type TxTabsInstance = InstanceType<typeof TxTabs>
export type TxTabItemInstance = InstanceType<typeof TxTabItem>
export type TxTabHeaderInstance = InstanceType<typeof TxTabHeader>
export type TxTabItemGroupInstance = InstanceType<typeof TxTabItemGroup>

export default Tabs
