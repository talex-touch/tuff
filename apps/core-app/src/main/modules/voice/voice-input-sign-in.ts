import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import { StorageList } from '@talex-touch/utils'
import { enableVoiceInputForSignIn } from '@talex-touch/utils/common/storage/entity/app-settings'
import { createLogger } from '../../utils/logger'
import { getSanitizedAuthSessionState, subscribeAuthState } from '../auth'
import { getMainConfig, saveMainConfig } from '../storage'

const voiceLog = createLogger('Voice')

/**
 * Turns dictation on when an account signs in, unless the user has chosen.
 *
 * The rule lives with the setting (`enableVoiceInputForSignIn`); this only feeds it every signed-in
 * state main sees. That includes the session restored at launch, not just a fresh sign-in: auth can
 * finish loading before this subscribes, so the current state is applied once up front.
 */
export function registerVoiceInputSignInDefault(): () => void {
  const apply = (signedIn: boolean): void => {
    if (!signedIn) return
    try {
      const setting = getMainConfig(StorageList.APP_SETTING) as AppSetting
      const wasEnabled = setting.voiceInput?.enabled === true
      if (!enableVoiceInputForSignIn(setting as unknown as Record<string, unknown>)) return
      saveMainConfig(StorageList.APP_SETTING, setting)
      if (!wasEnabled && setting.voiceInput.enabled) {
        voiceLog.info('Voice input turned on for the signed-in account')
      }
    } catch (error) {
      voiceLog.warn('Voice input sign-in default skipped', { error })
    }
  }

  const dispose = subscribeAuthState((state) => apply(state.isSignedIn))
  apply(getSanitizedAuthSessionState().isSignedIn)
  return dispose
}
