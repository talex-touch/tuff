import { afterEach, describe, expect, it, vi } from 'vitest'

describe('secure-store lazy safeStorage resolution', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('node:module')
  })

  it('does not touch electron.safeStorage until secure storage is explicitly used', async () => {
    const isEncryptionAvailableMock = vi.fn(() => false)
    const requireMock = vi.fn(() => ({
      safeStorage: {
        isEncryptionAvailable: isEncryptionAvailableMock,
        encryptString: vi.fn(),
        decryptString: vi.fn()
      }
    }))

    vi.doMock('node:module', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:module')>()
      return {
        ...actual,
        createRequire: vi.fn(() => requireMock)
      }
    })

    const secureStore = await import('./secure-store')

    expect(isEncryptionAvailableMock).not.toHaveBeenCalled()
    expect(requireMock).not.toHaveBeenCalled()
    expect(secureStore.isSecureStoreAvailable()).toBe(false)
    expect(requireMock).toHaveBeenCalledWith('electron')
    expect(isEncryptionAvailableMock).toHaveBeenCalledTimes(1)
  })
})
