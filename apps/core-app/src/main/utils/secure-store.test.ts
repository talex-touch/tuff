import { afterEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
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

  it('serializes concurrent mutations without losing encrypted entries', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')
    const entries = Array.from(
      { length: 24 },
      (_, index) => [`plugin.concurrent.key-${index}`, `value-${index}`] as const
    )

    await expect(
      Promise.all(
        entries.map(([key, value]) =>
          secureStore.setSecureStoreValue(rootPath, key, value, 'plugin-secret')
        )
      )
    ).resolves.toEqual(new Array(entries.length).fill(true))

    await expect(
      Promise.all(
        entries.map(([key]) => secureStore.getSecureStoreValue(rootPath, key, 'plugin-secret'))
      )
    ).resolves.toEqual(entries.map(([, value]) => value))

    const files = await readdir(path.join(rootPath, 'config'))
    expect(files.filter((name) => name.includes('.tmp-'))).toEqual([])
  })

  it('preserves the previous file when atomic rename fails', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')
    await secureStore.setSecureStoreValue(
      rootPath,
      'plugin.alpha.token',
      'old-value',
      'plugin-secret'
    )
    const rename = vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('rename failed'))

    await expect(
      secureStore.setSecureStoreValue(rootPath, 'plugin.alpha.token', 'new-value', 'plugin-secret')
    ).resolves.toBe(false)
    rename.mockRestore()
    await expect(
      secureStore.getSecureStoreValueStrict(rootPath, 'plugin.alpha.token', 'plugin-secret')
    ).resolves.toBe('old-value')
  })

  it('atomically purges only the requested plugin secret prefix', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')

    await Promise.all([
      secureStore.setSecureStoreValue(
        rootPath,
        'plugin.alpha.token',
        'alpha-token',
        'plugin-secret'
      ),
      secureStore.setSecureStoreValue(
        rootPath,
        'plugin.alpha.endpoint',
        'alpha-endpoint',
        'plugin-secret'
      ),
      secureStore.setSecureStoreValue(rootPath, 'plugin.beta.token', 'beta-token', 'plugin-secret')
    ])

    await expect(
      secureStore.deleteSecureStoreValuesByPrefix(rootPath, 'plugin.alpha.')
    ).resolves.toBe(2)
    await expect(
      secureStore.getSecureStoreValue(rootPath, 'plugin.alpha.token', 'plugin-secret')
    ).resolves.toBeNull()
    await expect(
      secureStore.getSecureStoreValue(rootPath, 'plugin.beta.token', 'plugin-secret')
    ).resolves.toBe('beta-token')
  })

  it('does not overwrite a corrupt secure store during mutation', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')
    const storePath = path.join(rootPath, 'config', secureStore.SECURE_STORE_FILE)
    await mkdir(path.dirname(storePath), { recursive: true })
    await writeFile(storePath, '{corrupt', 'utf-8')

    await expect(
      secureStore.getSecureStoreValueStrict(rootPath, 'plugin.alpha.token', 'plugin-secret')
    ).rejects.toThrow()
    await expect(secureStore.getSecureStoreHealth(rootPath)).resolves.toMatchObject({
      backend: 'unavailable',
      available: false,
      reason: 'Local encrypted storage is unavailable'
    })
    await expect(
      secureStore.setSecureStoreValue(rootPath, 'plugin.alpha.token', 'new-value', 'plugin-secret')
    ).resolves.toBe(false)
    await expect(readFile(storePath, 'utf-8')).resolves.toBe('{corrupt')
  })

  it('treats non-string entries as corruption in strict reads', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')
    const storePath = path.join(rootPath, 'config', secureStore.SECURE_STORE_FILE)
    await mkdir(path.dirname(storePath), { recursive: true })
    await writeFile(storePath, JSON.stringify({ 'plugin.alpha.token': 123 }), 'utf-8')

    await expect(
      secureStore.getSecureStoreValueStrict(rootPath, 'plugin.alpha.token', 'plugin-secret')
    ).rejects.toThrow('SECURE_STORE_INVALID_ENTRY')
    await expect(
      secureStore.getSecureStoreValue(rootPath, 'plugin.alpha.token', 'plugin-secret')
    ).resolves.toBeNull()
  })

  it('marks local root secret unavailable when the existing secret is corrupt', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')
    await secureStore.setSecureStoreValue(rootPath, 'auth.token', 'token-value', 'auth-token')
    await writeFile(path.join(rootPath, 'config', secureStore.LOCAL_SECRET_FILE), 'broken', 'utf-8')

    await expect(secureStore.getSecureStoreHealth(rootPath)).resolves.toMatchObject({
      backend: 'unavailable',
      available: false,
      degraded: true,
      reason: 'Local encrypted storage is unavailable'
    })
    expect(secureStore.isSecureStoreAvailable(rootPath)).toBe(false)
    await expect(
      secureStore.getSecureStoreValue(rootPath, 'auth.token', 'auth-token')
    ).resolves.toBeNull()
    await expect(
      secureStore.getSecureStoreValueStrict(rootPath, 'auth.token', 'auth-token')
    ).rejects.toThrow()
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
