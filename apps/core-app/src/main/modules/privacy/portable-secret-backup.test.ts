import { promises as fs } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PORTABLE_SECRET_BACKUP_LIMITS,
  applyPortableSecretRestore,
  createPortableSecretBackup,
  openPortableSecretBackup,
  previewPortableSecretRestore
} from './portable-secret-backup'
import {
  PORTABLE_SECRET_CATALOG_V1,
  resolvePortableSecretCatalogEntry
} from './portable-secret-catalog'
import {
  getSecureStoreValueStrict,
  SECURE_STORE_FILE,
  setSecureStoreValue
} from '../../utils/secure-store'

const PASSWORD = 'correct horse battery staple'
const FIRST_ENTRY = {
  ownerKind: 'plugin',
  ownerId: 'touch-translation',
  key: 'providers.deepl.apiKey',
  purpose: 'translation-provider-credential',
  value: 'synthetic-portable-canary-one'
} as const
const SECOND_ENTRY = {
  ownerKind: 'plugin',
  ownerId: 'touch-translation',
  key: 'providers.bing.apiKey',
  purpose: 'translation-provider-credential',
  value: 'synthetic-portable-canary-two'
} as const

function mutateEnvelope(raw: string, mutate: (value: Record<string, unknown>) => void): string {
  const parsed = JSON.parse(raw) as Record<string, unknown>
  mutate(parsed)
  return JSON.stringify(parsed)
}

function flipBase64(value: unknown): string {
  const source = String(value)
  return `${source[0] === 'A' ? 'B' : 'A'}${source.slice(1)}`
}

describe('portable Secret backup envelope', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('round-trips cataloged entries through scrypt and AES-256-GCM', async () => {
    const backup = await createPortableSecretBackup([FIRST_ENTRY, SECOND_ENTRY], PASSWORD, {
      now: new Date('2026-07-27T12:00:00.000Z')
    })
    const envelope = JSON.parse(backup) as Record<string, unknown>

    expect(Object.keys(envelope)).toEqual([
      'format',
      'version',
      'createdAt',
      'kdf',
      'cipher',
      'payload'
    ])
    expect(envelope).toMatchObject({
      format: 'talex.touch.secret-backup',
      version: 1,
      createdAt: '2026-07-27T12:00:00.000Z',
      kdf: { name: 'scrypt', N: 32768, r: 8, p: 1 },
      cipher: { name: 'AES-256-GCM' }
    })
    expect(
      Buffer.from(String((envelope.kdf as Record<string, unknown>).salt), 'base64')
    ).toHaveLength(16)
    expect(
      Buffer.from(String((envelope.cipher as Record<string, unknown>).iv), 'base64')
    ).toHaveLength(12)
    expect(
      Buffer.from(String((envelope.cipher as Record<string, unknown>).tag), 'base64')
    ).toHaveLength(16)
    expect(backup).not.toContain(FIRST_ENTRY.value)

    await expect(openPortableSecretBackup(backup, PASSWORD)).resolves.toEqual({
      entries: [FIRST_ENTRY, SECOND_ENTRY]
    })
  })

  it.each([
    ['wrong password', (raw: string) => raw, 'another valid password'],
    [
      'AAD header',
      (raw: string) =>
        mutateEnvelope(raw, (value) => {
          value.createdAt = '2026-07-27T12:00:01.000Z'
        }),
      PASSWORD
    ],
    [
      'salt',
      (raw: string) =>
        mutateEnvelope(raw, (value) => {
          const kdf = value.kdf as Record<string, unknown>
          kdf.salt = flipBase64(kdf.salt)
        }),
      PASSWORD
    ],
    [
      'IV',
      (raw: string) =>
        mutateEnvelope(raw, (value) => {
          const cipher = value.cipher as Record<string, unknown>
          cipher.iv = flipBase64(cipher.iv)
        }),
      PASSWORD
    ],
    [
      'ciphertext',
      (raw: string) =>
        mutateEnvelope(raw, (value) => {
          value.payload = flipBase64(value.payload)
        }),
      PASSWORD
    ],
    [
      'tag',
      (raw: string) =>
        mutateEnvelope(raw, (value) => {
          const cipher = value.cipher as Record<string, unknown>
          cipher.tag = flipBase64(cipher.tag)
        }),
      PASSWORD
    ]
  ])(
    'rejects %s tampering with one redacted authentication code',
    async (_label, mutate, password) => {
      const backup = await createPortableSecretBackup([FIRST_ENTRY], PASSWORD)
      await expect(openPortableSecretBackup(mutate(backup), password)).rejects.toMatchObject({
        code: 'PRIVACY_SECRET_BACKUP_AUTH_FAILED',
        message: 'PRIVACY_SECRET_BACKUP_AUTH_FAILED'
      })
    }
  )

  it('rejects truncation, invalid base64, unknown fields, versions and algorithms', async () => {
    const backup = await createPortableSecretBackup([FIRST_ENTRY], PASSWORD)
    const invalid = [
      backup.slice(0, -4),
      mutateEnvelope(backup, (value) => {
        value.extra = true
      }),
      mutateEnvelope(backup, (value) => {
        value.version = 2
      }),
      mutateEnvelope(backup, (value) => {
        const cipher = value.cipher as Record<string, unknown>
        cipher.name = 'AES-256-CBC'
      }),
      mutateEnvelope(backup, (value) => {
        const kdf = value.kdf as Record<string, unknown>
        kdf.salt = `${String(kdf.salt)}=`
      }),
      mutateEnvelope(backup, (value) => {
        value.payload = 'not+canonical==='
      })
    ]

    for (const raw of invalid) {
      await expect(openPortableSecretBackup(raw, PASSWORD)).rejects.toMatchObject({
        code: expect.stringMatching(/^PRIVACY_SECRET_BACKUP_/)
      })
    }
  })

  it('rejects hostile KDF parameters before invoking expensive derivation', async () => {
    const backup = await createPortableSecretBackup([FIRST_ENTRY], PASSWORD)
    for (const patch of [{ N: 2 ** 20 }, { N: 32769 }, { r: 9 }, { p: 2 }, { name: 'pbkdf2' }]) {
      const hostile = mutateEnvelope(backup, (value) => {
        Object.assign(value.kdf as Record<string, unknown>, patch)
      })
      await expect(openPortableSecretBackup(hostile, PASSWORD)).rejects.toMatchObject({
        code: 'PRIVACY_SECRET_BACKUP_KDF_INVALID'
      })
    }
  })

  it('rejects duplicate, forbidden, empty and oversized portable entries', async () => {
    await expect(createPortableSecretBackup([], PASSWORD)).rejects.toMatchObject({
      code: 'PRIVACY_SECRET_BACKUP_PAYLOAD_INVALID'
    })
    await expect(
      createPortableSecretBackup([FIRST_ENTRY, { ...FIRST_ENTRY }], PASSWORD)
    ).rejects.toMatchObject({ code: 'PRIVACY_SECRET_BACKUP_DUPLICATE_ENTRY' })
    await expect(
      createPortableSecretBackup(
        [
          {
            ownerKind: 'machine',
            ownerId: 'device',
            key: 'root-key',
            purpose: 'machine-seed',
            value: 'synthetic-forbidden-canary'
          }
        ],
        PASSWORD
      )
    ).rejects.toMatchObject({ code: 'PRIVACY_SECRET_BACKUP_ENTRY_FORBIDDEN' })
    await expect(
      createPortableSecretBackup(
        [
          {
            ...FIRST_ENTRY,
            value: 'x'.repeat(PORTABLE_SECRET_BACKUP_LIMITS.maxValueBytes + 1)
          }
        ],
        PASSWORD
      )
    ).rejects.toMatchObject({ code: 'PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED' })
    await expect(
      createPortableSecretBackup(
        [
          {
            ...FIRST_ENTRY,
            key: 'x'.repeat(PORTABLE_SECRET_BACKUP_LIMITS.maxKeyBytes + 1)
          }
        ],
        PASSWORD
      )
    ).rejects.toMatchObject({ code: 'PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED' })
    await expect(
      createPortableSecretBackup(
        new Array(PORTABLE_SECRET_BACKUP_LIMITS.maxEntries + 1).fill(FIRST_ENTRY),
        PASSWORD
      )
    ).rejects.toMatchObject({ code: 'PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED' })
    await expect(
      createPortableSecretBackup(
        [FIRST_ENTRY],
        'p'.repeat(PORTABLE_SECRET_BACKUP_LIMITS.maxPasswordBytes + 1)
      )
    ).rejects.toMatchObject({ code: 'PRIVACY_SECRET_BACKUP_PASSWORD_INVALID' })
  })

  it('counts Unicode password code points and rejects non-well-formed strings', async () => {
    const twelveAstralCodePoints = '😀'.repeat(12)
    await expect(
      createPortableSecretBackup([FIRST_ENTRY], twelveAstralCodePoints)
    ).resolves.toEqual(expect.any(String))
    await expect(createPortableSecretBackup([FIRST_ENTRY], '😀'.repeat(11))).rejects.toMatchObject({
      code: 'PRIVACY_SECRET_BACKUP_PASSWORD_INVALID'
    })
    await expect(
      createPortableSecretBackup([FIRST_ENTRY], `${'p'.repeat(12)}\ud800`)
    ).rejects.toMatchObject({ code: 'PRIVACY_SECRET_BACKUP_PASSWORD_INVALID' })
  })

  it('rejects aggregate escaped payload size before constructing the complete payload', async () => {
    const entries = PORTABLE_SECRET_CATALOG_V1.slice(0, 3).map((entry) => ({
      ownerKind: entry.ownerKind,
      ownerId: entry.ownerId,
      key: entry.key,
      purpose: entry.purpose,
      value: '\u0000'.repeat(PORTABLE_SECRET_BACKUP_LIMITS.maxValueBytes)
    }))

    await expect(createPortableSecretBackup(entries, PASSWORD)).rejects.toMatchObject({
      code: 'PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED'
    })
  })

  it('rejects malformed objects, proxies, accessors, classes, sparse arrays and cycles', async () => {
    class EntryClass {
      ownerKind = FIRST_ENTRY.ownerKind
      ownerId = FIRST_ENTRY.ownerId
      key = FIRST_ENTRY.key
      purpose = FIRST_ENTRY.purpose
      value = FIRST_ENTRY.value
    }
    const getter = vi.fn(() => FIRST_ENTRY.value)
    const accessor = Object.defineProperty({ ...FIRST_ENTRY }, 'value', {
      enumerable: true,
      get: getter
    })
    const sparse = new Array(1)
    const arraySubclass = [FIRST_ENTRY]
    Object.setPrototypeOf(arraySubclass, Object.create(Array.prototype))
    const cyclic = { ...FIRST_ENTRY } as Record<string, unknown>
    cyclic.self = cyclic

    const proxyOwnKeys = vi.fn(() => Reflect.ownKeys(FIRST_ENTRY))
    const hostileProxy = new Proxy({ ...FIRST_ENTRY }, { ownKeys: proxyOwnKeys })

    for (const entries of [
      [new Proxy({ ...FIRST_ENTRY }, {})],
      [hostileProxy],
      [accessor],
      [new EntryClass()],
      sparse,
      arraySubclass,
      [cyclic]
    ]) {
      await expect(createPortableSecretBackup(entries, PASSWORD)).rejects.toMatchObject({
        code: 'PRIVACY_SECRET_BACKUP_PAYLOAD_INVALID'
      })
    }
    expect(getter).not.toHaveBeenCalled()
    expect(proxyOwnKeys).not.toHaveBeenCalled()
  })

  it('rejects oversized files before JSON parsing or scrypt work', async () => {
    const oversized = Buffer.alloc(PORTABLE_SECRET_BACKUP_LIMITS.maxFileBytes + 1, 0x20)
    await expect(openPortableSecretBackup(oversized, PASSWORD)).rejects.toMatchObject({
      code: 'PRIVACY_SECRET_BACKUP_LIMIT_EXCEEDED'
    })
    await expect(
      openPortableSecretBackup(Uint8Array.from([0x7b, 0x22, 0xff, 0x22, 0x7d]), PASSWORD)
    ).rejects.toMatchObject({
      code: 'PRIVACY_SECRET_BACKUP_ENVELOPE_INVALID'
    })
  })

  it('uses an immutable allowlist that excludes identity, session, sync and machine keys', () => {
    expect(Object.isFrozen(PORTABLE_SECRET_CATALOG_V1)).toBe(true)
    expect(PORTABLE_SECRET_CATALOG_V1.length).toBeGreaterThan(0)
    for (const entry of PORTABLE_SECRET_CATALOG_V1) expect(Object.isFrozen(entry)).toBe(true)

    for (const candidate of [
      { ownerKind: 'machine', ownerId: 'root', key: 'local-secret', purpose: 'machine-seed' },
      { ownerKind: 'account', ownerId: 'current', key: 'session-token', purpose: 'auth-token' },
      { ownerKind: 'sync', ownerId: 'device', key: 'payload-key', purpose: 'sync-payload-key' },
      { ownerKind: 'plugin', ownerId: 'unknown', key: 'apiKey', purpose: 'plugin-secret' }
    ]) {
      expect(() => resolvePortableSecretCatalogEntry(candidate)).toThrow(
        'PRIVACY_SECRET_BACKUP_ENTRY_FORBIDDEN'
      )
    }
  })

  it('previews conflicts before applying explicit skip or overwrite plans', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-privacy-restore-'))
    const firstCatalog = resolvePortableSecretCatalogEntry(FIRST_ENTRY)
    const secondCatalog = resolvePortableSecretCatalogEntry(SECOND_ENTRY)
    await setSecureStoreValue(
      rootPath,
      firstCatalog.secureStoreKey,
      'existing-synthetic-value',
      firstCatalog.secureStorePurpose
    )
    const backup = await createPortableSecretBackup([FIRST_ENTRY, SECOND_ENTRY], PASSWORD)

    const preview = await previewPortableSecretRestore(rootPath, backup, PASSWORD)
    expect(preview).toMatchObject({
      total: 2,
      conflicts: 1,
      newEntries: 1
    })
    expect(preview.planFingerprints.skip).toMatch(/^[a-f0-9]{64}$/)
    expect(preview.planFingerprints.overwrite).toMatch(/^[a-f0-9]{64}$/)
    expect(preview.planFingerprints.skip).not.toBe(preview.planFingerprints.overwrite)
    await expect(
      applyPortableSecretRestore(
        rootPath,
        backup,
        PASSWORD,
        'overwrite',
        preview.planFingerprints.skip
      )
    ).rejects.toMatchObject({ code: 'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID' })
    await expect(
      applyPortableSecretRestore(rootPath, backup, PASSWORD, 'skip', preview.planFingerprints.skip)
    ).resolves.toEqual({
      imported: 1,
      overwritten: 0,
      skipped: 1
    })
    await expect(
      getSecureStoreValueStrict(
        rootPath,
        firstCatalog.secureStoreKey,
        firstCatalog.secureStorePurpose
      )
    ).resolves.toBe('existing-synthetic-value')
    await expect(
      getSecureStoreValueStrict(
        rootPath,
        secondCatalog.secureStoreKey,
        secondCatalog.secureStorePurpose
      )
    ).resolves.toBe(SECOND_ENTRY.value)

    const overwritePreview = await previewPortableSecretRestore(rootPath, backup, PASSWORD)
    await expect(
      applyPortableSecretRestore(
        rootPath,
        backup,
        PASSWORD,
        'overwrite',
        overwritePreview.planFingerprints.overwrite
      )
    ).resolves.toEqual({ imported: 2, overwritten: 2, skipped: 0 })
    await expect(
      getSecureStoreValueStrict(
        rootPath,
        firstCatalog.secureStoreKey,
        firstCatalog.secureStorePurpose
      )
    ).resolves.toBe(FIRST_ENTRY.value)
  })

  it('rejects a restore plan after the secure-store generation changes', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-privacy-restore-'))
    const catalog = resolvePortableSecretCatalogEntry(FIRST_ENTRY)
    const backup = await createPortableSecretBackup([FIRST_ENTRY], PASSWORD)
    const preview = await previewPortableSecretRestore(rootPath, backup, PASSWORD)

    await setSecureStoreValue(
      rootPath,
      catalog.secureStoreKey,
      'concurrent-synthetic-value',
      catalog.secureStorePurpose
    )

    await expect(
      applyPortableSecretRestore(
        rootPath,
        backup,
        PASSWORD,
        'overwrite',
        preview.planFingerprints.overwrite
      )
    ).rejects.toMatchObject({
      code: 'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID',
      message: 'PRIVACY_SECRET_BACKUP_CONFLICT_PLAN_INVALID'
    })
    await expect(
      getSecureStoreValueStrict(rootPath, catalog.secureStoreKey, catalog.secureStorePurpose)
    ).resolves.toBe('concurrent-synthetic-value')
  })

  it('preserves prior encrypted store bytes when atomic restore persistence fails', async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), 'tuff-privacy-restore-'))
    const catalog = resolvePortableSecretCatalogEntry(FIRST_ENTRY)
    const secondCatalog = resolvePortableSecretCatalogEntry(SECOND_ENTRY)
    await setSecureStoreValue(
      rootPath,
      catalog.secureStoreKey,
      'existing-synthetic-value',
      catalog.secureStorePurpose
    )
    const storePath = path.join(rootPath, 'config', SECURE_STORE_FILE)
    const before = await readFile(storePath)
    const backup = await createPortableSecretBackup([FIRST_ENTRY, SECOND_ENTRY], PASSWORD)
    const preview = await previewPortableSecretRestore(rootPath, backup, PASSWORD)
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('synthetic persistence failure'))

    await expect(
      applyPortableSecretRestore(
        rootPath,
        backup,
        PASSWORD,
        'overwrite',
        preview.planFingerprints.overwrite
      )
    ).rejects.toMatchObject({
      code: 'PRIVACY_SECRET_BACKUP_STORE_WRITE_FAILED',
      message: 'PRIVACY_SECRET_BACKUP_STORE_WRITE_FAILED'
    })
    await expect(readFile(storePath)).resolves.toEqual(before)
    await expect(
      getSecureStoreValueStrict(rootPath, catalog.secureStoreKey, catalog.secureStorePurpose)
    ).resolves.toBe('existing-synthetic-value')
    await expect(
      getSecureStoreValueStrict(
        rootPath,
        secondCatalog.secureStoreKey,
        secondCatalog.secureStorePurpose
      )
    ).resolves.toBeNull()
  })
})
