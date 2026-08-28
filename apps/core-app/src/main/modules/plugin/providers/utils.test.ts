import type { Readable } from 'node:stream'
import { NetworkTimeoutError } from '@talex-touch/utils/network'
import fse from 'fs-extra'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestStreamMock, requestStreamManualRedirectMock } = vi.hoisted(() => ({
  requestStreamMock: vi.fn(),
  requestStreamManualRedirectMock: vi.fn()
}))

vi.mock('../../network', () => ({
  getNetworkService: () => ({
    requestStream: requestStreamMock,
    requestStreamManualRedirect: requestStreamManualRedirectMock
  })
}))

import { Readable as NodeReadable, Writable } from 'node:stream'
import { downloadToTempFile } from './utils'

function createTimedOutStream(): Readable {
  return new NodeReadable({
    read() {
      this.destroy(new NetworkTimeoutError(42))
    }
  }) as Readable
}

function getHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
  const normalizedName = name.toLowerCase()
  return Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === normalizedName)?.[1]
}

function resolveRuntimeHeaders(
  url: URL,
  headers: Readonly<Record<string, string>>
): Record<string, string> {
  if (url.origin !== 'https://nexus.example.test') return { ...headers }
  if (getHeader(headers, 'authorization')) return { ...headers }
  return { ...headers, Authorization: 'Bearer runtime-token' }
}

describe('downloadToTempFile', () => {
  beforeEach(() => {
    requestStreamMock.mockReset()
    requestStreamManualRedirectMock.mockReset()
  })

  it('normalizes deadline-expired download streams to the configured timeout', async () => {
    requestStreamMock.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: { 'content-length': '64' },
      url: 'https://example.test/plugin.tpex',
      stream: createTimedOutStream()
    })

    await expect(
      downloadToTempFile('https://example.test/plugin.tpex', '.tpex', {
        timeout: 42,
        headers: { Authorization: 'Bearer acceptance-token' }
      })
    ).rejects.toMatchObject({
      name: 'NetworkTimeoutError',
      message: 'NETWORK_TIMEOUT after 42ms'
    })
    expect(requestStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { Authorization: 'Bearer acceptance-token' } })
    )
  })

  it('closes the writer before removing a partial file after a stream error', async () => {
    let partialPath = ''
    let writerClosed = false
    let createdWriter: ReturnType<typeof fse.createWriteStream> | undefined
    const originalCreateWriteStream = fse.createWriteStream
    const originalRemove = fse.remove
    const createWriteStreamSpy = vi.spyOn(fse, 'createWriteStream').mockImplementation(((
      filePath,
      options
    ) => {
      partialPath = filePath.toString()
      createdWriter = originalCreateWriteStream(filePath, options)
      createdWriter.once('close', () => {
        writerClosed = true
      })
      return createdWriter
    }) as typeof fse.createWriteStream)
    const removeSpy = vi.spyOn(fse, 'remove').mockImplementation(async (filePath) => {
      if (filePath.toString() === partialPath && !writerClosed) {
        throw Object.assign(new Error('resource busy'), { code: 'EBUSY' })
      }
      await originalRemove(filePath)
    })
    let emitted = false
    const failingStream = new NodeReadable({
      read() {
        if (emitted) return
        emitted = true
        this.push(Buffer.from('partial'))
        setImmediate(() => this.destroy(new Error('upstream failed')))
      }
    })
    requestStreamMock.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'https://example.test/plugin.tpex',
      stream: failingStream
    })

    try {
      await expect(downloadToTempFile('https://example.test/plugin.tpex', '.tpex')).rejects.toThrow(
        'upstream failed'
      )
      expect(partialPath).not.toBe('')
      expect(writerClosed).toBe(true)
      await expect(fse.pathExists(partialPath)).resolves.toBe(false)
    } finally {
      removeSpy.mockRestore()
      createWriteStreamSpy.mockRestore()
      if (createdWriter && !createdWriter.closed) {
        const closed = new Promise<void>((resolve) => createdWriter!.once('close', resolve))
        createdWriter.destroy()
        await closed
      }
      if (partialPath) await originalRemove(partialPath).catch(() => undefined)
    }
  })

  it('closes the writer before removing a partial file after a writer error', async () => {
    let partialPath = ''
    let writerClosed = false
    let createdWriter: Writable | undefined
    const originalRemove = fse.remove
    const createWriteStreamSpy = vi.spyOn(fse, 'createWriteStream').mockImplementation(((
      filePath
    ) => {
      partialPath = filePath.toString()
      createdWriter = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          fse.writeFileSync(partialPath, chunk)
          callback(new Error('writer failed'))
        }
      })
      createdWriter.once('close', () => {
        writerClosed = true
      })
      return createdWriter as unknown as ReturnType<typeof fse.createWriteStream>
    }) as typeof fse.createWriteStream)
    const removeSpy = vi.spyOn(fse, 'remove').mockImplementation(async (filePath) => {
      if (filePath.toString() === partialPath && !writerClosed) {
        throw Object.assign(new Error('resource busy'), { code: 'EBUSY' })
      }
      await originalRemove(filePath)
    })
    requestStreamMock.mockResolvedValueOnce({
      status: 200,
      statusText: 'OK',
      headers: {},
      url: 'https://example.test/plugin.tpex',
      stream: NodeReadable.from([Buffer.from('partial')])
    })

    try {
      await expect(downloadToTempFile('https://example.test/plugin.tpex', '.tpex')).rejects.toThrow(
        'writer failed'
      )
      expect(partialPath).not.toBe('')
      expect(writerClosed).toBe(true)
      await expect(fse.pathExists(partialPath)).resolves.toBe(false)
    } finally {
      removeSpy.mockRestore()
      createWriteStreamSpy.mockRestore()
      if (createdWriter && !createdWriter.closed) {
        const closed = new Promise<void>((resolve) => createdWriter!.once('close', resolve))
        createdWriter.destroy()
        await closed
      }
      if (partialPath) await originalRemove(partialPath).catch(() => undefined)
    }
  })

  it('recomputes headers per redirect and strips Authorization on a cross-origin hop', async () => {
    let redirectStreamClosed = false
    const redirectStream = new NodeReadable({
      read() {},
      destroy(error, callback) {
        setImmediate(() => {
          redirectStreamClosed = true
          callback(error)
        })
      }
    })
    requestStreamManualRedirectMock
      .mockResolvedValueOnce({
        status: 302,
        statusText: 'Found',
        headers: { Location: 'https://cdn.example.test/plugin.tpex' },
        url: 'https://nexus.example.test/start',
        stream: redirectStream
      })
      .mockImplementationOnce(async () => {
        expect(redirectStreamClosed).toBe(true)
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          url: 'https://cdn.example.test/plugin.tpex',
          stream: createTimedOutStream()
        }
      })

    await expect(
      downloadToTempFile('https://nexus.example.test/start', '.tpex', {
        timeout: 42,
        resolveHeadersForUrl: resolveRuntimeHeaders
      })
    ).rejects.toMatchObject({ name: 'NetworkTimeoutError' })

    expect(requestStreamManualRedirectMock).toHaveBeenCalledTimes(2)
    expect(
      getHeader(requestStreamManualRedirectMock.mock.calls[0]![0].headers, 'authorization')
    ).toBe('Bearer runtime-token')
    expect(
      getHeader(requestStreamManualRedirectMock.mock.calls[1]![0].headers, 'authorization')
    ).toBeUndefined()
  })

  it('preserves Authorization across a same-origin redirect', async () => {
    requestStreamManualRedirectMock
      .mockResolvedValueOnce({
        status: 307,
        statusText: 'Temporary Redirect',
        headers: { location: '/final.tpex' },
        url: 'https://nexus.example.test/start',
        stream: NodeReadable.from([])
      })
      .mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        url: 'https://nexus.example.test/final.tpex',
        stream: createTimedOutStream()
      })

    await expect(
      downloadToTempFile('https://nexus.example.test/start', '.tpex', {
        timeout: 42,
        headers: { authorization: 'Bearer explicit-token' },
        resolveHeadersForUrl: resolveRuntimeHeaders
      })
    ).rejects.toMatchObject({ name: 'NetworkTimeoutError' })

    expect(
      getHeader(requestStreamManualRedirectMock.mock.calls[1]![0].headers, 'authorization')
    ).toBe('Bearer explicit-token')
  })

  it.each([
    {
      name: 'missing Location',
      response: {
        status: 302,
        statusText: 'Found',
        headers: {},
        url: 'https://nexus.example.test/start',
        stream: NodeReadable.from([])
      },
      error: 'PLUGIN_DOWNLOAD_REDIRECT_LOCATION_MISSING'
    },
    {
      name: 'unsupported redirect protocol',
      response: {
        status: 302,
        statusText: 'Found',
        headers: { location: 'file:///tmp/plugin.tpex' },
        url: 'https://nexus.example.test/start',
        stream: NodeReadable.from([])
      },
      error: 'PLUGIN_DOWNLOAD_UNSUPPORTED_PROTOCOL'
    }
  ])('rejects $name before creating a partial file', async ({ response, error }) => {
    requestStreamManualRedirectMock.mockResolvedValueOnce(response)

    await expect(
      downloadToTempFile('https://nexus.example.test/start', '.tpex', {
        resolveHeadersForUrl: resolveRuntimeHeaders
      })
    ).rejects.toThrow(error)

    expect(requestStreamManualRedirectMock).toHaveBeenCalledOnce()
  })

  it('rejects a redirect chain that exceeds the bounded hop limit', async () => {
    for (let index = 0; index < 6; index += 1) {
      requestStreamManualRedirectMock.mockResolvedValueOnce({
        status: 302,
        statusText: 'Found',
        headers: { location: `/hop-${index + 1}` },
        url: `https://nexus.example.test/hop-${index}`,
        stream: NodeReadable.from([])
      })
    }

    await expect(
      downloadToTempFile('https://nexus.example.test/hop-0', '.tpex', {
        resolveHeadersForUrl: resolveRuntimeHeaders
      })
    ).rejects.toThrow('PLUGIN_DOWNLOAD_REDIRECT_LIMIT_EXCEEDED')

    expect(requestStreamManualRedirectMock).toHaveBeenCalledTimes(6)
  })
})
