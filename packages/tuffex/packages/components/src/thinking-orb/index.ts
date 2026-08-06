import { withInstall } from '../../../utils/withInstall'
import TxThinkingOrb from './src/TxThinkingOrb.vue'

const ThinkingOrb = withInstall(TxThinkingOrb)

export { ThinkingOrb, TxThinkingOrb }
export type { OrbSize, OrbState, OrbTheme } from './src/types'
export { ORB_STATES } from './src/types'
export type TxThinkingOrbInstance = InstanceType<typeof TxThinkingOrb>

export default ThinkingOrb
