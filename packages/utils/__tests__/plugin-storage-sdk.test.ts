import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginEvents } from '../transport/events'

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
  send: vi.fn(),
  usePluginName: vi.fn(() => 'demo-plugin'),
  ensureRendererChannel: vi.fn(() => ({
    send: vi.fn(),
    regChannel: vi.fn(),
    unRegChannel: vi.fn(),
  })),
}))

vi.mock('../plugin/sdk/channel', () => ({
  ensureRendererChannel: mocks.ensureRendererChannel,
}))

vi.mock('../plugin/sdk/plugin-info', () => ({
  usePluginName: mocks.usePluginName,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({
    on: mocks.on,
    send: mocks.send,
  })),
}))

import { usePluginStorage } from '../plugin/sdk/storage'
import { usePluginSecret } from '../plugin/sdk/secret'

describe('Plugin Storage SDK', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.on.mockReset()
    mocks.usePluginName.mockClear()
    mocks.ensureRendererChannel.mockClear()
  })

  it('maps file operations to typed plugin storage events', async () => {
    const sdk = usePluginStorage()

    await sdk.getFile('settings.json')
    await sdk.setFile('settings.json', { theme: 'dark' })
    await sdk.deleteFile('settings.json')
    await sdk.listFiles()
    await sdk.clearAll()
    await sdk.openFolder()

    expect(mocks.send).toHaveBeenNthCalledWith(
      1,
      PluginEvents.storage.getFile,
      { pluginName: 'demo-plugin', fileName: 'settings.json' },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      PluginEvents.storage.setFile,
      {
        pluginName: 'demo-plugin',
        fileName: 'settings.json',
        content: { theme: 'dark' },
      },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      3,
      PluginEvents.storage.deleteFile,
      { pluginName: 'demo-plugin', fileName: 'settings.json' },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      4,
      PluginEvents.storage.listFiles,
      { pluginName: 'demo-plugin' },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      5,
      PluginEvents.storage.clear,
      { pluginName: 'demo-plugin' },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      6,
      PluginEvents.storage.openFolder,
      { pluginName: 'demo-plugin' },
    )
  })

  it('maps diagnostic operations to typed plugin storage events', async () => {
    const sdk = usePluginStorage()

    await sdk.getStats()
    await sdk.getTree()
    await sdk.getFileDetails('settings.json')

    expect(mocks.send).toHaveBeenNthCalledWith(
      1,
      PluginEvents.storage.getStats,
      { pluginName: 'demo-plugin' },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      PluginEvents.storage.getTree,
      { pluginName: 'demo-plugin' },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      3,
      PluginEvents.storage.getFileDetails,
      { pluginName: 'demo-plugin', fileName: 'settings.json' },
    )
  })

  it('listens to storage updates through typed plugin storage event', () => {
    const dispose = vi.fn()
    mocks.on.mockReturnValueOnce(dispose)
    const sdk = usePluginStorage()
    const callback = vi.fn()

    const unsubscribe = sdk.onDidChange('settings.json', callback)

    expect(mocks.on).toHaveBeenCalledWith(
      PluginEvents.storage.update,
      expect.any(Function),
    )

    const listener = mocks.on.mock.calls[0]?.[1] as
      | ((data: { name: string, fileName?: string }) => void)
      | undefined
    expect(listener).toBeTypeOf('function')
    listener?.({ name: 'other-plugin', fileName: 'settings.json' })
    listener?.({ name: 'demo-plugin', fileName: 'other.json' })
    listener?.({ name: 'demo-plugin', fileName: 'settings.json' })

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith({
      name: 'demo-plugin',
      fileName: 'settings.json',
    })

    unsubscribe()
    expect(dispose).toHaveBeenCalled()
  })

  it('maps plugin secret operations to namespaced typed storage events', async () => {
    const sdk = usePluginSecret()

    await sdk.get('providers.baidu.secretKey')
    await sdk.set('providers.baidu.secretKey', 'secret-value')
    await sdk.delete('providers.baidu.secretKey')

    expect(mocks.send).toHaveBeenNthCalledWith(
      1,
      PluginEvents.storage.getSecret,
      { pluginName: 'demo-plugin', key: 'providers.baidu.secretKey' },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      PluginEvents.storage.setSecret,
      { pluginName: 'demo-plugin', key: 'providers.baidu.secretKey', value: 'secret-value' },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      3,
      PluginEvents.storage.deleteSecret,
      { pluginName: 'demo-plugin', key: 'providers.baidu.secretKey' },
    )
  })
})
