import type {
  PluginInstallSourceRequest,
  PluginInstallSourceResponse
} from '@talex-touch/utils/transport/events/types'
import type { MarketPluginListItem } from './useMarketData'
import {
  CURRENT_SDK_VERSION,
  SUPPORTED_SDK_VERSIONS,
  isValidSdkVersion,
  parseSdkVersion
} from '@talex-touch/utils/plugin'
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

type SdkapiCheckLevel = 'ok' | 'warning' | 'error'
type SdkapiCheckReason = 'missing' | 'invalid' | 'unsupported' | 'tooNew' | 'legacy'

function normalizeSdkapi(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return parseSdkVersion(value)
  return undefined
}

/**
 * Composable for managing plugin installation
 * Handles plugin installation flow and status tracking
 */
export function useMarketInstall() {
  const { t } = useI18n()
  const installManager = useInstallManager()
  const transport = useTuffTransport()
  const pluginSdk = createPluginSdk(transport)

  function evaluateSdkapi(plugin: MarketPluginListItem): {
    level: SdkapiCheckLevel
    reason?: SdkapiCheckReason
    sdkapi?: number
    raw?: unknown
  } {
    const raw = plugin.sdkapi
    if (raw === undefined || raw === null) {
      return { level: 'error', reason: 'missing', raw }
    }

    const parsed = normalizeSdkapi(raw)
    if (parsed === undefined || !isValidSdkVersion(parsed)) {
      return { level: 'error', reason: 'invalid', raw }
    }

    if (!SUPPORTED_SDK_VERSIONS.includes(parsed)) {
      return { level: 'error', reason: 'unsupported', sdkapi: parsed, raw }
    }

    if (parsed > CURRENT_SDK_VERSION) {
      return { level: 'error', reason: 'tooNew', sdkapi: parsed, raw }
    }

    if (parsed < CURRENT_SDK_VERSION) {
      return { level: 'warning', reason: 'legacy', sdkapi: parsed, raw }
    }

    return { level: 'ok', sdkapi: parsed, raw }
  }

  function buildSdkapiMessage(
    plugin: MarketPluginListItem,
    result: ReturnType<typeof evaluateSdkapi>
  ): string {
    const name = plugin.name
    const sdkapi = result.sdkapi ? String(result.sdkapi) : ''
    const raw = result.raw !== undefined ? String(result.raw) : ''

    switch (result.reason) {
      case 'missing':
        return t('market.installation.sdkapi.blockMissing', { name, current: CURRENT_SDK_VERSION })
      case 'invalid':
        return t('market.installation.sdkapi.blockInvalid', {
          name,
          value: raw,
          current: CURRENT_SDK_VERSION
        })
      case 'unsupported':
        return t('market.installation.sdkapi.blockUnsupported', {
          name,
          version: sdkapi,
          current: CURRENT_SDK_VERSION
        })
      case 'tooNew':
        return t('market.installation.sdkapi.blockTooNew', {
          name,
          version: sdkapi,
          current: CURRENT_SDK_VERSION
        })
      case 'legacy':
        return t('market.installation.sdkapi.warnLegacy', {
          name,
          version: sdkapi,
          current: CURRENT_SDK_VERSION
        })
      default:
        return ''
    }
  }

  async function confirmSdkapiCompatibility(plugin: MarketPluginListItem): Promise<boolean> {
    const result = evaluateSdkapi(plugin)
    if (result.level === 'ok') return true

    if (result.level === 'error') {
      await forTouchTip(
        t('market.installation.sdkapi.blockTitle'),
        buildSdkapiMessage(plugin, result),
        [
          {
            content: t('market.installation.sdkapi.blockConfirm'),
            type: 'default',
            onClick: async () => true
          }
        ]
      )
      return false
    }

    let confirmed = false
    await forTouchTip(
      t('market.installation.sdkapi.warnTitle'),
      buildSdkapiMessage(plugin, result),
      [
        {
          content: t('market.installation.sdkapi.warnContinue'),
          type: 'warning',
          onClick: async () => {
            confirmed = true
            return true
          }
        },
        {
          content: t('market.installation.sdkapi.warnCancel'),
          type: 'default',
          onClick: async () => true
        }
      ]
    )
    return confirmed
  }

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
      return `${getAuthBaseUrl()}${url}`
    }

    return url
  }

  async function handleInstall(
    plugin: MarketPluginListItem,
    options?: InstallOptions
  ): Promise<void> {
    if (isPluginInstalling(plugin.id, plugin.providerId)) return

    try {
      const sdkapiConfirmed = await confirmSdkapiCompatibility(plugin)
      if (!sdkapiConfirmed) return

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
    } catch (error: unknown) {
      console.error('[Market] Plugin install failed:', error)

      // Handle active UI error specially
      const errorMessage = getErrorMessage(error)
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
