import '../style/index.scss'
import type {
  BubbleMapProps,
  ChoroplethMapProps,
  MapAccessor,
  MapBaseProps,
  MapGeoJson,
  MapLabels,
  MapStyle,
} from './src/types'
import { withInstall } from '../utils/with-install'
import bubbleComponent from './src/TxBubbleMap.vue'
import choroplethComponent from './src/TxChoroplethMap.vue'

const TxBubbleMap = withInstall(bubbleComponent)
const TxChoroplethMap = withInstall(choroplethComponent)

export { TxBubbleMap, TxChoroplethMap }
export { DEFAULT_MAP_SCALE_VARS, rampColor, rampGradient } from './src/color'
export {
  boundingWindowFeature,
  createDefaultProjection,
  DEFAULT_BOUNDING_COORDS,
  fitProjectionToWindow,
  MAX_ZOOM_FACTOR,
  MERCATOR_MAX_LAT,
  projectedAspect,
  resolveProjection,
} from './src/projection'
export { applyRoam, clampScale, initialRoam, panBy, scaleAboutPoint } from './src/roam'
export type { RoamState } from './src/roam'
export { MAP_DEFAULT_LABELS } from './src/types'
export type {
  BubbleMapProps,
  ChoroplethMapProps,
  MapAccessor,
  MapBaseProps,
  MapGeoJson,
  MapLabels,
  MapStyle,
}
// No *Instance types here: generic SFCs compile to functions, not
// constructors, so InstanceType does not apply.
