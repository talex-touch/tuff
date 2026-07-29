import type { Breakpoint, GridAlign, GridGap, GridItemProps, GridProps, Responsive } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxGrid from './src/TxGrid.vue'
import TxGridItem from './src/TxGridItem.vue'

withInstall(TxGrid)
withInstall(TxGridItem)

export { TxGrid, TxGridItem }
export { TxGrid as Grid, TxGridItem as GridItem }
export type { Breakpoint, GridAlign, GridGap, GridItemProps, GridProps, Responsive }
export type TxGridInstance = InstanceType<typeof TxGrid>
export type TxGridItemInstance = InstanceType<typeof TxGridItem>

export default TxGrid
