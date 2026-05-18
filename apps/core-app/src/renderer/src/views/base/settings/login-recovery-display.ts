import type { Translate } from '~/modules/lang/useI18nText'

export interface LoginRecoveryDisplayState {
  authorizeUrl?: string
  userCode?: string
  browserOpenFailed?: boolean
}

export function resolveLoginManualHint(state: LoginRecoveryDisplayState, t: Translate): string {
  if (!state.authorizeUrl) return ''

  const code = state.userCode
  if (state.browserOpenFailed) {
    return code
      ? t('settingUser.loginDialogBrowserOpenFailedWithCode', { code })
      : t('settingUser.loginDialogBrowserOpenFailed')
  }

  return code
    ? t('settingUser.loginDialogManualHintWithCode', { code })
    : t('settingUser.loginDialogManualHint')
}
