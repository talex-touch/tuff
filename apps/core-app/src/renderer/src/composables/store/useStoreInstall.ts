import type {
  PluginInstallSourceRequest,
  PluginInstallSourceResponse
} from '@talex-touch/utils/transport/events/types'
import type { StorePluginListItem } from './useStoreData'
import { formatNpmPluginSource } from '@talex-touch/utils/plugin'
import { PluginProviderType } from '@talex-touch/utils/plugin/providers/types'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createPluginSdk } from '@talex-touch/utils/transport/sdk/domains/plugin'
import { useI18n } from 'vue-i18n'
import { getAuthBaseUrl } from '~/modules/auth/auth-env'
import { useInstallManager } from '~/modules/install/install-manager'
import { forTouchTip } from '~/modules/mention/dialog-mention'
import { createRendererLogger } from '~/utils/renderer-log'
import {
  resolveStoreInstallActiveUi,
  resolveStoreInstallFailureReason
} from './store-install-error-utils'
import { usePluginVersionStatus } from './usePluginVersionStatus'

const storeInstallLog = createRendererLogger('StoreInstall')

export interface InstallOptions {
  /** Whether this is an upgrade (force update existing plugin) */
  isUpgrade?: boolean
  /** Auto re-enable plugin after upgrade */
  autoReEnable?: boolean
}

export interface ResolvedStoreInstallTarget {
  source: string
  hintType?: PluginProviderType
  registry?: string
}

function readTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isGithubUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com'
  } catch {
    return false
  }
}

export function resolveStoreInstallTarget(
  plugin: StorePluginListItem,
  authBaseUrl: string
): ResolvedStoreInstallTarget | null {
  if (plugin.providerType === 'tpexApi' && plugin.id && plugin.version) {
    return {
      source: `tpex:${plugin.id}@${plugin.version}`,
      hintType: PluginProviderType.TPEX
    }
  }

  if (plugin.install?.type === 'npm') {
    const npmInstall = plugin.install as {
      type: 'npm'
      packageName?: string
      version?: string
      registry?: string
      distTag?: string
    }
    const packageName = readTrimmedString(npmInstall.packageName)
    if (!packageName) {
      return null
    }

    const version = readTrimmedString(npmInstall.version) ?? readTrimmedString(plugin.version)
    const distTag =
      readTrimmedString(npmInstall.distTag) ?? readTrimmedString(plugin.metadata?.distTag)
    const registry =
      readTrimmedString(npmInstall.registry) ?? readTrimmedString(plugin.metadata?.registry)

    let source: string
    try {
      source = formatNpmPluginSource(packageName, version ?? distTag)
    } catch {
      throw new Error('PLUGIN_SOURCE_INVALID')
    }

    return {
      source,
      hintType: PluginProviderType.NPM,
      ...(registry ? { registry } : {})
    }
  }

  let url: string | undefined
  if (typeof plugin.downloadUrl === 'string' && plugin.downloadUrl.length > 0) {
    url = plugin.downloadUrl
  } else if (plugin.install?.type === 'url' && plugin.install.url) {
    url = plugin.install.url
  }

  if (url) {
    const resolvedUrl = url.startsWith('/api/') ? `${authBaseUrl}${url}` : url
    return {
      source: resolvedUrl,
      hintType: isGithubUrl(resolvedUrl) ? PluginProviderType.GITHUB : undefined
    }
  }

  if (plugin.install?.type === 'git' && plugin.install.repo) {
    const repo = plugin.install.repo.replace(/\/+$/, '').replace(/\.git$/i, '')
    const ref = plugin.install.ref?.trim()
    if (isGithubUrl(repo)) {
      return {
        source: ref ? `${repo}/tree/${encodeURIComponent(ref)}` : repo,
        hintType: PluginProviderType.GITHUB
      }
    }
    return {
      source: repo
    }
  }

  return null
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
  const { getPluginVersionStatus } = usePluginVersionStatus()

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

  function buildInstallPayload(
    plugin: StorePluginListItem,
    options?: InstallOptions
  ): PluginInstallSourceRequest {
    if (plugin.install?.type === 'npm') {
      const npmInstall = plugin.install as {
        type: 'npm'
        packageName?: string
        version?: string
        registry?: string
        distTag?: string
      }
      const target = resolveStoreInstallTarget(plugin, getAuthBaseUrl())
      const packageName = readTrimmedString(npmInstall.packageName)
      if (!target || !packageName) {
        throw new Error('STORE_INSTALL_NO_SOURCE')
      }

      const version = readTrimmedString(npmInstall.version) ?? readTrimmedString(plugin.version)
      const distTag =
        readTrimmedString(npmInstall.distTag) ?? readTrimmedString(plugin.metadata?.distTag)

      return {
        source: target.source,
        hintType: PluginProviderType.NPM,
        metadata: {
          packageName,
          ...(version ? { version } : {}),
          ...(target.registry ? { registry: target.registry } : {}),
          ...(distTag ? { distTag } : {}),
          ...(plugin.metadata?.officialScope !== undefined
            ? { officialScope: Boolean(plugin.metadata.officialScope) }
            : {}),
          official: plugin.official === true,
          pluginId: plugin.manifest?.id || plugin.id,
          providerId: plugin.providerId,
          providerName: plugin.providerName,
          providerType: plugin.providerType || 'npmPackage',
          // Upgrade options
          forceUpdate: options?.isUpgrade ?? false,
          autoReEnable: options?.autoReEnable ?? true
        },
        clientMetadata: {
          pluginId: plugin.id,
          pluginName: plugin.name,
          providerId: plugin.providerId,
          providerName: plugin.providerName,
          packageName
        }
      }
    }

    const target = resolveStoreInstallTarget(plugin, getAuthBaseUrl())
    if (!target) {
      throw new Error('STORE_INSTALL_NO_SOURCE')
    }

    return {
      source: target.source,
      hintType: target.hintType,
      metadata: {
        officialId: plugin.id,
        officialVersion: plugin.version,
        officialSource: plugin.official === true ? 'talex-touch/tuff-official-plugins' : undefined,
        official: plugin.official === true,
        channel: plugin.metadata?.channel,
        providerId: plugin.providerId,
        providerName: plugin.providerName,
        providerType: plugin.providerType,
        ...(target.registry ? { registry: target.registry } : {}),
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
  }

  async function handleInstall(
    plugin: StorePluginListItem,
    options?: InstallOptions
  ): Promise<void> {
    if (isPluginInstalling(plugin.id, plugin.providerId)) return

    try {
      const status = getPluginVersionStatus(plugin)
      if (status.isBundledManaged) {
        throw new Error('PRIVILEGED_PLUGIN_NAME_RESERVED')
      }
      if (options?.isUpgrade) {
        const upgradeConfirmed = await confirmUpgrade(plugin)
        if (!upgradeConfirmed) {
          return
        }
      }

      const payload = buildInstallPayload(plugin, options)

      const result: PluginInstallSourceResponse = await pluginSdk.installFromSource(payload)

      if (result?.status === 'success') {
        const successTitle = options?.isUpgrade
          ? t('store.upgradeDialog.successTitle')
          : t('store.installation.successTitle')
        const successMessage = options?.isUpgrade
          ? t('store.upgradeDialog.successMessage', { name: plugin.name })
          : t('store.installation.successMessage', { name: plugin.name })

        await forTouchTip(successTitle, successMessage, [
          { content: t('common.confirm'), type: 'info', onClick: async () => true }
        ])
      } else {
        const reason = result?.message || 'INSTALL_FAILED'
        throw new Error(reason)
      }
    } catch (error: unknown) {
      storeInstallLog.error('Plugin install failed:', error)

      // Handle active UI error specially
      const errorMessage = getErrorMessage(error)
      const activeUi = resolveStoreInstallActiveUi(errorMessage, t)
      if (activeUi !== null) {
        await forTouchTip(
          t('store.upgradeDialog.activeUITitle'),
          t('store.upgradeDialog.activeUIMessage', { name: plugin.name, ui: activeUi }),
          [{ content: t('common.confirm'), type: 'info', onClick: async () => true }]
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
        }),
        [{ content: t('common.confirm'), type: 'info', onClick: async () => true }]
      )
    }
  }

  return {
    getInstallTask,
    isPluginInstalling,
    handleInstall
  }
}
