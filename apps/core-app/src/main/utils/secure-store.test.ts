import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

describe('secure-store local encrypted backend', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('reports the local encrypted root secret backend', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')

    expect(secureStore.isSecureStoreAvailable()).toBe(false)
    expect(secureStore.isSecureStoreAvailable(rootPath)).toBe(true)
    await expect(secureStore.getSecureStoreHealth(rootPath)).resolves.toMatchObject({
      backend: 'local-secret',
      available: true,
      degraded: false
    })
  })

  it('persists values through local root secret storage', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')

    await expect(secureStore.getSecureStoreHealth(rootPath)).resolves.toMatchObject({
      backend: 'local-secret',
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
      path.join(rootPath, 'config', secureStore.LOCAL_SECRET_FILE),
      'utf-8'
    )
    expect(Buffer.from(secret.trim(), 'base64')).toHaveLength(32)
    const rawStore = await readFile(
      path.join(rootPath, 'config', secureStore.SECURE_STORE_FILE),
      'utf-8'
    )
    expect(rawStore).not.toContain('token-value')
    expect(rawStore).toContain('local-secret')
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

  it('does not read removed safe-storage envelopes', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')
    await mkdir(path.join(rootPath, 'config'), { recursive: true })
    await writeFile(
      path.join(rootPath, 'config', secureStore.SECURE_STORE_FILE),
      JSON.stringify({
        'auth.token': JSON.stringify({
          v: 1,
          backend: 'safe-storage',
          alg: 'A256GCM',
          kid: 'legacy',
          n: Buffer.alloc(12).toString('base64'),
          c: Buffer.from('legacy').toString('base64'),
          t: Buffer.alloc(16).toString('base64')
        })
      }),
      'utf-8'
    )

    await expect(secureStore.getSecureStoreHealth(rootPath)).resolves.toMatchObject({
      backend: 'local-secret',
      available: true,
      degraded: false
    })
    await expect(
      secureStore.getSecureStoreValue(rootPath, 'auth.token', 'auth-token')
    ).resolves.toBeNull()
  })
})
