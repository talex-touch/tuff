import type { TextMorphProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxTextMorph from './src/TxTextMorph.vue'

const TextMorph = withInstall(TxTextMorph)

export { TextMorph, TxTextMorph }
export type { TextMorphProps }
export type TxTextMorphInstance = InstanceType<typeof TxTextMorph>

// The engine is exported for the components that drive it directly (TxTextTransformer,
// TxBadge) and for anyone building a morphing surface tuffex does not ship.
export {
  MORPH_DEFAULTS,
  MorphController,
  type MorphControllerOptions,
  type MorphSegment,
  type MorphSegmentKind,
  type MorphSpring,
  TextMorphEngine,
  type TextMorphEngineOptions,
} from './src/engine'

export default TextMorph
