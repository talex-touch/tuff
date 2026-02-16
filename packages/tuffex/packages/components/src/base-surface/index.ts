import type {
  BaseSurfaceMode,
  BaseSurfacePreset,
  BaseSurfaceProps,
  BaseSurfaceRefractionProfile,
  BaseSurfaceRefractionRenderer,
  BaseSurfaceRefractionTone,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxBaseSurface from './src/TxBaseSurface.vue'

const BaseSurface = withInstall(TxBaseSurface)

export { BaseSurface, TxBaseSurface }
export type {
  BaseSurfaceMode,
  BaseSurfacePreset,
  BaseSurfaceProps,
  BaseSurfaceRefractionProfile,
  BaseSurfaceRefractionRenderer,
  BaseSurfaceRefractionTone,
}
export type TxBaseSurfaceInstance = InstanceType<typeof TxBaseSurface>

export default BaseSurface
