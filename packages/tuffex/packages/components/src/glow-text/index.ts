import type { GlowTextProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxGlowText from './src/TxGlowText.vue'

const GlowText = withInstall(TxGlowText)

export { GlowText, TxGlowText }
export type { GlowTextProps }
export type TxGlowTextInstance = InstanceType<typeof TxGlowText>

export default GlowText
