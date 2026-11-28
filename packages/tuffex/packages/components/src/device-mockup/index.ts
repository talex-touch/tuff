import type { Plugin } from 'vue'
import { withInstall } from '../../../utils/withInstall'
import TxDeviceMockupSfc from './src/TxDeviceMockup.vue'

const TxDeviceMockup: typeof TxDeviceMockupSfc & Plugin = withInstall(TxDeviceMockupSfc)
const TuffDeviceMockup: typeof TxDeviceMockupSfc & Plugin = TxDeviceMockup
const DeviceMockup: typeof TxDeviceMockupSfc & Plugin = TxDeviceMockup

export { DeviceMockup, TuffDeviceMockup, TxDeviceMockup }

// Lean core presets, categories, gradients, and registry (zero static family/export/scene imports)
export {
  DEFAULT_DEVICE_MOCKUP_PRESET,
  DEFAULT_DEVICE_MOCKUP_PRESET_ID,
  DEVICE_MOCKUP_CATEGORIES,
  DEVICE_MOCKUP_GRADIENTS,
  RESPONSIVE_DEVICE_MOCKUP_PRESET,
} from './src/core-presets'
export {
  computeDeviceMockupFitScale,
  defineDeviceMockupPreset,
  findDeviceMockupPreset,
  getDeviceMockupPreset,
  getRegisteredDeviceMockupPresets,
  isResponsiveDeviceMockupPreset,
  registerDeviceMockupPresets,
  resolveDeviceMockupDimensions,
  searchDeviceMockupPresets,
} from './src/registry'
export { DEVICE_MOCKUP_DEFAULT_LABELS } from './src/types'

export type {
  DeviceMockupAndroidPresetId,
  DeviceMockupBackdrop,
  DeviceMockupBrowserPresetId,
  DeviceMockupCategory,
  DeviceMockupCategoryMeta,
  DeviceMockupCutout,
  DeviceMockupDesktopPresetId,
  DeviceMockupEmits,
  DeviceMockupExportConfig,
  DeviceMockupExportFormat,
  DeviceMockupExportOptions,
  DeviceMockupExportScale,
  DeviceMockupFamily,
  DeviceMockupFinish,
  DeviceMockupFit,
  DeviceMockupFormFactor,
  DeviceMockupFrameStyle,
  DeviceMockupFraming,
  DeviceMockupGradientMeta,
  DeviceMockupGradientPreset,
  DeviceMockupIosPresetId,
  DeviceMockupLabels,
  DeviceMockupMeshBloom,
  DeviceMockupMetrics,
  DeviceMockupObjectFit,
  DeviceMockupOrientation,
  DeviceMockupOs,
  DeviceMockupPerspective,
  DeviceMockupPreset,
  DeviceMockupPresetId,
  DeviceMockupProps,
  DeviceMockupSafeArea,
  DeviceMockupScene,
  DeviceMockupSceneId,
  DeviceMockupShadow,
  DeviceMockupShadowVariant,
  DeviceMockupShape,
  DeviceMockupSize,
  DeviceMockupSlotProps,
  DeviceMockupStageRatio,
  DeviceMockupTabletPresetId,
  DeviceMockupTheme,
  DeviceMockupWatchPresetId,
  ResolvedDeviceMockupDimensions,
} from './src/types'
export type TxDeviceMockupInstance = InstanceType<typeof TxDeviceMockup>

export default TxDeviceMockup
