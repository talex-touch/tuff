import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

describe('secure-store encrypted backends', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('node:module')
  })

  it('uses Electron safeStorage when system encryption is available', async () => {
    const encryptString = vi.fn((value: string) => Buffer.from(`safe:${value}`, 'utf-8'))
    const decryptString = vi.fn((value: Buffer) => value.toString('utf-8').replace(/^safe:/, ''))

    vi.doMock('node:module', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:module')>()
      return {
        ...actual,
        createRequire: vi.fn(() =>
          vi.fn(() => ({
            safeStorage: {
              isEncryptionAvailable: () => true,
              encryptString,
              decryptString
            }
          }))
        )
      }
    })

    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')

    await expect(secureStore.getSecureStoreHealth(rootPath)).resolves.toMatchObject({
      backend: 'safe-storage',
      available: true,
      degraded: false
    })
    await expect(
      secureStore.setSecureStoreValue(rootPath, 'auth.token', 'token-value', 'auth-token')
    ).resolves.toBe(true)
    await expect(
      secureStore.getSecureStoreValue(rootPath, 'auth.token', 'auth-token')
    ).resolves.toBe('token-value')

    const secret = await readFile(
      path.join(rootPath, 'config', secureStore.SAFE_STORAGE_SECRET_FILE),
      'utf-8'
    )
    expect(Buffer.from(secret.trim(), 'base64').toString('utf-8')).toMatch(/^safe:/)
    expect(encryptString).toHaveBeenCalled()
    expect(decryptString).toHaveBeenCalled()
  })

  it('falls back to local root secret storage when safeStorage is unavailable', async () => {
    const requireMock = vi.fn()

    vi.doMock('node:module', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:module')>()
      return {
        ...actual,
        createRequire: vi.fn(() => requireMock)
      }
    })

    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')

    expect(secureStore.isSecureStoreAvailable()).toBe(false)
    expect(secureStore.isSecureStoreAvailable(rootPath)).toBe(true)
    await expect(secureStore.getSecureStoreHealth(rootPath)).resolves.toMatchObject({
      backend: 'local-secret',
      available: true,
      degraded: true
    })
    expect(requireMock).toHaveBeenCalledWith('electron')
  })

  it('persists values through local root secret storage', async () => {
    vi.doMock('node:module', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:module')>()
      return {
        ...actual,
        createRequire: vi.fn(() => vi.fn(() => ({})))
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

    const secret = await readFile(
      path.join(rootPath, 'config', secureStore.LOCAL_SECRET_FILE),
      'utf-8'
    )
    expect(Buffer.from(secret.trim(), 'base64')).toHaveLength(32)
    const rawStore = await readFile(
      path.join(rootPath, 'config', secureStore.SECURE_STORE_FILE),
      'utf-8'
    )
    expect(rawStore).not.toContain('token-value')
    expect(secureStore.isSecureStoreAvailable(rootPath)).toBe(true)
  })

  it('marks local root secret unavailable when the existing secret is corrupt', async () => {
    vi.doMock('node:module', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:module')>()
      return {
        ...actual,
        createRequire: vi.fn(() => vi.fn(() => ({})))
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
    await expect(
      secureStore.getSecureStoreValue(rootPath, 'auth.token', 'auth-token')
    ).resolves.toBeNull()
  })

  it('does not bypass unreadable local-secret envelopes with safeStorage', async () => {
    vi.doMock('node:module', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:module')>()
      return {
        ...actual,
        createRequire: vi.fn(() => vi.fn(() => ({})))
      }
    })

    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    let secureStore = await import('./secure-store')
    await secureStore.setSecureStoreValue(rootPath, 'auth.token', 'token-value', 'auth-token')
    await writeFile(path.join(rootPath, 'config', secureStore.LOCAL_SECRET_FILE), 'broken', 'utf-8')

    vi.resetModules()
    const safeStorage = {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: vi.fn((value: string) => Buffer.from(`safe:${value}`, 'utf-8')),
      decryptString: vi.fn((value: Buffer) => value.toString('utf-8').replace(/^safe:/, ''))
    }
    vi.doMock('node:module', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:module')>()
      return {
        ...actual,
        createRequire: vi.fn(() => vi.fn(() => ({ safeStorage })))
      }
    })
    secureStore = await import('./secure-store')

    await expect(secureStore.getSecureStoreHealth(rootPath)).resolves.toMatchObject({
      backend: 'unavailable',
      available: false,
      degraded: true
    })
    await expect(
      secureStore.setSecureStoreValue(rootPath, 'auth.next-token', 'next-token', 'auth-token')
    ).resolves.toBe(false)
    expect(secureStore.isSecureStoreAvailable(rootPath)).toBe(false)
  })
})
