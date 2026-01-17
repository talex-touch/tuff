import { withInstall } from '../../../utils/withInstall'
import TxGridLayout from './src/TxGridLayout.vue'

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
