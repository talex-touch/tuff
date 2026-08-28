import type {
  PluginInstallSourceRequest,
  PluginInstallSourceResponse
} from '@talex-touch/utils/transport/events/types'
import type { StorePluginListItem } from './useStoreData'
import { PluginProviderType } from '@talex-touch/utils/plugin/providers/types'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createPluginSdk } from '@talex-touch/utils/transport/sdk/domains/plugin'
import { useI18n } from 'vue-i18n'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { useInstallManager } from '~/modules/install/install-manager'
import { forTouchTip } from '~/modules/mention/dialog-mention'
import { createRendererLogger } from '~/utils/renderer-log'
import { resolveStoreInstallFailureReason } from './store-install-error-utils'

const storeInstallLog = createRendererLogger('StoreInstall')

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
      ],
      `store-upgrade:${plugin.providerId || 'default'}:${plugin.id}`
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
      if (options?.isUpgrade) {
        const upgradeConfirmed = await confirmUpgrade(plugin)
        if (!upgradeConfirmed) {
          return
        }
      }

      const downloadUrl = resolveDownloadUrl(plugin)
      if (!downloadUrl) {
        throw new Error('STORE_INSTALL_NO_SOURCE')
      }

      const registrySource =
        plugin.providerType === 'tpexApi' && plugin.id && plugin.version
          ? `tpex:${plugin.id}@${plugin.version}`
          : null

      const payload: PluginInstallSourceRequest = {
        source: registrySource ?? downloadUrl,
        hintType: registrySource ? PluginProviderType.TPEX : undefined,
        metadata: {
          officialId: plugin.id,
          officialVersion: plugin.version,
          officialSource: 'talex-touch/tuff-official-plugins',
          official: plugin.official === true,
          channel: plugin.metadata?.channel,
          providerId: plugin.providerId,
          providerName: plugin.providerName,
          providerType: plugin.providerType,
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
      storeInstallLog.error('Plugin install failed:', error)

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
          reason: resolveStoreInstallFailureReason(errorMessage, t)
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
