import {
  NetworkAbortError,
  NetworkCooldownError,
  NetworkHttpStatusError,
  NetworkTimeoutError
} from '@talex-touch/utils/network'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkService } from './network-service'

const electronMocks = vi.hoisted(() => {
  const fetch = vi.fn()
  const setProxy = vi.fn()
  return {
    fetch,
    setProxy,
    session: {
      fromPartition: vi.fn(() => ({
        fetch,
        setProxy
      }))
    }
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp')
  },
  session: electronMocks.session
}))

vi.mock('../storage', () => ({
  getMainConfig: vi.fn(() => undefined),
  saveMainConfig: vi.fn()
}))

vi.mock('../../utils/app-root-path', () => ({
  resolveRuntimeRootPath: vi.fn(() => '/tmp')
}))

vi.mock('../../utils/local-file-policy', () => ({
  getAllowedLocalFileRoots: vi.fn(() => ['/tmp']),
  isAllowedLocalFilePath: vi.fn(() => true)
}))

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}))

vi.mock('../../utils/secure-store', () => ({
  getSecureStoreValue: vi.fn()
}))

describe('networkService cooldown policy', () => {
  beforeEach(() => {
    electronMocks.fetch.mockReset()
    electronMocks.setProxy.mockReset()
    electronMocks.session.fromPartition.mockClear()
    electronMocks.setProxy.mockResolvedValue(undefined)
  })

  it('keeps plugin-facing requests on the no-redirect network path', async () => {
    const service = new NetworkService()
    electronMocks.fetch.mockImplementation(async () => new Response('{}', { status: 200 }))

    await expect(
      service.requestNoRedirect({ method: 'GET', url: 'https://example.test/data' })
    ).resolves.toMatchObject({ ok: true })
    expect(electronMocks.fetch).toHaveBeenLastCalledWith(
      'https://example.test/data',
      expect.objectContaining({ redirect: 'error' })
    )

    await service.request({ method: 'GET', url: 'https://example.test/data' })
    expect(electronMocks.fetch).toHaveBeenLastCalledWith(
      'https://example.test/data',
      expect.objectContaining({ redirect: 'follow' })
    )
  })

  it('removes Node-managed content length from fetch adapters', async () => {
    const service = new NetworkService()
    electronMocks.fetch.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    await service.fetch('https://example.test/chat/completions', {
      method: 'POST',
      headers: {
        'content-length': '2',
        'content-type': 'application/json',
        'x-provider-header': 'preserved'
      },
      body: '{}'
    })

    const [, init] = electronMocks.fetch.mock.lastCall as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.has('content-length')).toBe(false)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-provider-header')).toBe('preserved')
  })

  it('exposes bodyless redirects through the manual stream path', async () => {
    const service = new NetworkService()
    electronMocks.fetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        statusText: 'Found',
        headers: { location: 'https://cdn.example.test/plugin.tpex' }
      })
    )

    const response = await service.requestStreamManualRedirect({
      method: 'GET',
      url: 'https://nexus.example.test/plugin.tpex',
      responseType: 'stream',
      validateStatus: [200, 301, 302, 303, 307, 308]
    })

    expect(response).toMatchObject({
      status: 302,
      headers: { location: 'https://cdn.example.test/plugin.tpex' }
    })
    expect(electronMocks.fetch).toHaveBeenCalledWith(
      'https://nexus.example.test/plugin.tpex',
      expect.objectContaining({ redirect: 'manual' })
    )
    await expect(
      (async () => {
        const chunks: Buffer[] = []
        for await (const chunk of response.stream) chunks.push(Buffer.from(chunk))
        return Buffer.concat(chunks)
      })()
    ).resolves.toEqual(Buffer.alloc(0))
  })

  it('still rejects a bodyless success response through the manual stream path', async () => {
    const service = new NetworkService()
    electronMocks.fetch.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        statusText: 'OK'
      })
    )

    await expect(
      service.requestStreamManualRedirect({
        method: 'GET',
        url: 'https://nexus.example.test/plugin.tpex',
        responseType: 'stream',
        retryPolicy: { maxRetries: 0 },
        validateStatus: [200, 301, 302, 303, 307, 308]
      })
    ).rejects.toThrow('NETWORK_EMPTY_STREAM_BODY')
  })

  it('pins plugin HTTP to the approved address, rejects redirects and bounds bytes while reading', async () => {
    const hits: string[] = []
    const server = createServer((request, response) => {
      hits.push(request.url ?? '')
      if (request.url === '/redirect') {
        response.writeHead(302, { location: '/internal' })
        response.end('redirect')
        return
      }
      if (request.url === '/large') {
        response.end('x'.repeat(2_048))
        return
      }
      response.end('internal')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const service = new NetworkService()
    try {
      await expect(
        service.requestPinnedNoRedirect(
          {
            method: 'GET',
            url: `http://rebind.invalid:${port}/redirect`,
            responseType: 'text',
            retryPolicy: { maxRetries: 0 },
            validateStatus: Array.from({ length: 500 }, (_, index) => index + 100)
          },
          { resolvedAddresses: ['127.0.0.1'], maxResponseBytes: 1_024 }
        )
      ).resolves.toMatchObject({ status: 302, data: 'redirect' })
      expect(hits).toEqual(['/redirect'])
      expect(electronMocks.fetch).not.toHaveBeenCalled()

      await expect(
        service.requestPinnedNoRedirect(
          {
            method: 'GET',
            url: `http://rebind.invalid:${port}/large`,
            responseType: 'text',
            retryPolicy: { maxRetries: 0 }
          },
          { resolvedAddresses: ['127.0.0.1'], maxResponseBytes: 1_024 }
        )
      ).rejects.toThrow('NETWORK_RESPONSE_TOO_LARGE')
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  })

  it('keeps caller cancellation neutral for pinned requests', async () => {
    let markRequestStarted!: () => void
    const requestStarted = new Promise<void>((resolve) => {
      markRequestStarted = resolve
    })
    const hits: string[] = []
    const server = createServer((request, response) => {
      hits.push(request.url ?? '')
      if (request.url === '/hang') {
        markRequestStarted()
        response.writeHead(200, { 'content-type': 'application/json' })
        response.write('{')
        return
      }
      response.end('{}')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const service = new NetworkService()
    const caller = new AbortController()
    const policy = { resolvedAddresses: ['127.0.0.1'], maxResponseBytes: 1_024 }
    const options = {
      method: 'GET' as const,
      url: `http://rebind.invalid:${port}/hang`,
      signal: caller.signal,
      cooldownPolicy: {
        key: 'plugin:pinned-cancel',
        failureThreshold: 1,
        cooldownMs: 30_000
      },
      retryPolicy: { maxRetries: 2 }
    }

    try {
      const request = service.requestPinnedNoRedirect(options, policy)
      await requestStarted
      caller.abort(new Error('private caller reason'))

      await expect(request).rejects.toMatchObject({
        name: 'NetworkAbortError',
        code: 'NETWORK_ABORTED',
        message: 'NETWORK_ABORTED'
      })
      await expect(
        service.requestPinnedNoRedirect(
          {
            ...options,
            url: `http://rebind.invalid:${port}/ok`,
            signal: undefined,
            retryPolicy: { maxRetries: 0 }
          },
          policy
        )
      ).resolves.toMatchObject({ ok: true })
      expect(hits).toEqual(['/hang', '/ok'])
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  })

  it('blocks ordinary requests while cooldown is active', async () => {
    const service = new NetworkService()
    electronMocks.fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))

    const options = {
      method: 'GET' as const,
      url: 'https://example.test/health',
      cooldownPolicy: {
        key: 'provider:health',
        failureThreshold: 1,
        cooldownMs: 30_000
      },
      retryPolicy: {
        maxRetries: 0
      }
    }

    await expect(service.request(options)).rejects.toThrow('offline')
    await expect(service.request(options)).rejects.toBeInstanceOf(NetworkCooldownError)
    expect(electronMocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('lets a pre-aborted caller take precedence over an active cooldown', async () => {
    const service = new NetworkService()
    const options = {
      method: 'GET' as const,
      url: 'https://example.test/health',
      cooldownPolicy: {
        key: 'provider:pre-aborted',
        failureThreshold: 1,
        cooldownMs: 30_000
      },
      retryPolicy: { maxRetries: 0 }
    }
    electronMocks.fetch.mockRejectedValueOnce(new Error('offline'))
    await expect(service.request(options)).rejects.toThrow('offline')

    const caller = new AbortController()
    caller.abort(new Error('private caller reason'))
    await expect(service.request({ ...options, signal: caller.signal })).rejects.toBeInstanceOf(
      NetworkAbortError
    )
    expect(electronMocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('interrupts retry backoff when the caller cancels', async () => {
    const service = new NetworkService()
    const caller = new AbortController()
    let markAttempted!: () => void
    const attempted = new Promise<void>((resolve) => {
      markAttempted = resolve
    })
    electronMocks.fetch.mockImplementationOnce(async () => {
      markAttempted()
      throw new Error('offline')
    })

    const request = service.request({
      method: 'GET',
      url: 'https://example.test/retry',
      signal: caller.signal,
      retryPolicy: {
        maxRetries: 2,
        baseDelayMs: 1_000,
        maxDelayMs: 1_000
      }
    })
    await attempted
    await new Promise<void>((resolve) => setImmediate(resolve))
    caller.abort(new Error('private caller reason'))

    const outcome = await Promise.race([
      request.then(
        () => ({ status: 'fulfilled' as const }),
        (error: unknown) => ({ status: 'rejected' as const, error })
      ),
      new Promise<{ status: 'pending' }>((resolve) =>
        setTimeout(() => resolve({ status: 'pending' }), 250)
      )
    ])
    expect(outcome).toMatchObject({
      status: 'rejected',
      error: { name: 'NetworkAbortError', code: 'NETWORK_ABORTED' }
    })
    expect(electronMocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('lets probe requests bypass cooldown and clear the key on success', async () => {
    const service = new NetworkService()
    electronMocks.fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const baseOptions = {
      method: 'GET' as const,
      url: 'https://example.test/health',
      cooldownPolicy: {
        key: 'provider:health',
        failureThreshold: 1,
        cooldownMs: 30_000
      },
      retryPolicy: {
        maxRetries: 0
      }
    }

    await expect(service.request(baseOptions)).rejects.toThrow('offline')
    await expect(
      service.request({ ...baseOptions, skipCooldownCheck: true })
    ).resolves.toMatchObject({
      ok: true
    })
    await expect(service.request(baseOptions)).resolves.toMatchObject({ ok: true })
    expect(electronMocks.fetch).toHaveBeenCalledTimes(3)
  })

  it('clears cooldown and notifies listeners when status recovers online', async () => {
    const service = new NetworkService()
    const listener = vi.fn()
    service.onStatusChange(listener)
    electronMocks.fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const options = {
      method: 'GET' as const,
      url: 'https://example.test/models',
      cooldownPolicy: {
        key: 'provider:models',
        failureThreshold: 1,
        cooldownMs: 30_000
      },
      retryPolicy: {
        maxRetries: 0
      }
    }

    await expect(service.request(options)).rejects.toThrow('offline')
    await expect(service.request(options)).rejects.toBeInstanceOf(NetworkCooldownError)

    const status = service.setOnlineStatus(true, 'online')

    expect(status).toMatchObject({ online: true, reason: 'online' })
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ online: true }))
    await expect(service.request(options)).resolves.toMatchObject({ ok: true })
    expect(electronMocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('does not notify listeners when repeated probes keep the same status', () => {
    const service = new NetworkService()
    const listener = vi.fn()
    service.onStatusChange(listener)

    service.setOnlineStatus(false, 'offline')
    service.setOnlineStatus(false, 'probe')
    service.setOnlineStatus(true, 'online')
    service.setOnlineStatus(true, 'probe')

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener.mock.calls.map(([payload]) => payload.online)).toEqual([false, true])
  })

  it('rejects non-2xx JSON responses without retaining their body by default', async () => {
    const service = new NetworkService()
    const responseData = {
      code: 'AUTH_INVALID',
      message: 'The access token is invalid',
      recovery: 'Sign in again'
    }
    electronMocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify(responseData), {
        status: 401,
        statusText: 'Unauthorized'
      })
    )

    const request = service.request({
      method: 'POST',
      url: 'https://api.example.test/invoke',
      retryPolicy: {
        maxRetries: 0
      }
    })

    await expect(request).rejects.toBeInstanceOf(NetworkHttpStatusError)
    await expect(request).rejects.toMatchObject({
      status: 401,
      code: 'NETWORK_HTTP_STATUS_401',
      responseData: undefined
    })
  })

  it('captures non-2xx JSON response bodies when explicitly requested and records the failure', async () => {
    const service = new NetworkService()
    const responseData = {
      code: 'AUTH_INVALID',
      message: 'The access token is invalid',
      recovery: 'Sign in again'
    }
    electronMocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify(responseData), {
        status: 401,
        statusText: 'Unauthorized'
      })
    )

    const request = service.request({
      method: 'POST',
      url: 'https://api.example.test/invoke',
      captureErrorResponseData: true,
      cooldownPolicy: {
        key: 'provider:invoke',
        failureThreshold: 1,
        cooldownMs: 30_000
      },
      retryPolicy: {
        maxRetries: 0
      }
    })

    await expect(request).rejects.toBeInstanceOf(NetworkHttpStatusError)
    await expect(request).rejects.toMatchObject({
      status: 401,
      responseData
    })
    await expect(
      service.request({
        method: 'POST',
        url: 'https://api.example.test/invoke',
        cooldownPolicy: {
          key: 'provider:invoke',
          failureThreshold: 1,
          cooldownMs: 30_000
        },
        retryPolicy: {
          maxRetries: 0
        }
      })
    ).rejects.toBeInstanceOf(NetworkCooldownError)
    expect(electronMocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('does not reset a prior failure when a stream only opens', async () => {
    const service = new NetworkService()
    const options = {
      method: 'GET' as const,
      url: 'https://example.test/stream',
      cooldownPolicy: {
        key: 'provider:stream',
        failureThreshold: 2,
        cooldownMs: 30_000,
        autoResetOnSuccess: true
      },
      retryPolicy: {
        maxRetries: 0
      }
    }
    electronMocks.fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream<Uint8Array>({
            start() {}
          })
        )
      )
      .mockRejectedValueOnce(new Error('offline'))

    await expect(service.request(options)).rejects.toThrow('offline')
    const response = await service.requestStream(options)

    try {
      await expect(service.request(options)).rejects.toThrow('offline')
      await expect(service.request(options)).rejects.toBeInstanceOf(NetworkCooldownError)
      expect(electronMocks.fetch).toHaveBeenCalledTimes(3)
    } finally {
      const closed = new Promise<void>((resolve) => response.stream.once('close', resolve))
      response.stream.destroy()
      await closed
    }
  })

  it('delivers stream data before an error records the threshold failure', async () => {
    const service = new NetworkService()
    const options = {
      method: 'GET' as const,
      url: 'https://example.test/stream',
      cooldownPolicy: {
        key: 'provider:stream',
        failureThreshold: 2,
        cooldownMs: 30_000,
        autoResetOnSuccess: true
      },
      retryPolicy: {
        maxRetries: 0
      }
    }
    let controller!: ReadableStreamDefaultController<Uint8Array>
    electronMocks.fetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(nextController) {
            controller = nextController
          }
        })
      )
    )

    await expect(service.request(options)).rejects.toThrow('offline')
    const response = await service.requestStream(options)
    const received = new Promise<Buffer>((resolve, reject) => {
      response.stream.once('data', (chunk) => resolve(Buffer.from(chunk)))
      response.stream.once('error', reject)
    })

    controller.enqueue(new TextEncoder().encode('partial'))
    await expect(received).resolves.toEqual(Buffer.from('partial'))

    const streamFailure = new Promise<never>((_resolve, reject) => {
      response.stream.once('error', reject)
    })
    controller.error(new Error('upstream dropped'))

    await expect(streamFailure).rejects.toThrow('upstream dropped')
    await expect(service.request(options)).rejects.toBeInstanceOf(NetworkCooldownError)
    expect(electronMocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('records an upstream AbortError-shaped stream failure instead of treating it as cancellation', async () => {
    const service = new NetworkService()
    const options = {
      method: 'GET' as const,
      url: 'https://example.test/stream',
      cooldownPolicy: {
        key: 'provider:upstream-abort',
        failureThreshold: 1,
        cooldownMs: 30_000
      },
      retryPolicy: { maxRetries: 0 }
    }
    let controller!: ReadableStreamDefaultController<Uint8Array>
    electronMocks.fetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(nextController) {
            controller = nextController
          }
        })
      )
    )

    const response = await service.requestStream(options)
    const streamFailure = new Promise<unknown>((resolve) => {
      response.stream.once('error', resolve)
    })
    const upstreamError = Object.assign(new Error('The operation was aborted'), {
      name: 'AbortError',
      code: 'ABORT_ERR'
    })
    controller.error(upstreamError)

    await expect(streamFailure).resolves.toBe(upstreamError)
    await expect(service.request(options)).rejects.toBeInstanceOf(NetworkCooldownError)
    expect(electronMocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('times out a stream body after response headers and partial data', async () => {
    const service = new NetworkService()
    let controller!: ReadableStreamDefaultController<Uint8Array>
    electronMocks.fetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(nextController) {
            controller = nextController
            controller.enqueue(new TextEncoder().encode('partial'))
          }
        })
      )
    )

    const response = await service.requestStream({
      method: 'GET',
      url: 'https://example.test/stream',
      timeoutMs: 100,
      retryPolicy: { maxRetries: 0 }
    })
    const chunks: Buffer[] = []
    const consumption = (async () => {
      for await (const chunk of response.stream) {
        chunks.push(Buffer.from(chunk))
      }
    })()

    try {
      const outcome = await Promise.race([
        consumption.then(
          () => ({ status: 'completed' as const }),
          (error: unknown) => ({ status: 'failed' as const, error })
        ),
        new Promise<{ status: 'pending' }>((resolve) =>
          setTimeout(() => resolve({ status: 'pending' }), 300)
        )
      ])

      expect(outcome.status).toBe('failed')
      expect(outcome).toMatchObject({
        error: {
          name: 'NetworkTimeoutError',
          code: 'NETWORK_TIMEOUT',
          timeoutMs: 100
        }
      })
      if (outcome.status === 'failed') {
        expect(outcome.error).toBeInstanceOf(NetworkTimeoutError)
      }
      expect(Buffer.concat(chunks).toString()).toBe('partial')
    } finally {
      try {
        controller.close()
      } catch {
        // The timeout destroys the bridged Node stream and cancels the Web stream.
      }
      await consumption.catch(() => undefined)
    }
  })

  it('projects the same timeout through a real fetch body that stays open after partial data', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.write('partial')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as AddressInfo).port
    const service = new NetworkService()
    electronMocks.fetch.mockImplementation(
      async (url: string, init?: RequestInit) => await globalThis.fetch(url, init)
    )

    try {
      const response = await service.requestStream({
        method: 'GET',
        url: `http://127.0.0.1:${port}/stream`,
        timeoutMs: 100,
        retryPolicy: { maxRetries: 0 }
      })
      const chunks: Buffer[] = []
      const consumption = (async () => {
        for await (const chunk of response.stream) chunks.push(Buffer.from(chunk))
      })()

      await expect(consumption).rejects.toBeInstanceOf(NetworkTimeoutError)
      expect(Buffer.concat(chunks).toString()).toBe('partial')
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  })

  it('keeps the header deadline when the caller also supplies a cancellation signal', async () => {
    const service = new NetworkService()
    const caller = new AbortController()
    electronMocks.fetch.mockImplementationOnce(
      async (_url: string, init?: RequestInit): Promise<Response> =>
        await new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          const rejectAbort = () => reject(signal?.reason ?? new Error('NETWORK_REQUEST_ABORTED'))
          if (signal?.aborted) rejectAbort()
          else signal?.addEventListener('abort', rejectAbort, { once: true })
        })
    )

    const request = service.requestStream({
      method: 'GET',
      url: 'https://example.test/stream',
      timeoutMs: 100,
      signal: caller.signal,
      retryPolicy: { maxRetries: 0 }
    })
    const outcome = await Promise.race([
      request.then(
        () => ({ status: 'completed' as const }),
        (error: unknown) => ({ status: 'failed' as const, error })
      ),
      new Promise<{ status: 'pending' }>((resolve) =>
        setTimeout(() => resolve({ status: 'pending' }), 300)
      )
    ])

    caller.abort(new Error('late caller reason'))
    await request.catch(() => undefined)
    expect(outcome).toMatchObject({
      status: 'failed',
      error: {
        name: 'NetworkTimeoutError',
        code: 'NETWORK_TIMEOUT',
        timeoutMs: 100
      }
    })
  })

  it('keeps a caller abort neutral before response headers and does not retry it', async () => {
    const service = new NetworkService()
    const caller = new AbortController()
    const options = {
      method: 'GET' as const,
      url: 'https://example.test/stream',
      signal: caller.signal,
      cooldownPolicy: {
        key: 'provider:header-cancel',
        failureThreshold: 1,
        cooldownMs: 30_000
      },
      retryPolicy: { maxRetries: 2 }
    }
    electronMocks.fetch
      .mockImplementationOnce(
        async (_url: string, init?: RequestInit): Promise<Response> =>
          await new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal
            const rejectAbort = () => reject(signal?.reason)
            if (signal?.aborted) rejectAbort()
            else signal?.addEventListener('abort', rejectAbort, { once: true })
          })
      )
      .mockResolvedValueOnce(new Response('{}'))

    const request = service.requestStream(options)
    caller.abort(new Error('private caller reason'))

    await expect(request).rejects.toMatchObject({
      name: 'NetworkAbortError',
      code: 'NETWORK_ABORTED',
      message: 'NETWORK_ABORTED'
    })
    await expect(
      service.request({ ...options, signal: undefined, retryPolicy: { maxRetries: 0 } })
    ).resolves.toMatchObject({ ok: true })
    expect(electronMocks.fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps a caller abort neutral after partial stream data', async () => {
    const service = new NetworkService()
    const caller = new AbortController()
    const options = {
      method: 'GET' as const,
      url: 'https://example.test/stream',
      timeoutMs: 1_000,
      signal: caller.signal,
      cooldownPolicy: {
        key: 'provider:body-cancel',
        failureThreshold: 2,
        cooldownMs: 30_000
      },
      retryPolicy: { maxRetries: 0 }
    }
    electronMocks.fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('partial'))
            }
          })
        )
      )
      .mockRejectedValueOnce(new Error('offline'))

    await expect(service.request(options)).rejects.toThrow('offline')
    const response = await service.requestStream(options)
    const chunks: Buffer[] = []
    let resolvePartial!: () => void
    const partialReceived = new Promise<void>((resolve) => {
      resolvePartial = resolve
    })
    const consumption = (async () => {
      for await (const chunk of response.stream) {
        chunks.push(Buffer.from(chunk))
        resolvePartial()
      }
    })()

    await partialReceived
    caller.abort(new Error('private caller reason'))

    await expect(consumption).rejects.toBeInstanceOf(NetworkAbortError)
    expect(Buffer.concat(chunks).toString()).toBe('partial')
    await expect(service.request({ ...options, signal: undefined })).rejects.toThrow('offline')
    await expect(service.request({ ...options, signal: undefined })).rejects.toBeInstanceOf(
      NetworkCooldownError
    )
    expect(electronMocks.fetch).toHaveBeenCalledTimes(3)
  })

  it('requires a caller signal when the stream opts out of the request deadline', async () => {
    const service = new NetworkService()

    await expect(
      service.requestStream({
        method: 'GET',
        url: 'https://example.test/stream',
        streamTimeoutMode: 'caller-signal'
      })
    ).rejects.toThrow('NETWORK_CALLER_SIGNAL_REQUIRED')
    expect(electronMocks.fetch).not.toHaveBeenCalled()
  })

  it('lets an explicit caller signal govern a healthy long-lived stream', async () => {
    const service = new NetworkService()
    const caller = new AbortController()
    let controller!: ReadableStreamDefaultController<Uint8Array>
    const finishTimer = setTimeout(() => {
      try {
        controller.enqueue(new TextEncoder().encode('-complete'))
        controller.close()
      } catch {
        // A failing implementation may already have cancelled the Web stream.
      }
    }, 150)
    electronMocks.fetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(nextController) {
            controller = nextController
            controller.enqueue(new TextEncoder().encode('partial'))
          }
        })
      )
    )

    const options = {
      method: 'GET' as const,
      url: 'https://example.test/stream',
      timeoutMs: 100,
      signal: caller.signal,
      streamTimeoutMode: 'caller-signal',
      retryPolicy: { maxRetries: 0 }
    } as Parameters<NetworkService['requestStream']>[0]
    const response = await service.requestStream(options)

    try {
      const chunks: Buffer[] = []
      for await (const chunk of response.stream) chunks.push(Buffer.from(chunk))
      expect(Buffer.concat(chunks).toString()).toBe('partial-complete')
    } finally {
      clearTimeout(finishTimer)
      caller.abort()
      try {
        controller.close()
      } catch {
        // The stream has already reached a terminal state.
      }
    }
  })

  it('lets a protocol consumer complete a hanging body as a successful request', async () => {
    const service = new NetworkService()
    const options = {
      method: 'GET' as const,
      url: 'https://example.test/stream',
      cooldownPolicy: {
        key: 'provider:protocol-complete',
        failureThreshold: 2,
        cooldownMs: 30_000,
        autoResetOnSuccess: true
      },
      retryPolicy: { maxRetries: 0 }
    }
    electronMocks.fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('done'))
            }
          })
        )
      )
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('{}'))

    await expect(service.request(options)).rejects.toThrow('offline')
    const response = await service.requestStream(options)
    const controlled = response as typeof response & { complete: () => void }
    const closed = new Promise<void>((resolve) => response.stream.once('close', resolve))
    controlled.complete()
    controlled.complete()
    await closed

    await expect(service.request(options)).rejects.toThrow('offline')
    await expect(service.request(options)).resolves.toMatchObject({ ok: true })
    expect(electronMocks.fetch).toHaveBeenCalledTimes(4)
  })

  it('resets prior failures after the stream body is fully consumed', async () => {
    const service = new NetworkService()
    const options = {
      method: 'GET' as const,
      url: 'https://example.test/stream',
      cooldownPolicy: {
        key: 'provider:stream',
        failureThreshold: 2,
        cooldownMs: 30_000,
        autoResetOnSuccess: true
      },
      retryPolicy: {
        maxRetries: 0
      }
    }
    electronMocks.fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('complete'))
              controller.close()
            }
          })
        )
      )
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('{}'))

    await expect(service.request(options)).rejects.toThrow('offline')
    const response = await service.requestStream(options)
    const chunks: Buffer[] = []
    for await (const chunk of response.stream) {
      chunks.push(Buffer.from(chunk))
    }

    expect(Buffer.concat(chunks).toString()).toBe('complete')
    await expect(service.request(options)).rejects.toThrow('offline')
    await expect(service.request(options)).resolves.toMatchObject({ ok: true })
    expect(electronMocks.fetch).toHaveBeenCalledTimes(4)
  })

  it('does not clear or add a failure when a consumer cancels a stream early', async () => {
    const service = new NetworkService()
    const options = {
      method: 'GET' as const,
      url: 'https://example.test/stream',
      cooldownPolicy: {
        key: 'provider:stream',
        failureThreshold: 2,
        cooldownMs: 30_000,
        autoResetOnSuccess: true
      },
      retryPolicy: {
        maxRetries: 0
      }
    }
    electronMocks.fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream<Uint8Array>({
            start() {}
          })
        )
      )
      .mockRejectedValueOnce(new Error('offline'))

    await expect(service.request(options)).rejects.toThrow('offline')
    const response = await service.requestStream(options)
    const controlled = response as typeof response & { cancel: () => void }
    const closed = new Promise<void>((resolve) => response.stream.once('close', resolve))
    controlled.cancel()
    controlled.cancel()
    await closed

    await expect(service.request(options)).rejects.toThrow('offline')
    await expect(service.request(options)).rejects.toBeInstanceOf(NetworkCooldownError)
    expect(electronMocks.fetch).toHaveBeenCalledTimes(3)
  })
})
