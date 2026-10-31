import {
  appSettingOriginData,
  type AppSetting
} from '@talex-touch/utils/common/storage/entity/app-settings'

export type BetaFeature = keyof AppSetting['betaFeatures']
export type BetaShortcutFeature = 'screenshot' | 'voiceDictation' | 'voiceQuickEdit' | 'omniPanel'

type BetaFeatureSettings = {
  betaFeatures?: Partial<AppSetting['betaFeatures']>
  dev?: { advancedSettings?: unknown } | null
}

/**
 * Features that live only while Advanced Settings is on, on top of their own opt-in. OmniPanel
 * hooks the mouse and reads the selection in every app, so turning Advanced Settings off has to
 * switch it off too: hiding its switch alone left a panel running that settings no longer showed.
 */
const ADVANCED_ONLY_FEATURES: ReadonlySet<BetaFeature> = new Set<BetaFeature>(['omniPanel'])

export const BETA_FEATURE_SHORTCUTS = {
  screenshot: 'screenshot.tool.start',
  voiceDictation: 'voice.dictation.toggle',
  voiceQuickEdit: 'voice.quickEdit',
  omniPanel: 'core.omniPanel.toggle'
} as const satisfies Record<BetaShortcutFeature, string>

const shortcutFeatures: Readonly<Record<string, BetaFeature>> = {
  [BETA_FEATURE_SHORTCUTS.screenshot]: 'screenshot',
  [BETA_FEATURE_SHORTCUTS.voiceDictation]: 'voiceDictation',
  [BETA_FEATURE_SHORTCUTS.voiceQuickEdit]: 'voiceQuickEdit',
  [BETA_FEATURE_SHORTCUTS.omniPanel]: 'omniPanel',
  'core.omniPanel.mouseLongPress': 'omniPanel'
}

export function isBetaFeatureEnabled(
  settings: BetaFeatureSettings | null | undefined,
  feature: BetaFeature
): boolean {
  if (ADVANCED_ONLY_FEATURES.has(feature) && settings?.dev?.advancedSettings !== true) return false
  const enabled = settings?.betaFeatures?.[feature]
  return typeof enabled === 'boolean' ? enabled : appSettingOriginData.betaFeatures[feature]
}

export function isShortcutFeatureEnabled(
  settings: BetaFeatureSettings | null | undefined,
  shortcutId: string
): boolean {
  if (!Object.prototype.hasOwnProperty.call(shortcutFeatures, shortcutId)) return true
  return isBetaFeatureEnabled(settings, shortcutFeatures[shortcutId])
}
