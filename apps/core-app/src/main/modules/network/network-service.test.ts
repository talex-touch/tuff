import { NetworkCooldownError, NetworkHttpStatusError } from '@talex-touch/utils/network'
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
        setProxy,
      })),
    },
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp'),
  },
  session: electronMocks.session,
}))

vi.mock('../storage', () => ({
  getMainConfig: vi.fn(() => undefined),
  saveMainConfig: vi.fn(),
}))

vi.mock('../../utils/app-root-path', () => ({
  resolveRuntimeRootPath: vi.fn(() => '/tmp'),
}))

vi.mock('../../utils/local-file-policy', () => ({
  getAllowedLocalFileRoots: vi.fn(() => ['/tmp']),
  isAllowedLocalFilePath: vi.fn(() => true),
}))

vi.mock('../../utils/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}))

vi.mock('../../utils/secure-store', () => ({
  getSecureStoreValue: vi.fn(),
}))

describe('networkService cooldown policy', () => {
  beforeEach(() => {
    electronMocks.fetch.mockReset()
    electronMocks.setProxy.mockReset()
    electronMocks.session.fromPartition.mockClear()
    electronMocks.setProxy.mockResolvedValue(undefined)
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
        cooldownMs: 30_000,
      },
      retryPolicy: {
        maxRetries: 0,
      },
    }

    await expect(service.request(options)).rejects.toThrow('offline')
    await expect(service.request(options)).rejects.toBeInstanceOf(NetworkCooldownError)
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
        cooldownMs: 30_000,
      },
      retryPolicy: {
        maxRetries: 0,
      },
    }

    await expect(service.request(baseOptions)).rejects.toThrow('offline')
    await expect(
      service.request({ ...baseOptions, skipCooldownCheck: true }),
    ).resolves.toMatchObject({
      ok: true,
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
        cooldownMs: 30_000,
      },
      retryPolicy: {
        maxRetries: 0,
      },
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
      recovery: 'Sign in again',
    }
    electronMocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify(responseData), {
        status: 401,
        statusText: 'Unauthorized',
      }),
    )

    const request = service.request({
      method: 'POST',
      url: 'https://api.example.test/invoke',
      retryPolicy: {
        maxRetries: 0,
      },
    })

    await expect(request).rejects.toBeInstanceOf(NetworkHttpStatusError)
    await expect(request).rejects.toMatchObject({
      status: 401,
      code: 'NETWORK_HTTP_STATUS_401',
      responseData: undefined,
    })
  })

  it('captures non-2xx JSON response bodies when explicitly requested and records the failure', async () => {
    const service = new NetworkService()
    const responseData = {
      code: 'AUTH_INVALID',
      message: 'The access token is invalid',
      recovery: 'Sign in again',
    }
    electronMocks.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify(responseData), {
        status: 401,
        statusText: 'Unauthorized',
      }),
    )

    const request = service.request({
      method: 'POST',
      url: 'https://api.example.test/invoke',
      captureErrorResponseData: true,
      cooldownPolicy: {
        key: 'provider:invoke',
        failureThreshold: 1,
        cooldownMs: 30_000,
      },
      retryPolicy: {
        maxRetries: 0,
      },
    })

    await expect(request).rejects.toBeInstanceOf(NetworkHttpStatusError)
    await expect(request).rejects.toMatchObject({
      status: 401,
      responseData,
    })
    await expect(
      service.request({
        method: 'POST',
        url: 'https://api.example.test/invoke',
        cooldownPolicy: {
          key: 'provider:invoke',
          failureThreshold: 1,
          cooldownMs: 30_000,
        },
        retryPolicy: {
          maxRetries: 0,
        },
      }),
    ).rejects.toBeInstanceOf(NetworkCooldownError)
    expect(electronMocks.fetch).toHaveBeenCalledTimes(1)
  })
})
