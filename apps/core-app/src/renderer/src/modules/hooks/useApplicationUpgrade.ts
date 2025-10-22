import { h } from 'vue'
import { AppUpdate } from './api/useUpdate'
import AppUpdateView from '~/components/base/AppUpgradationView.vue'
import { popperMention } from '../mention/dialog-mention'
import { useAppState } from './useAppStates'

/**
 * Application upgrade related hooks
 */
export function useApplicationUpgrade() {
  const appUpdate = AppUpdate.getInstance()
  const { appStates } = useAppState()

  /**
   * Check application update
   * @returns Promise<void>
   */
  async function checkApplicationUpgrade(): Promise<void> {
    const res = await appUpdate.check()
    console.log(res)
    window.$startupInfo.appUpdate = res ? true : false

    if (res) {
      appStates.hasUpdate = true

      await popperMention('New Version Available', () => {
        return h(AppUpdateView, { release: res })
      })
    }
  }

  return {
    checkApplicationUpgrade
  }
}
