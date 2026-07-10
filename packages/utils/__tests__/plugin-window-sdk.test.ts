import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginEvents } from '../transport/events'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  useChannel: vi.fn(() => ({ send: vi.fn() })),
  tryGetPluginSdkApi: vi.fn(() => 260615),
}))

vi.mock('../plugin/sdk/channel', () => ({
  useChannel: mocks.useChannel,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({
    send: mocks.send,
  })),
}))

vi.mock('../plugin/sdk/plugin-info', () => ({
  tryGetPluginSdkApi: mocks.tryGetPluginSdkApi,
}))

import {
  createWindow,
  executeWindowCommand,
  setWindowProperty,
  toggleWinVisible,
} from '../plugin/sdk/window'

describe('Plugin Window SDK', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.useChannel.mockClear()
  })

  it('keeps existing window event names behind shared event objects', () => {
    expect(PluginEvents.window.new.toEventName()).toBe('window:new')
    expect(PluginEvents.window.visible.toEventName()).toBe('window:visible')
    expect(PluginEvents.window.command.toEventName()).toBe('window:command')
    expect(PluginEvents.window.property.toEventName()).toBe('window:property')
  })

  it('maps window operations to shared plugin window events', async () => {
    mocks.send
      .mockResolvedValueOnce({ id: 42 })
      .mockResolvedValueOnce({ visible: false })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })

    await expect(
      createWindow({
        file: 'views/index.html',
        options: { width: 640, height: 480, visible: false },
      }),
    ).resolves.toBe(42)
    await expect(toggleWinVisible(42, false)).resolves.toBe(false)
    await expect(executeWindowCommand(42, { type: 'focus' })).resolves.toBe(true)
    await expect(setWindowProperty(42, { window: { setAlwaysOnTop: [true] } })).resolves.toBe(true)

    expect(mocks.send).toHaveBeenNthCalledWith(1, PluginEvents.window.new, {
      file: 'views/index.html',
      options: { width: 640, height: 480, visible: false },
      _sdkapi: 260615,
    })
    expect(mocks.send).toHaveBeenNthCalledWith(2, PluginEvents.window.visible, {
      id: 42,
      visible: false,
      _sdkapi: 260615,
    })
    expect(mocks.send).toHaveBeenNthCalledWith(3, PluginEvents.window.command, {
      id: 42,
      command: { type: 'focus' },
      _sdkapi: 260615,
    })
    expect(mocks.send).toHaveBeenNthCalledWith(4, PluginEvents.window.command, {
      id: 42,
      command: { type: 'setAlwaysOnTop', value: true },
      _sdkapi: 260615,
    })
  })

  it('rejects remote and legacy BrowserWindow-shaped create requests before transport', async () => {
    await expect(createWindow({ url: 'https://example.test' } as never)).rejects.toMatchObject({
      code: 'PLUGIN_WINDOW_REMOTE_URL_DENIED',
    })
    await expect(
      createWindow({
        file: 'index.html',
        webPreferences: { preload: '/tmp/evil.js' },
      } as never),
    ).rejects.toMatchObject({ code: 'PLUGIN_WINDOW_OPTIONS_INVALID' })

    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('fails closed for removed reflective legacy properties', async () => {
    await expect(
      setWindowProperty(42, { window: { setTitle: ['Demo'] } } as never),
    ).rejects.toMatchObject({ code: 'PLUGIN_WINDOW_COMMAND_REMOVED' })
    await expect(
      setWindowProperty(42, { webContents: { openDevTools: [] } } as never),
    ).rejects.toMatchObject({ code: 'PLUGIN_WINDOW_COMMAND_REMOVED' })

    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('surfaces fail-closed permission errors returned by the transport boundary', async () => {
    mocks.send.mockResolvedValueOnce({
      code: 'PLUGIN_WINDOW_PERMISSION_DENIED',
      message: 'Permission denied.',
    })

    await expect(createWindow({ file: 'index.html' })).rejects.toMatchObject({
      code: 'PLUGIN_WINDOW_PERMISSION_DENIED',
      message: 'Permission denied.',
    })
  })
})
