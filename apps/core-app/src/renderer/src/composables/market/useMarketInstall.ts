import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import { useI18n } from 'vue-i18n'
import { useInstallManager } from '~/modules/install/install-manager'
import { forTouchTip } from '~/modules/mention/dialog-mention'
import type { OfficialPluginListItem } from './useMarketData'

/**
 * Composable for managing plugin installation
 * Handles plugin installation flow and status tracking
 */
export function useMarketInstall() {
  const { t } = useI18n()
  const installManager = useInstallManager()

  function getInstallTask(pluginId?: string) {
    return installManager.getTaskByPluginId(pluginId)
  }

  function isPluginInstalling(pluginId?: string): boolean {
    return installManager.isActiveStage(getInstallTask(pluginId)?.stage)
  }

  async function handleInstall(
    plugin: OfficialPluginListItem,
    channel: ITouchClientChannel | undefined
  ): Promise<void> {
    if (isPluginInstalling(plugin.id)) return

    if (!channel) {
      await forTouchTip(
        t('market.installation.failureTitle'),
        t('market.installation.browserNotSupported')
      )
      return
    }

    try {
      const payload: Record<string, unknown> = {
        source: plugin.downloadUrl,
        metadata: {
          officialId: plugin.id,
          officialVersion: plugin.version,
          officialSource: 'talex-touch/tuff-official-plugins',
          official: plugin.official === true
        },
        clientMetadata: {
          pluginId: plugin.id,
          pluginName: plugin.name
        }
      }

      const result: any = await channel.send('plugin:install-source', payload)

      if (result?.status === 'success') {
        await forTouchTip(
          t('market.installation.successTitle'),
          t('market.installation.successMessage', { name: plugin.name })
        )
      } else {
        const reason = result?.message || 'INSTALL_FAILED'
        throw new Error(reason)
      }
    } catch (error: any) {
      console.error('[Market] Plugin install failed:', error)
      await forTouchTip(
        t('market.installation.failureTitle'),
        t('market.installation.failureMessage', {
          name: plugin.name,
          reason: error?.message || 'UNKNOWN_ERROR'
        })
      )
    }
  }

  return {
    getInstallTask,
    isPluginInstalling,
    handleInstall
  }
}
