import TxGlowText from './src/TxGlowText.vue'
import { withInstall } from '../../../utils/withInstall'
import type { GlowTextProps } from './src/types'

const GlowText = withInstall(TxGlowText)

export { GlowText, TxGlowText }
export type { GlowTextProps }
export type TxGlowTextInstance = InstanceType<typeof TxGlowText>

export default GlowText
