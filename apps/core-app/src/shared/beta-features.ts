import {
  appSettingOriginData,
  type AppSetting
} from '@talex-touch/utils/common/storage/entity/app-settings'

export type BetaFeature = keyof AppSetting['betaFeatures']

type BetaFeatureSettings = {
  betaFeatures?: Partial<AppSetting['betaFeatures']>
}

export const BETA_FEATURE_SHORTCUTS = {
  screenshot: 'screenshot.tool.start',
  voiceDictation: 'voice.dictation.toggle',
  voiceQuickEdit: 'voice.quickEdit',
  omniPanel: 'core.omniPanel.toggle'
} as const satisfies Record<BetaFeature, string>

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
