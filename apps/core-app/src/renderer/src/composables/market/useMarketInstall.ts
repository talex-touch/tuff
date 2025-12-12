import type { ITouchClientChannel } from '@talex-touch/utils/channel'
import { useI18n } from 'vue-i18n'
import { useInstallManager } from '~/modules/install/install-manager'
import { forTouchTip } from '~/modules/mention/dialog-mention'
import type { MarketPluginListItem } from './useMarketData'

const NEXUS_URL = import.meta.env.VITE_NEXUS_URL || 'https://tuff.tagzxia.com'

export interface InstallOptions {
  /** Whether this is an upgrade (force update existing plugin) */
  isUpgrade?: boolean
  /** Auto re-enable plugin after upgrade */
  autoReEnable?: boolean
}

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

  /**
   * Confirm upgrade with warning that plugin will be stopped
   */
  async function confirmUpgrade(plugin: MarketPluginListItem): Promise<boolean> {
    let confirmed = false

    await forTouchTip(
      t('market.upgradeDialog.confirmTitle'),
      t('market.upgradeDialog.confirmMessage', { name: plugin.name }),
      [
        {
          content: t('market.upgradeDialog.confirmUpgrade'),
          type: 'success',
          onClick: async () => {
            confirmed = true
            return true
          }
        },
        {
          content: t('market.upgradeDialog.confirmCancel'),
          type: 'default',
          onClick: async () => {
            return true
          }
        }
      ]
    )

    return confirmed
  }

  function resolveDownloadUrl(plugin: MarketPluginListItem): string | undefined {
    let url: string | undefined

    if (typeof plugin.downloadUrl === 'string' && plugin.downloadUrl.length > 0) {
      url = plugin.downloadUrl
    } else if (plugin.install?.type === 'url' && plugin.install.url) {
      url = plugin.install.url
    }

    if (!url) return undefined

    // If the URL is a relative path starting with /api/, prepend NEXUS_URL
    if (url.startsWith('/api/')) {
      return `${NEXUS_URL}${url}`
    }

    return url
  }

  async function handleInstall(
    plugin: MarketPluginListItem,
    channel: ITouchClientChannel | undefined,
    options?: InstallOptions
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
      // For upgrades, show upgrade confirmation
      if (options?.isUpgrade) {
        const upgradeConfirmed = await confirmUpgrade(plugin)
        if (!upgradeConfirmed) {
          return
        }
      } else {
        // If not trusted, user must confirm first
        const userConfirmed = await confirmUntrusted(plugin)
        if (!userConfirmed) {
          return
        }
      }

      const downloadUrl = resolveDownloadUrl(plugin)
      if (!downloadUrl) {
        throw new Error('MARKET_INSTALL_NO_SOURCE')
      }

      // After user confirmation, mark as trusted to skip backend confirmation
      const isTrusted = plugin.trusted === true || true // User already confirmed

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
          trusted: isTrusted,
          // Upgrade options
          forceUpdate: options?.isUpgrade ?? false,
          autoReEnable: options?.autoReEnable ?? true
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
        const successTitle = options?.isUpgrade
          ? t('market.upgradeDialog.successTitle')
          : t('market.installation.successTitle')
        const successMessage = options?.isUpgrade
          ? t('market.upgradeDialog.successMessage', { name: plugin.name })
          : t('market.installation.successMessage', { name: plugin.name })

        await forTouchTip(successTitle, successMessage)
      } else {
        const reason = result?.message || 'INSTALL_FAILED'
        throw new Error(reason)
      }
    } catch (error: any) {
      console.error('[Market] Plugin install failed:', error)

      // Handle active UI error specially
      const errorMessage = error?.message || 'UNKNOWN_ERROR'
      if (errorMessage.startsWith('PLUGIN_HAS_ACTIVE_UI:')) {
        const uiInfo = errorMessage.replace('PLUGIN_HAS_ACTIVE_UI:', '')
        await forTouchTip(
          t('market.upgradeDialog.activeUITitle'),
          t('market.upgradeDialog.activeUIMessage', { name: plugin.name, ui: uiInfo })
        )
        return
      }

      const failureTitle = options?.isUpgrade
        ? t('market.upgradeDialog.failureTitle')
        : t('market.installation.failureTitle')

      await forTouchTip(
        failureTitle,
        t('market.installation.failureMessage', {
          name: plugin.name,
          reason: errorMessage
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
