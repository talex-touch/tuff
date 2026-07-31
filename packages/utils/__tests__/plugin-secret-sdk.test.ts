import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePluginSecret } from '../plugin/sdk/secret'

import { PluginEvents } from '../transport/events'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
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
  createPluginTuffTransport: vi.fn(() => ({ send: mocks.send })),
}))

describe('plugin Secret SDK', () => {
  beforeEach(() => {
    mocks.send.mockReset()
  })

  it('preserves successful and missing-value response shapes', async () => {
    mocks.send
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true })

    const secret = usePluginSecret()
    await expect(secret.get('token')).resolves.toBeNull()
    await expect(secret.set('token', 'value')).resolves.toEqual({ success: true })
    await expect(secret.delete('token')).resolves.toEqual({ success: true })

    expect(mocks.send).toHaveBeenNthCalledWith(1, PluginEvents.storage.getSecret, {
      pluginName: 'demo-plugin',
      key: 'token',
    })
  })

  it('preserves typed failure responses for secret mutations', async () => {
    const denied = {
      success: false as const,
      code: 'PLUGIN_STORAGE_PERMISSION_DENIED' as const,
      error: 'Plugin storage permission is denied.',
    }
    mocks.send.mockResolvedValue(denied)

    await expect(usePluginSecret().set('token', 'value')).resolves.toBe(denied)
  })

  it('preserves credential bytes and rejects hostile batches before transport', async () => {
    mocks.send.mockResolvedValue({ success: true })
    const secret = usePluginSecret()

    await expect(secret.setMany([{ key: 'providers.tencent.secretId', value: '  synthetic-id  ' }])).resolves.toEqual({
      success: true,
    })
    expect(mocks.send).toHaveBeenCalledWith(PluginEvents.storage.setSecretBatch, {
      pluginName: 'demo-plugin',
      entries: [{ key: 'providers.tencent.secretId', value: '  synthetic-id  ' }],
    })
    mocks.send.mockClear()

    const getter = vi.fn(() => 'synthetic')
    const accessor = Object.defineProperty({ key: 'token' }, 'value', { enumerable: true, get: getter })
    for (const entries of [
      Array.from({ length: 2 }),
      [accessor],
      [{ key: 'token', value: 'value', extra: true }],
      [{ key: 'token', value: 'x'.repeat(64 * 1024 + 1) }],
    ]) {
      await expect(secret.setMany(entries as never)).rejects.toBeInstanceOf(TypeError)
    }
    expect(getter).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('rejects malformed or oversized secret responses', async () => {
    const secret = usePluginSecret()
    for (const response of [undefined, '   ', 'x'.repeat(64 * 1024 + 1)]) {
      mocks.send.mockResolvedValueOnce(response)
      await expect(secret.get('token')).rejects.toMatchObject({
        name: 'PluginStorageError',
        operation: 'secret:get',
      })
    }
  })

  it('does not conflate rejected access with a missing secret', async () => {
    mocks.send.mockResolvedValue({
      success: false,
      code: 'PLUGIN_STORAGE_CALLER_UNVERIFIED',
      error: 'Authoritative plugin caller identity is required.',
    })

    await expect(usePluginSecret().get('token')).rejects.toMatchObject({
      name: 'PluginStorageError',
      code: 'PLUGIN_STORAGE_CALLER_UNVERIFIED',
      operation: 'secret:get',
    })
  })
})
