import { withInstall } from '../../../utils/withInstall'
import TxImageGeneration from './src/TxImageGeneration.vue'

const ImageGeneration = withInstall(TxImageGeneration)

export { ImageGeneration, TxImageGeneration }

export type {
  ImageGenerationCycleEvent,
  ImageGenerationCycleHandler,
  ImageGenerationHandle,
  ImageGenerationPreset,
  ImageGenerationProps,
  ImageGenerationTheme,
} from './src/types'

export type TxImageGenerationInstance = InstanceType<typeof TxImageGeneration>

export { PRESETS as imageGenerationPresets, hexToRgb as imageGenerationHexToRgb, parseCssColor } from './src/presets'

// `EasingKey` / `MaskShape` / `MosaicConfig` / `Preset` / `PresetMode` /
// `PresetName` / `PresetTheme` / `RevealConfig` are too generic for the star
// barrel — the generic ones carry a component-prefixed alias here.
//
// `PRESETS`, `Preset*`, `createInstance`, `destroyInstance` and `hexToRgb` also
// exist in the sibling `metal-fx` barrel, and duplicated names are excluded from
// an `export *` aggregate; the prefixed aliases below are the collision-free
// entry points.
export type {
  EasingKey,
  EasingKey as ImageGenerationEasingKey,
  MaskShape,
  MaskShape as ImageGenerationMaskShape,
  MosaicConfig,
  Preset as ImageGenerationPresetConfig,
  PresetMode as ImageGenerationPresetMode,
  PresetName as ImageGenerationPresetName,
  PresetTheme as ImageGenerationPresetTheme,
  RevealConfig,
} from './src/presets'

// Power-user surface: expose the engine primitives so consumers can drive the
// renderer + reveal pipeline without Vue.
export {
  createCycle,
  createInstance as imageGenerationCreateInstance,
  createReveal,
  destroyInstance as imageGenerationDestroyInstance,
  ease,
  effectiveCardBg,
  getFrameRate,
  getMaxDpr,
  loadImage,
  pickRandomImage,
  samplePaletteFromCanvas,
  setFrameRate,
  setInstanceCardBg,
  setInstanceColors,
  setInstancePaused,
  setInstancePreset,
  setInstanceStrength,
  setInstanceVisible,
  setMaxDpr,
  setSharedFragmentShader,
  IMAGE_FRAGMENT_SHADER,
  updateInstanceSize,
} from './src/engine'

// `Cycle*` / `Instance` are too generic for the star barrel — `Instance`
// carries a component-prefixed alias here.
export type {
  CreateInstanceOptions,
  CreateRevealOptions,
  Cycle,
  CycleEvent,
  CycleOptions,
  CyclePhase,
  EaseFn,
  Instance,
  Instance as ImageGenerationInstance,
  RevealStartOptions,
  RevealState,
  SampledPalette,
} from './src/engine'

export default ImageGeneration
