import type { DeviceMockupPreset } from '../src/types'
import { RESPONSIVE_DEVICE_MOCKUP_PRESET } from '../src/core-presets'
import { ANDROID_DEVICE_PRESETS } from './android/index'
import { BROWSER_DEVICE_PRESETS } from './browser/index'
import { DESKTOP_DEVICE_PRESETS } from './desktop/index'
import { IOS_DEVICE_PRESETS } from './ios/index'
import { TABLET_DEVICE_PRESETS } from './tablet/index'
import { WATCH_DEVICE_PRESETS } from './watch/index'

export * from './android/index'
export * from './browser/index'
export * from './desktop/index'
export * from './ios/index'
export * from './tablet/index'
export * from './watch/index'
export { DEFAULT_DEVICE_MOCKUP_PRESET, RESPONSIVE_DEVICE_MOCKUP_PRESET } from '../src/core-presets'

/** Complete 75-preset catalog across iOS, Android/HarmonyOS, Tablet, Desktop, Watch, Browser, and Responsive. */
export const DEVICE_MOCKUP_PRESETS: readonly DeviceMockupPreset[] = /*#__PURE__*/ Object.freeze([
  ...IOS_DEVICE_PRESETS,
  ...ANDROID_DEVICE_PRESETS,
  ...TABLET_DEVICE_PRESETS,
  ...DESKTOP_DEVICE_PRESETS,
  ...WATCH_DEVICE_PRESETS,
  ...BROWSER_DEVICE_PRESETS,
  RESPONSIVE_DEVICE_MOCKUP_PRESET,
])
