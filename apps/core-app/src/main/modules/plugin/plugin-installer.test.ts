import type { PreparedPluginInstall } from './plugin-installer'
import { PluginProviderType } from '@talex-touch/utils/plugin/providers'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { resolveMock, pluginResolverCtorMock } = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  pluginResolverCtorMock: vi.fn()
}))

vi.mock('./plugin-resolver', () => ({
  PluginResolver: pluginResolverCtorMock
}))

import { PluginInstaller } from './plugin-installer'

describe('PluginInstaller', () => {
  afterEach(() => {
    vi.clearAllMocks()
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
