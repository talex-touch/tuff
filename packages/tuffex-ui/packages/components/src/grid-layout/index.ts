import TxGridLayout from './src/TxGridLayout.vue'
import { withInstall } from '../../../utils/withInstall'

export interface GridLayoutProps {
  minItemWidth?: string
  gap?: string
  maxColumns?: number
  interactive?: boolean
}

const GridLayout = withInstall(TxGridLayout)

export { GridLayout, TxGridLayout }
export type TxGridLayoutInstance = InstanceType<typeof TxGridLayout>

export default GridLayout
