import type { Plugin } from 'vue'
import { withInstall } from '../../../utils/withInstall'
import TxPixelFieldSfc from './src/TxPixelField.vue'

const TxPixelField: typeof TxPixelFieldSfc & Plugin = withInstall(TxPixelFieldSfc)
const TuffPixelField: typeof TxPixelFieldSfc & Plugin = TxPixelField
const PixelField: typeof TxPixelFieldSfc & Plugin = TxPixelField

export { PixelField, TuffPixelField, TxPixelField }

export {
  PIXEL_FIELD_DARK_PALETTES,
  PIXEL_FIELD_LIGHT_PALETTES,
  buildPaletteLut as buildPixelFieldPaletteLut,
  resolvePixelFieldPalette,
} from './src/palettes'
export {
  buildPixelFieldParticles,
  loadImageBitmap as loadPixelFieldImageBitmap,
  rasterizeTextBitmap as rasterizePixelFieldTextBitmap,
} from './src/presets'
export { createPixelFieldRuntime, renderPixelFieldFrame } from './src/engine'
export { PIXEL_FIELD_DEFAULT_LABELS } from './src/types'

export type {
  PixelFieldHandle,
  PixelFieldInteraction,
  PixelFieldLabels,
  PixelFieldPalette,
  PixelFieldPaletteName,
  PixelFieldParticle,
  PixelFieldPreset,
  PixelFieldProps,
  PixelFieldStage,
} from './src/types'
export type {
  PixelFieldPointerState,
  PixelFieldPulse,
  PixelFieldRuntimeState,
  PixelFieldStepConfig,
} from './src/engine'
export type TxPixelFieldInstance = InstanceType<typeof TxPixelField>

export default TxPixelField
