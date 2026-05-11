import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

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

  it('persists values through the local-secret fallback when safeStorage is unavailable', async () => {
    const requireMock = vi.fn(() => ({
      safeStorage: {
        isEncryptionAvailable: vi.fn(() => false),
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

    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')

    await expect(secureStore.getSecureStoreHealth(rootPath)).resolves.toMatchObject({
      backend: 'local-secret',
      available: true,
      degraded: true
    })

    await expect(
      secureStore.setSecureStoreValue(rootPath, 'auth.token', 'token-value', 'auth-token')
    ).resolves.toBe(true)
    await expect(
      secureStore.getSecureStoreValue(rootPath, 'auth.token', 'auth-token')
    ).resolves.toBe('token-value')

    const secret = await readFile(path.join(rootPath, 'config', secureStore.LOCAL_SECRET_FILE), 'utf-8')
    expect(Buffer.from(secret.trim(), 'base64')).toHaveLength(32)
    const rawStore = await readFile(path.join(rootPath, 'config', secureStore.SECURE_STORE_FILE), 'utf-8')
    expect(rawStore).not.toContain('token-value')
    expect(secureStore.isSecureStoreAvailable(rootPath)).toBe(true)
  })

  it('marks local-secret fallback unavailable when the existing secret is corrupt', async () => {
    const requireMock = vi.fn(() => ({
      safeStorage: {
        isEncryptionAvailable: vi.fn(() => false),
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

    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')
    await secureStore.setSecureStoreValue(rootPath, 'auth.token', 'token-value', 'auth-token')
    await writeFile(path.join(rootPath, 'config', secureStore.LOCAL_SECRET_FILE), 'broken', 'utf-8')

    await expect(secureStore.getSecureStoreHealth(rootPath)).resolves.toMatchObject({
      backend: 'unavailable',
      available: false,
      degraded: true
    })
    expect(secureStore.isSecureStoreAvailable(rootPath)).toBe(false)
    await expect(secureStore.getSecureStoreValue(rootPath, 'auth.token', 'auth-token')).resolves.toBeNull()
  })
})
