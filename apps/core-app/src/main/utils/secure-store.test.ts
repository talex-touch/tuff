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

  it('applies a multi-purpose encrypted batch with one atomic persistence step', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')
    const rename = vi.spyOn(fs, 'rename')

    await expect(
      secureStore.applySecureStoreBatch(rootPath, [
        { key: 'plugin.alpha.token', value: 'alpha', purpose: 'plugin-secret' },
        { key: 'provider.openai.api-key', value: 'provider', purpose: 'provider-credential' }
      ])
    ).resolves.toBe(true)

    expect(rename).toHaveBeenCalledTimes(1)
    await expect(
      secureStore.getSecureStoreValueStrict(rootPath, 'plugin.alpha.token', 'plugin-secret')
    ).resolves.toBe('alpha')
    await expect(
      secureStore.getSecureStoreValueStrict(
        rootPath,
        'provider.openai.api-key',
        'provider-credential'
      )
    ).resolves.toBe('provider')
  })

  it('rejects a stale batch revision without mutating encrypted entries', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')
    const batch = [
      { key: 'plugin.alpha.token', value: 'new-alpha', purpose: 'plugin-secret' }
    ] as const

    await secureStore.setSecureStoreValue(
      rootPath,
      'plugin.alpha.token',
      'old-alpha',
      'plugin-secret'
    )
    const snapshot = await secureStore.getSecureStoreBatchSnapshot(rootPath, batch)
    await secureStore.setSecureStoreValue(rootPath, 'plugin.beta.token', 'beta', 'plugin-secret')

    await expect(
      secureStore.applySecureStoreBatch(rootPath, batch, {
        conflictPolicy: 'overwrite',
        expectedRevision: snapshot.revision
      })
    ).resolves.toEqual({
      persisted: false,
      conflict: true,
      applied: 0,
      overwritten: 0,
      skipped: 0
    })
    await expect(
      secureStore.getSecureStoreValueStrict(rootPath, 'plugin.alpha.token', 'plugin-secret')
    ).resolves.toBe('old-alpha')
  })

  it('rejects hostile batch DTOs before encrypted store work', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')
    const getter = vi.fn(() => 'synthetic-secret')
    const accessor = Object.defineProperty(
      { key: 'plugin.alpha.token', purpose: 'plugin-secret' },
      'value',
      { enumerable: true, get: getter }
    )
    const sparse = new Array(1)
    const arraySubclass = [
      { key: 'plugin.alpha.token', value: 'synthetic-secret', purpose: 'plugin-secret' }
    ]
    Object.setPrototypeOf(arraySubclass, Object.create(Array.prototype))
    const proxyGetPrototype = vi.fn(() => Array.prototype)
    const proxy = new Proxy(
      [{ key: 'plugin.alpha.token', value: 'synthetic-secret', purpose: 'plugin-secret' }],
      { getPrototypeOf: proxyGetPrototype }
    )

    for (const batch of [
      sparse,
      arraySubclass,
      proxy,
      [accessor],
      [
        { key: 'plugin.alpha.token', value: 'first' },
        { key: ' plugin.alpha.token ', value: 'duplicate' }
      ],
      [{ key: '__proto__', value: 'synthetic-secret' }]
    ]) {
      await expect(secureStore.applySecureStoreBatch(rootPath, batch as never)).rejects.toThrow()
    }
    await expect(
      secureStore.applySecureStoreBatch(
        rootPath,
        [{ key: 'plugin.alpha.token', value: 'synthetic-secret' }],
        { conflictPolicy: 'overwrite', expectedRevision: 'not-a-revision' }
      )
    ).rejects.toThrow('INVALID_SECURE_STORE_BATCH_OPTIONS')
    expect(getter).not.toHaveBeenCalled()
    expect(proxyGetPrototype).not.toHaveBeenCalled()
    await expect(readdir(rootPath)).resolves.toEqual([])
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

  it('atomically purges and verifies both exact plugin Secret namespaces', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')
    const prefixes = ['plugin.alpha.', 'plugin.v2.YWxwaGE.'] as const

    await Promise.all([
      secureStore.setSecureStoreValue(
        rootPath,
        'plugin.alpha.token',
        'legacy-token',
        'plugin-secret'
      ),
      secureStore.setSecureStoreValue(
        rootPath,
        'plugin.v2.YWxwaGE.token',
        'v2-token',
        'plugin-secret'
      ),
      secureStore.setSecureStoreValue(
        rootPath,
        'plugin.alpha2.token',
        'other-token',
        'plugin-secret'
      )
    ])

    await expect(secureStore.countSecureStoreValuesByPrefixes(rootPath, prefixes)).resolves.toBe(2)
    await expect(secureStore.deleteSecureStoreValuesByPrefixes(rootPath, prefixes)).resolves.toBe(2)
    await expect(secureStore.countSecureStoreValuesByPrefixes(rootPath, prefixes)).resolves.toBe(0)
    await expect(
      secureStore.getSecureStoreValue(rootPath, 'plugin.alpha2.token', 'plugin-secret')
    ).resolves.toBe('other-token')
  })

  it('retains every matching namespace when an atomic multi-prefix write fails', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-secure-store-'))
    const secureStore = await import('./secure-store')
    await secureStore.setSecureStoreValue(
      rootPath,
      'plugin.alpha.token',
      'legacy-token',
      'plugin-secret'
    )
    await secureStore.setSecureStoreValue(
      rootPath,
      'plugin.v2.YWxwaGE.token',
      'v2-token',
      'plugin-secret'
    )
    const rename = vi
      .spyOn(fs, 'rename')
      .mockRejectedValueOnce(new Error('synthetic rename failure'))

    await expect(
      secureStore.deleteSecureStoreValuesByPrefixes(rootPath, [
        'plugin.alpha.',
        'plugin.v2.YWxwaGE.'
      ])
    ).rejects.toThrow('synthetic rename failure')
    rename.mockRestore()
    await expect(
      secureStore.countSecureStoreValuesByPrefixes(rootPath, [
        'plugin.alpha.',
        'plugin.v2.YWxwaGE.'
      ])
    ).resolves.toBe(2)
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
