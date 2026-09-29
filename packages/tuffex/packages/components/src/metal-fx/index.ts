import { withInstall } from '../../../utils/withInstall'
import TxMetalBadge from './src/TxMetalBadge.vue'
import TxMetalFx from './src/TxMetalFx.vue'
import TxMetalText from './src/TxMetalText.vue'

const MetalFx = withInstall(TxMetalFx)
const MetalText = withInstall(TxMetalText)
const MetalBadge = withInstall(TxMetalBadge)

export { MetalBadge, MetalFx, MetalText, TxMetalBadge, TxMetalFx, TxMetalText }

export { useMetalBend } from './src/use-metal-bend'
export { useMetalTextReflection } from './src/use-metal-text-reflection'
export { paintTextRun, textMaskDataUrl } from './src/engine/text-mask'

export type {
  MetalBadgeCore,
  MetalBadgeProps,
  MetalFxPreset,
  MetalFxProps,
  MetalFxRef,
  MetalFxReflectionTarget,
  MetalFxTheme,
  MetalFxVariant,
  MetalTextProps,
  TextInnerShadow,
} from './src/types'
export { FIGMA_INNER_SHADOW, METAL_BADGE_DEFAULTS, METAL_TEXT_DEFAULTS } from './src/types'
export type TxMetalFxInstance = InstanceType<typeof TxMetalFx>
export type TxMetalTextInstance = InstanceType<typeof TxMetalText>
export type TxMetalBadgeInstance = InstanceType<typeof TxMetalBadge>

// Power-user surface: expose the engine primitives so consumers building
// non-React integrations can drive the same renderer.
//
// `PRESETS` / `Preset*` / `GLOW*` / `BEND*` / `hexToRgb(a)` / `createInstance`
// and friends are too generic for the `export *` star barrel (duplicated names
// are silently dropped there), so each also ships under a `metalFx`-prefixed
// alias — the same convention as border-beam's `borderBeamSizePresets` and
// liquid's `LiquidTransition`.
export {
  PRESETS as metalFxPresets,
  SHAPE_NONE,
  SHAPE_CIRCLE,
  SHAPE_DAISY,
  SHAPE_DIAMOND,
  SHAPE_METABALLS,
  FIT_NONE,
  FIT_CONTAIN,
  FIT_COVER,
  hexToRgb as metalFxHexToRgb,
  hexToRgba,
  hexToRgba as metalFxHexToRgba,
} from './src/engine/presets'
export type {
  Preset as MetalFxPresetConfig,
  PresetMode as MetalFxPresetMode,
  PresetName as MetalFxPresetName,
  PresetTheme as MetalFxPresetTheme,
} from './src/engine/presets'

export {
  createInstance as metalFxCreateInstance,
  destroyInstance as metalFxDestroyInstance,
  updateInstance,
  updateInstance as metalFxUpdateInstance,
  setSharedPreset,
  setSharedPresetMode,
  getSharedPreset,
  setInstanceDeform,
  redrawInstance,
  pauseShared,
  resumeShared,
} from './src/engine/renderer/loop'
export type { DeformFn, DeformLayers, MetalFxInstance, MaskFn } from './src/engine/renderer/core'
export { isMetalFxSupported } from './src/engine/renderer/core'

export { RIM_DEFAULTS } from './src/engine/rim'
export type { RimOptions } from './src/engine/rim'

// Live glow tuning — mutable singleton read by the glow engine every frame.
export {
  GLOW,
  GLOW as metalFxGlow,
  GLOW_DEFAULTS,
  GLOW_DEFAULTS as metalFxGlowDefaults,
  GLOW_MARKUP_KEYS,
  setGlowConfig,
  resetGlowConfig,
  subscribeGlowConfig,
} from './src/engine/glow/config'
export type { GlowConfig } from './src/engine/glow/config'

// Cursor light: glint under the pointer + catch-light facing it.
export {
  CURSOR_LIGHT,
  CURSOR_LIGHT as metalFxCursorLight,
  CURSOR_LIGHT_DEFAULTS,
  CURSOR_LIGHT_DEFAULTS as metalFxCursorLightDefaults,
  setCursorLightConfig,
  resetCursorLightConfig,
  setCursorSprite,
} from './src/engine/cursor/light'
export type { CursorLightConfig, CursorSprite } from './src/engine/cursor/light'

// Cursor-as-occluder for proximity reflections.
export {
  REFLECTION_OCCLUDER,
  REFLECTION_OCCLUDER as metalFxReflectionOccluder,
  REFLECTION_OCCLUDER_DEFAULTS,
  REFLECTION_OCCLUDER_DEFAULTS as metalFxReflectionOccluderDefaults,
  setReflectionOccluderConfig,
  resetReflectionOccluderConfig,
} from './src/engine/reflection/paint'
export type { ReflectionOccluderConfig } from './src/engine/reflection/paint'

// Cursor-driven local deformation ("liquid dent").
export {
  BEND,
  BEND as metalFxBend,
  BEND_DEFAULTS,
  BEND_DEFAULTS as metalFxBendDefaults,
  setBendConfig,
  resetBendConfig,
} from './src/engine/bend/config'
export type { BendConfig } from './src/engine/bend/config'

export default MetalFx
