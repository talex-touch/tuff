import type { PrismGlowPalette, PrismGlowPlacement, PrismGlowProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxPrismGlow from './src/TxPrismGlow.vue'

const PrismGlow = withInstall(TxPrismGlow)

export { PrismGlow, TxPrismGlow }
export type { PrismGlowPalette, PrismGlowPlacement, PrismGlowProps }
export type TxPrismGlowInstance = InstanceType<typeof TxPrismGlow>

export default PrismGlow
