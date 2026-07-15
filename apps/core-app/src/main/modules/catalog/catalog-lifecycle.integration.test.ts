import { createClient, type Client } from '@libsql/client'
import {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_ERROR_CODES,
  DomainLexiconRegistry,
  ScopedDomainLexiconRegistry,
  createCatalogManifestSigningPayload,
  serializeDomainLexiconCatalogPack,
  type CatalogManifestV1,
  type CatalogPackType,
  type DomainLexiconCatalogPackV1,
  type DomainLexiconEntry,
  type PluginDomainLexiconEntryInput
} from '@talex-touch/utils/i18n'
import {
  officialDomainLexiconRegistry,
  replaceOfficialDomainLexiconRegistryForHost
} from '@talex-touch/utils/i18n/unit-lexicon'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import * as schema from '../../db/schema'
import { SqliteCatalogRepository, type BuiltinCatalogPack } from './catalog-repository'
import { type CatalogRemote } from './catalog-remote'
import { DefaultCatalogService, type CatalogServiceLogger } from './catalog-service'
import { PinnedCatalogVerifier } from './catalog-verifier'

const createdAt = '2026-07-15T00:00:00.000Z'
const baselineVersion = '260000'
const remoteVersion = '2026.07.15'
const databaseFileName = 'catalog-lifecycle.sqlite'
const encoder = new TextEncoder()

let directory: string
let client: Client
let db: LibSQLDatabase<typeof schema>
let repository: SqliteCatalogRepository
let now: number
let officialSnapshot: DomainLexiconRegistry

class InMemoryCatalogRemote implements CatalogRemote {
  latestCalls = 0
  packCalls = 0
  readonly packRequests: CatalogManifestV1[] = []

  constructor(
    private readonly latestManifest: Uint8Array,
    private readonly packBytes: Uint8Array
  ) {}

  async fetchLatestManifest(_type: CatalogPackType): Promise<Uint8Array> {
    this.latestCalls += 1
    return this.latestManifest
  }

  async fetchPack(manifest: CatalogManifestV1): Promise<Uint8Array> {
    this.packCalls += 1
    this.packRequests.push(manifest)
    return this.packBytes
  }
}

interface SignedRemoteFixture {
  manifest: CatalogManifestV1
  manifestBytes: Uint8Array
  payloadBytes: Uint8Array
  payloadText: string
  remoteLabel: string
  remoteAlias: string
  publicKeyPem: string
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tuff-catalog-lifecycle-'))
  client = createClient({ url: `file:${join(directory, databaseFileName)}` })
  await client.execute('PRAGMA foreign_keys = ON')
  const migration = await readFile(
    new URL('../../../../resources/db/migrations/0026_catalog_service.sql', import.meta.url),
    'utf8'
  )
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.execute(statement)
  }
  db = drizzle(client, { schema })
  now = 1_784_077_200_000
  repository = new SqliteCatalogRepository(db, { now: () => now++ })
  officialSnapshot = new DomainLexiconRegistry(officialDomainLexiconRegistry.list())
})

afterEach(async () => {
  replaceOfficialDomainLexiconRegistryForHost(officialSnapshot)
  await dbWriteScheduler.drain()
  client.close()
  await rm(directory, { recursive: true, force: true })
})

function catalogEntry(
  label: string,
  alias: string,
  source: DomainLexiconEntry['source'],
  version: string
): DomainLexiconEntry {
  return {
    id: 'unit.length.catalog-meter',
    domain: 'unit',
    source,
    version,
    labels: {
      default: label,
      locales: { 'zh-CN': `${label}-中文`, 'en-US': label }
    },
    aliases: {
      default: [alias],
      locales: { 'zh-CN': [`${alias}-中文`], 'en-US': [alias] }
    },
    metadata: { category: 'length', symbol: 'm' }
  }
}

function builtinPack(): BuiltinCatalogPack {
  const entry = catalogEntry(
    'Lifecycle Baseline Meter',
    'lifecycle-baseline-alias',
    'builtin',
    baselineVersion
  )
  const pack: DomainLexiconCatalogPackV1 = {
    contractVersion: 1,
    type: 'domain-lexicon',
    packId: 'builtin.domain-lexicon',
    version: baselineVersion,
    schemaVersion: 1,
    createdAt,
    locales: ['zh-CN', 'en-US'],
    entries: [withoutProvenance(entry)]
  }
  const payloadBytes = serializeDomainLexiconCatalogPack(pack)
  return {
    manifest: {
      type: pack.type,
      packId: pack.packId,
      version: pack.version,
      schemaVersion: pack.schemaVersion,
      createdAt: pack.createdAt,
      minSdkapi: CATALOG_CLIENT_SDKAPI,
      locales: pack.locales,
      entryCount: pack.entries.length,
      payloadBytes: payloadBytes.byteLength,
      payloadSha256: createHash('sha256').update(payloadBytes).digest('hex')
    },
    source: 'builtin',
    signatureStatus: 'builtin',
    entries: Object.freeze([entry]),
    registry: new DomainLexiconRegistry([entry])
  }
}

function signedRemoteFixture(): SignedRemoteFixture {
  const remoteLabel = 'Lifecycle Remote Meter'
  const remoteAlias = 'lifecycle-remote-alias'
  const pack: DomainLexiconCatalogPackV1 = {
    contractVersion: 1,
    type: 'domain-lexicon',
    packId: 'official.domain-lexicon',
    version: remoteVersion,
    schemaVersion: 1,
    createdAt,
    locales: ['zh-CN', 'en-US'],
    entries: [
      withoutProvenance(
        catalogEntry(
          remoteLabel,
          remoteAlias,
          `catalog:official.domain-lexicon@${remoteVersion}`,
          remoteVersion
        )
      )
    ]
  }
  const payloadBytes = serializeDomainLexiconCatalogPack(pack)
  const unsigned: CatalogManifestV1 = {
    contractVersion: 1,
    type: pack.type,
    packId: pack.packId,
    version: pack.version,
    schemaVersion: pack.schemaVersion,
    createdAt: pack.createdAt,
    minSdkapi: CATALOG_CLIENT_SDKAPI,
    locales: pack.locales,
    entryCount: pack.entries.length,
    payloadBytes: payloadBytes.byteLength,
    payloadSha256: createHash('sha256').update(payloadBytes).digest('hex'),
    signatureAlgorithm: 'rsa-sha256',
    keyId: 'release-v1',
    signature: 'AA=='
  }
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const manifest: CatalogManifestV1 = {
    ...unsigned,
    signature: sign(
      'RSA-SHA256',
      createCatalogManifestSigningPayload(unsigned),
      keys.privateKey
    ).toString('base64')
  }
  return {
    manifest,
    manifestBytes: encoder.encode(JSON.stringify(manifest)),
    payloadBytes,
    payloadText: new TextDecoder().decode(payloadBytes),
    remoteLabel,
    remoteAlias,
    publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  }
}

function withoutProvenance(entry: DomainLexiconEntry) {
  return {
    id: entry.id,
    domain: entry.domain,
    labels: entry.labels,
    aliases: entry.aliases,
    metadata: entry.metadata
  }
}

function pluginEntry(id: string, label: string): PluginDomainLexiconEntryInput {
  return {
    id,
    domain: 'capability',
    version: '1',
    labels: { default: label },
    aliases: { default: [`${label}-alias`] }
  }
}

async function catalogPersistenceJson(): Promise<string> {
  const [packs, entries, state] = await Promise.all([
    client.execute('SELECT * FROM catalog_packs ORDER BY pack_id, version'),
    client.execute('SELECT * FROM catalog_domain_lexicon_entries ORDER BY pack_id, pack_version'),
    client.execute('SELECT * FROM catalog_state ORDER BY type')
  ])
  return JSON.stringify({ packs: packs.rows, entries: entries.rows, state: state.rows })
}

async function catalogColumnNames(): Promise<string[]> {
  const result = await client.execute(`
    SELECT name FROM pragma_table_info('catalog_packs')
    UNION ALL
    SELECT name FROM pragma_table_info('catalog_domain_lexicon_entries')
    UNION ALL
    SELECT name FROM pragma_table_info('catalog_state')
  `)
  return result.rows.map((row) => String(row.name))
}

describe('CatalogService lifecycle integration', () => {
  it('executes a signed whole-pack lifecycle without persisting transport secrets or disturbing scoped plugin overlays', async () => {
    const fixture = signedRemoteFixture()
    const remote = new InMemoryCatalogRemote(fixture.manifestBytes, fixture.payloadBytes)
    const logs: string[] = []
    const logger: CatalogServiceLogger = {
      info: (message, context) => logs.push(`${message} ${JSON.stringify(context)}`),
      warn: (message, context) => logs.push(`${message} ${JSON.stringify(context)}`)
    }
    const service = new DefaultCatalogService({
      repository,
      remote,
      verifier: new PinnedCatalogVerifier({ publicKeyPem: fixture.publicKeyPem }),
      baseline: builtinPack(),
      clock: () => now++,
      logger
    })
    const scoped = new ScopedDomainLexiconRegistry(officialDomainLexiconRegistry)
    scoped.register('plugin-alpha', [pluginEntry('private-meter', 'Plugin Alpha Meter')])
    scoped.register('plugin-beta', [pluginEntry('private-meter', 'Plugin Beta Meter')])

    const initialized = await service.initialize()

    expect(remote.latestCalls).toBe(0)
    expect(remote.packCalls).toBe(0)
    expect(initialized.active).toMatchObject({
      packId: 'builtin.domain-lexicon',
      version: baselineVersion,
      source: 'builtin'
    })
    expect(service.getActiveRegistry().resolve('unit.length.catalog-meter', 'en-US')?.label).toBe(
      'Lifecycle Baseline Meter'
    )

    replaceOfficialDomainLexiconRegistryForHost(service.getActiveRegistry())
    expect(
      scoped.resolve('plugin-alpha', 'unit.length.catalog-meter', { locale: 'en-US' })?.label
    ).toBe('Lifecycle Baseline Meter')
    expect(scoped.resolve('plugin-alpha', 'private-meter')?.entry.id).toBe(
      'plugin:plugin-alpha:private-meter'
    )
    expect(scoped.resolve('plugin-beta', 'plugin:plugin-alpha:private-meter')).toBeNull()

    const checked = await service.checkUpdates()

    expect(checked.status).toBe('update-available')
    if (checked.status !== 'update-available') {
      throw new Error('Expected the signed remote manifest to be available')
    }
    expect(checked.manifest).toEqual(fixture.manifest)
    expect(remote.latestCalls).toBe(1)
    expect(remote.packCalls).toBe(0)

    const verified = await service.downloadPack(checked.manifest)

    expect(remote.packCalls).toBe(1)
    expect(remote.packRequests).toEqual([fixture.manifest])
    expect(verified.manifest.payloadSha256).toBe(fixture.manifest.payloadSha256)
    expect(verified.registry.resolve('unit.length.catalog-meter', 'en-US')?.label).toBe(
      fixture.remoteLabel
    )

    const imported = await service.importPack(verified)
    const repeatedImport = await service.importPack(verified)

    expect(imported).toMatchObject({
      packId: 'official.domain-lexicon',
      version: remoteVersion,
      status: 'ready',
      signatureStatus: 'verified'
    })
    expect(repeatedImport).toMatchObject({ status: 'ready', payloadSha256: imported.payloadSha256 })
    expect(service.getStatus().active?.packId).toBe('builtin.domain-lexicon')
    expect(service.getActiveRegistry().resolve('unit.length.catalog-meter', 'en-US')?.label).toBe(
      'Lifecycle Baseline Meter'
    )
    expect(
      Number(
        (
          await client.execute(
            "SELECT COUNT(*) AS value FROM catalog_packs WHERE pack_id = 'official.domain-lexicon'"
          )
        ).rows[0]?.value
      )
    ).toBe(1)

    const activated = await service.activatePack(imported)
    const activationState = await client.execute({
      sql: 'SELECT * FROM catalog_state WHERE type = ?',
      args: ['domain-lexicon']
    })
    const activationRows = await client.execute(
      'SELECT pack_id, version, status FROM catalog_packs ORDER BY pack_id'
    )

    expect(activated).toMatchObject({
      active: { packId: 'official.domain-lexicon', version: remoteVersion, source: 'remote' },
      previous: { packId: 'builtin.domain-lexicon', version: baselineVersion, source: 'builtin' }
    })
    expect(service.getActiveRegistry().resolve('unit.length.catalog-meter', 'en-US')?.label).toBe(
      fixture.remoteLabel
    )
    expect(activationState.rows[0]).toMatchObject({
      active_pack_id: 'official.domain-lexicon',
      active_pack_version: remoteVersion,
      previous_pack_id: 'builtin.domain-lexicon',
      previous_pack_version: baselineVersion
    })
    expect(activationRows.rows).toEqual([
      { pack_id: 'builtin.domain-lexicon', version: baselineVersion, status: 'previous' },
      { pack_id: 'official.domain-lexicon', version: remoteVersion, status: 'active' }
    ])

    replaceOfficialDomainLexiconRegistryForHost(service.getActiveRegistry())
    expect(
      scoped.resolve('plugin-alpha', 'unit.length.catalog-meter', { locale: 'en-US' })?.label
    ).toBe(fixture.remoteLabel)
    expect(scoped.resolve('plugin-alpha', 'private-meter')?.entry.id).toBe(
      'plugin:plugin-alpha:private-meter'
    )
    expect(scoped.resolve('plugin-beta', 'private-meter')?.entry.id).toBe(
      'plugin:plugin-beta:private-meter'
    )
    expect(scoped.resolve('plugin-beta', 'plugin:plugin-alpha:private-meter')).toBeNull()

    const rolledBack = await service.rollback('domain-lexicon', 'operator-request')
    const rollbackState = await client.execute({
      sql: 'SELECT * FROM catalog_state WHERE type = ?',
      args: ['domain-lexicon']
    })

    expect(rolledBack).toMatchObject({
      active: { packId: 'builtin.domain-lexicon', version: baselineVersion, source: 'builtin' },
      previous: { packId: 'official.domain-lexicon', version: remoteVersion, source: 'remote' },
      rollbackReason: 'operator-request'
    })
    expect(service.getActiveRegistry().resolve('unit.length.catalog-meter', 'en-US')?.label).toBe(
      'Lifecycle Baseline Meter'
    )
    expect(rollbackState.rows[0]).toMatchObject({
      active_pack_id: 'builtin.domain-lexicon',
      active_pack_version: baselineVersion,
      previous_pack_id: 'official.domain-lexicon',
      previous_pack_version: remoteVersion,
      rollback_reason: 'operator-request'
    })

    replaceOfficialDomainLexiconRegistryForHost(service.getActiveRegistry())
    expect(
      scoped.resolve('plugin-alpha', 'unit.length.catalog-meter', { locale: 'en-US' })?.label
    ).toBe('Lifecycle Baseline Meter')
    expect(scoped.resolve('plugin-alpha', 'private-meter')?.entry.id).toBe(
      'plugin:plugin-alpha:private-meter'
    )
    expect(scoped.resolve('plugin-beta', 'plugin:plugin-alpha:private-meter')).toBeNull()

    const persistence = await catalogPersistenceJson()
    const columns = await catalogColumnNames()
    const diagnostics = logs.join('\n')

    expect(columns).not.toContain('signature')
    expect(columns).not.toContain('payload')
    expect(persistence).not.toContain(fixture.manifest.signature)
    expect(persistence).not.toContain(fixture.payloadText)
    expect(persistence).not.toContain(Buffer.from(fixture.payloadBytes).toString('base64'))
    for (const secret of [
      fixture.manifest.signature,
      fixture.payloadText,
      fixture.remoteLabel,
      fixture.remoteAlias,
      join(directory, databaseFileName)
    ]) {
      expect(diagnostics).not.toContain(secret)
    }
  })

  it('rejects a tampered signed manifest before download or mutation and logs only stable diagnostics', async () => {
    const fixture = signedRemoteFixture()
    const tamperedManifestBytes = encoder.encode(
      JSON.stringify({
        ...fixture.manifest,
        signature: `${fixture.manifest.signature.slice(0, -4)}AAAA`
      })
    )
    const remote = new InMemoryCatalogRemote(tamperedManifestBytes, fixture.payloadBytes)
    const logs: string[] = []
    const logger: CatalogServiceLogger = {
      info: (message, context) => logs.push(`${message} ${JSON.stringify(context)}`),
      warn: (message, context) => logs.push(`${message} ${JSON.stringify(context)}`)
    }
    const service = new DefaultCatalogService({
      repository,
      remote,
      verifier: new PinnedCatalogVerifier({ publicKeyPem: fixture.publicKeyPem }),
      baseline: builtinPack(),
      clock: () => now++,
      logger
    })

    await service.initialize()
    await expect(service.checkUpdates()).rejects.toMatchObject({
      code: CATALOG_ERROR_CODES.signatureInvalid
    })

    expect(remote.latestCalls).toBe(1)
    expect(remote.packCalls).toBe(0)
    expect(service.getStatus().active).toMatchObject({
      packId: 'builtin.domain-lexicon',
      version: baselineVersion
    })
    expect(service.getActiveRegistry().resolve('unit.length.catalog-meter', 'en-US')?.label).toBe(
      'Lifecycle Baseline Meter'
    )
    expect(
      Number((await client.execute('SELECT COUNT(*) AS value FROM catalog_packs')).rows[0]?.value)
    ).toBe(1)
    expect(
      Number(
        (await client.execute('SELECT COUNT(*) AS value FROM catalog_domain_lexicon_entries'))
          .rows[0]?.value
      )
    ).toBe(1)
    expect((await repository.getStatus('domain-lexicon')).previous).toBeNull()

    const diagnostics = logs.join('\n')
    for (const secret of [
      fixture.manifest.signature,
      fixture.payloadText,
      fixture.remoteLabel,
      fixture.remoteAlias,
      join(directory, databaseFileName)
    ]) {
      expect(diagnostics).not.toContain(secret)
    }
  })
})
