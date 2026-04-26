import type { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

const { requestStreamMock } = vi.hoisted(() => ({
  requestStreamMock: vi.fn()
}))

vi.mock('../../network', () => ({
  getNetworkService: () => ({
    requestStream: requestStreamMock
  })
}))

import { Readable as NodeReadable } from 'node:stream'
import { downloadToTempFile } from './utils'

describe('downloadToTempFile', () => {
  it('normalizes aborted download streams to network timeout errors', async () => {
    const abortedStream = new NodeReadable({
      read() {
        this.destroy(new Error('The operation was aborted'))
      }
    }) as Readable

    requestStreamMock.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: { 'content-length': '64' },
      url: 'https://example.test/plugin.tpex',
      stream: abortedStream
    })

    await expect(
      downloadToTempFile('https://example.test/plugin.tpex', '.tpex', { timeout: 42 })
    ).rejects.toMatchObject({
      name: 'NetworkTimeoutError',
      message: 'NETWORK_TIMEOUT after 42ms'
    })
  })
})
