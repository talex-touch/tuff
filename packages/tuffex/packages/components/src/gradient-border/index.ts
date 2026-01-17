import { withInstall } from '../../../utils/withInstall'
import TxGradientBorder from './src/TxGradientBorder.vue'

export interface GradientBorderProps {
  as?: string
  borderWidth?: string | number
  borderRadius?: string | number
  padding?: string | number
  animationDuration?: number
}

const GradientBorder = withInstall(TxGradientBorder)

export { GradientBorder, TxGradientBorder }
export type TxGradientBorderInstance = InstanceType<typeof TxGradientBorder>

export default GradientBorder
