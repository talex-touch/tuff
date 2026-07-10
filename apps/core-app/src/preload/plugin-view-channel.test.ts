import { describe, expect, it, vi } from 'vitest'
import { RAW_PLUGIN_PROCESS_CHANNEL } from '../shared/ipc/raw-channel'
import { createPluginViewChannel } from './plugin-view-channel'

function createIpcAdapter() {
  let listener: ((event: unknown, payload: unknown) => void) | undefined
  return {
    adapter: {
      on: vi.fn((_channel: string, next: (event: unknown, payload: unknown) => void) => {
        listener = next
      }),
      removeListener: vi.fn(),
      send: vi.fn()
    },
    emit(payload: unknown) {
      listener?.({}, payload)
    }
  }
}

describe('plugin view channel', () => {
  it('authenticates replies with the owning unique key', async () => {
    const ipc = createIpcAdapter()
    const channel = createPluginViewChannel(ipc.adapter, {
      uniqueKey: 'owner-key',
      timeoutMs: 1000,
      createRequestId: () => 'request-1'
    })

    const pending = channel.send('window:new', { file: 'index.html' })
    expect(ipc.adapter.send).toHaveBeenCalledWith(
      RAW_PLUGIN_PROCESS_CHANNEL,
      expect.objectContaining({
        name: 'window:new',
        header: expect.objectContaining({ uniqueKey: 'owner-key', type: 'plugin' })
      })
    )

    ipc.emit({
      name: 'window:new',
      code: 200,
      data: { id: 7 },
      sync: { id: 'request-1', timeout: 1000, timeStamp: Date.now() },
      header: { status: 'reply', type: 'plugin', uniqueKey: 'wrong-key' }
    })
    let settled = false
    void pending.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    ipc.emit({
      name: 'window:new',
      code: 200,
      data: { id: 7 },
      sync: { id: 'request-1', timeout: 1000, timeStamp: Date.now() },
      header: { status: 'reply', type: 'plugin', uniqueKey: 'owner-key' }
    })

    await expect(pending).resolves.toEqual({ id: 7 })
  })

  it('exposes async send/listen only and never leaks the ipc adapter', async () => {
    const ipc = createIpcAdapter()
    const channel = createPluginViewChannel(ipc.adapter, {
      uniqueKey: 'owner-key',
      createRequestId: () => 'request-2'
    })
    const handler = vi.fn(() => ({ accepted: true }))
    const dispose = channel.regChannel('plugin:event', handler)

    ipc.emit({
      name: 'plugin:event',
      code: 200,
      data: { value: 1 },
      sync: { id: 'main-request', timeout: 1000, timeStamp: Date.now() },
      header: { status: 'request', type: 'plugin', uniqueKey: 'owner-key' }
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'plugin:event', data: { value: 1 } })
    )
    expect(ipc.adapter.send).toHaveBeenCalledWith(
      RAW_PLUGIN_PROCESS_CHANNEL,
      expect.objectContaining({
        code: 200,
        data: { accepted: true },
        header: expect.objectContaining({ status: 'reply' })
      })
    )
    expect(channel).not.toHaveProperty('ipcRenderer')
    expect(channel).not.toHaveProperty('sendSync')

    dispose()
    channel.destroy()
  })
})
