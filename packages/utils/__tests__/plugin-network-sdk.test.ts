import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkEvents } from '../transport/events'

const mocks = vi.hoisted(() => ({
  ensureRendererChannel: vi.fn(() => ({})),
  send: vi.fn(),
}))

vi.mock('../plugin/sdk/channel', () => ({
  ensureRendererChannel: mocks.ensureRendererChannel,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({ send: mocks.send })),
}))

import { usePluginNetwork } from '../plugin/sdk/network'

describe('Plugin Network SDK', () => {
  beforeEach(() => {
    mocks.ensureRendererChannel.mockClear()
    mocks.send.mockReset()
  })

  it('routes requests through the permission-gated host network event', async () => {
    const response = {
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { translatedText: '你好，世界' },
      url: 'https://example.test/translate',
    }
    mocks.send.mockResolvedValueOnce(response)

    const request = {
      method: 'POST' as const,
      url: 'https://example.test/translate',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Hello world' }),
    }

    await expect(usePluginNetwork().request<typeof response.data>(request)).resolves.toEqual(response)
    expect(mocks.ensureRendererChannel).toHaveBeenCalledOnce()
    expect(mocks.send).toHaveBeenCalledWith(NetworkEvents.api.request, request)
  })
})
