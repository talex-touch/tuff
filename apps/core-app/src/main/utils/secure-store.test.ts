import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

describe('secure-store local root secret', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('node:module')
  })

  it('does not import electron or touch safeStorage', async () => {
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
    expect(requireMock).not.toHaveBeenCalled()
  })

  it('persists values through local root secret storage', async () => {
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
})
