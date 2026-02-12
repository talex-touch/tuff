import type { TuffLogoStrokeProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxTuffLogoStroke from './src/TxTuffLogoStroke.vue'

const TuffLogoStroke = withInstall(TxTuffLogoStroke)

export { TuffLogoStroke, TxTuffLogoStroke }
export type { TuffLogoStrokeProps }
export type TxTuffLogoStrokeInstance = InstanceType<typeof TxTuffLogoStroke>

export default TuffLogoStroke
