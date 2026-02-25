import type {
  PluginInstallSourceRequest,
  PluginInstallSourceResponse
} from '@talex-touch/utils/transport/events/types'
import type { StorePluginListItem } from './useStoreData'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createPluginSdk } from '@talex-touch/utils/transport/sdk/domains/plugin'
import { useI18n } from 'vue-i18n'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { useInstallManager } from '~/modules/install/install-manager'
import { forTouchTip } from '~/modules/mention/dialog-mention'

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
export function useStoreInstall() {
  const { t } = useI18n()
  const installManager = useInstallManager()
  const transport = useTuffTransport()
  const pluginSdk = createPluginSdk(transport)

  function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message
    }
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message
      if (typeof message === 'string') {
        return message
      }
    }
    return 'UNKNOWN_ERROR'
  }

  function getInstallTask(pluginId?: string, providerId?: string) {
    return installManager.getTaskByPluginId(pluginId, providerId)
  }

  function isPluginInstalling(pluginId?: string, providerId?: string): boolean {
    return installManager.isActiveStage(getInstallTask(pluginId, providerId)?.stage)
  }

  async function confirmUntrusted(plugin: StorePluginListItem): Promise<boolean> {
    if (plugin.trusted) return true

    let confirmed = false

    await forTouchTip(
      t('store.installation.confirmTitle'),
      t('store.installation.confirmMessage', { name: plugin.name }),
      [
        {
          content: t('store.installation.confirmInstall'),
          type: 'success',
          onClick: async () => {
            confirmed = true
            return true
          }
        },
        {
          content: t('store.installation.confirmReject'),
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
  async function confirmUpgrade(plugin: StorePluginListItem): Promise<boolean> {
    let confirmed = false

    await forTouchTip(
      t('store.upgradeDialog.confirmTitle'),
      t('store.upgradeDialog.confirmMessage', { name: plugin.name }),
      [
        {
          content: t('store.upgradeDialog.confirmUpgrade'),
          type: 'success',
          onClick: async () => {
            confirmed = true
            return true
          }
        },
        {
          content: t('store.upgradeDialog.confirmCancel'),
          type: 'default',
          onClick: async () => {
            return true
          }
        }
      ]
    )

    return confirmed
  }

  function resolveDownloadUrl(plugin: StorePluginListItem): string | undefined {
    let url: string | undefined

    if (typeof plugin.downloadUrl === 'string' && plugin.downloadUrl.length > 0) {
      url = plugin.downloadUrl
    } else if (plugin.install?.type === 'url' && plugin.install.url) {
      url = plugin.install.url
    }

    if (!url) return undefined

    // If the URL is a relative path starting with /api/, prepend NEXUS_URL
    if (url.startsWith('/api/')) {
      return `${getAuthBaseUrl()}${url}`
    }

    return url
  }

  async function handleInstall(
    plugin: StorePluginListItem,
    options?: InstallOptions
  ): Promise<void> {
    if (isPluginInstalling(plugin.id, plugin.providerId)) return

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
        throw new Error('STORE_INSTALL_NO_SOURCE')
      }

      // After user confirmation, mark as trusted to skip backend confirmation
      const isTrusted = plugin.trusted === true || true // User already confirmed

      const payload: PluginInstallSourceRequest = {
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

      const result: PluginInstallSourceResponse = await pluginSdk.installFromSource(payload)

      if (result?.status === 'success') {
        const successTitle = options?.isUpgrade
          ? t('store.upgradeDialog.successTitle')
          : t('store.installation.successTitle')
        const successMessage = options?.isUpgrade
          ? t('store.upgradeDialog.successMessage', { name: plugin.name })
          : t('store.installation.successMessage', { name: plugin.name })

        await forTouchTip(successTitle, successMessage)
      } else {
        const reason = result?.message || 'INSTALL_FAILED'
        throw new Error(reason)
      }
    } catch (error: unknown) {
      console.error('[Store] Plugin install failed:', error)

      // Handle active UI error specially
      const errorMessage = getErrorMessage(error)
      if (errorMessage.startsWith('PLUGIN_HAS_ACTIVE_UI:')) {
        const uiInfo = errorMessage.replace('PLUGIN_HAS_ACTIVE_UI:', '')
        await forTouchTip(
          t('store.upgradeDialog.activeUITitle'),
          t('store.upgradeDialog.activeUIMessage', { name: plugin.name, ui: uiInfo })
        )
        return
      }

      const failureTitle = options?.isUpgrade
        ? t('store.upgradeDialog.failureTitle')
        : t('store.installation.failureTitle')

      await forTouchTip(
        failureTitle,
        t('store.installation.failureMessage', {
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
