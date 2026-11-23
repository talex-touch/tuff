import type { StorePluginListItem } from './useStoreData'
import { PluginProviderType } from '@talex-touch/utils/plugin/providers/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  installFromSource: vi.fn(),
  forTouchTip: vi.fn(),
  getTaskByPluginId: vi.fn(),
  isActiveStage: vi.fn(),
  getPluginVersionStatus: vi.fn()
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({})
}))

vi.mock('@talex-touch/utils/transport/sdk/domains/plugin', () => ({
  createPluginSdk: () => ({
    installFromSource: mockState.installFromSource
  })
}))

vi.mock('~/modules/auth/auth-env', () => ({
  getAuthBaseUrl: () => 'https://nexus.example.com'
}))

vi.mock('~/modules/install/install-manager', () => ({
  useInstallManager: () => ({
    getTaskByPluginId: mockState.getTaskByPluginId,
    isActiveStage: mockState.isActiveStage
  })
}))

vi.mock('~/modules/mention/dialog-mention', () => ({
  forTouchTip: mockState.forTouchTip
}))

vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  })
}))

vi.mock('./usePluginVersionStatus', () => ({
  usePluginVersionStatus: () => ({
    getPluginVersionStatus: mockState.getPluginVersionStatus
  })
}))

function createNpmPlugin(overrides: Partial<StorePluginListItem> = {}): StorePluginListItem {
  return {
    id: 'npm:@talex-touch/clipboard-history-plugin',
    name: 'Clipboard History',
    version: '1.2.0',
    description: 'Clipboard manager',
    downloadUrl:
      'https://registry.npmjs.org/@talex-touch/clipboard-history-plugin/-/clipboard-history-plugin-1.2.0.tgz',
    manifest: {
      id: 'com.talex.touch.clipboard-history',
      name: 'clipboard-history',
      sdkapi: 261011
    },
    install: {
      type: 'npm',
      packageName: '@talex-touch/clipboard-history-plugin',
      version: '1.2.0',
      registry: 'https://npm.example.com',
      ...({ distTag: 'latest' } as Record<string, unknown>)
    },
    metadata: {
      packageName: '@talex-touch/clipboard-history-plugin',
      registry: 'https://npm.example.com',
      distTag: 'latest',
      officialScope: true
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

describe('useStoreInstall', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.getTaskByPluginId.mockReturnValue(undefined)
    mockState.isActiveStage.mockReturnValue(false)
    mockState.getPluginVersionStatus.mockReturnValue({
      isInstalled: false,
      installedVersion: undefined,
      storeVersion: '1.2.0',
      hasUpgrade: false,
      sdkapi: 261011,
      isCompatible: true,
      isBundledManaged: false,
      compatibilityWarning: undefined
    })
    mockState.installFromSource.mockResolvedValue({ status: 'success' })
    mockState.forTouchTip.mockResolvedValue(undefined)
  })

  it('dispatches canonical npm:<pkg>@<version> source with PluginProviderType.NPM and registry metadata instead of tarball downloadUrl', async () => {
    const { useStoreInstall } = await import('./useStoreInstall')
    const { handleInstall } = useStoreInstall()

    await handleInstall(createNpmPlugin())

    expect(mockState.installFromSource).toHaveBeenCalledTimes(1)
    expect(mockState.installFromSource).toHaveBeenCalledWith({
      source: 'npm:@talex-touch/clipboard-history-plugin@1.2.0',
      hintType: PluginProviderType.NPM,
      metadata: expect.objectContaining({
        packageName: '@talex-touch/clipboard-history-plugin',
        version: '1.2.0',
        registry: 'https://npm.example.com',
        distTag: 'latest',
        officialScope: true,
        official: false,
        pluginId: 'com.talex.touch.clipboard-history',
        providerId: 'npm-scope',
        providerName: 'NPM Package',
        providerType: 'npmPackage',
        forceUpdate: false,
        autoReEnable: true
      }),
      clientMetadata: {
        pluginId: 'npm:@talex-touch/clipboard-history-plugin',
        pluginName: 'Clipboard History',
        providerId: 'npm-scope',
        providerName: 'NPM Package',
        packageName: '@talex-touch/clipboard-history-plugin'
      }
    })
  })

  it('installs npm plugins even when downloadUrl is empty and falls back to distTag when version is omitted', async () => {
    const { useStoreInstall } = await import('./useStoreInstall')
    const { handleInstall } = useStoreInstall()

    await handleInstall(
      createNpmPlugin({
        id: 'npm:tuff-plugin-weather',
        name: 'Weather',
        version: undefined,
        downloadUrl: '',
        install: {
          type: 'npm',
          packageName: 'tuff-plugin-weather',
          registry: 'https://registry.npmjs.org'
        },
        metadata: {
          distTag: 'beta',
          officialScope: false
        }
      })
    )

    expect(mockState.installFromSource).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'npm:tuff-plugin-weather@beta',
        hintType: PluginProviderType.NPM,
        metadata: expect.objectContaining({
          packageName: 'tuff-plugin-weather',
          registry: 'https://registry.npmjs.org',
          distTag: 'beta',
          providerType: 'npmPackage',
          official: false
        })
      })
    )
  })

  it('passes forceUpdate=true when upgrading an npm plugin after user confirmation', async () => {
    mockState.forTouchTip.mockImplementationOnce(
      async (
        _title: string,
        _message: string,
        actions: Array<{ onClick: () => Promise<boolean> }>
      ) => {
        await actions[0]?.onClick()
      }
    )

    const { useStoreInstall } = await import('./useStoreInstall')
    const { handleInstall } = useStoreInstall()

    await handleInstall(createNpmPlugin(), { isUpgrade: true, autoReEnable: true })

    expect(mockState.installFromSource).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'npm:@talex-touch/clipboard-history-plugin@1.2.0',
        hintType: PluginProviderType.NPM,
        metadata: expect.objectContaining({
          forceUpdate: true,
          autoReEnable: true
        })
      })
    )
  })

  it('preserves TPEX dispatch for tpexApi plugins', async () => {
    const { useStoreInstall } = await import('./useStoreInstall')
    const { handleInstall } = useStoreInstall()

    await handleInstall({
      id: 'com.tuffex.clipboard',
      name: 'Clipboard',
      version: '2.0.0',
      downloadUrl: '/api/downloads/clipboard.tpex',
      install: {
        type: 'url',
        url: '/api/downloads/clipboard.tpex',
        format: 'tpex'
      },
      providerId: 'tuff-nexus',
      providerName: 'Tuff Nexus',
      providerType: 'tpexApi',
      providerTrustLevel: 'official',
      trusted: true,
      official: true
    })

    expect(mockState.installFromSource).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'tpex:com.tuffex.clipboard@2.0.0',
        hintType: PluginProviderType.TPEX,
        metadata: expect.objectContaining({
          officialId: 'com.tuffex.clipboard',
          officialVersion: '2.0.0',
          official: true,
          providerType: 'tpexApi'
        })
      })
    )
  })

  it('surfaces failure dialog without calling installFromSource when npm package name is invalid', async () => {
    const { useStoreInstall } = await import('./useStoreInstall')
    const { handleInstall } = useStoreInstall()

    await handleInstall(
      createNpmPlugin({
        install: {
          type: 'npm',
          packageName: '../bad/package'
        }
      })
    )

    expect(mockState.installFromSource).not.toHaveBeenCalled()
    expect(mockState.forTouchTip).toHaveBeenCalledWith(
      'store.installation.failureTitle',
      expect.stringContaining('store.installation.reasons.sourceInvalid'),
      expect.any(Array)
    )
  })
})
