import type { IManifest } from '@talex-touch/utils/plugin'
import type {
  PluginInstallRequest,
  PluginInstallSummary
} from '@talex-touch/utils/plugin/providers'
import { PluginProviderType } from '@talex-touch/utils/plugin/providers'

export interface PluginInstallSourceRecord {
  value?: string | null
}

export interface PluginInstallSourceDb {
  getPluginData: (
    pluginName: string,
    key: string
  ) => Promise<PluginInstallSourceRecord | null | undefined>
  setPluginData: (pluginName: string, key: string, value: unknown) => Promise<unknown>
}

export interface UninstallOwnerIdentity {
  pluginName: string
  pluginInstanceId: string
  activationGeneration: number
}

export function buildInstallSourcePayload(
  request: PluginInstallRequest,
  providerResult: PluginInstallSummary['providerResult']
): Record<string, unknown> {
  const providerMetadata =
    providerResult.metadata && typeof providerResult.metadata === 'object'
      ? { ...providerResult.metadata }
      : null

  return {
    source: request.source,
    hintType: request.hintType ?? null,
    official: Boolean(providerResult.official),
    provider: providerResult.provider,
    installedAt: Date.now(),
    metadata: request.metadata ?? null,
    providerMetadata,
    clientMetadata: request.clientMetadata ?? null
  }
}

export async function persistPluginInstallSourceMetadata(
  dbUtils: Pick<PluginInstallSourceDb, 'setPluginData'>,
  params: {
    request: PluginInstallRequest
    manifest?: IManifest
    providerResult: PluginInstallSummary['providerResult']
  },
  onWarn: (message: string, pluginName?: string, error?: Error) => void
): Promise<void> {
  const pluginName = params.manifest?.name
  if (!pluginName) {
    onWarn('Failed to persist install metadata: missing plugin name')
    return
  }
  try {
    await dbUtils.setPluginData(
      pluginName,
      'install_source',
      buildInstallSourcePayload(params.request, params.providerResult)
    )
  } catch (error) {
    onWarn('Failed to save plugin source metadata', pluginName, error as Error)
  }
}

export async function getPluginInstallSourceData(
  dbUtils: Pick<PluginInstallSourceDb, 'getPluginData'>,
  pluginName: string,
  folderName: string
): Promise<PluginInstallSourceRecord | null | undefined> {
  const byPluginName = await dbUtils.getPluginData(pluginName, 'install_source')
  if (byPluginName || pluginName === folderName) {
    return byPluginName
  }
  return dbUtils.getPluginData(folderName, 'install_source')
}

export function createUninstallInstallSourceTracker(
  dbUtils: Pick<PluginInstallSourceDb, 'getPluginData'>
): {
  capture: (owner: UninstallOwnerIdentity) => Promise<void>
  consumeShouldSkipRemoteReport: (owner: UninstallOwnerIdentity) => boolean
} {
  const pendingProviders = new Map<string, string | null>()
  const getKey = (owner: UninstallOwnerIdentity): string =>
    `${owner.pluginName}:${owner.pluginInstanceId}:${owner.activationGeneration}`

  return {
    async capture(owner) {
      const ownerKey = getKey(owner)
      if (pendingProviders.has(ownerKey)) return
      try {
        const sourceData = await dbUtils.getPluginData(owner.pluginName, 'install_source')
        const raw = sourceData?.value
        if (typeof raw === 'string' && raw.trim().length > 0) {
          const parsed = JSON.parse(raw) as { provider?: unknown }
          if (typeof parsed?.provider === 'string' && parsed.provider.trim().length > 0) {
            pendingProviders.set(ownerKey, parsed.provider.trim().toLowerCase())
            return
          }
        }
        pendingProviders.set(ownerKey, null)
      } catch {
        pendingProviders.set(ownerKey, null)
      }
    },

    consumeShouldSkipRemoteReport(owner) {
      const ownerKey = getKey(owner)
      const provider = pendingProviders.get(ownerKey)
      pendingProviders.delete(ownerKey)
      return provider === PluginProviderType.NPM
    }
  }
}
