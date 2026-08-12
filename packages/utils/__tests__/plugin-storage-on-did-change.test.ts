/**
 * onDidChange is typed and documented as `(newConfig) => void`, but the listener forwarded the
 * raw broadcast envelope `{ name, fileName }`, which carries no content at all (#868). A plugin
 * writing `onDidChange('settings.json', cfg => applyTheme(cfg.theme))` read `undefined` on every
 * write and had no way to reach the new value from the callback.
 *
 * The content is read back rather than added to the broadcast: the broadcast goes to every window
 * on every write, and plugin storage runs to 10MB, so putting file bodies on it would be a worse
 * trade than one read per subscriber.
 *
 * Reading back makes delivery asynchronous, which is a defect this change *introduces* if left
 * alone - two quick writes can resolve out of order. Hence the ticket, and hence a test for it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePluginStorage } from '../plugin/sdk/storage'
import { PluginEvents } from '../transport/events'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  on: vi.fn(),
  usePluginName: vi.fn(() => 'demo-plugin'),
  ensureRendererChannel: vi.fn(() => ({ send: vi.fn() })),
}))

vi.mock('../plugin/sdk/channel', () => ({
  ensureRendererChannel: mocks.ensureRendererChannel,
}))

vi.mock('../plugin/sdk/plugin-info', () => ({
  usePluginName: mocks.usePluginName,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({ send: mocks.send, on: mocks.on })),
}))

type Broadcast = { name: string, fileName?: string }

/** Subscribes and hands back the listener the SDK registered on the update event. */
function subscribe(fileName: string, callback: (value: unknown) => void): (data: Broadcast) => void {
  mocks.on.mockReturnValueOnce(vi.fn())
  usePluginStorage().onDidChange(fileName, callback)

  const listener = mocks.on.mock.calls.at(-1)?.[1] as ((data: Broadcast) => void) | undefined
  if (!listener) throw new Error('onDidChange registered no listener')
  return listener
}

describe('onDidChange delivers the new content', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.on.mockReset()
  })

  it('回调拿到的是文件新内容,不是 { name, fileName } 信封', async () => {
    const content = { theme: 'dark' }
    mocks.send.mockResolvedValue(content)
    const callback = vi.fn()

    subscribe('settings.json', callback)({ name: 'demo-plugin', fileName: 'settings.json' })
    await vi.waitFor(() => expect(callback).toHaveBeenCalled())

    expect(callback).toHaveBeenCalledWith(content)
    expect(mocks.send).toHaveBeenCalledWith(PluginEvents.storage.getFile, {
      pluginName: 'demo-plugin',
      fileName: 'settings.json',
    })
  })

  it('别的插件、别的文件的广播不触发回调,也不产生回读', async () => {
    mocks.send.mockResolvedValue({ theme: 'dark' })
    const callback = vi.fn()
    const listener = subscribe('settings.json', callback)

    listener({ name: 'other-plugin', fileName: 'settings.json' })
    listener({ name: 'demo-plugin', fileName: 'other.json' })
    await Promise.resolve()

    expect(mocks.send).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()
  })

  it('clearStorage 的无 fileName 广播仍然通知每个订阅者,并读回 null', async () => {
    // clearStorage() empties every storage root, so settings.json really is gone. Staying silent
    // here would leave the subscriber serving state for a file that no longer exists.
    mocks.send.mockResolvedValue(null)
    const callback = vi.fn()

    subscribe('settings.json', callback)({ name: 'demo-plugin' })
    await vi.waitFor(() => expect(callback).toHaveBeenCalled())

    expect(callback).toHaveBeenCalledWith(null)
  })

  it('两次快速写入乱序返回时,回调只看到最后一次请求的内容', async () => {
    const first = { version: 1 }
    const second = { version: 2 }
    let resolveFirst: (value: unknown) => void = () => {}
    mocks.send
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce(second)

    const callback = vi.fn()
    const listener = subscribe('settings.json', callback)
    listener({ name: 'demo-plugin', fileName: 'settings.json' })
    listener({ name: 'demo-plugin', fileName: 'settings.json' })
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(second))

    // The first read resolves last, carrying stale content.
    resolveFirst(first)
    await Promise.resolve()
    await Promise.resolve()

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).not.toHaveBeenCalledWith(first)
  })

  it('回读失败时报错而不是抛出未处理的 rejection', async () => {
    const failure = new Error('storage unavailable')
    mocks.send.mockRejectedValue(failure)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const callback = vi.fn()

    subscribe('settings.json', callback)({ name: 'demo-plugin', fileName: 'settings.json' })
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled())

    expect(callback).not.toHaveBeenCalled()
    expect(consoleError.mock.calls[0]?.[0]).toContain('settings.json')
    consoleError.mockRestore()
  })

  it('退订仍然返回 transport 给的取消函数', () => {
    const dispose = vi.fn()
    mocks.on.mockReturnValueOnce(dispose)

    usePluginStorage().onDidChange('settings.json', vi.fn())()

    expect(dispose).toHaveBeenCalled()
  })
})
