import { createClient, type Client } from '@libsql/client'
import {
  CATALOG_CLIENT_SDKAPI,
  CATALOG_ERROR_CODES,
  CatalogContractError,
  DomainLexiconRegistry,
  createCatalogManifestSigningPayload,
  serializeDomainLexiconCatalogPack,
  type CatalogErrorCode,
  type CatalogManifestV1,
  type DomainLexiconCatalogPackV1,
  type DomainLexiconEntry
} from '@talex-touch/utils/i18n'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import * as schema from '../../db/schema'
import { SqliteCatalogRepository, type BuiltinCatalogPack } from './catalog-repository'
import { PinnedCatalogVerifier } from './catalog-verifier'

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
const verifier = new PinnedCatalogVerifier({
  publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()
})
const createdAt = '2026-07-15T00:00:00.000Z'

let directory: string
let client: Client
let db: LibSQLDatabase<typeof schema>
let repository: SqliteCatalogRepository
let clock: number

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tuff-catalog-repository-'))
  client = createClient({ url: `file:${join(directory, 'catalog.sqlite')}` })
  await client.execute('PRAGMA foreign_keys = ON')
  const migration = await readFile(
    new URL('../../../../resources/db/migrations/0026_catalog_service.sql', import.meta.url),
    'utf8'
  )
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) await client.execute(statement)
  }
  db = drizzle(client, { schema })
  clock = 1_784_077_200_000
  repository = new SqliteCatalogRepository(db, { now: () => clock++ })
})

afterEach(async () => {
  await dbWriteScheduler.drain()
  client.close()
  await rm(directory, { recursive: true, force: true })
})

function catalogEntry(
  label: string,
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
      default: [`${label}-alias`],
      locales: {
        'zh-CN': [`${label}-中文别名`],
        'en-US': [`${label}-alias`]
      }
    },
    metadata: { category: 'length', symbol: 'm' }
  }
}

function builtinPack(): BuiltinCatalogPack {
  const version = '260000'
  const entry = catalogEntry('baseline meter', 'builtin', version)
  const normalizedPack: DomainLexiconCatalogPackV1 = {
    contractVersion: 1,
    type: 'domain-lexicon',
    packId: 'builtin.domain-lexicon',
    version,
    schemaVersion: 1,
    createdAt,
    locales: ['zh-CN', 'en-US'],
    entries: [withoutProvenance(entry)]
  }
  const bytes = serializeDomainLexiconCatalogPack(normalizedPack)
  return {
    manifest: {
      type: normalizedPack.type,
      packId: normalizedPack.packId,
      version,
      schemaVersion: 1,
      createdAt,
      minSdkapi: CATALOG_CLIENT_SDKAPI,
      locales: normalizedPack.locales,
      entryCount: 1,
      payloadBytes: bytes.byteLength,
      payloadSha256: createHash('sha256').update(bytes).digest('hex')
    },
    source: 'builtin',
    signatureStatus: 'builtin',
    entries: Object.freeze([entry]),
    registry: new DomainLexiconRegistry([entry])
  }
}

function verifiedPack(version: string, label: string) {
  const provenance: DomainLexiconEntry['source'] = `catalog:official.domain-lexicon@${version}`
  const entry = catalogEntry(label, provenance, version)
  const pack: DomainLexiconCatalogPackV1 = {
    contractVersion: 1,
    type: 'domain-lexicon',
    packId: 'official.domain-lexicon',
    version,
    schemaVersion: 1,
    createdAt,
    locales: ['zh-CN', 'en-US'],
    entries: [withoutProvenance(entry)]
  }
  const payloadBytes = serializeDomainLexiconCatalogPack(pack)
  const unsigned: CatalogManifestV1 = {
    contractVersion: 1,
    type: pack.type,
    packId: pack.packId,
    version,
    schemaVersion: 1,
    createdAt,
    minSdkapi: CATALOG_CLIENT_SDKAPI,
    locales: pack.locales,
    entryCount: pack.entries.length,
    payloadBytes: payloadBytes.byteLength,
    payloadSha256: createHash('sha256').update(payloadBytes).digest('hex'),
    signatureAlgorithm: 'rsa-sha256',
    keyId: 'release-v1',
    signature: 'AA=='
  }
  const manifest: CatalogManifestV1 = {
    ...unsigned,
    signature: sign(
      'RSA-SHA256',
      createCatalogManifestSigningPayload(unsigned),
      keys.privateKey
    ).toString('base64')
  }
  return verifier.verifyPack(manifest, payloadBytes)
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

async function expectCode(promise: Promise<unknown>, code: CatalogErrorCode): Promise<void> {
  try {
    await promise
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(CatalogContractError)
    expect((error as CatalogContractError).code).toBe(code)
  }
}

async function scalar(sql: string, args: Array<string | number> = []): Promise<number> {
  const result = await client.execute({ sql, args })
  return Number(result.rows[0]?.value ?? -1)
}

describe('SqliteCatalogRepository', () => {
  it('seeds the built-in pack idempotently without duplicating rows', async () => {
    const baseline = builtinPack()

    const first = await repository.initializeBaseline(baseline)
    const second = await repository.initializeBaseline(baseline)

    expect(first.active).toMatchObject({
      packId: 'builtin.domain-lexicon',
      status: 'active',
      source: 'builtin'
    })
    expect(second.registry.resolve('unit.length.catalog-meter', 'en-US')?.label).toBe(
      'baseline meter'
    )
    expect(await scalar('SELECT COUNT(*) AS value FROM catalog_packs')).toBe(1)
    expect(await scalar('SELECT COUNT(*) AS value FROM catalog_domain_lexicon_entries')).toBe(1)
    expect(await scalar('SELECT COUNT(*) AS value FROM catalog_state')).toBe(1)
  })

  it('imports a verified pack idempotently and rejects same-version hash conflicts', async () => {
    await repository.initializeBaseline(builtinPack())
    const firstPack = verifiedPack('2026.07.15', 'remote meter')

    const first = await repository.importVerifiedPack(firstPack)
    const repeated = await repository.importVerifiedPack(firstPack)

    expect(first.status).toBe('ready')
    expect(repeated.payloadSha256).toBe(first.payloadSha256)
    expect(await scalar('SELECT COUNT(*) AS value FROM catalog_packs')).toBe(2)
    expect(await scalar('SELECT COUNT(*) AS value FROM catalog_domain_lexicon_entries')).toBe(2)

    await expectCode(
      repository.importVerifiedPack(verifiedPack('2026.07.15', 'conflicting remote meter')),
      CATALOG_ERROR_CODES.versionConflict
    )
    expect(await scalar('SELECT COUNT(*) AS value FROM catalog_packs')).toBe(2)
  })

  it('rolls back the whole import when an entry write fails', async () => {
    await repository.initializeBaseline(builtinPack())
    await client.execute(`
      CREATE TRIGGER fail_remote_catalog_entry
      BEFORE INSERT ON catalog_domain_lexicon_entries
      WHEN NEW.pack_id = 'official.domain-lexicon'
      BEGIN
        SELECT RAISE(ABORT, 'forced entry failure');
      END
    `)

    await expectCode(
      repository.importVerifiedPack(verifiedPack('2026.07.15', 'remote meter')),
      CATALOG_ERROR_CODES.importFailed
    )

    expect(
      await scalar('SELECT COUNT(*) AS value FROM catalog_packs WHERE pack_id = ?', [
        'official.domain-lexicon'
      ])
    ).toBe(0)
    expect((await repository.getStatus('domain-lexicon')).active?.packId).toBe(
      'builtin.domain-lexicon'
    )
  })

  it('activates atomically, reconstructs the registry, and keeps repeated activation idempotent', async () => {
    await repository.initializeBaseline(builtinPack())
    const remote = await repository.importVerifiedPack(verifiedPack('2026.07.15', 'remote meter'))

    const activated = await repository.activatePack(remote)
    const repeated = await repository.activatePack(remote)

    expect(activated.active.packId).toBe('official.domain-lexicon')
    expect(activated.previous?.packId).toBe('builtin.domain-lexicon')
    expect(activated.registry.resolve('unit.length.catalog-meter', 'en-US')?.label).toBe(
      'remote meter'
    )
    expect(repeated.previous?.packId).toBe('builtin.domain-lexicon')
    expect(repeated.previous?.version).toBe('260000')

    await repository.initializeBaseline(builtinPack())
    expect((await repository.getStatus('domain-lexicon')).active?.version).toBe('2026.07.15')
  })

  it('rolls back every status and pointer change when activation persistence fails', async () => {
    await repository.initializeBaseline(builtinPack())
    const remote = await repository.importVerifiedPack(verifiedPack('2026.07.15', 'remote meter'))
    await client.execute(`
      CREATE TRIGGER fail_catalog_activation
      BEFORE UPDATE ON catalog_state
      WHEN NEW.active_pack_version = '2026.07.15'
      BEGIN
        SELECT RAISE(ABORT, 'forced activation failure');
      END
    `)

    await expectCode(repository.activatePack(remote), CATALOG_ERROR_CODES.activationFailed)

    const status = await repository.getStatus('domain-lexicon')
    expect(status.active?.version).toBe('260000')
    expect(status.previous).toBeNull()
    expect(
      await scalar(
        "SELECT COUNT(*) AS value FROM catalog_packs WHERE status = 'ready' AND version = '2026.07.15'"
      )
    ).toBe(1)
  })

  it('swaps active and previous snapshots on rollback and rejects a missing previous pointer', async () => {
    await repository.initializeBaseline(builtinPack())
    await expectCode(
      repository.rollback('domain-lexicon', 'manual'),
      CATALOG_ERROR_CODES.noPrevious
    )

    const first = await repository.importVerifiedPack(verifiedPack('2026.07.15', 'remote meter v1'))
    await repository.activatePack(first)
    const second = await repository.importVerifiedPack(
      verifiedPack('2026.07.16', 'remote meter v2')
    )
    await repository.activatePack(second)

    const rolledBack = await repository.rollback('domain-lexicon', 'operator-request')

    expect(rolledBack.active.version).toBe('2026.07.15')
    expect(rolledBack.previous?.version).toBe('2026.07.16')
    expect(rolledBack.rollbackReason).toBe('operator-request')
    expect(rolledBack.registry.resolve('unit.length.catalog-meter', 'en-US')?.label).toBe(
      'remote meter v1'
    )
  })

  it('does not silently repair corrupt active entry rows during repeated initialization', async () => {
    const baseline = builtinPack()
    await repository.initializeBaseline(baseline)
    await client.execute('DELETE FROM catalog_domain_lexicon_entries')

    await expectCode(repository.initializeBaseline(baseline), CATALOG_ERROR_CODES.activePackInvalid)
    expect(await scalar('SELECT COUNT(*) AS value FROM catalog_domain_lexicon_entries')).toBe(0)
  })
})
