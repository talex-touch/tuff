import type { BaseSurfaceMode, BaseSurfaceProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxBaseSurface from './src/TxBaseSurface.vue'

const BaseSurface = withInstall(TxBaseSurface)

export { BaseSurface, TxBaseSurface }
export type { BaseSurfaceMode, BaseSurfaceProps }
export type TxBaseSurfaceInstance = InstanceType<typeof TxBaseSurface>

export default BaseSurface
