import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { registerSystemSecureStoreHandlers } from './system-secure-store-handlers'

const {
  getSecureStoreHealthMock,
  getSecureStoreValueMock,
  isSecureStoreAvailableMock,
  setSecureStoreValueMock
} = vi.hoisted(() => ({
  getSecureStoreHealthMock: vi.fn(),
  getSecureStoreValueMock: vi.fn(),
  isSecureStoreAvailableMock: vi.fn(),
  setSecureStoreValueMock: vi.fn()
}))

vi.mock('../utils/secure-store', () => ({
  getSecureStoreHealth: getSecureStoreHealthMock,
  getSecureStoreValue: getSecureStoreValueMock,
  isSecureStoreAvailable: isSecureStoreAvailableMock,
  setSecureStoreValue: setSecureStoreValueMock
}))

function createTransport() {
  const handlers = new Map<string, (payload: unknown, context: unknown) => unknown>()
  return {
    handlers,
    transport: {
      on: vi.fn((event: { toEventName: () => string }, handler) => {
        handlers.set(event.toEventName(), handler)
        return vi.fn()
      })
    }
  }
}

describe('registerSystemSecureStoreHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isSecureStoreAvailableMock.mockReturnValue(true)
    getSecureStoreValueMock.mockResolvedValue('secret')
    setSecureStoreValueMock.mockResolvedValue(true)
    getSecureStoreHealthMock.mockReturnValue({
      backend: 'local-secret',
      available: true,
      degraded: true
    })
  })

  it('returns null for missing secure value keys', async () => {
    const { handlers, transport } = createTransport()

    registerSystemSecureStoreHandlers(transport as never, {
      rootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() }
    })

    const result = await handlers.get(AppEvents.system.getSecureValue.toEventName())?.({}, {})

    expect(result).toBeNull()
    expect(getSecureStoreValueMock).not.toHaveBeenCalled()
  })

  it('reads secure values when storage is available', async () => {
    const { handlers, transport } = createTransport()

    registerSystemSecureStoreHandlers(transport as never, {
      rootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() }
    })

    const result = await handlers.get(AppEvents.system.getSecureValue.toEventName())?.(
      { key: 'auth.token' },
      {}
    )

    expect(result).toBe('secret')
    expect(isSecureStoreAvailableMock).toHaveBeenCalledWith('/tmp/tuff')
    expect(getSecureStoreValueMock).toHaveBeenCalledWith(
      '/tmp/tuff',
      'auth.token',
      expect.any(Function)
    )
  })

  it('returns null without reading values when secure storage is unavailable', async () => {
    isSecureStoreAvailableMock.mockReturnValueOnce(false)
    const { handlers, transport } = createTransport()

    registerSystemSecureStoreHandlers(transport as never, {
      rootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() }
    })

    const result = await handlers.get(AppEvents.system.getSecureValue.toEventName())?.(
      { key: 'auth.token' },
      {}
    )

    expect(result).toBeNull()
    expect(getSecureStoreValueMock).not.toHaveBeenCalled()
  })

  it('throws for missing set secure value keys', async () => {
    const { handlers, transport } = createTransport()

    registerSystemSecureStoreHandlers(transport as never, {
      rootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() }
    })

    await expect(
      handlers.get(AppEvents.system.setSecureValue.toEventName())?.({}, {})
    ).rejects.toThrow('Missing secure storage key')
  })

  it('writes secure values when storage is available', async () => {
    const { handlers, transport } = createTransport()

    registerSystemSecureStoreHandlers(transport as never, {
      rootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() }
    })

    await handlers.get(AppEvents.system.setSecureValue.toEventName())?.(
      { key: 'auth.token', value: 'next-secret' },
      {}
    )

    expect(setSecureStoreValueMock).toHaveBeenCalledWith(
      '/tmp/tuff',
      'auth.token',
      'next-secret',
      expect.any(Function)
    )
  })

  it('throws when secure storage is unavailable while writing', async () => {
    isSecureStoreAvailableMock.mockReturnValueOnce(false)
    const { handlers, transport } = createTransport()

    registerSystemSecureStoreHandlers(transport as never, {
      rootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() }
    })

    await expect(
      handlers.get(AppEvents.system.setSecureValue.toEventName())?.(
        { key: 'auth.token', value: 'next-secret' },
        {}
      )
    ).rejects.toThrow('Secure storage is unavailable')
  })

  it('reports secure store health for the configured root path', () => {
    const { handlers, transport } = createTransport()

    registerSystemSecureStoreHandlers(transport as never, {
      rootPath: () => '/tmp/tuff',
      logger: { warn: vi.fn() }
    })

    const result = handlers.get(AppEvents.system.getSecureStoreHealth.toEventName())?.({}, {})

    expect(result).toEqual({ backend: 'local-secret', available: true, degraded: true })
    expect(getSecureStoreHealthMock).toHaveBeenCalledWith('/tmp/tuff')
  })

  it('forwards secure store warnings through the CommonChannel logger', async () => {
    const logger = { warn: vi.fn() }
    getSecureStoreValueMock.mockImplementationOnce(async (_root, _key, warn) => {
      warn('Failed to decrypt secure store envelope', new Error('decrypt failed'))
      return null
    })
    const { handlers, transport } = createTransport()

    registerSystemSecureStoreHandlers(transport as never, {
      rootPath: () => '/tmp/tuff',
      logger
    })

    await handlers.get(AppEvents.system.getSecureValue.toEventName())?.({ key: 'auth.token' }, {})

    expect(logger.warn).toHaveBeenCalledWith(
      '[CommonChannel] Failed to decrypt secure store envelope',
      {
        error: 'decrypt failed'
      }
    )
  })
})
