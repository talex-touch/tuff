import { withInstall } from '../../../utils/withInstall'
import TxFusionSurface from './src/TxFusionSurface.vue'

const FusionSurface = withInstall(TxFusionSurface)

export { FusionSurface, TxFusionSurface }
export { FUSION_SURFACE_BREAK_PINCH, fusionSurfacePath, fusionSurfacePinch } from './src/geometry'
// The per-frame spring the component runs on, for callers that drive
// `fusionSurfacePath()` themselves and need the same curves.
export { springSteps } from '../liquid/src/spring'
export type {
  FusionSurfaceBud,
  FusionSurfaceBudShape,
  FusionSurfaceEdge,
  FusionSurfaceEmits,
  FusionSurfaceGeometry,
  FusionSurfaceGeometryInput,
  FusionSurfaceProps,
  FusionSurfaceRect,
  FusionSurfaceSpan,
  FusionSurfaceSplit,
  FusionSurfaceTransition,
} from './src/types'
export type TxFusionSurfaceInstance = InstanceType<typeof TxFusionSurface>

export default FusionSurface
