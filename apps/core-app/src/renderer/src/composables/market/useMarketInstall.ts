import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import { useI18n } from 'vue-i18n'
import { useInstallManager } from '~/modules/install/install-manager'
import { forTouchTip } from '~/modules/mention/dialog-mention'
import type { MarketPluginListItem } from './useMarketData'

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

  async function confirmUntrusted(plugin: MarketPluginListItem): Promise<boolean> {
    if (plugin.trusted) return true

    let confirmed = false

    await forTouchTip(
      t('market.installation.confirmTitle'),
      t('market.installation.confirmMessage', { name: plugin.name }),
      [
        {
          content: t('market.installation.confirmInstall'),
          type: 'success',
          onClick: async () => {
            confirmed = true
            return true
          }
        },
        {
          content: t('market.installation.confirmReject'),
          type: 'warning',
          onClick: async () => {
            // Return true to close the dialog (confirmed remains false)
            return true
          }
        }
      ]
    )

    return confirmed
  }

  function resolveDownloadUrl(plugin: MarketPluginListItem): string | undefined {
    if (typeof plugin.downloadUrl === 'string' && plugin.downloadUrl.length > 0) {
      return plugin.downloadUrl
    }

    if (plugin.install?.type === 'url' && plugin.install.url) {
      return plugin.install.url
    }

    return undefined
  }

  async function handleInstall(
    plugin: MarketPluginListItem,
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
      // If not trusted, user must confirm first
      const userConfirmed = await confirmUntrusted(plugin)
      if (!userConfirmed) {
        return
      }

      const downloadUrl = resolveDownloadUrl(plugin)
      if (!downloadUrl) {
        throw new Error('MARKET_INSTALL_NO_SOURCE')
      }

      // After user confirmation, mark as trusted to skip backend confirmation
      const isTrusted = plugin.trusted === true || userConfirmed

      const payload: Record<string, unknown> = {
        source: downloadUrl,
        metadata: {
          officialId: plugin.id,
          officialVersion: plugin.version,
          officialSource: 'talex-touch/tuff-official-plugins',
          official: plugin.official === true,
          providerId: plugin.providerId,
          providerName: plugin.providerName,
          providerType: plugin.providerType,
          trusted: isTrusted
        },
        clientMetadata: {
          pluginId: plugin.id,
          pluginName: plugin.name,
          providerId: plugin.providerId,
          providerName: plugin.providerName
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
