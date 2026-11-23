import type { StorePluginListItem } from './useStoreData'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pluginMap = reactive(new Map<string, Record<string, unknown>>())

vi.mock('~/stores/plugin', () => ({
  usePluginStore: () => ({
    plugins: pluginMap
  })
}))

vi.mock('~/modules/install/install-manager', () => ({
  getPluginCompositeKey: (pluginId: string, providerId?: string) =>
    providerId ? `${providerId}::${pluginId}` : pluginId
}))

function createStorePlugin(overrides: Partial<StorePluginListItem> = {}): StorePluginListItem {
  return {
    id: 'npm:@talex-touch/clipboard-history-plugin',
    name: 'Clipboard History',
    version: '1.2.0',
    manifest: {
      id: 'com.talex.touch.clipboard-history',
      name: 'clipboard-history',
      sdkapi: 261011
    },
    install: {
      type: 'npm',
      packageName: '@talex-touch/clipboard-history-plugin',
      version: '1.2.0',
      registry: 'https://registry.npmjs.org'
    },
    metadata: {
      packageName: '@talex-touch/clipboard-history-plugin',
      registry: 'https://registry.npmjs.org',
      distTag: 'latest'
    },
    providerId: 'npm-scope',
    providerName: 'NPM Package',
    providerType: 'npmPackage',
    providerTrustLevel: 'unverified',
    trusted: false,
    official: false,
    ...overrides
  }
}

describe('usePluginVersionStatus', () => {
  beforeEach(() => {
    pluginMap.clear()
  })

  it('reconciles installed npm plugins via installSource.providerMetadata.packageName and detects updates', async () => {
    pluginMap.set('custom-runtime-slug', {
      name: 'custom-runtime-slug',
      version: '1.0.0',
      installSource: {
        provider: 'npm',
        source: 'npm:@acme/weather-plugin@1.0.0',
        providerMetadata: {
          packageName: '@acme/weather-plugin',
          resolvedVersion: '1.0.0',
          registry: 'https://registry.npmjs.org'
        }
      }
    })

    const { usePluginVersionStatus } = await import('./usePluginVersionStatus')
    const { getPluginVersionStatus, isPluginInstalled, getInstalledVersion } =
      usePluginVersionStatus()

    expect(isPluginInstalled('@acme/weather-plugin')).toBe(true)
    expect(isPluginInstalled('npm:@acme/weather-plugin')).toBe(true)
    expect(getInstalledVersion('npm:@acme/weather-plugin')).toBe('1.0.0')

    const status = getPluginVersionStatus(
      createStorePlugin({
        id: 'npm:@acme/weather-plugin',
        name: 'Acme Weather',
        version: '1.1.0',
        manifest: {
          id: 'com.acme.weather',
          name: 'acme-weather',
          sdkapi: 261011
        },
        install: {
          type: 'npm',
          packageName: '@acme/weather-plugin',
          version: '1.1.0'
        },
        metadata: {
          packageName: '@acme/weather-plugin'
        }
      })
    )

    expect(status).toMatchObject({
      isInstalled: true,
      installedVersion: '1.0.0',
      storeVersion: '1.1.0',
      hasUpgrade: true,
      sdkapi: 261011,
      isCompatible: true
    })
  })

  it('reconciles a plugin installed from Nexus with its NPM store card and vice versa', async () => {
    pluginMap.set('clipboard-history', {
      id: 'com.talex.touch.clipboard-history',
      name: 'clipboard-history',
      version: '1.2.0',
      installSource: {
        provider: 'tpex',
        source: 'tpex:com.talex.touch.clipboard-history@1.2.0',
        metadata: {
          officialId: 'com.talex.touch.clipboard-history',
          providerId: 'tuff-nexus'
        }
      }
    })

    const { usePluginVersionStatus } = await import('./usePluginVersionStatus')
    const { getPluginVersionStatus } = usePluginVersionStatus()

    // NPM card without tuff.name still matches via manifest.id / inferred npm plugin slug
    const npmCardStatus = getPluginVersionStatus(
      createStorePlugin({
        id: 'npm:@talex-touch/clipboard-history-plugin',
        name: '@talex-touch/clipboard-history-plugin',
        version: '1.3.0',
        manifest: undefined
      })
    )
    expect(npmCardStatus).toMatchObject({
      isInstalled: true,
      installedVersion: '1.2.0',
      storeVersion: '1.3.0',
      hasUpgrade: true
    })

    // Reverse direction: plugin installed from NPM matches Nexus store card
    pluginMap.clear()
    pluginMap.set('clipboard-history', {
      name: 'clipboard-history',
      version: '1.2.0',
      installSource: {
        provider: 'npm',
        source: 'npm:@talex-touch/clipboard-history-plugin@1.2.0',
        providerMetadata: {
          packageName: '@talex-touch/clipboard-history-plugin',
          resolvedVersion: '1.2.0'
        },
        metadata: {
          pluginId: 'com.talex.touch.clipboard-history',
          providerId: 'npm-scope'
        }
      }
    })

    const nexusCardStatus = getPluginVersionStatus({
      id: 'com.talex.touch.clipboard-history',
      name: 'Clipboard History',
      version: '1.2.0',
      manifest: {
        id: 'com.talex.touch.clipboard-history',
        name: 'clipboard-history',
        sdkapi: 261011
      },
      metadata: {
        npmPackageName: '@talex-touch/clipboard-history-plugin'
      },
      providerId: 'tuff-nexus',
      providerName: 'Tuff Nexus',
      providerType: 'tpexApi',
      providerTrustLevel: 'official',
      trusted: true,
      official: true
    })

    expect(nexusCardStatus).toMatchObject({
      isInstalled: true,
      installedVersion: '1.2.0',
      storeVersion: '1.2.0',
      hasUpgrade: false,
      isCompatible: true
    })
  })

  it('reconciles manual npm:<pkg>@<version> installs from installSource.source even without providerMetadata', async () => {
    pluginMap.set('weather', {
      name: 'weather',
      version: '0.8.0',
      installSource: {
        provider: 'npm',
        source: 'npm:tuff-plugin-weather@0.8.0'
      }
    })

    const { usePluginVersionStatus } = await import('./usePluginVersionStatus')
    const { getPluginVersionStatus } = usePluginVersionStatus()

    const status = getPluginVersionStatus(
      createStorePlugin({
        id: 'npm:tuff-plugin-weather',
        name: 'Weather Forecast',
        version: '0.9.0',
        manifest: {
          id: 'com.example.weather',
          name: 'weather-forecast',
          sdkapi: 261011
        },
        install: {
          type: 'npm',
          packageName: 'tuff-plugin-weather',
          version: '0.9.0'
        },
        metadata: {
          packageName: 'tuff-plugin-weather'
        }
      })
    )

    expect(status).toMatchObject({
      isInstalled: true,
      installedVersion: '0.8.0',
      storeVersion: '0.9.0',
      hasUpgrade: true
    })
  })

  it('evaluates sdkapi compatibility for npm catalog plugins declaring manifest.sdkapi', async () => {
    const { usePluginVersionStatus } = await import('./usePluginVersionStatus')
    const { getPluginVersionStatus } = usePluginVersionStatus()

    const incompatible = getPluginVersionStatus(
      createStorePlugin({
        manifest: {
          id: 'com.example.outdated',
          name: 'outdated-plugin',
          sdkapi: 240101
        }
      })
    )

    expect(incompatible.sdkapi).toBe(240101)
    expect(incompatible.isCompatible).toBe(false)
    expect(incompatible.compatibilityWarning).toBeTruthy()
  })
})
