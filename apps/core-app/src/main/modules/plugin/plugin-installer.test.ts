import type { PreparedPluginInstall } from './plugin-installer'
import { PluginProviderType } from '@talex-touch/utils/plugin/providers'
import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  resolveMock,
  pluginResolverCtorMock,
  installFromRegistryMock,
  ensureDefaultProvidersRegisteredMock
} = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  pluginResolverCtorMock: vi.fn(),
  installFromRegistryMock: vi.fn(),
  ensureDefaultProvidersRegisteredMock: vi.fn()
}))

vi.mock('./plugin-resolver', () => ({
  PluginResolver: pluginResolverCtorMock
}))

vi.mock('./providers', () => ({
  installFromRegistry: installFromRegistryMock,
  ensureDefaultProvidersRegistered: ensureDefaultProvidersRegisteredMock
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getFocusedWindow: vi.fn(() => null)
  },
  dialog: {
    showMessageBox: vi.fn().mockResolvedValue({ response: 1 })
  }
}))

import { PluginInstaller } from './plugin-installer'

describe('PluginInstaller', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('blocks prepareInstall when manifest sdkapi is below enforced baseline', async () => {
    installFromRegistryMock.mockResolvedValue({
      filePath: '/plugins/legacy-plugin.tpex',
      provider: PluginProviderType.TPEX,
      official: false,
      manifest: {
        name: 'legacy-plugin',
        version: '1.0.0',
        sdkapi: 251211
      }
    })

    const installer = new PluginInstaller(async () => true)

    await expect(
      installer.prepareInstall({
        source: 'https://example.com/legacy-plugin.tpex'
      })
    ).rejects.toMatchObject({
      code: 'SDKAPI_BLOCKED',
      message: expect.stringContaining('sdkapi 251211')
    })
  })

  it('accepts success payload returned during finalizeInstall', async () => {
    pluginResolverCtorMock.mockImplementation(() => ({
      resolve: resolveMock.mockImplementation(async (callback) => {
        callback({
          event: { msg: 'success' },
          type: 'success'
        })
      })
    }))

    const installer = new PluginInstaller(async () => true)
    const prepared: PreparedPluginInstall = {
      request: { source: '/plugins/clipboard-history.tpex' },
      providerResult: {
        filePath: '/plugins/clipboard-history.tpex',
        provider: PluginProviderType.TPEX,
        official: true
      }
    }

    await expect(installer.finalizeInstall(prepared)).resolves.toEqual({
      manifest: undefined,
      providerResult: prepared.providerResult
    })

    expect(pluginResolverCtorMock).toHaveBeenCalledWith('/plugins/clipboard-history.tpex')
    expect(resolveMock).toHaveBeenCalledOnce()
  })
})
