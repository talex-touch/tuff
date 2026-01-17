import type { TabHeaderProps, TabItemGroupProps, TabItemProps, TabsEmits, TabsProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxTabHeader from './src/TxTabHeader.vue'
import TxTabItem from './src/TxTabItem.vue'
import TxTabItemGroup from './src/TxTabItemGroup.vue'
import TxTabs from './src/TxTabs.vue'

const Tabs = withInstall(TxTabs)
const TabItem = withInstall(TxTabItem)
const TabHeader = withInstall(TxTabHeader)
const TabItemGroup = withInstall(TxTabItemGroup)

export {
  TabHeader,
  TabItem,
  TabItemGroup,
  Tabs,
  TxTabHeader,
  TxTabItem,
  TxTabItemGroup,
  TxTabs,
}

export type {
  TabHeaderProps,
  TabItemGroupProps,
  TabItemProps,
  TabsEmits,
  TabsProps,
}

export type TxTabsInstance = InstanceType<typeof TxTabs>
export type TxTabItemInstance = InstanceType<typeof TxTabItem>
export type TxTabHeaderInstance = InstanceType<typeof TxTabHeader>
export type TxTabItemGroupInstance = InstanceType<typeof TxTabItemGroup>

export default Tabs
